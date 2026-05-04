import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "cache", "price_features");
const DEX_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "features", "dex_token_level_features_universe.csv");
const SUPPLY_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "features", "supply_scope_summary_universe.csv");
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "validation");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "validation");

interface Candle { ts: number; date: string; price: number; volume: number; mcap: number; }

interface StructureResult {
  token: string; date: string; structure: string;
  triggered: boolean; triggerValue: number;
  isPositive: boolean; relativeDayToEvent: number;
  forwardRet3d: number; forwardRet7d: number; forwardMaxDd7d: number;
}

type Classification = "LEADING" | "SYNCHRONOUS" | "LAGGING" | "RISK" | "CONTEXT" | "NOISE" | "INSUFFICIENT_DATA";
type Decision = "KEEP_AS_EARLY_WATCH" | "KEEP_AS_CONFIRMATION" | "KEEP_AS_RISK_SIGNAL" | "KEEP_AS_CONTEXT" | "NEED_MORE_DATA" | "REJECT_HIGH_FALSE_POSITIVE";

const POSITIVE = new Set(["BSB", "LAB", "PEPE", "WIF", "BONK", "FLOKI"]);
const EVENT_DATES: Record<string, string> = {
  BSB: "2026-04-25", LAB: "2026-04-23", PEPE: "2025-12-28",
  BONK: "2025-07-15", WIF: "2025-12-30", FLOKI: "2026-03-01",
};

const CONTROL_SET = new Set(["DOGE", "SHIB", "POPCAT", "TURBO", "FET", "RNDR", "TAO", "VIRTUAL",
  "PENDLE", "ONDO", "ENA", "JUP", "PYTH", "SEI", "SUI", "TIA", "BTC", "ETH", "SOL", "ARB", "OP", "PEOPLE"]);

function loadCandles(token: string): Candle[] {
  const registryPath = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "scanner_v02", "registry", "token_metadata_registry.csv");
  if (!existsSync(registryPath)) return [];
  const regLines = readFileSync(registryPath, "utf-8").split("\n").slice(1);
  const registry = regLines.map(l => { const p = l.split(","); return { sym: p[0], cg: p[3] }; });
  const reg = registry.find(r => r.sym === token);
  if (!reg) return [];

  const path = join(CACHE_DIR, `${reg.cg}_90d.json`);
  if (!existsSync(path)) return [];
  const cache = JSON.parse(readFileSync(path, "utf-8"));
  const prices = cache.prices || [];
  const vols = cache.total_volumes || [];
  const mcaps = cache.market_caps || [];

  const dailyMap = new Map<string, Candle>();
  for (let i = 0; i < prices.length; i++) {
    const ts = prices[i][0];
    const date = new Date(ts).toISOString().slice(0, 10);
    const ex = dailyMap.get(date);
    if (!ex || ts > ex.ts) {
      dailyMap.set(date, { ts, date, price: prices[i][1], volume: vols[i]?.[1] || 0, mcap: mcaps[i]?.[1] || 0 });
    }
  }
  return [...dailyMap.values()].sort((a, b) => a.ts - b.ts);
}

function loadDexLiq(): Map<string, number> {
  const m = new Map<string, number>();
  if (!existsSync(DEX_PATH)) return m;
  const lines = readFileSync(DEX_PATH, "utf-8").split("\n").slice(1);
  for (const line of lines) {
    const p = line.split(",");
    if (p.length > 2) m.set(p[0], parseFloat(p[2]) || 0);
  }
  return m;
}

function loadSupplyRatio(): Map<string, number> {
  const m = new Map<string, number>();
  if (!existsSync(SUPPLY_PATH)) return m;
  const lines = readFileSync(SUPPLY_PATH, "utf-8").split("\n").slice(1);
  for (const line of lines) {
    const p = line.split(",");
    if (p.length > 7) {
      const ratio = parseFloat(p[7]);
      if (!isNaN(ratio) && ratio > 0) m.set(p[0], ratio);
    }
  }
  return m;
}

function computeAllStructures(candles: Candle[], token: string, supplyRatio: number | undefined, dexLiq: number | undefined): StructureResult[] {
  const results: StructureResult[] = [];
  const n = candles.length;
  if (n < 30) return results;

  const closes = candles.map(c => c.price);
  const vols = candles.map(c => c.volume);
  const eventDate = EVENT_DATES[token] || null;
  const isPos = POSITIVE.has(token);
  const eventTs = eventDate ? new Date(eventDate).getTime() : 0;

  for (let i = 30; i < n; i++) {
    const cur = candles[i];
    const relDay = eventTs ? Math.round((cur.ts - eventTs) / 86400000) : 999;

    // Forward returns
    const fwd3d = i + 3 < n ? (closes[i + 3] - cur.price) / cur.price : 0;
    const fwd7d = i + 7 < n ? (closes[i + 7] - cur.price) / cur.price : 0;
    let fwdPeak = cur.price;
    let fwdMaxDd = 0;
    for (let j = i; j < Math.min(n, i + 7); j++) {
      if (closes[j] > fwdPeak) fwdPeak = closes[j];
      const dd = (fwdPeak - closes[j]) / fwdPeak;
      if (dd > fwdMaxDd) fwdMaxDd = dd;
    }

    // ── 1. Volume Compression ──
    const range3 = i >= 2 ? (Math.max(...closes.slice(i - 2, i + 1)) - Math.min(...closes.slice(i - 2, i + 1))) / Math.min(...closes.slice(i - 2, i + 1)) : 1;
    const vol3Avg = vols.slice(i - 2, i + 1).reduce((a, b) => a + b, 0) / 3;
    const vol30Avg = vols.slice(i - 29, i + 1).reduce((a, b) => a + b, 0) / 30;
    const rets3: number[] = [];
    for (let j = i - 2; j <= i; j++) { if (j > 0) rets3.push(Math.log(closes[j] / closes[j - 1])); }
    const rv3 = rets3.length > 0 ? Math.sqrt(rets3.reduce((s, r) => s + r * r, 0) / rets3.length) : 1;

    // Range percentile
    const ranges30: number[] = [];
    for (let j = Math.max(0, i - 29); j <= i; j++) {
      if (j >= 2) {
        const slice = closes.slice(j - 2, j + 1);
        ranges30.push((Math.max(...slice) - Math.min(...slice)) / Math.min(...slice));
      }
    }
    const rangePct = ranges30.filter(r => r >= range3).length / Math.max(ranges30.length, 1);
    const volRatio = vol30Avg > 0 ? vol3Avg / vol30Avg : 1;
    const volCompression = rangePct < 0.3 && volRatio < 0.8;

    results.push({
      token, date: cur.date, structure: "VOLUME_COMPRESSION",
      triggered: volCompression, triggerValue: 1 - rangePct,
      isPositive: isPos, relativeDayToEvent: relDay,
      forwardRet3d: fwd3d, forwardRet7d: fwd7d, forwardMaxDd7d: fwdMaxDd,
    });

    // ── 2. Quiet Breakout ──
    const high7d = Math.max(...closes.slice(Math.max(0, i - 6), i + 1));
    const breaks7dHigh = cur.price >= high7d * 0.99;
    const volZ7d = computeVolZ(vols, i, 7, 30);
    const ret3d = i >= 3 ? (cur.price - closes[i - 3]) / closes[i - 3] : 0;
    const quietBreakout = volCompression && breaks7dHigh && volZ7d < 2.0 && ret3d > 0.08;

    results.push({
      token, date: cur.date, structure: "QUIET_BREAKOUT",
      triggered: quietBreakout, triggerValue: ret3d,
      isPositive: isPos, relativeDayToEvent: relDay,
      forwardRet3d: fwd3d, forwardRet7d: fwd7d, forwardMaxDd7d: fwdMaxDd,
    });

    // ── 3. Volume Expansion ──
    const volExpansion = volZ7d > 2.0 && ret3d > 0.15;
    results.push({
      token, date: cur.date, structure: "VOLUME_EXPANSION",
      triggered: volExpansion, triggerValue: volZ7d,
      isPositive: isPos, relativeDayToEvent: relDay,
      forwardRet3d: fwd3d, forwardRet7d: fwd7d, forwardMaxDd7d: fwdMaxDd,
    });

    // ── 4. Efficiency Decay ──
    const effDecay = volZ7d > 2.0 && Math.abs((cur.price - (i >= 1 ? closes[i - 1] : cur.price)) / Math.max(cur.price, 0.0001)) < 0.05;
    results.push({
      token, date: cur.date, structure: "EFFICIENCY_DECAY",
      triggered: effDecay, triggerValue: volZ7d,
      isPositive: isPos, relativeDayToEvent: relDay,
      forwardRet3d: fwd3d, forwardRet7d: fwd7d, forwardMaxDd7d: fwdMaxDd,
    });

    // ── 5. Supply Overhang ──
    const supplyOverhang = supplyRatio !== undefined && supplyRatio < 0.3;
    results.push({
      token, date: cur.date, structure: "SUPPLY_OVERHANG",
      triggered: supplyOverhang, triggerValue: supplyRatio ?? 1,
      isPositive: isPos, relativeDayToEvent: relDay,
      forwardRet3d: fwd3d, forwardRet7d: fwd7d, forwardMaxDd7d: fwdMaxDd,
    });

    // ── 6. DEX Liquidity Fragility ──
    const dexFragile = dexLiq !== undefined && (dexLiq < 100000);
    results.push({
      token, date: cur.date, structure: "DEX_LIQUIDITY_FRAGILITY",
      triggered: dexFragile, triggerValue: dexLiq ?? 999999,
      isPositive: isPos, relativeDayToEvent: relDay,
      forwardRet3d: fwd3d, forwardRet7d: fwd7d, forwardMaxDd7d: fwdMaxDd,
    });
  }

  return results;
}

function computeVolZ(vols: number[], idx: number, shortW: number, longW: number): number {
  const shortSlice = vols.slice(Math.max(0, idx - shortW + 1), idx + 1);
  const longSlice = vols.slice(Math.max(0, idx - longW + 1), idx + 1);
  const shortAvg = shortSlice.reduce((a, b) => a + b, 0) / shortSlice.length;
  const longAvg = longSlice.reduce((a, b) => a + b, 0) / longSlice.length;
  const longStd = Math.sqrt(longSlice.reduce((s, v) => s + (v - longAvg) ** 2, 0) / longSlice.length);
  return longStd > 0 ? (shortAvg - longAvg) / longStd : 0;
}

function classify(triggered: StructureResult[], posRate: number, ctrlRate: number, avgLeadDays: number, avgFwdDd7d: number): Classification {
  if (triggered.length === 0) return "INSUFFICIENT_DATA";
  if (ctrlRate > 0.10) return "NOISE";
  if (avgLeadDays < -2 && ctrlRate < 0.05) return "LEADING";
  if (avgLeadDays >= -2 && avgLeadDays <= 2) return "SYNCHRONOUS";
  if (avgLeadDays > 2) return "LAGGING";
  if (avgFwdDd7d > 0.15 && ctrlRate < 0.05) return "RISK";
  if (posRate > 0.10 && ctrlRate < 0.05) return "CONTEXT";
  return "INSUFFICIENT_DATA";
}

async function main() {
  console.log("=== Structure Validation ===\n");
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const dexLiq = loadDexLiq();
  const supplyRatio = loadSupplyRatio();
  const allTokens = [...POSITIVE, ...CONTROL_SET];

  const allResults: StructureResult[] = [];

  for (const token of allTokens) {
    const candles = loadCandles(token);
    if (candles.length < 30) { console.log(`${token}: DATA_INSUFFICIENT (${candles.length} candles)`); continue; }

    const results = computeAllStructures(candles, token, supplyRatio.get(token), dexLiq.get(token));
    allResults.push(...results);
    const triggered = results.filter(r => r.triggered).length;
    console.log(`${token}: ${candles.length} candles, ${triggered} triggers`);
  }

  // Aggregate by structure
  const structures = [...new Set(allResults.map(r => r.structure))];
  console.log(`\n=== Per-Structure Analysis ===\n`);

  const reportLines: string[] = [
    "# Candidate Structure Validation Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## Summary", "",
    "| Structure | Classification | Decision | Pos Rate | Ctrl Rate | Avg Lead | Fwd DD 7d | Triggers |",
    "|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|",
  ];

  const allDecisions: string[] = [];

  for (const struct of structures) {
    const sResults = allResults.filter(r => r.structure === struct);
    const triggered = sResults.filter(r => r.triggered);
    const posTrig = triggered.filter(r => r.isPositive);
    const ctrlTrig = triggered.filter(r => !r.isPositive);
    const posTotal = sResults.filter(r => r.isPositive).length;
    const ctrlTotal = sResults.filter(r => !r.isPositive).length;
    const posRate = posTotal > 0 ? posTrig.length / posTotal : 0;
    const ctrlRate = ctrlTotal > 0 ? ctrlTrig.length / ctrlTotal : 0;
    const leadDays = triggered.map(r => r.relativeDayToEvent).filter(d => Math.abs(d) < 999);
    const avgLead = leadDays.length > 0 ? leadDays.reduce((a, b) => a + b, 0) / leadDays.length : 0;
    const avgFwdDd = triggered.length > 0 ? triggered.reduce((a, r) => a + r.forwardMaxDd7d, 0) / triggered.length : 0;

    const clsf = classify(triggered, posRate, ctrlRate, avgLead, avgFwdDd);
    let decision: Decision;

    if (triggered.length === 0) decision = "NEED_MORE_DATA";
    else if (clsf === "LEADING") decision = "KEEP_AS_EARLY_WATCH";
    else if (clsf === "SYNCHRONOUS") decision = "KEEP_AS_CONFIRMATION";
    else if (clsf === "RISK") decision = "KEEP_AS_RISK_SIGNAL";
    else if (clsf === "NOISE") decision = "REJECT_HIGH_FALSE_POSITIVE";
    else if (clsf === "CONTEXT") decision = "KEEP_AS_CONTEXT";
    else decision = "NEED_MORE_DATA";

    allDecisions.push(`${struct}: ${decision} (${clsf})`);

    reportLines.push(`| ${struct} | ${clsf} | ${decision} | ${(posRate*100).toFixed(1)}% | ${(ctrlRate*100).toFixed(1)}% | ${avgLead.toFixed(1)}d | ${(avgFwdDd*100).toFixed(1)}% | ${triggered.length} |`);

    console.log(`${struct}: ${clsf} → ${decision}`);
    console.log(`  Pos: ${posTrig.length}/${posTotal} (${(posRate*100).toFixed(1)}%) | Ctrl: ${ctrlTrig.length}/${ctrlTotal} (${(ctrlRate*100).toFixed(1)}%) | Lead: ${avgLead.toFixed(1)}d | FwdDD: ${(avgFwdDd*100).toFixed(1)}%`);
  }

  reportLines.push("", "## What We Still Cannot Know", "",
    "- Cannot confirm real accumulation (no holder time-series)",
    "- Cannot confirm real distribution (no transfer-to-CEX data)",
    "- Cannot assess derivatives positioning (no OI/funding data)",
    "- All findings are correlations, not causal proof",
    "- N=6 positive samples — statistically insufficient");

  writeFileSync(join(REPORTS_DIR, "structure_validation_report.md"), reportLines.join("\n"));

  // Write CSV
  const csvH = "structure,token,date,triggered,trigger_value,is_positive,relative_day_to_event,forward_ret_3d,forward_ret_7d,forward_max_dd_7d";
  const csvR = [csvH, ...allResults.map(r => `${r.structure},${r.token},${r.date},${r.triggered ? 1 : 0},${r.triggerValue},${r.isPositive ? 1 : 0},${r.relativeDayToEvent},${r.forwardRet3d},${r.forwardRet7d},${r.forwardMaxDd7d}`)];
  writeFileSync(join(OUT_DIR, "structure_validation_results.csv"), csvR.join("\n"));

  console.log(`\nReports saved.`);
  console.log(`\n=== Decisions ===\n${allDecisions.join("\n")}`);
}

main().catch(console.error);
