import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getCoinGeckoAuth } from "../../data_sources/coingecko_auth.js";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const CACHE_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "cache", "price_features");
const REGISTRY_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "registry");
const FEATURES_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "features");
const QUEUE_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "queue");

interface CacheEntry {
  token: string; coingecko_id: string; fetched_at: string;
  range_days: number; source: string;
  prices: number[][]; market_caps: number[][]; total_volumes: number[][];
  data_points_count: number; start_date: string; end_date: string; status: string;
}

interface CacheManifestEntry {
  token: string; coingecko_id: string; cache_path: string; status: string;
  fetched_at: string; data_points_count: number; start_date: string; end_date: string;
  needs_refresh: boolean; last_error: string;
}

interface RegistryRow {
  symbol: string; coingecko_id: string; cmc_id: string;
}

function loadRegistry(): RegistryRow[] {
  const p = join(REGISTRY_DIR, "token_metadata_registry.csv");
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf-8").split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = l.split(","); const r: any = {};
    headers.forEach((h, j) => r[h.trim()] = vals[j]?.trim() || "");
    return r as RegistryRow;
  });
}

function loadManifest(): Map<string, CacheManifestEntry> {
  const m = new Map<string, CacheManifestEntry>();
  const p = join(CACHE_DIR, "cache_manifest.json");
  if (!existsSync(p)) return m;
  const entries = JSON.parse(readFileSync(p, "utf-8")) as CacheManifestEntry[];
  for (const e of entries) m.set(e.token, e);
  return m;
}

function saveManifest(manifest: Map<string, CacheManifestEntry>) {
  writeFileSync(join(CACHE_DIR, "cache_manifest.json"), JSON.stringify([...manifest.values()], null, 2));
}

function cachePath(cgId: string): string {
  return join(CACHE_DIR, `${cgId}_90d.json`);
}

function cacheValid(entry: CacheManifestEntry | undefined): boolean {
  if (!entry || entry.status !== "COMPLETE") return false;
  const age = Date.now() - new Date(entry.fetched_at).getTime();
  return age < 86400000; // 24h TTL
}

function fetchWithRetry(cgId: string, retries: number = 2): Promise<any> {
  const auth = getCoinGeckoAuth();

  async function attempt(): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const url = `${auth.baseUrl}/coins/${cgId}/market_chart?vs_currency=usd&days=90`;
        const r = await fetch(url, { headers: auth.headers });
        if (r.status === 429) return { status: "RATE_LIMITED" };
        if (r.status === 404) return { status: "ID_NOT_FOUND" };
        if (!r.ok) return { status: `HTTP_${r.status}` };
        return { status: "OK", data: await r.json() };
      } catch (err: any) {
        if (i < retries - 1) await sleep(5000);
        else return { status: "FETCH_ERROR", error: err.message };
      }
    }
    return { status: "UNKNOWN_ERROR" };
  }
  return attempt();
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const maxRequests = parseInt(args[args.indexOf("--max-requests") + 1] || "3");
  const sleepMs = parseInt(args[args.indexOf("--sleep-ms") + 1] || "30000");
  const onlyMissing = args.includes("--only-missing");
  const targetToken = args.includes("--token") ? args[args.indexOf("--token") + 1] : null;

  console.log("=== Price Feature Fetch Engine ===\n");
  console.log(`Max requests: ${maxRequests} | Sleep: ${sleepMs}ms | Only missing: ${onlyMissing}`);

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  if (!existsSync(QUEUE_DIR)) mkdirSync(QUEUE_DIR, { recursive: true });

  const registry = loadRegistry();
  let manifest = loadManifest();
  console.log(`Registry: ${registry.length} | Cache: ${manifest.size} entries\n`);

  // Build priority queue
  const queue: { token: string; cgId: string; priority: string; reason: string }[] = [];

  for (const reg of registry) {
    if (!reg.coingecko_id) continue;
    if (targetToken && reg.symbol !== targetToken) continue;

    const cached = manifest.get(reg.symbol);

    if (cacheValid(cached)) {
      if (!onlyMissing) console.log(`  SKIP ${reg.symbol}: cache complete, age ${Math.round((Date.now() - new Date(cached!.fetched_at).getTime())/3600000)}h`);
      continue;
    }

    const priority = cached && cached.status === "PARTIAL" ? "P1" : "P0";
    const reason = !cached ? "no_cache" : cached.status === "PARTIAL" ? "partial" : "expired";
    queue.push({ token: reg.symbol, cgId: reg.coingecko_id, priority, reason });
  }

  // Sort: P0 first
  queue.sort((a, b) => a.priority.localeCompare(b.priority));
  console.log(`Queue: ${queue.length} tokens to fetch (P0: ${queue.filter(q => q.priority === "P0").length})\n`);

  let fetched = 0;
  let rateLimited = false;

  for (const task of queue) {
    if (fetched >= maxRequests) { console.log(`Max requests (${maxRequests}) reached.`); break; }
    if (rateLimited) { console.log(`Rate limited — stopping. ${queue.length - fetched} remaining.`); break; }

    console.log(`  [${fetched + 1}/${Math.min(maxRequests, queue.length)}] Fetching ${task.token} (${task.cgId}) [${task.reason}]...`);
    const result = await fetchWithRetry(task.cgId);

    if (result.status === "RATE_LIMITED") {
      rateLimited = true;
      const m: CacheManifestEntry = {
        token: task.token, coingecko_id: task.cgId,
        cache_path: cachePath(task.cgId), status: "RATE_LIMITED",
        fetched_at: new Date().toISOString(), data_points_count: 0,
        start_date: "", end_date: "", needs_refresh: true,
        last_error: "CoinGecko rate limit",
      };
      manifest.set(task.token, m);
      console.log(`    RATE_LIMITED`);
      continue;
    }

    if (result.status !== "OK" || !result.data?.prices) {
      const m: CacheManifestEntry = {
        token: task.token, coingecko_id: task.cgId,
        cache_path: cachePath(task.cgId), status: "FAILED",
        fetched_at: new Date().toISOString(), data_points_count: 0,
        start_date: "", end_date: "", needs_refresh: true,
        last_error: result.status || "unknown",
      };
      manifest.set(task.token, m);
      console.log(`    FAILED: ${result.status}`);
      continue;
    }

    // Save cache
    const prices = result.data.prices || [];
    const mcap = result.data.market_caps || [];
    const vol = result.data.total_volumes || [];
    const firstDate = prices.length > 0 ? new Date(prices[0][0]).toISOString().slice(0, 10) : "";
    const lastDate = prices.length > 0 ? new Date(prices[prices.length - 1][0]).toISOString().slice(0, 10) : "";

    const entry: CacheEntry = {
      token: task.token, coingecko_id: task.cgId,
      fetched_at: new Date().toISOString(), range_days: 90, source: "coingecko_api",
      prices, market_caps: mcap, total_volumes: vol,
      data_points_count: prices.length, start_date: firstDate, end_date: lastDate,
      status: "COMPLETE",
    };

    writeFileSync(cachePath(task.cgId), JSON.stringify(entry));

    const m: CacheManifestEntry = {
      token: task.token, coingecko_id: task.cgId,
      cache_path: cachePath(task.cgId), status: "COMPLETE",
      fetched_at: new Date().toISOString(), data_points_count: prices.length,
      start_date: firstDate, end_date: lastDate, needs_refresh: false, last_error: "",
    };
    manifest.set(task.token, m);
    fetched++;
    console.log(`    OK: ${prices.length} points, ${firstDate} → ${lastDate}`);

    if (fetched < Math.min(maxRequests, queue.length) && !rateLimited) {
      await sleep(sleepMs);
    }
  }

  saveManifest(manifest);

  // Write queue status
  const remaining = queue.filter(q => {
    const m = manifest.get(q.token);
    return !m || m.status !== "COMPLETE";
  });
  const queueFile = join(QUEUE_DIR, "price_feature_fetch_queue.json");
  writeFileSync(queueFile, JSON.stringify(remaining.map(q => ({
    token: q.token, coingecko_id: q.cgId, priority: q.priority,
    reason: q.reason, attempt_count: 0, last_attempt_at: new Date().toISOString(),
    status: "PENDING", error: "",
  })), null, 2));

  const completeCount = [...manifest.values()].filter(m => m.status === "COMPLETE").length;
  console.log(`\n=== Complete: ${fetched} fetched | Cache: ${completeCount}/${registry.length} complete | Remaining: ${remaining.length} ===`);
}

main().catch(console.error);
