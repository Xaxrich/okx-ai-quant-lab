const ARKHAM_KEY = process.env.ARKHAM_API_KEY || "";
const ARKHAM_BASE = "https://api.arkm.com";

export interface ArkhamResponse {
  ok: boolean;
  status: string;
  endpoint: string;
  channel: "ARKHAM_CHANNEL";
  data: unknown;
  error?: string;
  limitations?: string[];
  creditsUsed?: number;
}

export interface ArkhamRateLimitEvent {
  endpoint: string;
  retryAfterMs: number;
  timestamp: string;
}

const HEAVY_ENDPOINTS = new Set([
  "/transfers", "/swaps", "/counterparties/address", "/counterparties/entity",
  "/token/top_flow", "/token/volume", "/transfers/histogram",
  "/flow/address", "/flow/entity", "/volume/address", "/volume/entity",
  "/portfolio/timeSeries/address", "/portfolio/timeSeries/entity",
  "/history/address", "/history/entity",
]);

function isHeavy(path: string): boolean {
  for (const heavy of HEAVY_ENDPOINTS) {
    if (path.startsWith(heavy) || path.includes(heavy)) return true;
  }
  return false;
}

const rateLimitEvents: ArkhamRateLimitEvent[] = [];
let lastHeavyCall = 0;
const HEAVY_MIN_INTERVAL = 1100; // ~1 req/s for heavy endpoints

export function getRateLimitEvents(): ArkhamRateLimitEvent[] {
  return [...rateLimitEvents];
}

export async function arkhamGet(path: string): Promise<ArkhamResponse> {
  const base: ArkhamResponse = {
    ok: false, status: "ARKHAM_NOT_CONFIGURED", endpoint: path,
    channel: "ARKHAM_CHANNEL", data: null,
  };

  if (!ARKHAM_KEY) {
    base.error = "ARKHAM_API_KEY not set in environment";
    base.limitations = ["No API key configured"];
    return base;
  }

  // Rate limit: heavy endpoints
  if (isHeavy(path)) {
    const now = Date.now();
    const elapsed = now - lastHeavyCall;
    if (elapsed < HEAVY_MIN_INTERVAL) {
      await new Promise(r => setTimeout(r, HEAVY_MIN_INTERVAL - elapsed));
    }
    lastHeavyCall = Date.now();
  }

  try {
    const url = `${ARKHAM_BASE}${path}`;
    const r = await fetch(url, {
      headers: { "API-Key": ARKHAM_KEY, "Accept": "application/json" },
    });

    const statusCode = r.status;

    if (statusCode === 429) {
      const retryAfter = parseInt(r.headers.get("Retry-After") || "5") * 1000;
      rateLimitEvents.push({ endpoint: path, retryAfterMs: retryAfter, timestamp: new Date().toISOString() });
      base.ok = false;
      base.status = "ARKHAM_RATE_LIMITED";
      base.error = `Rate limited, retry after ${retryAfter}ms`;
      base.limitations = ["Rate limit hit"];
      return base;
    }

    if (statusCode === 401) {
      base.ok = false;
      base.status = "ARKHAM_UNAUTHORIZED";
      base.error = "Invalid or expired API key";
      return base;
    }

    if (statusCode === 403) {
      const text = await r.text().catch(() => "");
      base.ok = false;
      base.status = "ARKHAM_FORBIDDEN";
      base.error = text.slice(0, 200) || "Access denied — plan or permission issue";
      return base;
    }

    if (statusCode === 404) {
      base.ok = false;
      base.status = "ARKHAM_NOT_FOUND";
      base.error = "Endpoint or resource not found";
      return base;
    }

    const text = await r.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    base.ok = true;
    base.status = "OK";
    base.data = parsed;

    // Check for empty data
    if (Array.isArray(parsed) && (parsed as any[]).length === 0) {
      base.limitations = ["ARKHAM_DATA_EMPTY"];
      base.status = "ARKHAM_DATA_EMPTY";
    } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const dataKeys = Object.keys(obj).filter(k => k !== "meta" && k !== "nextCursor");
      if (dataKeys.length === 0) {
        base.limitations = ["ARKHAM_DATA_EMPTY"];
        base.status = "ARKHAM_DATA_EMPTY";
      }
    }

    return base;
  } catch (e: any) {
    base.ok = false;
    base.status = "ARKHAM_ERROR";
    base.error = e.message;
    base.limitations = ["Network or parse error"];
    return base;
  }
}

export function arkhamConfidence(
  hasEntity: boolean,
  hasLabel: boolean,
  entityType?: string,
  isPredicted?: boolean
): { confidence: string; limitation: string } {
  if (hasEntity && !isPredicted) {
    return { confidence: "HIGH", limitation: "" };
  }
  if (hasEntity && isPredicted) {
    return { confidence: "MEDIUM", limitation: "Entity prediction — not directly confirmed" };
  }
  if (hasLabel) {
    return { confidence: "HIGH", limitation: "Label-based identification" };
  }
  return { confidence: "UNKNOWN", limitation: "No entity or label attribution available" };
}

export function isArkhamConfigured(): boolean {
  return ARKHAM_KEY.length > 0;
}
