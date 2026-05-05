import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const CACHE_DIR = join(OUT_DIR, "cache");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const LAB = { sym: "LAB", cgId: "lab", okxInstId: "LAB-USDT-SWAP" };

const CG_API = process.env.COINGLASS_API_KEY || "";
const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";

// ── Cache helpers ──
function cacheGet(key: string, maxAgeMin: number): { hit: boolean; data?: string } {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return { hit: false };
  try {
    const stat = require("fs").statSync(path);
    const age = (Date.now() - stat.mtimeMs) / 60000;
    if (age > maxAgeMin) return { hit: false };
    return { hit: true, data: readFileSync(path, "utf-8") };
  } catch { return { hit: false }; }
}
function cachePut(key: string, data: string) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), data);
}

async function fetchWithCache(url: string, headers: Record<string, string>, cacheKey: string, maxAgeMin: number): Promise<{ data: string; cached: boolean }> {
  const cached = cacheGet(cacheKey, maxAgeMin);
  if (cached.hit && cached.data) return { data: cached.data, cached: true };
  const r = await fetch(url, { headers });
  const text = await r.text();
  cachePut(cacheKey, text);
  return { data: text, cached: false };
}

// ── Fetchers ──

async function fetchPrice(): Promise<{ price: number | null; return1h: number | null; return24h: number | null; source: string; calls: number }> {
  // Try CoinGecko simple price first (lighter)
  const url = `https://pro-api.coingecko.com/api/v3/simple/price?ids=${LAB.cgId}&vs_currencies=usd&include_24hr_change=true${CG_KEY ? "&x_cg_pro_api_key=" + CG_KEY : ""}`;
  try {
    const r = await fetch(url);
    if (r.ok) {
      const j = await r.json();
      const usd = j[LAB.cgId]?.usd || null;
      const chg = j[LAB.cgId]?.usd_24h_change || null;
      if (usd) {
        // Cache for 5min
        cachePut("price", JSON.stringify({ price: usd, return24h: chg, ts: new Date().toISOString() }));
        return { price: usd, return1h: null, return24h: chg, source: "coingecko_simple", calls: 1 };
      }
    }
  } catch { /* fall through */ }

  // Fallback: read from snapshot v2
  const snapPath = join(OUT_DIR, "lab_live_feature_snapshot_v2.csv");
  if (existsSync(snapPath)) {
    const lines = readFileSync(snapPath, "utf-8").trim().split("\n");
    if (lines.length > 1) {
      const last = lines[lines.length - 1].split(",");
      return { price: parseFloat(last[2]) || null, return1h: parseFloat(last[5]) || null, return24h: parseFloat(last[6]) || null, source: "snapshot_cache", calls: 0 };
    }
  }
  return { price: null, return1h: null, return24h: null, source: "unavailable", calls: 0 };
}

async function fetchCoinGlassOI(): Promise<{ oi: number | null; oiPrev: number | null; oi4h: number | null; calls: number }> {
  if (!CG_API) return { oi: null, oiPrev: null, oi4h: null, calls: 0 };
  const { data, cached } = await fetchWithCache(
    `https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=${LAB.sym}&interval=4h&limit=2&unit=usd`,
    { "CG-API-KEY": CG_API }, "cg_oi_latest", 5
  );
  try {
    const j = JSON.parse(data);
    if (j.code === "0" && j.data?.length >= 2) {
      const latest = parseFloat(j.data[j.data.length - 1].close || "0");
      const prev = parseFloat(j.data[j.data.length - 2].close || "0");
      const oi4h = latest - prev;
      return { oi: latest, oiPrev: prev, oi4h, calls: cached ? 0 : 1 };
    }
  } catch { /* parse error */ }
  return { oi: null, oiPrev: null, oi4h: null, calls: 0 };
}

async function fetchCoinGlassLiq(): Promise<{ liq4h: number | null; liqLong4h: number | null; liqShort4h: number | null; calls: number }> {
  if (!CG_API) return { liq4h: null, liqLong4h: null, liqShort4h: null, calls: 0 };
  try {
    const { data, cached } = await fetchWithCache(
      `https://open-api-v4.coinglass.com/api/futures/liquidation/aggregated-history?symbol=${LAB.sym}&interval=4h&limit=1&exchange_list=Binance,OKX,Bybit`,
      { "CG-API-KEY": CG_API }, "cg_liq_latest", 5
    );
    const j = JSON.parse(data);
    if (j.code === "0" && j.data?.length > 0) {
      const latest = j.data[j.data.length - 1];
      const long = parseFloat(latest.aggregated_long_liquidation_usd || "0");
      const short = parseFloat(latest.aggregated_short_liquidation_usd || "0");
      return { liq4h: long + short, liqLong4h: long, liqShort4h: short, calls: cached ? 0 : 1 };
    }
  } catch { /* fall through */ }
  return { liq4h: null, liqLong4h: null, liqShort4h: null, calls: 0 };
}

async function fetchFunding(): Promise<{ rate: number | null; streak: number | null; cacheAge: number | null; calls: number }> {
  if (!CG_API) return { rate: null, streak: null, cacheAge: null, calls: 0 };
  try {
    const { data, cached } = await fetchWithCache(
      `https://open-api-v4.coinglass.com/api/futures/funding-rate/oi-weight-history?symbol=${LAB.sym}&interval=4h&limit=12`,
      { "CG-API-KEY": CG_API }, "cg_funding", 15
    );
    const j = JSON.parse(data);
    if (j.code === "0" && j.data?.length > 0) {
      const vals = j.data.map((d: any) => parseFloat(d.close || "0")).filter((v: number) => !isNaN(v));
      const latest = vals[vals.length - 1] || 0;
      let streak = 0;
      for (let i = vals.length - 1; i >= 0 && vals[i] > 0; i--) streak++;
      return { rate: latest, streak, cacheAge: cached ? 15 : 0, calls: cached ? 0 : 1 };
    }
  } catch { /* fall through */ }
  return { rate: null, streak: null, cacheAge: null, calls: 0 };
}

async function fetchOkxQuick(): Promise<{ oiUsd: number | null; funding: number | null; calls: number }> {
  try {
    const r = await fetch(`https://www.okx.com/api/v5/public/open-interest?instId=${LAB.okxInstId}`);
    const j = await r.json();
    const oiUsd = j.data?.[0]?.oiUsd ? parseFloat(j.data[0].oiUsd) : null;

    const frR = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${LAB.okxInstId}`);
    const frJ = await frR.json();
    const funding = frJ.data?.[0]?.fundingRate ? parseFloat(frJ.data[0].fundingRate) : null;

    return { oiUsd, funding, calls: 2 };
  } catch { return { oiUsd: null, funding: null, calls: 0 }; }
}

// ── State machine ──

function classifyFast(
  price: number | null, return1h: number | null,
  oi: number | null, oi4h: number | null,
  fundingRate: number | null, fundingStreak: number | null,
  liq4h: number | null,
  okxOi: number | null, okxFunding: number | null,
  dataOk: boolean
): { state: string; riskScore: number; risks: string[] } {
  const risks: string[] = [];
  let score = 0;

  if (!dataOk || !price || !oi) {
    return { state: "LAB_FAST_DATA_INSUFFICIENT", riskScore: 0, risks: ["data insufficient"] };
  }

  // Funding risk (max 25)
  const fundingPct = (fundingRate || 0) * 100;
  if (fundingPct >= 10) { score += 20; risks.push(`funding ${fundingPct.toFixed(1)}% extreme`); }
  else if (fundingPct >= 5) { score += 15; risks.push(`funding ${fundingPct.toFixed(1)}% elevated`); }
  if ((fundingStreak || 0) >= 6) { score += 5; risks.push(`funding streak ${fundingStreak}`); }

  // OI risk (max 25)
  const oiDeclining = (oi4h || 0) < 0;
  if (oiDeclining) { score += 15; risks.push("OI 4h declining"); }
  else if (oi4h && oi > 0 && (oi4h / (oi - oi4h)) > 0.05) { score += 10; risks.push("OI accelerating"); }

  // Liquidation risk (max 25)
  if (liq4h && oi && (liq4h / oi) > 0.005) { score += 15; risks.push("liq/OI elevated"); }
  else if (liq4h && liq4h > 1e6) { score += 10; risks.push("liq > $1M 4h"); }

  // Efficiency decay (max 15)
  if (return1h !== null && return1h <= 0 && !oiDeclining) { score += 8; risks.push("price flat/declining while OI rising"); }

  // OKX cross-check (informational)
  if (okxOi && oi && (okxOi / oi) < 0.01) risks.push("OKX OI < 1% global — not main venue");

  // State determination
  let state = "LAB_FAST_CLEAR";
  if (oiDeclining && liq4h && liq4h > 500000) state = "LAB_FAST_DELEVERAGING_CANDIDATE";
  else if (oiDeclining && (fundingPct >= 5)) state = "LAB_FAST_OI_ROLLOVER_CANDIDATE";
  else if (liq4h && oi && (liq4h / oi) > 0.005) state = "LAB_FAST_LIQUIDATION_SPIKE";
  else if (return1h !== null && return1h <= 0 && !oiDeclining && fundingPct >= 5) state = "LAB_FAST_EFFICIENCY_DECAY_CANDIDATE";
  else if (fundingPct >= 5 && (fundingStreak || 0) >= 6) state = "LAB_FAST_FUNDING_OVERHEATED";
  else if (oi4h && oi > 0 && (oi4h / (oi - oi4h)) > 0.05) state = "LAB_FAST_OI_ACCELERATING";
  else if (return1h !== null && return1h > 0) state = "LAB_FAST_BREAKOUT_CONTINUES";

  return { state, riskScore: Math.min(100, score), risks };
}

// ── Main ──

async function main() {
  console.log("=== LAB 5-Min Fast Watch ===\n");

  if (process.env.NO_ARKHAM_MODE !== "true") {
    console.log("LAB_FAST_WATCH_REQUIRES_NO_ARKHAM_MODE");
    return;
  }

  for (const d of [OUT_DIR, CACHE_DIR, REPORTS_DIR]) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

  const ts = new Date().toISOString();
  let totalCalls = 0, cacheHits = 0;

  // Fetch — max 3 external calls prioritized
  const priceResult = await fetchPrice();
  totalCalls += priceResult.calls;

  const oiResult = await fetchCoinGlassOI();
  totalCalls += oiResult.calls;

  const liqResult = await fetchCoinGlassLiq();
  totalCalls += liqResult.calls;

  const fundResult = await fetchFunding();
  totalCalls += fundResult.calls;

  // OKX is extra, only if budget allows (skip if already 3+ calls)
  let okxResult = { oiUsd: null as number | null, funding: null as number | null, calls: 0 };
  if (totalCalls < 3) {
    okxResult = await fetchOkxQuick();
    totalCalls += okxResult.calls;
  }

  // Read previous snapshot for 5m/15m change computation
  const snapPath = join(OUT_DIR, "lab_fast_watch.csv");
  let prevOi: number | null = null;
  let prevLiq: number | null = null;
  if (existsSync(snapPath)) {
    const lines = readFileSync(snapPath, "utf-8").trim().split("\n");
    if (lines.length > 1) {
      const prevData = lines[lines.length - 1].split(",");
      prevOi = parseFloat(prevData[8]) || null;
      prevLiq = parseFloat(prevData[18]) || null;
    }
  }

  const oiChange5m = (oiResult.oi && prevOi) ? oiResult.oi - prevOi : null;
  const oiChange15m = null; // Not computable with 4h-only interval
  const liqChange = (liqResult.liq4h && prevLiq) ? liqResult.liq4h - prevLiq : null;

  const dataOk = !!(priceResult.price && oiResult.oi);
  const { state, riskScore, risks } = classifyFast(
    priceResult.price, priceResult.return1h,
    oiResult.oi, oiResult.oi4h,
    fundResult.rate, fundResult.streak,
    liqResult.liq4h,
    okxResult.oiUsd, okxResult.funding,
    dataOk
  );

  const reviewLabel = riskScore >= 51 ? "REVIEW_REQUIRED" : riskScore >= 31 ? "WATCH" : "OBSERVE";

  // Console output
  console.log(`Price: $${priceResult.price?.toFixed(4) || "?"} (${priceResult.source})`);
  const oi4hVal = oiResult.oi4h ?? 0;
  console.log(`OI: $${(oiResult.oi || 0).toFixed(0)} | 4h: ${oi4hVal >= 0 ? "+" : ""}$${oi4hVal.toFixed(0)} | prev_diff: ${oiChange5m !== null ? "$" + oiChange5m.toFixed(0) : "N/A"}`);
  console.log(`Funding: ${fundResult.rate ? (fundResult.rate * 100).toFixed(2) + "%" : "?"} | streak: ${fundResult.streak ?? "?"} | cache: ${fundResult.cacheAge ?? "?"}min`);
  console.log(`Liq 4h: $${(liqResult.liq4h || 0).toFixed(0)} | prev_diff: ${liqChange !== null ? "$" + liqChange.toFixed(0) : "N/A"}`);
  console.log(`API calls: ${totalCalls} | State: ${state} | Risk: ${riskScore}/100 | ${reviewLabel}`);
  console.log(`Risks: ${risks.length > 0 ? risks.join("; ") : "none"}`);

  // Append CSV
  const snapH = "timestamp,token,price_usd,price_source,return_1h,return_24h,coinglass_oi_usd,oi_change_from_prev,oi_change_4h,funding_rate_percent,funding_cache_age_min,funding_streak,liquidation_volume_4h,liq_long_4h,liq_short_4h,liq_change_from_prev,okx_oi_usd,okx_funding_rate,fast_watch_state,risk_score,review_label,api_calls_used,cache_hits,limitations";
  const snapRow = [
    ts, LAB.sym, priceResult.price || "", priceResult.source,
    priceResult.return1h || "", priceResult.return24h || "",
    oiResult.oi || "", oiChange5m || "", oiResult.oi4h || "",
    fundResult.rate ? (fundResult.rate * 100).toFixed(2) : "", fundResult.cacheAge || "",
    fundResult.streak || "",
    liqResult.liq4h || "", liqResult.liqLong4h || "", liqResult.liqShort4h || "",
    liqChange || "",
    okxResult.oiUsd || "", okxResult.funding ? (okxResult.funding * 100).toFixed(2) : "",
    state, riskScore, reviewLabel, totalCalls, cacheHits,
    [!dataOk ? "data insufficient" : "", oiResult.oi4h === null ? "OI 4h unavailable" : ""].filter(Boolean).join("; "),
  ];
  const escapeCsv = (v: any) => String(v ?? "").includes(",") ? `"${v}"` : String(v ?? "");
  const isNew = !existsSync(snapPath);
  if (isNew) writeFileSync(snapPath, snapH + "\n" + snapRow.map(escapeCsv).join(",") + "\n");
  else appendFileSync(snapPath, snapRow.map(escapeCsv).join(",") + "\n");

  // Light report
  const reportLines = [
    "# LAB Fast Watch", "",
    `Generated: ${ts}`,
    `State: **${state}** | Risk: **${riskScore}/100** | ${reviewLabel}`,
    "",
    `- Price: $${priceResult.price?.toFixed(4) || "?"} (source: ${priceResult.source})`,
    `- OI: $${(oiResult.oi || 0).toFixed(0)} (4h: ${oi4hVal >= 0 ? "+" : ""}$${oi4hVal.toFixed(0)})`,
    `- Funding: ${fundResult.rate ? (fundResult.rate * 100).toFixed(2) + "%" : "?"} | streak: ${fundResult.streak ?? "?"}`,
    `- Liq 4h: $${(liqResult.liq4h || 0).toFixed(0)}`,
    `- OKX OI: $${okxResult.oiUsd?.toFixed(0) || "?"}`,
    "",
    `Risks: ${risks.length > 0 ? risks.join("; ") : "none"}`,
    "",
    `**No trading recommendation.**`,
    `CoinGlass HOBBYIST plan: 4h minimum interval, intraday OI/liq not available.`,
  ];
  writeFileSync(join(REPORTS_DIR, "lab_fast_watch_latest.md"), reportLines.join("\n"));

  console.log(`\nCSV: ${snapPath}`);
}

main().catch(console.error);
