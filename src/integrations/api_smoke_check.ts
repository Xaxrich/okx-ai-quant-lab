import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { writeCsv } from "../utils/csv.js";
import { fetchJsonWithFallback } from "../utils/http.js";
import { getCoinGeckoAuth } from "../altcoin/data_sources/coingecko_auth.js";
import { arkhamGet } from "../altcoin/intelligence/arkham/arkham_client.js";

type SmokeStatus = "OK" | "NOT_CONFIGURED" | "UNEXPECTED_RESPONSE" | `HTTP_${number}` | "ERROR";

interface SmokeResult {
  service: string;
  status: SmokeStatus;
  configured: boolean;
  detail: string;
}

const ROOT = join(import.meta.dirname, "..", "..");
const OUT_DIR = join(ROOT, "data", "health");

function loadDotenv(): void {
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

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 15000): Promise<{ status: number; body: unknown }> {
  const response = await fetchJsonWithFallback(url, init, timeoutMs);
  return { status: response.status, body: response.body };
}

function ok(service: string, detail: string, configured = true): SmokeResult {
  return { service, status: "OK", configured, detail };
}

function notConfigured(service: string, detail: string): SmokeResult {
  return { service, status: "NOT_CONFIGURED", configured: false, detail };
}

function unexpected(service: string, detail: string, configured = true): SmokeResult {
  return { service, status: "UNEXPECTED_RESPONSE", configured, detail };
}

function http(service: string, status: number): SmokeResult {
  return { service, status: `HTTP_${status}`, configured: true, detail: "endpoint returned non-2xx HTTP status" };
}

function error(service: string, err: unknown): SmokeResult {
  return { service, status: "ERROR", configured: true, detail: err instanceof Error ? err.message : String(err) };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function checkOkxPublic(): Promise<SmokeResult> {
  const service = "OKX_PUBLIC_REST";
  try {
    const { status, body } = await fetchJson("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT");
    if (status < 200 || status >= 300) return http(service, status);
    const data = asRecord(body).data;
    const rows = Array.isArray(data) ? data : [];
    const last = asRecord(rows[0]).last;
    return rows.length > 0 ? ok(service, `BTC-USDT ticker returned last=${last}`) : unexpected(service, "ticker data array was empty");
  } catch (err) {
    return error(service, err);
  }
}

async function checkCoinGecko(): Promise<SmokeResult> {
  const service = "COINGECKO";
  const auth = getCoinGeckoAuth();
  if (auth.mode === "NO_KEY") return notConfigured(service, "COINGECKO_PRO_API_KEY or COINGECKO_DEMO_API_KEY not set");

  try {
    const { status, body } = await fetchJson(`${auth.baseUrl}/ping`, { headers: auth.headers });
    if (status < 200 || status >= 300) return http(service, status);
    return asRecord(body).gecko_says ? ok(service, `${auth.mode} ping accepted`) : unexpected(service, "ping response missing gecko_says");
  } catch (err) {
    return error(service, err);
  }
}

async function checkCoinMarketCap(): Promise<SmokeResult> {
  const service = "COINMARKETCAP";
  const key = process.env.COINMARKETCAP_API_KEY || "";
  if (!key) return notConfigured(service, "COINMARKETCAP_API_KEY not set");

  try {
    const { status, body } = await fetchJson("https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?symbol=BTC&limit=1", {
      headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
    });
    if (status < 200 || status >= 300) return http(service, status);
    const rows = asRecord(body).data;
    return Array.isArray(rows) && rows.length > 0 ? ok(service, "BTC map lookup returned data") : unexpected(service, "map lookup returned no data");
  } catch (err) {
    return error(service, err);
  }
}

async function checkEtherscan(): Promise<SmokeResult> {
  const service = "ETHERSCAN_V2";
  const key = process.env.ETHERSCAN_API_KEY || "";
  if (!key) return notConfigured(service, "ETHERSCAN_API_KEY not set");

  try {
    const url = new URL("https://api.etherscan.io/v2/api");
    url.search = new URLSearchParams({ chainid: "1", module: "stats", action: "ethsupply", apikey: key }).toString();
    const { status, body } = await fetchJson(url.toString());
    if (status < 200 || status >= 300) return http(service, status);
    const parsed = asRecord(body);
    return parsed.status === "1" && parsed.result ? ok(service, "ETH supply endpoint accepted key") : unexpected(service, String(parsed.message || "unexpected response"));
  } catch (err) {
    return error(service, err);
  }
}

async function checkBscScan(): Promise<SmokeResult> {
  const service = "BSCSCAN";
  const key = process.env.BSCSCAN_API_KEY || "";
  if (!key) return notConfigured(service, "BSCSCAN_API_KEY not set");

  try {
    const url = new URL("https://api.bscscan.com/api");
    url.search = new URLSearchParams({ module: "stats", action: "bnbsupply", apikey: key }).toString();
    const { status, body } = await fetchJson(url.toString());
    if (status < 200 || status >= 300) return http(service, status);
    const parsed = asRecord(body);
    return parsed.status === "1" && parsed.result ? ok(service, "BNB supply endpoint accepted key") : unexpected(service, String(parsed.message || "unexpected response"));
  } catch (err) {
    return error(service, err);
  }
}

async function checkCoinGlass(): Promise<SmokeResult> {
  const service = "COINGLASS";
  const key = process.env.COINGLASS_API_KEY || "";
  if (!key) return notConfigured(service, "COINGLASS_API_KEY not set");

  try {
    const { status, body } = await fetchJson("https://open-api-v4.coinglass.com/api/futures/supported-coins", {
      headers: { "CG-API-KEY": key, Accept: "application/json" },
    });
    if (status < 200 || status >= 300) return http(service, status);
    const data = asRecord(body).data;
    return Array.isArray(data) && data.length > 0 ? ok(service, `${data.length} supported futures coins`) : unexpected(service, "supported coins response was empty");
  } catch (err) {
    return error(service, err);
  }
}

async function checkDexScreener(): Promise<SmokeResult> {
  const service = "DEXSCREENER";
  try {
    const { status, body } = await fetchJson("https://api.dexscreener.com/latest/dex/search?q=LAB");
    if (status < 200 || status >= 300) return http(service, status);
    const pairs = asRecord(body).pairs;
    return Array.isArray(pairs) ? ok(service, `${pairs.length} pairs returned`, true) : unexpected(service, "search response missing pairs", true);
  } catch (err) {
    return error(service, err);
  }
}

async function checkArkham(): Promise<SmokeResult> {
  const service = "ARKHAM";
  const key = process.env.ARKHAM_API_KEY || "";
  if (!key) return notConfigured(service, "ARKHAM_API_KEY not set");

  try {
    const response = await arkhamGet("/health", { cacheTtlHours: 1 });
    if (!response.ok) return unexpected(service, `${response.status}: ${response.error || response.limitations?.join(";") || "health check failed"}`);
    return response.data ? ok(service, `health endpoint responded${response.cacheHit ? " (cache)" : ""}`) : unexpected(service, "empty health response");
  } catch (err) {
    return error(service, err);
  }
}

async function checkMoralis(): Promise<SmokeResult> {
  const service = "MORALIS";
  const key = process.env.MORALIS_API_KEY || "";
  if (!key) return notConfigured(service, "MORALIS_API_KEY not set");

  try {
    const { status, body } = await fetchJson("https://deep-index.moralis.io/api/v2.2/erc20/0x6982508145454ce325ddbe47a25d4ec3d2311933/price?chain=eth", {
      headers: { "X-API-Key": key, Accept: "application/json" },
    });
    if (status < 200 || status >= 300) return http(service, status);
    const parsed = asRecord(body);
    return parsed.usdPrice ? ok(service, "PEPE price endpoint returned usdPrice") : unexpected(service, "price response missing usdPrice");
  } catch (err) {
    return error(service, err);
  }
}

async function checkFeishu(): Promise<SmokeResult> {
  const service = "FEISHU";
  const appId = process.env.FEISHU_APP_ID || "";
  const appSecret = process.env.FEISHU_APP_SECRET || "";
  if (!appId || !appSecret) return notConfigured(service, "FEISHU_APP_ID or FEISHU_APP_SECRET not set");

  try {
    const { status, body } = await fetchJson("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    if (status < 200 || status >= 300) return http(service, status);
    const parsed = asRecord(body);
    return parsed.code === 0 && parsed.tenant_access_token ? ok(service, "tenant access token issued") : unexpected(service, String(parsed.msg || "token response missing token"));
  } catch (err) {
    return error(service, err);
  }
}

async function main() {
  loadDotenv();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const checks = [
    checkOkxPublic,
    checkCoinGecko,
    checkCoinMarketCap,
    checkEtherscan,
    checkBscScan,
    checkCoinGlass,
    checkDexScreener,
    checkArkham,
    checkMoralis,
    checkFeishu,
  ];

  const results = await Promise.all(checks.map((check) => check()));
  const okCount = results.filter((result) => result.status === "OK").length;
  const configuredCount = results.filter((result) => result.configured).length;
  const outPath = join(OUT_DIR, "api_smoke_latest.csv");

  writeCsv(outPath, [
    ["checked_at", "service", "status", "configured", "detail"],
    ...results.map((result) => [new Date().toISOString(), result.service, result.status, String(result.configured), result.detail]),
  ]);

  console.log("=== API Smoke Check ===");
  for (const result of results) {
    console.log(`${result.service}: ${result.status} — ${result.detail}`);
  }
  console.log("");
  console.log(`OK: ${okCount}/${results.length}`);
  console.log(`Configured: ${configuredCount}/${results.length}`);
  console.log(`Output: ${outPath}`);

  process.exitCode = results.some((result) => result.status !== "OK" && result.status !== "NOT_CONFIGURED") ? 1 : 0;
}

const isMain = process.argv[1]?.includes("api_smoke_check");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
