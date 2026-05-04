import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { getCoinGeckoAuth } from "../../data_sources/coingecko_auth.js";

const auth = getCoinGeckoAuth();
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "dex_history");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "dex_history");
const POOLS_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "coingecko", "pools", "primary_pools.csv");

interface PoolInfo { token: string; address: string; network: string; dexId: string; poolName: string; reserveUsd: number; volH24: number; txH24: number; confidence: string; liqShare: number; volShare: number; }

interface OhlcvCandle { ts: number; open: number; high: number; low: number; close: number; volume: number; }

interface DexFeatureRow {
  token: string; timeframe: string; timestamp: string; ts: number;
  open: number; high: number; low: number; close: number; volume: number;
  return1: number | null; return3: number | null; return7: number | null;
  volMa7: number | null; volMa30: number | null; volZScore7: number | null;
  range3: number | null; volatility7: number | null;
  compressionCandidate: boolean; expansionCandidate: boolean;
}

interface DexQualityRow {
  token: string; primaryPoolAvailable: boolean; primaryPoolConfidence: string;
  hourRows: number; fourHourRows: number; dayRows: number;
  hourDays: number; fourHourDays: number; dayDays: number;
  coversBreakout: boolean; coversPeak: boolean;
  readinessScore: number; readinessLabel: string; limitations: string[];
}

const TOKENS = [
  { sym: "BSB", isBase: true, breakout: "2026-04-25", peak: "2026-04-28" },
  { sym: "LAB", isBase: true, breakout: "2026-04-23", peak: "2026-05-02" },
  { sym: "PEPE", isBase: true, breakout: "2026-01-03", peak: "2026-01-03" },
  { sym: "WIF", isBase: true, breakout: "2026-01-05", peak: "2026-01-05" },
  { sym: "BONK", isBase: true, breakout: "2025-07-15", peak: "2025-07-15" },
  { sym: "FLOKI", isBase: true, breakout: "2026-03-01", peak: "2026-03-01" },
];

function loadPools(): Map<string, PoolInfo> {
  const m = new Map<string, PoolInfo>();
  if (!existsSync(POOLS_PATH)) return m;
  const lines = readFileSync(POOLS_PATH, "utf-8").split("\n").slice(1);
  for (const line of lines) {
    const p = line.split(",");
    m.set(p[0], { token: p[0], address: p[1], network: p[2], dexId: p[3], poolName: p[4], reserveUsd: parseFloat(p[5]), volH24: parseFloat(p[6]), txH24: parseInt(p[7]), confidence: p[15], liqShare: parseFloat(p[9]), volShare: parseFloat(p[10]) });
  }
  return m;
}

async function fetchOhlcv(poolAddr: string, network: string, timeframe: string, aggregate: number, limit: number, tokenParam: string): Promise<OhlcvCandle[]> {
  try {
    const url = `${auth.baseUrl}/onchain/networks/${network}/pools/${poolAddr}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd&token=${tokenParam}&include_empty_intervals=true`;
    const r = await fetch(url, { headers: auth.headers });
    if (!r.ok) return [];
    const d = await r.json() as any;
    const ohlcvList = d?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(ohlcvList)) return [];
    return ohlcvList.map((c: any[]) => ({ ts: parseInt(c[0]) * 1000, open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]) }));
  } catch { return []; }
}

function computeFeatures(candles: OhlcvCandle[], token: string, timeframe: string, poolConfidence: string): DexFeatureRow[] {
  const rows: DexFeatureRow[] = [];
  const closes = candles.map(c => c.close);
  const vols = candles.map(c => c.volume);
  const n = candles.length;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const ret1 = i >= 1 && closes[i-1] > 0 ? (c.close - closes[i-1]) / closes[i-1] : null;
    const ret3 = i >= 3 && closes[i-3] > 0 ? (c.close - closes[i-3]) / closes[i-3] : null;
    const ret7 = i >= 7 && closes[i-7] > 0 ? (c.close - closes[i-7]) / closes[i-7] : null;

    const volSlice7 = vols.slice(Math.max(0, i - 6), i + 1);
    const volSlice30 = vols.slice(Math.max(0, i - 29), i + 1);
    const volMa7 = volSlice7.reduce((a, b) => a + b, 0) / volSlice7.length;
    const volMa30 = volSlice30.reduce((a, b) => a + b, 0) / volSlice30.length;
    const volStd30 = Math.sqrt(volSlice30.reduce((s, v) => s + (v - volMa30) ** 2, 0) / Math.max(volSlice30.length, 1));
    const volZ7 = volStd30 > 0 ? (volMa7 - volMa30) / volStd30 : null;

    const range3 = i >= 2 ? (Math.max(...closes.slice(i - 2, i + 1)) - Math.min(...closes.slice(i - 2, i + 1))) / Math.min(...closes.slice(i - 2, i + 1)) : null;
    const rets7: number[] = [];
    for (let j = Math.max(0, i - 6); j <= i; j++) { if (j > 0 && closes[j-1] > 0) rets7.push(Math.log(closes[j] / closes[j-1])); }
    const vol7 = rets7.length > 0 ? Math.sqrt(rets7.reduce((s, r) => s + r * r, 0) / rets7.length) : null;

    const compression = range3 !== null && volMa7 < volMa30 * 0.8 && vol7 !== null && vol7 < 0.05;
    const expansion = volZ7 !== null && volZ7 > 2 && ret3 !== null && ret3 > 0.1;

    rows.push({
      token, timeframe, timestamp: new Date(c.ts).toISOString(), ts: c.ts,
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      return1: ret1, return3: ret3, return7: ret7,
      volMa7, volMa30, volZScore7: volZ7,
      range3, volatility7: vol7,
      compressionCandidate: compression, expansionCandidate: expansion,
    });
  }
  return rows;
}

async function main() {
  console.log("=== DEX History Data Pipeline ===\n");
  console.log(`Auth: ${auth.mode} | ${auth.baseUrl}\n`);

  if (!existsSync(OUT_DIR + "/raw")) mkdirSync(OUT_DIR + "/raw", { recursive: true });
  if (!existsSync(OUT_DIR + "/features")) mkdirSync(OUT_DIR + "/features", { recursive: true });
  if (!existsSync(OUT_DIR + "/analysis")) mkdirSync(OUT_DIR + "/analysis", { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const pools = loadPools();
  console.log(`Loaded ${pools.size} primary pools\n`);

  const allFeatures: DexFeatureRow[] = [];
  const allQuality: DexQualityRow[] = [];

  for (const token of TOKENS) {
    const pool = pools.get(token.sym);
    if (!pool) { console.log(`${token.sym}: NO PRIMARY POOL — skipping`); continue; }

    const tokenDir = token.isBase ? "base" : token.sym;
    console.log(`${token.sym}: ${pool.poolName} (${pool.dexId}, ${pool.network}) conf=${pool.confidence}`);

    const hourCandles = await fetchOhlcv(pool.address, pool.network, "hour", 1, 720, tokenDir);
    const fourHourCandles = await fetchOhlcv(pool.address, pool.network, "hour", 4, 540, tokenDir);
    const dayCandles = await fetchOhlcv(pool.address, pool.network, "day", 1, 90, tokenDir);

    console.log(`  Hour: ${hourCandles.length} | 4H: ${fourHourCandles.length} | Day: ${dayCandles.length}`);

    // Save raw
    if (hourCandles.length > 0) writeFileSync(join(OUT_DIR, "raw", `${token.sym}_pool_ohlcv_hour.json`), JSON.stringify(hourCandles));
    if (fourHourCandles.length > 0) writeFileSync(join(OUT_DIR, "raw", `${token.sym}_pool_ohlcv_4h.json`), JSON.stringify(fourHourCandles));
    if (dayCandles.length > 0) writeFileSync(join(OUT_DIR, "raw", `${token.sym}_pool_ohlcv_day.json`), JSON.stringify(dayCandles));

    // Features
    const hourFeats = computeFeatures(hourCandles, token.sym, "hour", pool.confidence);
    const dayFeats = computeFeatures(dayCandles, token.sym, "day", pool.confidence);
    allFeatures.push(...hourFeats, ...dayFeats);

    // Data quality
    const hourDays = hourCandles.length > 0 ? Math.round(hourCandles.length / 24) : 0;
    const dayDays = dayCandles.length;
    const coversBreakout = dayCandles.length > 0 && new Date(dayCandles[0].ts) <= new Date(token.breakout) && new Date(dayCandles[dayCandles.length - 1].ts) >= new Date(token.breakout);
    const coversPeak = dayCandles.length > 0 && new Date(dayCandles[0].ts) <= new Date(token.peak) && new Date(dayCandles[dayCandles.length - 1].ts) >= new Date(token.peak);

    const limitations: string[] = [];
    if (token.sym === "BSB") limitations.push("MULTICHAIN_POOL_RESOLUTION_REQUIRED — single-chain pool only");
    if (pool.confidence === "MEDIUM" || pool.confidence === "LOW") limitations.push(`Primary pool confidence is ${pool.confidence}`);
    if (dayCandles.length < 10) limitations.push("Day OHLCV insufficient (<10 candles)");
    if (hourCandles.length < 10) limitations.push("Hour OHLCV insufficient");

    let readinessScore = 0;
    if (pool.confidence === "HIGH") readinessScore += 30; else if (pool.confidence === "MEDIUM") readinessScore += 15;
    if (dayCandles.length >= 30) readinessScore += 30; else if (dayCandles.length >= 10) readinessScore += 15;
    if (hourCandles.length >= 100) readinessScore += 25; else if (hourCandles.length >= 10) readinessScore += 10;
    if (coversBreakout && coversPeak) readinessScore += 15;

    let label = "DEX_HISTORY_INSUFFICIENT";
    if (readinessScore >= 60) label = "DEX_HISTORY_READY";
    else if (readinessScore >= 35) label = "DEX_HISTORY_PARTIAL";
    else if (readinessScore >= 15) label = "DEX_HISTORY_LOW_CONFIDENCE";

    allQuality.push({ token: token.sym, primaryPoolAvailable: true, primaryPoolConfidence: pool.confidence, hourRows: hourCandles.length, fourHourRows: fourHourCandles.length, dayRows: dayCandles.length, hourDays, fourHourDays: Math.round(fourHourCandles.length / 6), dayDays, coversBreakout, coversPeak, readinessScore, readinessLabel: label, limitations });

    console.log(`  Readiness: ${label} (score=${readinessScore})`);
    console.log("");
  }

  // Write features CSV
  if (allFeatures.length > 0) {
    const fH = "token,timeframe,timestamp,close,volume,return_3,vol_zscore_7,range_3,volatility_7,compression,expansion";
    const fR = [fH, ...allFeatures.map(r => `${r.token},${r.timeframe},${r.timestamp},${r.close},${r.volume},${r.return3 ?? ""},${r.volZScore7 ?? ""},${r.range3 ?? ""},${r.volatility7 ?? ""},${r.compressionCandidate},${r.expansionCandidate}`)];
    writeFileSync(join(OUT_DIR, "features", "dex_history_feature_table.csv"), fR.join("\n"));
  }

  // Quality CSV
  const qH = "token,pool_confidence,hour_rows,day_rows,covers_breakout,covers_peak,readiness_score,readiness_label,limitations";
  const qR = [qH, ...allQuality.map(r => `${r.token},${r.primaryPoolConfidence},${r.hourRows},${r.dayRows},${r.coversBreakout},${r.coversPeak},${r.readinessScore},${r.readinessLabel},"${r.limitations.join("; ")}"`)];
  writeFileSync(join(OUT_DIR, "analysis", "dex_history_data_quality.csv"), qR.join("\n"));

  // Report
  const ready = allQuality.filter(r => r.readinessLabel === "DEX_HISTORY_READY").length;
  const partial = allQuality.filter(r => r.readinessLabel === "DEX_HISTORY_PARTIAL").length;
  console.log(`\n=== Summary: ${ready} READY, ${partial} PARTIAL, ${allQuality.length - ready - partial} LOW/INSUFFICIENT ===`);

  const reportLines = [
    "# DEX History Data Pipeline Report", "", `Generated: ${new Date().toISOString()}`,
    `Auth: ${auth.mode}`, "",
    "## 1. Token Coverage", "",
    "| Token | Pool | Confidence | Hour | Day | Covers Breakout | Covers Peak | Readiness |",
    "|-------|------|:---:|:---:|:---:|:---:|:---:|------|",
  ];
  for (const q of allQuality) {
    reportLines.push(`| ${q.token} | ${pools.get(q.token)?.poolName?.slice(0, 20) || "?"} | ${q.primaryPoolConfidence} | ${q.hourRows} | ${q.dayRows} | ${q.coversBreakout ? "✓" : "✗"} | ${q.coversPeak ? "✓" : "✗"} | ${q.readinessLabel} |`);
  }
  reportLines.push("", "## 2. What This Data Can Support", "",
    "- DEX pool-level OHLCV history (hour + day granularity)",
    "- DEX volume compression / expansion research",
    "- Primary pool price discovery research",
    "", "## 3. What This Data Cannot Prove", "",
    "- Cannot confirm accumulation (single pool ≠ all DEX activity)",
    "- Cannot confirm distribution (no trader identification)",
    "- Cannot identify buyer/seller (only pool-level data)",
    "- Multi-chain tokens need cross-chain pool resolution",
    "", "## 4. Recommendation", "",
    ready >= 4 ? "**READY_FOR_DEX_LEAD_LAG_ANALYSIS** — sufficient coverage for lead-lag study." : ready >= 2 ? "**PARTIAL_READY_FOR_DEX_LEAD_LAG_ANALYSIS** — some tokens ready, others need pool fixes." : "**NOT_READY_NEEDS_POOL_FIX**",
  );
  writeFileSync(join(REPORTS_DIR, "dex_history_data_pipeline_report.md"), reportLines.join("\n"));
  console.log(`\nReports saved.`);
}

main().catch(console.error);
