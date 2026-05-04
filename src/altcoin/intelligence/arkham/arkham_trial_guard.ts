import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const TRIAL_END = process.env.ARKHAM_TRIAL_END || "2026-06-03";
const CANCEL_DECISION = process.env.ARKHAM_CANCEL_DECISION_DATE || "2026-06-01";
const DISABLE_HEAVY = process.env.ARKHAM_DISABLE_HEAVY_AFTER || "2026-06-01";
const DAILY_STANDARD_LIMIT = parseInt(process.env.ARKHAM_DAILY_STANDARD_LIMIT || "5000");
const DAILY_HEAVY_LIMIT = parseInt(process.env.ARKHAM_DAILY_HEAVY_LIMIT || "500");

const CACHE_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham", "cache");
const CACHE_MANIFEST = join(CACHE_DIR, "cache_manifest.json");
const USAGE_LEDGER = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham", "usage", "arkham_usage_ledger.jsonl");

export interface TrialStatus {
  allowed: boolean;
  heavyAllowed: boolean;
  reason: string;
  trialActive: boolean;
  daysRemaining: number;
  showWarning: boolean;
}

export interface UsageEntry {
  timestamp: string;
  endpoint: string;
  token: string;
  request_type: string;
  heavy_endpoint: boolean;
  cache_hit: boolean;
  status: string;
  estimated_cost_class: string;
  limitations: string;
}

export function checkTrialStatus(): TrialStatus {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const trialEnd = new Date(TRIAL_END);
  const cancelDecision = new Date(CANCEL_DECISION);
  const disableHeavy = new Date(DISABLE_HEAVY);

  const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000);
  const showWarning = today >= CANCEL_DECISION.slice(0, 10);

  if (today > TRIAL_END.slice(0, 10)) {
    return { allowed: false, heavyAllowed: false, reason: "Trial expired", trialActive: false, daysRemaining: 0, showWarning: true };
  }

  if (today >= DISABLE_HEAVY.slice(0, 10)) {
    return { allowed: true, heavyAllowed: false, reason: "Heavy endpoints disabled per trial guard", trialActive: true, daysRemaining, showWarning };
  }

  return { allowed: true, heavyAllowed: true, reason: "Trial active", trialActive: true, daysRemaining, showWarning };
}

const HEAVY_PATTERNS = [
  "/transfers", "/swaps", "/counterparties/address", "/counterparties/entity",
  "/token/top_flow", "/token/volume", "/transfers/histogram",
  "/flow/address", "/flow/entity", "/volume/address", "/volume/entity",
  "/portfolio/timeSeries/address", "/portfolio/timeSeries/entity",
  "/history/address", "/history/entity",
];

export function isHeavyEndpoint(path: string): boolean {
  return HEAVY_PATTERNS.some(p => path.includes(p));
}

export function estimateCostClass(path: string, heavy: boolean): string {
  if (heavy) return "HIGH";
  if (path.includes("/holders")) return "MEDIUM";
  if (path.includes("/intelligence/contract")) return "LOW";
  if (path.includes("/intelligence/address")) return "LOW";
  if (path.includes("/intelligence/entity")) return "LOW";
  if (path.includes("/balances")) return "MEDIUM";
  if (path.includes("/portfolio")) return "HIGH";
  return "LOW";
}

// ── Cache ──

interface CacheEntry {
  endpoint: string;
  params: string;
  hash: string;
  cachedAt: string;
  expiresAt: string;
  file: string;
}

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const usageDir = join(CACHE_DIR, "..", "usage");
  if (!existsSync(usageDir)) mkdirSync(usageDir, { recursive: true });
}

function loadManifest(): CacheEntry[] {
  ensureCacheDir();
  if (!existsSync(CACHE_MANIFEST)) return [];
  try {
    return JSON.parse(readFileSync(CACHE_MANIFEST, "utf-8"));
  } catch { return []; }
}

function saveManifest(entries: CacheEntry[]) {
  ensureCacheDir();
  writeFileSync(CACHE_MANIFEST, JSON.stringify(entries, null, 2));
}

export function cacheKey(endpoint: string, params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
  const raw = `${endpoint}?${sorted}`;
  return createHash("md5").update(raw).digest("hex").slice(0, 12);
}

export function cacheGet(endpoint: string, params: Record<string, string>): { hit: boolean; data?: string; entry?: CacheEntry } {
  const key = cacheKey(endpoint, params);
  const manifest = loadManifest();
  const entry = manifest.find(e => e.hash === key);
  if (!entry) return { hit: false };
  const cacheFile = join(CACHE_DIR, entry.file);
  if (!existsSync(cacheFile)) return { hit: false };
  const now = new Date();
  if (now > new Date(entry.expiresAt)) return { hit: false };
  try {
    const data = readFileSync(cacheFile, "utf-8");
    return { hit: true, data, entry };
  } catch { return { hit: false }; }
}

export function cachePut(endpoint: string, params: Record<string, string>, data: string, ttlHours: number = 24): CacheEntry {
  const key = cacheKey(endpoint, params);
  const manifest = loadManifest();
  // Remove old entry if exists
  const filtered = manifest.filter(e => e.hash !== key);
  const now = new Date();
  const fileName = `${key}_${now.toISOString().replace(/[:.]/g, "-")}.json`;
  const entry: CacheEntry = {
    endpoint, params: JSON.stringify(params), hash: key,
    cachedAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlHours * 3600000).toISOString(),
    file: fileName,
  };
  filtered.push(entry);
  writeFileSync(join(CACHE_DIR, fileName), data);
  saveManifest(filtered);
  return entry;
}

// ── Usage Ledger ──

export function logUsage(entry: UsageEntry) {
  const usageDir = join(CACHE_DIR, "..", "usage");
  if (!existsSync(usageDir)) mkdirSync(usageDir, { recursive: true });
  appendFileSync(USAGE_LEDGER, JSON.stringify(entry) + "\n");
}

export function getTodayUsage(): { standard: number; heavy: number } {
  if (!existsSync(USAGE_LEDGER)) return { standard: 0, heavy: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const lines = readFileSync(USAGE_LEDGER, "utf-8").trim().split("\n").filter(Boolean);
  let standard = 0, heavy = 0;
  for (const line of lines) {
    try {
      const e: UsageEntry = JSON.parse(line);
      if (e.timestamp.slice(0, 10) === today) {
        if (e.heavy_endpoint) heavy++; else standard++;
      }
    } catch { /* skip */ }
  }
  return { standard, heavy };
}

export function canMakeRequest(path: string): { allowed: boolean; reason: string } {
  const trial = checkTrialStatus();
  if (!trial.allowed) return { allowed: false, reason: trial.reason };

  const heavy = isHeavyEndpoint(path);
  if (heavy && !trial.heavyAllowed) return { allowed: false, reason: "Heavy endpoints disabled by trial guard" };

  const usage = getTodayUsage();
  if (!heavy && usage.standard >= DAILY_STANDARD_LIMIT) return { allowed: false, reason: `Daily standard limit reached (${DAILY_STANDARD_LIMIT})` };
  if (heavy && usage.heavy >= DAILY_HEAVY_LIMIT) return { allowed: false, reason: `Daily heavy limit reached (${DAILY_HEAVY_LIMIT})` };

  return { allowed: true, reason: "OK" };
}
