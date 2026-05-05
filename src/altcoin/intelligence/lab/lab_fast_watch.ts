import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const CACHE_DIR = join(OUT_DIR, "cache");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const USAGE_LEDGER = join(OUT_DIR, "lab_api_usage_ledger.jsonl");
const LAB = { sym: "LAB", cgId: "lab", okxInstId: "LAB-USDT-SWAP" };
const CG_COINGLASS_LIMIT = 500;

const CG_API = process.env.COINGLASS_API_KEY || "";
const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";

// ── Mode ──
type Mode = "micro" | "standard" | "full";
function getMode(): Mode {
  const a = process.argv.find(x => x.startsWith("--mode="));
  if (a) return a.split("=")[1] as Mode;
  return "micro";
}
function getWithOkx(): boolean { return process.argv.includes("--with-okx"); }
function getMaxExternalCalls(mode: Mode): number { return mode === "micro" ? 2 : mode === "standard" ? 4 : 6; }
function getMaxCoinGlassCalls(mode: Mode): number { return mode === "micro" ? 1 : mode === "standard" ? 3 : 4; }
function getCacheTtl(key: string, mode: Mode): number {
  if (mode === "micro") {
    if (key === "oi") return 6;
    if (key === "funding" || key === "liq") return 15;
    return 5;
  }
  if (key === "funding" || key === "liq") return 15;
  return 5;
}

// ── API usage ledger ──
interface UsageEntry { timestamp: string; source: string; endpoint_group: string; mode: string; cache_hit: boolean; counted_call: boolean; status: string; }
function logUsage(entry: UsageEntry) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(USAGE_LEDGER, JSON.stringify(entry) + "\n");
}
function getTodayCoinGlassCalls(): number {
  if (!existsSync(USAGE_LEDGER)) return 0;
  const today = new Date().toISOString().slice(0, 10);
  return readFileSync(USAGE_LEDGER, "utf-8").trim().split("\n").filter(Boolean).filter(l => {
    try { const e: UsageEntry = JSON.parse(l); return e.timestamp.slice(0, 10) === today && e.source === "coinglass" && e.counted_call; } catch { return false; }
  }).length;
}
function canCallCoinGlass(planned: number): { ok: boolean; used: number; remaining: number } {
  const used = getTodayCoinGlassCalls();
  const remaining = CG_COINGLASS_LIMIT - used;
  return { ok: remaining >= planned, used, remaining };
}

// ── Cache helpers ──
function cacheGet(key: string, maxAgeMin: number): { hit: boolean; data?: string } {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return { hit: false };
  try {
    const stat = require("fs").statSync(path);
    if ((Date.now() - stat.mtimeMs) / 60000 > maxAgeMin) return { hit: false };
    return { hit: true, data: readFileSync(path, "utf-8") };
  } catch { return { hit: false }; }
}
function cachePut(key: string, data: string) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), data);
}
function getCacheAge(key: string): number | null {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;
  try { return (Date.now() - require("fs").statSync(path).mtimeMs) / 60000; } catch { return null; }
}

async function fetchWithCache(
  url: string, headers: Record<string, string>, cacheKey: string, maxAgeMin: number,
  source: string, group: string, mode: string
): Promise<{ data: string; cached: boolean }> {
  const cached = cacheGet(cacheKey, maxAgeMin);
  if (cached.hit && cached.data) {
    logUsage({ timestamp: new Date().toISOString(), source, endpoint_group: group, mode, cache_hit: true, counted_call: false, status: "CACHE_HIT" });
    return { data: cached.data, cached: true };
  }
  const r = await fetch(url, { headers });
  const text = await r.text();
  cachePut(cacheKey, text);
  const ok = r.ok && text.length > 20 && !text.includes("Too Many Requests");
  logUsage({ timestamp: new Date().toISOString(), source, endpoint_group: group, mode, cache_hit: false, counted_call: true, status: ok ? "OK" : "FAILED" });
  return { data: text, cached: false };
}

// ── Fetchers ──

async function fetchPrice(mode: Mode): Promise<{ price: number | null; return24h: number | null; source: string; calls: number }> {
  // Always try cache first
  const cached = cacheGet("price", 5);
  if (cached.hit && cached.data) {
    try {
      const j = JSON.parse(cached.data);
      return { price: j.price, return24h: j.return24h, source: "cache", calls: 0 };
    } catch { /* fall through */ }
  }
  // CoinGecko simple price
  const url = `https://pro-api.coingecko.com/api/v3/simple/price?ids=${LAB.cgId}&vs_currencies=usd&include_24hr_change=true${CG_KEY ? "&x_cg_pro_api_key=" + CG_KEY : ""}`;
  try {
    const r = await fetch(url);
    if (r.ok) {
      const j = await r.json();
      const price = j[LAB.cgId]?.usd || null;
      const chg = j[LAB.cgId]?.usd_24h_change || null;
      if (price) {
        cachePut("price", JSON.stringify({ price, return24h: chg, ts: new Date().toISOString() }));
        return { price, return24h: chg, source: "coingecko", calls: 1 };
      }
    }
  } catch { /* fallback */ }

  // Fallback: last snapshot
  const snapPath = join(OUT_DIR, "lab_fast_watch.csv");
  if (existsSync(snapPath)) {
    const lines = readFileSync(snapPath, "utf-8").trim().split("\n");
    if (lines.length > 1) {
      const last = lines[lines.length - 1].split(",");
      return { price: parseFloat(last[2]) || null, return24h: parseFloat(last[6]) || null, source: "snapshot_fallback", calls: 0 };
    }
  }
  return { price: null, return24h: null, source: "unavailable", calls: 0 };
}

async function fetchCoinGlassOI(mode: Mode, budget: { ok: boolean; remaining: number }): Promise<{ oi: number | null; oiPrev: number | null; oi4h: number | null; calls: number; cacheAge: number | null }> {
  if (!CG_API) return { oi: null, oiPrev: null, oi4h: null, calls: 0, cacheAge: null };
  const ttl = getCacheTtl("oi", mode);

  // Budget check
  if (!budget.ok && !cacheGet("oi", 30).hit) {
    // Try stale cache as last resort
    const stale = cacheGet("oi", 30);
    if (stale.hit && stale.data) {
      try {
        const j = JSON.parse(stale.data);
        return { oi: j.latest || null, oiPrev: j.prev || null, oi4h: j.oi4h || null, calls: 0, cacheAge: getCacheAge("oi") };
      } catch { /* */ }
    }
    return { oi: null, oiPrev: null, oi4h: null, calls: 0, cacheAge: null };
  }

  const { data, cached } = await fetchWithCache(
    `https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=${LAB.sym}&interval=4h&limit=2&unit=usd`,
    { "CG-API-KEY": CG_API }, "oi", ttl, "coinglass", "oi", mode
  );
  try {
    const j = JSON.parse(data);
    if (j.code === "0" && j.data?.length >= 2) {
      const latest = parseFloat(j.data[j.data.length - 1].close || "0");
      const prev = parseFloat(j.data[j.data.length - 2].close || "0");
      const oi4h = latest - prev;
      return { oi: latest, oiPrev: prev, oi4h, calls: cached ? 0 : 1, cacheAge: cached ? getCacheAge("oi") : 0 };
    }
  } catch { /* */ }
  return { oi: null, oiPrev: null, oi4h: null, calls: 0, cacheAge: null };
}

async function fetchCoinGlassLiq(mode: Mode, budget: { ok: boolean; remaining: number }): Promise<{ liq4h: number | null; liqLong4h: number | null; liqShort4h: number | null; calls: number; cacheAge: number | null }> {
  if (!CG_API) return { liq4h: null, liqLong4h: null, liqShort4h: null, calls: 0, cacheAge: null };
  const ttl = getCacheTtl("liq", mode);
  if (!budget.ok) {
    const stale = cacheGet("liq", 30);
    if (stale.hit && stale.data) {
      try { const j = JSON.parse(stale.data); return { ...j, calls: 0, cacheAge: getCacheAge("liq") }; } catch { /* */ }
    }
    return { liq4h: null, liqLong4h: null, liqShort4h: null, calls: 0, cacheAge: null };
  }

  const { data, cached } = await fetchWithCache(
    `https://open-api-v4.coinglass.com/api/futures/liquidation/aggregated-history?symbol=${LAB.sym}&interval=4h&limit=1&exchange_list=Binance,OKX,Bybit`,
    { "CG-API-KEY": CG_API }, "liq", ttl, "coinglass", "liq", mode
  );
  try {
    const j = JSON.parse(data);
    if (j.code === "0" && j.data?.length > 0) {
      const latest = j.data[0];
      const long = parseFloat(latest.aggregated_long_liquidation_usd || "0");
      const short = parseFloat(latest.aggregated_short_liquidation_usd || "0");
      return { liq4h: long + short, liqLong4h: long, liqShort4h: short, calls: cached ? 0 : 1, cacheAge: cached ? getCacheAge("liq") : 0 };
    }
  } catch { /* */ }
  return { liq4h: null, liqLong4h: null, liqShort4h: null, calls: 0, cacheAge: null };
}

async function fetchFunding(mode: Mode, budget: { ok: boolean; remaining: number }): Promise<{ rate: number | null; streak: number | null; cacheAge: number | null; calls: number }> {
  if (!CG_API) return { rate: null, streak: null, cacheAge: null, calls: 0 };
  const ttl = getCacheTtl("funding", mode);
  if (!budget.ok) {
    const stale = cacheGet("funding", 30);
    if (stale.hit && stale.data) {
      try { const j = JSON.parse(stale.data); return { ...j, calls: 0, cacheAge: getCacheAge("funding") }; } catch { /* */ }
    }
    return { rate: null, streak: null, cacheAge: null, calls: 0 };
  }

  const { data, cached } = await fetchWithCache(
    `https://open-api-v4.coinglass.com/api/futures/funding-rate/oi-weight-history?symbol=${LAB.sym}&interval=4h&limit=12`,
    { "CG-API-KEY": CG_API }, "funding", ttl, "coinglass", "funding", mode
  );
  try {
    const j = JSON.parse(data);
    if (j.code === "0" && j.data?.length > 0) {
      const vals = j.data.map((d: any) => parseFloat(d.close || "0")).filter((v: number) => !isNaN(v));
      const latest = vals[vals.length - 1] || 0;
      let streak = 0;
      for (let i = vals.length - 1; i >= 0 && vals[i] > 0; i--) streak++;
      return { rate: latest, streak, cacheAge: cached ? getCacheAge("funding") : 0, calls: cached ? 0 : 1 };
    }
  } catch { /* */ }
  return { rate: null, streak: null, cacheAge: null, calls: 0 };
}

async function fetchOkxQuick(mode: Mode): Promise<{ oiUsd: number | null; funding: number | null; calls: number }> {
  try {
    const [oiR, frR] = await Promise.all([
      fetch(`https://www.okx.com/api/v5/public/open-interest?instId=${LAB.okxInstId}`),
      fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${LAB.okxInstId}`),
    ]);
    const oiJ = await oiR.json(), frJ = await frR.json();
    logUsage({ timestamp: new Date().toISOString(), source: "okx", endpoint_group: "oi", mode, cache_hit: false, counted_call: true, status: "OK" });
    logUsage({ timestamp: new Date().toISOString(), source: "okx", endpoint_group: "funding", mode, cache_hit: false, counted_call: true, status: "OK" });
    return {
      oiUsd: oiJ.data?.[0]?.oiUsd ? parseFloat(oiJ.data[0].oiUsd) : null,
      funding: frJ.data?.[0]?.fundingRate ? parseFloat(frJ.data[0].fundingRate) : null,
      calls: 2,
    };
  } catch { return { oiUsd: null, funding: null, calls: 0 }; }
}

// ── State machine ──

function classifyFast(
  price: number | null, oi: number | null, oi4h: number | null,
  fundingRate: number | null, fundingStreak: number | null,
  liq4h: number | null, liqCacheAge: number | null,
  dataFreshness: string,
): { state: string; riskScore: number; risks: string[] } {
  const risks: string[] = [];
  let score = 0;
  if (!price || !oi) return { state: "LAB_FAST_DATA_INSUFFICIENT", riskScore: 0, risks: ["no price/OI"] };
  if (dataFreshness === "STALE" || dataFreshness === "BUDGET_BLOCKED") {
    return { state: "LAB_FAST_STALE_DATA", riskScore: 0, risks: [`data ${dataFreshness.toLowerCase()}`] };
  }

  const fundingPct = (fundingRate || 0) * 100;
  const oiDeclining = (oi4h || 0) < 0;

  // Funding (max 25)
  if (fundingPct >= 15) { score += 25; risks.push(`funding ${fundingPct.toFixed(1)}% critical`); }
  else if (fundingPct >= 10) { score += 20; risks.push(`funding ${fundingPct.toFixed(1)}% extreme`); }
  else if (fundingPct >= 5) { score += 15; risks.push(`funding ${fundingPct.toFixed(1)}% elevated`); }
  if ((fundingStreak || 0) >= 6) { score += 5; risks.push(`streak ${fundingStreak}`); }

  // OI (max 25)
  if (oiDeclining) { score += 15; risks.push("OI declining"); }
  else if (oi4h && oi > 0 && (oi4h / (oi - oi4h)) > 0.10) { score += 15; risks.push("OI accelerating 10%+"); }
  else if (oi4h && oi > 0 && (oi4h / (oi - oi4h)) > 0.05) { score += 10; risks.push("OI accelerating"); }

  // Liquidation (max 25) — only score if data is fresh (<15min cache)
  if (liqCacheAge !== null && liqCacheAge <= 15 && liq4h && oi) {
    const liqRatio = liq4h / oi;
    if (liqRatio > 0.01) { score += 20; risks.push("liq/OI > 1%"); }
    else if (liqRatio > 0.005) { score += 15; risks.push("liq/OI elevated"); }
    else if (liq4h > 2e6) { score += 10; risks.push("liq > $2M"); }
    if (liq4h > 1e6) { score += 5; risks.push("liq > $1M"); }
  }

  // State
  let state = "LAB_FAST_CLEAR";
  if (oiDeclining && liq4h && liq4h > 1e6 && liqCacheAge !== null && liqCacheAge <= 15) state = "LAB_FAST_DELEVERAGING_CANDIDATE";
  else if (oiDeclining && fundingPct >= 5) state = "LAB_FAST_OI_ROLLOVER_CANDIDATE";
  else if (liq4h && oi && (liq4h / oi) > 0.005 && liqCacheAge !== null && liqCacheAge <= 15) state = "LAB_FAST_LIQUIDATION_SPIKE";
  else if (fundingPct >= 5 && (fundingStreak || 0) >= 6) state = "LAB_FAST_FUNDING_OVERHEATED";
  else if (oi4h && oi > 0 && (oi4h / (oi - oi4h)) > 0.05) state = "LAB_FAST_OI_ACCELERATING";
  else if (price > 0) state = "LAB_FAST_CLEAR";

  return { state, riskScore: Math.min(100, score), risks };
}

// ── Main ──

async function main() {
  const mode = getMode();
  const withOkx = getWithOkx();
  console.log(`=== LAB Fast Watch [${mode}] ===\n`);

  if (process.env.NO_ARKHAM_MODE !== "true") {
    console.log("LAB_FAST_WATCH_REQUIRES_NO_ARKHAM_MODE");
    return;
  }

  for (const d of [OUT_DIR, CACHE_DIR, REPORTS_DIR]) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

  const ts = new Date().toISOString();
  const maxExt = getMaxExternalCalls(mode);
  const maxCg = getMaxCoinGlassCalls(mode);
  let extCalls = 0, cgCalls = 0, cgCallsCounted = 0, okxCalls = 0;
  const cgBudget = canCallCoinGlass(maxCg);

  // Fetch
  const price = await fetchPrice(mode);
  extCalls += price.calls;

  const oi = await fetchCoinGlassOI(mode, cgBudget);
  if (oi.calls > 0) { extCalls += oi.calls; cgCalls += oi.calls; }

  // In micro mode, liq and funding use cache ONLY — no API calls
  const liqMode = mode === "micro" ? "micro" : mode;
  const fundMode = mode === "micro" ? "micro" : mode;
  // For micro: force budget blocked so only cache is used
  const microBudget = mode === "micro" ? { ok: false, used: cgBudget.used, remaining: cgBudget.remaining } : cgBudget;

  const liq = await fetchCoinGlassLiq(liqMode, microBudget);
  if (liq.calls > 0) { extCalls += liq.calls; cgCalls += liq.calls; }

  const fund = await fetchFunding(fundMode, microBudget);
  if (fund.calls > 0) { extCalls += fund.calls; cgCalls += fund.calls; }

  // OKX: only with --with-okx AND budget allows (OKX = 2 calls)
  let okx = { oiUsd: null as number | null, funding: null as number | null, calls: 0 };
  if (withOkx && extCalls + 2 <= maxExt) {
    okx = await fetchOkxQuick(mode);
    extCalls += okx.calls; okxCalls += okx.calls;
  }

  // Data freshness
  const oiAge = getCacheAge("oi"), fundAge = getCacheAge("funding"), liqAge = getCacheAge("liq");
  let freshness = "FRESH";
  if (oiAge !== null && oiAge > 15) freshness = "STALE";
  else if (!cgBudget.ok && oi.calls === 0) freshness = "BUDGET_BLOCKED";
  else if (oiAge !== null && oiAge > 5 && liqAge !== null && liqAge > 15) freshness = "PARTIAL_CACHE";

  const { state, riskScore, risks } = classifyFast(
    price.price, oi.oi, oi.oi4h, fund.rate, fund.streak,
    liq.liq4h, liqAge, freshness,
  );

  const reviewLabel = riskScore >= 71 ? "HIGH_RISK_REVIEW" : riskScore >= 51 ? "REVIEW_REQUIRED" : riskScore >= 31 ? "WATCH" : "OBSERVE";
  const cgUsedAfter = getTodayCoinGlassCalls();
  const cgRemaining = CG_COINGLASS_LIMIT - cgUsedAfter;

  // Console
  console.log(`Price: $${price.price?.toFixed(4) || "?"} (${price.source})`);
  console.log(`OI: $${(oi.oi || 0).toFixed(0)} | 4h: ${(oi.oi4h ?? 0) >= 0 ? "+" : ""}$${(oi.oi4h || 0).toFixed(0)} | age: ${oiAge?.toFixed(0) ?? "?"}min`);
  console.log(`Funding: ${fund.rate ? (fund.rate * 100).toFixed(2) + "%" : "?"} | streak: ${fund.streak ?? "?"} | age: ${fundAge?.toFixed(0) ?? "?"}min`);
  console.log(`Liq 4h: $${(liq.liq4h || 0).toFixed(0)} | age: ${liqAge?.toFixed(0) ?? "?"}min`);
  console.log(`Calls: ext=${extCalls} cg=${cgCalls} okx=${okxCalls} | CG budget: ${cgUsedAfter}/${CG_COINGLASS_LIMIT} (${cgRemaining} left)`);
  console.log(`${state} | Risk: ${riskScore}/100 | ${reviewLabel} | Freshness: ${freshness}`);
  if (risks.length > 0) console.log(`Risks: ${risks.join("; ")}`);

  // Append CSV
  const snapH = "timestamp,token,mode,price_usd,price_source,coinglass_oi_usd,oi_change_4h,funding_rate_percent,funding_streak,liq_4h,okx_oi_usd,okx_funding,fast_watch_state,risk_score,review_label,total_external_calls,coinglass_calls,okx_calls,cg_budget_used,cg_budget_remaining,oi_cache_age_min,funding_cache_age_min,liq_cache_age_min,data_freshness_status,limitations";
  const snapRow = [
    ts, LAB.sym, mode, price.price || "", price.source,
    oi.oi || "", oi.oi4h || "",
    fund.rate ? (fund.rate * 100).toFixed(2) : "", fund.streak || "",
    liq.liq4h || "", okx.oiUsd || "", okx.funding ? (okx.funding * 100).toFixed(2) : "",
    state, riskScore, reviewLabel, extCalls, cgCalls, okxCalls,
    cgUsedAfter, cgRemaining,
    oiAge?.toFixed(1) || "", fundAge?.toFixed(1) || "", liqAge?.toFixed(1) || "",
    freshness,
    [freshness === "STALE" ? "stale data" : "", freshness === "BUDGET_BLOCKED" ? "budget blocked" : "", !cgBudget.ok ? "over limit" : ""].filter(Boolean).join("; "),
  ];
  const esc = (v: any) => String(v ?? "").includes(",") ? `"${v}"` : String(v ?? "");
  const snapPath = join(OUT_DIR, "lab_fast_watch.csv");
  if (!existsSync(snapPath)) writeFileSync(snapPath, snapH + "\n");
  appendFileSync(snapPath, snapRow.map(esc).join(",") + "\n");

  // ── Scheduler plan (first run only) ──
  const planPath = join(REPORTS_DIR, "lab_fast_watch_scheduler_plan.md");
  if (!existsSync(planPath)) {
    const planLines = [
      "# LAB Fast Watch Scheduler Plan", "",
      `Generated: ${ts}`,
      `CoinGlass plan: HOBBYIST (daily limit ~${CG_COINGLASS_LIMIT})`,
      `CoinGlass intraday: NOT AVAILABLE (5m/15m/1h all 403, only 4h+)`,
      "",
      "## Safe Plan (recommended for HOBBYIST)", "",
      "Every 10 minutes, standard mode:",
      "```bash",
      "*/10 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode standard",
      "```",
      "Every 1 hour, full report:",
      "```bash",
      "0 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:live-monitor",
      "```",
      `Daily CoinGlass calls: ~${Math.ceil(6 * 24 * 3)} (standard: 3 CG calls × 6/hr × 24hr) — SAFE under ${CG_COINGLASS_LIMIT}`,
      "",
      "## Aggressive But Budget-Aware Plan",
      "Every 5 minutes, micro mode (OI only):",
      "```bash",
      "*/5 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode micro",
      "```",
      "Every 15 minutes, standard mode:",
      "```bash",
      "*/15 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode standard",
      "```",
      `Daily CoinGlass calls: ${12*24*1 + 4*24*3} (micro: 1 CG × 12/hr + standard: 3 CG × 4/hr) — SAFE under ${CG_COINGLASS_LIMIT}`,
      "",
      "## NOT SAFE",
      `5-minute STANDARD mode all day: ${12*24*3} CG calls/day — EXCEEDS ${CG_COINGLASS_LIMIT}`,
      "Do NOT run standard mode every 5 minutes on HOBBYIST plan.",
      "",
      "## Note",
      "CoinGlass 5m/15m/1h intraday OI and liquidation are NOT available on HOBBYIST plan.",
      "Fast watch uses 4h OI endpoint. Snapshot-to-snapshot deltas are NOT true 5m OI changes.",
      "They are differences between successive 4h-OHLC readings — approximate trend only.",
    ];
    writeFileSync(planPath, planLines.join("\n"));
    console.log(`\nScheduler plan: ${planPath}`);
  }

  // Light report
  const reportLines = [
    "# LAB Fast Watch", "",
    `Generated: ${ts} | Mode: ${mode}`,
    `State: **${state}** | Risk: **${riskScore}/100** | ${reviewLabel} | Freshness: ${freshness}`,
    "",
    `- Price: $${price.price?.toFixed(4) || "?"} (${price.source})`,
    `- OI: $${(oi.oi || 0).toFixed(0)} (4h: ${(oi.oi4h ?? 0) >= 0 ? "+" : ""}$${(oi.oi4h || 0).toFixed(0)}, age: ${oiAge?.toFixed(0) ?? "?"}min)`,
    `- Funding: ${fund.rate ? (fund.rate * 100).toFixed(2) + "%" : "?"} | streak: ${fund.streak ?? "?"} | age: ${fundAge?.toFixed(0) ?? "?"}min`,
    `- Liq 4h: $${(liq.liq4h || 0).toFixed(0)} (age: ${liqAge?.toFixed(0) ?? "?"}min)`,
    `- OKX OI: $${okx.oiUsd?.toFixed(0) || "not queried"}`,
    `- CG budget: ${cgUsedAfter}/${CG_COINGLASS_LIMIT} (${cgRemaining} remaining)`,
    "",
    `Risks: ${risks.length > 0 ? risks.join("; ") : "none"}`,
    "",
    `**No trading recommendation.**`,
    `CoinGlass 4h-only. Snapshot deltas are NOT intraday OI.`,
  ];
  writeFileSync(join(REPORTS_DIR, "lab_fast_watch_latest.md"), reportLines.join("\n"));
  console.log(`Report: ${REPORTS_DIR}/lab_fast_watch_latest.md`);
}

main().catch(console.error);
