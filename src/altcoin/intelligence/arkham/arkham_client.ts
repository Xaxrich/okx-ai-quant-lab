import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { fetchTextWithFallback } from "../../../utils/http.js";
import {
  checkTrialStatus, isHeavyEndpoint, estimateCostClass,
  cacheGet, cachePut, logUsage, canMakeRequest,
} from "./arkham_trial_guard.js";
import type { UsageEntry } from "./arkham_trial_guard.js";

const ARKHAM_BASE = "https://api.arkm.com";
const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
let dotenvLoaded = false;

function arkhamKey(): string {
  loadDotenvOnce();
  return process.env.ARKHAM_API_KEY || "";
}

function loadDotenvOnce(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (name && !process.env[name]) process.env[name] = value;
  }
}

interface ArkhamHttpResponse {
  statusCode: number;
  text: string;
  contentType: string;
  error?: string;
}

async function arkhamHttpGet(path: string, key: string): Promise<ArkhamHttpResponse> {
  const url = `${ARKHAM_BASE}${path}`;
  try {
    const response = await fetchTextWithFallback(url, {
      headers: { "API-Key": key, "Accept": "application/json", "User-Agent": "okx-ai-quant-lab/arkham-client" },
    }, 60_000);
    return {
      statusCode: response.status,
      text: response.text,
      contentType: response.headers["content-type"] || "",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 0,
      text: "",
      contentType: "",
      error: message,
    };
  }
}

export interface ArkhamResponse {
  ok: boolean;
  status: string;
  endpoint: string;
  channel: "ARKHAM_CHANNEL";
  data: unknown;
  error?: string;
  limitations?: string[];
  cacheHit?: boolean;
}

export interface ArkhamRateLimitEvent {
  endpoint: string;
  retryAfterMs: number;
  timestamp: string;
}

const rateLimitEvents: ArkhamRateLimitEvent[] = [];
let lastStandardCall = 0;
let lastHeavyCall = 0;
const STANDARD_MIN_INTERVAL = 210; // ~5 req/s
const HEAVY_MIN_INTERVAL = 1100; // ~1 req/s

export function getRateLimitEvents(): ArkhamRateLimitEvent[] {
  return [...rateLimitEvents];
}

function extractParams(path: string): Record<string, string> {
  const params: Record<string, string> = {};
  const q = path.split("?")[1];
  if (!q) return params;
  for (const pair of q.split("&")) {
    const [k, v] = pair.split("=");
    if (k) params[k] = v || "";
  }
  return params;
}

export async function arkhamGet(
  path: string,
  opts?: { token?: string; allowHeavyOverride?: boolean; cacheTtlHours?: number }
): Promise<ArkhamResponse> {
  const base: ArkhamResponse = {
    ok: false, status: "ARKHAM_NOT_CONFIGURED", endpoint: path,
    channel: "ARKHAM_CHANNEL", data: null, cacheHit: false,
  };

  const key = arkhamKey();
  if (!key) {
    base.error = "ARKHAM_API_KEY not set in environment";
    base.limitations = ["No API key configured"];
    return base;
  }

  // No-Arkham mode
  if (process.env.NO_ARKHAM_MODE === "true") {
    base.ok = false;
    base.status = "ARKHAM_DISABLED_BY_NO_ARKHAM_MODE";
    base.error = "Arkham API disabled — NO_ARKHAM_MODE=true";
    base.limitations = ["No-Arkham mode active — use local cache/assets only"];
    return base;
  }

  // Trial guard
  const trial = checkTrialStatus();
  if (!trial.allowed) {
    base.status = "ARKHAM_TRIAL_EXPIRED";
    base.error = trial.reason;
    base.limitations = ["Trial period ended"];
    return base;
  }

  const heavy = isHeavyEndpoint(path);
  if (heavy && !trial.heavyAllowed && !opts?.allowHeavyOverride) {
    base.status = "ARKHAM_HEAVY_DISABLED";
    base.error = "Heavy endpoints disabled per trial guard";
    base.limitations = ["Heavy endpoint blocked — trial guard"];
    return base;
  }

  // Check daily limits
  const limit = canMakeRequest(path);
  if (!limit.allowed) {
    base.status = "ARKHAM_DAILY_LIMIT";
    base.error = limit.reason;
    base.limitations = [limit.reason];
    return base;
  }

  // Cache check
  const params = extractParams(path);
  const endpointPath = path.split("?")[0];
  const cached = cacheGet(endpointPath, params);
  if (cached.hit && cached.data) {
    // Minimal log for cache hits
    const usageEntry: UsageEntry = {
      timestamp: new Date().toISOString(), endpoint: endpointPath,
      token: opts?.token || "", request_type: heavy ? "HEAVY" : "STANDARD",
      heavy_endpoint: heavy, cache_hit: true, status: "CACHE_HIT",
      estimated_cost_class: "FREE (cached)", limitations: "",
    };
    logUsage(usageEntry);

    base.ok = true;
    base.status = "OK";
    try {
      base.data = JSON.parse(cached.data);
    } catch {
      base.data = cached.data;
    }
    base.cacheHit = true;
    return base;
  }

  // Rate limit
  if (heavy) {
    const now = Date.now();
    const elapsed = now - lastHeavyCall;
    if (elapsed < HEAVY_MIN_INTERVAL) {
      await new Promise(r => setTimeout(r, HEAVY_MIN_INTERVAL - elapsed));
    }
    lastHeavyCall = Date.now();
  } else {
    const now = Date.now();
    const elapsed = now - lastStandardCall;
    if (elapsed < STANDARD_MIN_INTERVAL) {
      await new Promise(r => setTimeout(r, STANDARD_MIN_INTERVAL - elapsed));
    }
    lastStandardCall = Date.now();
  }

  // Make request with retries for 429
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await arkhamHttpGet(path, key);
      const statusCode = r.statusCode;

      if (statusCode === 0) {
        throw new Error(r.error || "Arkham request failed before HTTP response");
      }

      if (statusCode === 429) {
        const retryAfter = 5000;
        rateLimitEvents.push({ endpoint: path, retryAfterMs: retryAfter, timestamp: new Date().toISOString() });
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, retryAfter + 1000));
          continue;
        }
        base.status = "ARKHAM_RATE_LIMITED";
        base.error = `Rate limited after ${3} retries`;
        base.limitations = ["Rate limit exhausted"];
        logUsage({ timestamp: new Date().toISOString(), endpoint: endpointPath, token: opts?.token || "", request_type: heavy ? "HEAVY" : "STANDARD", heavy_endpoint: heavy, cache_hit: false, status: "RATE_LIMITED", estimated_cost_class: "FREE (failed)", limitations: "429" });
        return base;
      }

      if (statusCode === 401) {
        base.status = "ARKHAM_UNAUTHORIZED";
        base.error = "Invalid or expired API key";
        logUsage({ timestamp: new Date().toISOString(), endpoint: endpointPath, token: opts?.token || "", request_type: heavy ? "HEAVY" : "STANDARD", heavy_endpoint: heavy, cache_hit: false, status: "UNAUTHORIZED", estimated_cost_class: "FREE (failed)", limitations: "401" });
        return base;
      }

      if (statusCode === 403) {
        const text = r.text;
        base.status = "ARKHAM_FORBIDDEN";
        base.error = text.slice(0, 200) || "Access denied";
        logUsage({ timestamp: new Date().toISOString(), endpoint: endpointPath, token: opts?.token || "", request_type: heavy ? "HEAVY" : "STANDARD", heavy_endpoint: heavy, cache_hit: false, status: "FORBIDDEN", estimated_cost_class: "FREE (failed)", limitations: "403" });
        return base;
      }

      if (statusCode === 404) {
        base.status = "ARKHAM_NOT_FOUND";
        base.error = "Endpoint or resource not found";
        logUsage({ timestamp: new Date().toISOString(), endpoint: endpointPath, token: opts?.token || "", request_type: heavy ? "HEAVY" : "STANDARD", heavy_endpoint: heavy, cache_hit: false, status: "NOT_FOUND", estimated_cost_class: "FREE (failed)", limitations: "404" });
        return base;
      }

      const text = r.text;
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      base.ok = true;
      base.status = "OK";
      base.data = parsed;

      // Cache the response
      const costClass = estimateCostClass(path, heavy);
      const ttl = opts?.cacheTtlHours ?? (heavy ? 24 : 6);
      cachePut(endpointPath, params, text, ttl);

      // Log
      logUsage({
        timestamp: new Date().toISOString(), endpoint: endpointPath,
        token: opts?.token || "", request_type: heavy ? "HEAVY" : "STANDARD",
        heavy_endpoint: heavy, cache_hit: false, status: "OK",
        estimated_cost_class: costClass, limitations: "",
      });

      // Check for empty data
      if (Array.isArray(parsed) && (parsed as any[]).length === 0) {
        base.limitations = ["ARKHAM_DATA_EMPTY"];
        base.status = "ARKHAM_DATA_EMPTY";
      }

      return base;
    } catch (e: any) {
      lastError = e.message;
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  base.status = "ARKHAM_ERROR";
  base.error = lastError;
  base.limitations = ["Network error after retries"];
  logUsage({ timestamp: new Date().toISOString(), endpoint: endpointPath, token: opts?.token || "", request_type: heavy ? "HEAVY" : "STANDARD", heavy_endpoint: heavy, cache_hit: false, status: "ERROR", estimated_cost_class: "FREE (failed)", limitations: lastError });
  return base;
}

export function arkhamConfidence(
  hasEntity: boolean, hasLabel: boolean, entityType?: string, isPredicted?: boolean
): { confidence: string; limitation: string } {
  if (hasEntity && !isPredicted) return { confidence: "HIGH", limitation: "" };
  if (hasEntity && isPredicted) return { confidence: "MEDIUM", limitation: "Entity prediction — not directly confirmed" };
  if (hasLabel) return { confidence: "HIGH", limitation: "Label-based identification" };
  return { confidence: "UNKNOWN", limitation: "No entity or label attribution available" };
}

export function isArkhamConfigured(): boolean { return arkhamKey().length > 0; }
