import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const CG_CACHE = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "cache", "price_features");
const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";
const CG_BASE = CG_KEY ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";

async function fetchAndCache(cgId: string): Promise<boolean> {
  const path = join(CG_CACHE, `${cgId}_90d.json`);
  if (existsSync(path)) return true;
  if (!CG_KEY) return false;
  try {
    const url = `${CG_BASE}/coins/${cgId}/market_chart?vs_currency=usd&days=90`;
    const r = await fetch(url, { headers: { "x-cg-pro-api-key": CG_KEY } });
    if (!r.ok) return false;
    const d = await r.json() as any;
    if (!d.prices) return false;
    writeFileSync(path, JSON.stringify({ token: cgId, fetched_at: new Date().toISOString(), prices: d.prices, market_caps: d.market_caps || [], total_volumes: d.total_volumes || [], status: "COMPLETE", data_points_count: d.prices.length }));
    return true;
  } catch { return false; }
}
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "metric_loop");
const REGISTRY_PATH = join(OUT_DIR, "metric_registry.csv");

interface Candle { ts: number; date: string; price: number; volume: number; }
interface MetricResult {
  metricId: string; token: string; date: string;
  value: number; sampleGroup: string; eventRelDay: number;
}

const TOKENS: { sym: string; cg: string; group: string; breakout: string; peak: string; }[] = [
  { sym: "LAB", cg: "lab", group: "P0", breakout: "2026-04-23", peak: "2026-05-02" },
  { sym: "UB", cg: "unibase", group: "P0", breakout: "2026-04-28", peak: "2026-05-02" },
  { sym: "BSB", cg: "block-street", group: "P0", breakout: "2026-04-25", peak: "2026-04-28" },
  { sym: "AI", cg: "gensyn", group: "P0", breakout: "2026-04-29", peak: "2026-04-29" },
  { sym: "SIREN", cg: "siren-2", group: "P2", breakout: "2026-05-01", peak: "2026-05-04" },
  { sym: "PENDLE", cg: "pendle", group: "P2", breakout: "2026-04-30", peak: "2026-05-04" },
  { sym: "ONDO", cg: "ondo-finance", group: "P2", breakout: "2026-05-01", peak: "2026-05-04" },
  { sym: "TAO", cg: "bittensor", group: "CONTROL", breakout: "", peak: "" },
  { sym: "DOGE", cg: "dogecoin", group: "CONTROL", breakout: "", peak: "" },
  { sym: "VIRTUAL", cg: "virtual-protocol", group: "CONTROL", breakout: "", peak: "" },
  { sym: "PEPE", cg: "pepe", group: "CONTROL", breakout: "", peak: "" },
  { sym: "WIF", cg: "dogwifcoin", group: "CONTROL", breakout: "", peak: "" },
  { sym: "FLOKI", cg: "floki", group: "CONTROL", breakout: "", peak: "" },
  { sym: "BONK", cg: "bonk", group: "CONTROL", breakout: "", peak: "" },
  { sym: "SHIB", cg: "shiba-inu", group: "CONTROL", breakout: "", peak: "" },
  { sym: "ENA", cg: "ethena", group: "CONTROL", breakout: "", peak: "" },
  { sym: "JUP", cg: "jupiter-exchange-solana", group: "CONTROL", breakout: "", peak: "" },
  { sym: "TIA", cg: "celestia", group: "CONTROL", breakout: "", peak: "" },
];

function loadCandles(cgId: string): Candle[] {
  const path = join(CG_CACHE, `${cgId}_90d.json`);
  if (!existsSync(path)) return [];
  const cache = JSON.parse(readFileSync(path, "utf-8"));
  const prices = cache.prices || [], vols = cache.total_volumes || [];
  const daily = new Map<string, { p: number; v: number }>();
  for (let i = 0; i < prices.length; i++) {
    const date = new Date(prices[i][0]).toISOString().slice(0, 10);
    const ex = daily.get(date);
    if (!ex || prices[i][0] > (ex.p || 0)) daily.set(date, { p: prices[i][1], v: vols[i]?.[1] || 0 });
  }
  return [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(e => ({ ts: new Date(e[0]).getTime(), date: e[0], price: e[1].p, volume: e[1].v }));
}

function computePvMetrics(candles: Candle[], token: string, group: string, breakoutDate: string): MetricResult[] {
  const results: MetricResult[] = [];
  const n = candles.length;
  if (n < 30) return results;
  const closes = candles.map(c => c.price);
  const vols = candles.map(c => c.volume);
  const breakoutTs = breakoutDate ? new Date(breakoutDate).getTime() : 0;

  for (let i = 30; i < n; i++) {
    const c = candles[i];
    const relDay = breakoutTs ? Math.round((c.ts - breakoutTs) / 86400000) : 999;

    // PV_001: return_7d
    if (i >= 7) {
      results.push({ metricId: "PV_001", token, date: c.date, value: (c.price - closes[i-7]) / closes[i-7], sampleGroup: group, eventRelDay: relDay });
    }

    // PV_002: volume_zscore_7d
    const volMa7 = vols.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7;
    const volSlice30 = vols.slice(i - 29, i + 1);
    const volMa30 = volSlice30.reduce((a, b) => a + b, 0) / 30;
    const volStd30 = Math.sqrt(volSlice30.reduce((s, v) => s + (v - volMa30) ** 2, 0) / 30);
    if (volStd30 > 0) {
      results.push({ metricId: "PV_002", token, date: c.date, value: (volMa7 - volMa30) / volStd30, sampleGroup: group, eventRelDay: relDay });
    }

    // PV_003: range_compression_7d (range_3d < p30 of range_30d)
    if (i >= 29) {
      const ranges: number[] = [];
      for (let j = Math.max(0, i - 29); j <= i; j++) {
        if (j >= 2) {
          const slice = closes.slice(j - 2, j + 1);
          ranges.push((Math.max(...slice) - Math.min(...slice)) / Math.min(...slice));
        }
      }
      const range3 = i >= 2 ? (Math.max(...closes.slice(i - 2, i + 1)) - Math.min(...closes.slice(i - 2, i + 1))) / Math.min(...closes.slice(i - 2, i + 1)) : 1;
      const p30 = ranges.sort((a, b) => a - b)[Math.floor(ranges.length * 0.3)] || 1;
      results.push({ metricId: "PV_003", token, date: c.date, value: range3 < p30 ? 1 : 0, sampleGroup: group, eventRelDay: relDay });
    }

    // PV_004: quiet_breakout (ret_3d > 8% AND vol_z_7d < 2)
    if (i >= 7 && i >= 3) {
      const ret3d = (c.price - closes[i-3]) / closes[i-3];
      const volZ = volStd30 > 0 ? (volMa7 - volMa30) / volStd30 : 0;
      results.push({ metricId: "PV_004", token, date: c.date, value: (ret3d > 0.08 && volZ < 2) ? 1 : 0, sampleGroup: group, eventRelDay: relDay });
    }
  }
  return results;
}

async function main() {
  console.log("=== Round 1A: Price-Volume Metric Discovery ===\n");
  if (!existsSync(OUT_DIR + "/features")) mkdirSync(OUT_DIR + "/features", { recursive: true });
  if (!existsSync(OUT_DIR + "/replay")) mkdirSync(OUT_DIR + "/replay", { recursive: true });
  if (!existsSync(OUT_DIR + "/validation")) mkdirSync(OUT_DIR + "/validation", { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  // Fetch missing caches
  console.log("Fetching missing price caches...");
  const missingTokens = TOKENS.filter(t => !existsSync(join(CG_CACHE, `${t.cg}_90d.json`)));
  for (const t of missingTokens) {
    const ok = await fetchAndCache(t.cg);
    console.log(`  ${t.sym} (${t.cg}): ${ok ? "OK" : "FAILED"}`);
  }
  console.log("");

  const allResults: MetricResult[] = [];
  const coverageAudit: string[] = ["token,sample_group,price_cache_ready,included"];
  const tokenCoverage: string[] = [];

  for (const token of TOKENS) {
    const candles = loadCandles(token.cg);
    const hasData = candles.length >= 30;
    coverageAudit.push(`${token.sym},${token.group},${hasData},${hasData}`);
    if (!hasData) { console.log(`${token.sym}: DATA_INSUFFICIENT (${candles.length} candles)`); continue; }
    const results = computePvMetrics(candles, token.sym, token.group, token.breakout);
    allResults.push(...results);
    tokenCoverage.push(token.sym);
    console.log(`${token.sym} [${token.group}]: ${candles.length} candles, ${results.length} metric-dates`);
  }

  // Feature table
  const fH = "token,date,sample_group,event_rel_day,metric_id,value";
  const fR = [fH, ...allResults.map(r => `${r.token},${r.date},${r.sampleGroup},${r.eventRelDay},${r.metricId},${r.value}`)];
  writeFileSync(join(OUT_DIR, "features", "price_volume_feature_table.csv"), fR.join("\n"));

  // Validation per metric
  const metrics = ["PV_001", "PV_002", "PV_003", "PV_004"];
  const valH = "metric_id,positive_rate,momentum_rate,control_rate,discrimination,avg_lead_days,classification,decision";
  const valR = [valH];

  for (const mid of metrics) {
    const mResults = allResults.filter(r => r.metricId === mid);
    // Discrete metrics (PV_003, PV_004): trigger when value > 0
    // Continuous metrics (PV_001, PV_002): trigger when value > p90 of control
    const isDiscrete = mid === "PV_003" || mid === "PV_004";
    const controlVals = mResults.filter(r => r.sampleGroup === "CONTROL").map(r => r.value);
    const threshold = isDiscrete ? 0.5 : (controlVals.sort((a, b) => a - b)[Math.floor(controlVals.length * 0.9)] || 999);

    const posResults = mResults.filter(r => r.sampleGroup === "P0");
    const momResults = mResults.filter(r => r.sampleGroup === "P2");
    const ctrlResults = mResults.filter(r => r.sampleGroup === "CONTROL");

    const posTrig = posResults.filter(r => r.value > threshold).length;
    const momTrig = momResults.filter(r => r.value > threshold).length;
    const ctrlTrig = ctrlResults.filter(r => r.value > threshold).length;

    const posRate = posResults.length > 0 ? posTrig / posResults.length : 0;
    const momRate = momResults.length > 0 ? momTrig / momResults.length : 0;
    const ctrlRate = ctrlResults.length > 0 ? ctrlTrig / ctrlResults.length : 0;
    const disc = ctrlRate > 0 ? posRate / ctrlRate : (posRate > 0 ? 99 : 0);

    // Lead days: avg event_rel_day of triggered P0 results
    const leadDays = posResults.filter(r => r.value > threshold).map(r => r.eventRelDay).filter(d => Math.abs(d) < 999);
    const avgLead = leadDays.length > 0 ? leadDays.reduce((a, b) => a + b, 0) / leadDays.length : 0;

    let classification = "INSUFFICIENT_DATA";
    if (posTrig > 5 && avgLead < -2 && ctrlRate < 0.08) classification = "LEADING";
    else if (posTrig > 5 && avgLead >= -2 && avgLead <= 2 && ctrlRate < 0.12) classification = "SYNCHRONOUS";
    else if (posTrig > 3 && avgLead > 2 && ctrlRate < 0.08) classification = "LAGGING";
    else if (ctrlRate >= 0.15 && disc < 2.0) classification = "NOISE";
    else if (disc >= 3.0 && ctrlRate < 0.12) classification = "CONTEXT";
    else if (posTrig > 3) classification = "CONTEXT";
    else if (ctrlRate >= 0.15) classification = "NOISE";

    let decision = "NEED_MORE_SAMPLE";
    if (classification === "LEADING") decision = "EARLY_WATCH_CANDIDATE";
    else if (classification === "SYNCHRONOUS") decision = "ADD_CONFIRMATION_ONLY";
    else if (classification === "LAGGING") decision = "ADD_RISK_ONLY";
    else if (classification === "NOISE") decision = "REJECT_NOISE";
    else if (classification === "CONTEXT") decision = "ADD_RESEARCH_ONLY";

    valR.push(`${mid},${(posRate*100).toFixed(1)}%,${(momRate*100).toFixed(1)}%,${(ctrlRate*100).toFixed(1)}%,${disc.toFixed(1)}x,${avgLead.toFixed(1)}d,${classification},${decision}`);
    console.log(`${mid}: pos=${(posRate*100).toFixed(0)}% ctrl=${(ctrlRate*100).toFixed(0)}% disc=${disc.toFixed(1)}x lead=${avgLead.toFixed(0)}d → ${classification} → ${decision}`);
  }
  writeFileSync(join(OUT_DIR, "validation", "price_volume_validation_results.csv"), valR.join("\n"));
  writeFileSync(join(OUT_DIR, "analysis", "round1a_sample_coverage_audit.csv"), coverageAudit.join("\n"));

  const p0WithData = coverageAudit.slice(1).filter(r => r.startsWith("LAB,") || r.startsWith("UB,") || r.startsWith("BSB,") || r.startsWith("AI,")).filter(r => r.endsWith(",true")).length;
  const isFull = p0WithData >= 4;
  console.log(`\nP0 coverage: ${p0WithData}/4 → ${isFull ? "FULL_VALIDATION" : "PARTIAL_VALIDATION"}`);

  // Report
  const reportLines = [
    "# Price-Volume Metric Discovery — Round 1A.1", "", `Generated: ${new Date().toISOString()}`,
    `**Validation: ${isFull ? "FULL_VALIDATION" : "PARTIAL_VALIDATION"}** (P0: ${p0WithData}/4)`,
    "", "## 1. Scope", "",
    `Tokens: ${tokenCoverage.length} (${TOKENS.filter(t => t.group === "P0").length} P0, ${TOKENS.filter(t => t.group === "P2").length} P2, ${TOKENS.filter(t => t.group === "CONTROL").length} CONTROL)`,
    `Missing: ${TOKENS.filter(t => !tokenCoverage.includes(t.sym)).map(t => t.sym).join(", ") || "none"}`,
    `Classification: fixed (NOISE >= 15% ctrl rate, CONTEXT for >= 3x disc)`,
    `Metrics: 4 (PV_001-PV_004)`,
    "", "## 2. Validation Results", "",
    "| Metric | Pos Rate | Mom Rate | Ctrl Rate | Disc | Avg Lead | Classification | Decision |",
    "|--------|:---:|:---:|:---:|:---:|:---:|------|------|",
  ];
  for (const v of valR.slice(1)) {
    const p = v.split(",");
    reportLines.push(`| ${p[0]} | ${p[1]} | ${p[2]} | ${p[3]} | ${p[4]} | ${p[5]} | ${p[6]} | **${p[7]}** |`);
  }
  reportLines.push("", "## 3. What We Still Cannot Know", "",
    "- Price-volume alone cannot confirm accumulation or distribution",
    "- Cannot infer causality from correlation",
    "- All findings are from N=17 sample, not statistically significant",
    "- No trading recommendations",
    "", "## 4. Next Recommendation", "",
    "Round 1A complete. Metrics classified. Proceed to derivatives or expand metric library."
  );
  writeFileSync(join(REPORTS_DIR, "price_volume_metric_discovery_report.md"), reportLines.join("\n"));

  console.log(`\nReports saved.`);
}

main().catch(console.error);
