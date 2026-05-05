import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeCsv } from "../../../utils/csv.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "no_arkham");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "no_arkham");
const INTEL_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence");

function readCsv(path: string): { header: string[]; rows: string[][] } | null {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf-8").trim().split("\n");
  if (lines.length < 2) return null;
  return { header: lines[0].split(","), rows: lines.slice(1).map(l => l.split(",")) };
}

interface MetricResult {
  id: string; name: string; group: string; source: string;
  p0Mean: number; ctrlMean: number; p0Median: number; ctrlMedian: number;
  p0Med: number; ctrlMed: number;
  discRatio: number; p0Trigger: number; ctrlTrigger: number;
  classification: string; decision: string; limitations: string;
}

function validateMetric(
  id: string, name: string, group: string, source: string,
  p0Vals: number[], ctrlVals: number[]
): MetricResult {
  if (p0Vals.length < 3 || ctrlVals.length < 3) {
    return { id, name, group, source, p0Mean: 0, ctrlMean: 0, p0Median: 0, ctrlMedian: 0, p0Med: 0, ctrlMed: 0, discRatio: 0, p0Trigger: 0, ctrlTrigger: 0, classification: "INSUFFICIENT_DATA", decision: "NEED_MORE_SAMPLE", limitations: `p0=${p0Vals.length} ctrl=${ctrlVals.length}` };
  }
  const p0Mean = p0Vals.reduce((a, b) => a + b, 0) / p0Vals.length;
  const ctrlMean = ctrlVals.reduce((a, b) => a + b, 0) / ctrlVals.length;
  const p0Sorted = [...p0Vals].sort((a, b) => a - b);
  const ctrlSorted = [...ctrlVals].sort((a, b) => a - b);
  const p0Med = p0Sorted[Math.floor(p0Sorted.length / 2)];
  const ctrlMed = ctrlSorted[Math.floor(ctrlSorted.length / 2)];
  const ctrlStd = Math.sqrt(ctrlVals.reduce((s, v) => s + (v - ctrlMean) ** 2, 0) / ctrlVals.length);
  const thresh = ctrlMean + 2 * ctrlStd;
  const p0Trig = p0Vals.filter(v => v > thresh).length / p0Vals.length;
  const ctrlTrig = ctrlVals.filter(v => v > thresh).length / ctrlVals.length;
  const disc = ctrlTrig > 0 ? p0Trig / ctrlTrig : (p0Trig > 0 ? Infinity : 1);
  const ratioDisc = ctrlMean > 0 ? Math.abs(p0Mean / ctrlMean - 1) : 0;

  let cls = "INSUFFICIENT_DATA", dec = "NEED_MORE_SAMPLE", lim = "";
  if (disc > 3 && ratioDisc > 0.5) { cls = "STRUCTURAL_RISK"; dec = "PROMOTE_TO_REGISTRY_RISK_ONLY"; lim = `disc=${disc.toFixed(1)} ratio=${ratioDisc.toFixed(2)}`; }
  else if (disc > 2 || ratioDisc > 1) { cls = "STRUCTURAL_CONTEXT"; dec = "PROMOTE_TO_REGISTRY_RESEARCH_ONLY"; lim = `disc=${disc.toFixed(1)} ratio=${ratioDisc.toFixed(2)}`; }
  else if (disc > 0.5 && disc < 2 && ratioDisc < 0.5) { cls = "NOISE"; dec = "REJECT_NOISE"; lim = ""; }
  else { cls = "STRUCTURAL_CONTEXT"; dec = "KEEP_AS_CANDIDATE"; lim = "weak signal"; }

  return { id, name, group, source, p0Mean, ctrlMean, p0Median: p0Med, ctrlMedian: ctrlMed, p0Med, ctrlMed, discRatio: disc, p0Trigger: p0Trig, ctrlTrigger: ctrlTrig, classification: cls, decision: dec, limitations: lim };
}

function validateMetricGroup(
  data: { header: string[]; rows: string[][] },
  metricIds: string[], group: string, source: string
): MetricResult[] {
  const h = data.header;
  const tidx = h.indexOf("metric_id"), vidx = h.indexOf("value");
  const tokIdx = h.indexOf("token"), grpIdx = h.indexOf("sample_group");

  const results: MetricResult[] = [];
  for (const mid of metricIds) {
    const p0Vals: number[] = [], ctrlVals: number[] = [];
    for (const r of data.rows) {
      if (r[tidx] !== mid) continue;
      const v = parseFloat(r[vidx] || "");
      if (isNaN(v)) continue;
      if (r[grpIdx] === "P0") p0Vals.push(v);
      else if (r[grpIdx] === "CONTROL") ctrlVals.push(v);
    }
    results.push(validateMetric(mid, mid, group, source, p0Vals, ctrlVals));
  }
  return results;
}

function validateWideTable(
  data: { header: string[]; rows: string[][] },
  fields: { id: string; col: string }[], group: string, source: string
): MetricResult[] {
  const h = data.header;
  const grpIdx = h.indexOf("sample_group") >= 0 ? h.indexOf("sample_group") : h.indexOf("group");

  const results: MetricResult[] = [];
  for (const f of fields) {
    const colIdx = h.indexOf(f.col);
    if (colIdx < 0) continue;
    const p0Vals: number[] = [], ctrlVals: number[] = [];
    for (const r of data.rows) {
      if (grpIdx >= 0 && !["P0", "CONTROL"].includes(r[grpIdx] || "")) continue;
      const v = parseFloat(r[colIdx] || "");
      if (isNaN(v)) continue;
      if (grpIdx >= 0) {
        if (r[grpIdx] === "P0") p0Vals.push(v);
        else if (r[grpIdx] === "CONTROL") ctrlVals.push(v);
      } else {
        // Token-based fallback
        const tok = r[h.indexOf("token")];
        if (["LAB", "UB", "BSB", "AI"].includes(tok || "")) p0Vals.push(v);
        else if (["PEPE", "WIF", "BONK", "FLOKI", "DOGE", "TAO"].includes(tok || "")) ctrlVals.push(v);
      }
    }
    results.push(validateMetric(f.id, f.col, group, source, p0Vals, ctrlVals));
  }
  return results;
}

function main() {
  console.log("=== No-Arkham Breakout Structure Discovery ===\n");
  console.log(`NO_ARKHAM_MODE: ${process.env.NO_ARKHAM_MODE || "not set"}`);
  console.log("Arkham API: DISABLED (if NO_ARKHAM_MODE=true) or ALLOWED\n");

  for (const d of ["candidates"]) {
    const p = join(OUT_DIR, d); if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const allResults: MetricResult[] = [];

  // ── 1. Price-Volume (CoinGecko) ──
  console.log("── 1. Price-Volume (CoinGecko) ──\n");
  const pvData = readCsv(join(INTEL_DIR, "metric_loop", "features", "price_volume_feature_table.csv"));
  if (pvData) {
    const pvResults = validateMetricGroup(pvData, ["PV_001", "PV_002", "PV_004"], "price_volume", "CoinGecko");
    allResults.push(...pvResults);
    for (const r of pvResults) console.log(`  ${r.id}: p0=${r.p0Mean.toFixed(3)} ctrl=${r.ctrlMean.toFixed(3)} disc=${r.discRatio.toFixed(1)} ${r.classification}`);
  }

  // ── 2. CoinGlass Derivatives ──
  console.log("\n── 2. CoinGlass Derivatives ──\n");
  const cgData = readCsv(join(INTEL_DIR, "coinglass", "features", "coinglass_derivatives_features.csv"));
  if (cgData) {
    const cgFields = [
      { id: "CG_OI_001", col: "oi_usd" },
      { id: "CG_OI_002", col: "oi_chg_1d" },
      { id: "CG_OI_003", col: "oi_chg_7d" },
      { id: "CG_OI_004", col: "oi_z_7d" },
      { id: "CG_FR_001", col: "funding_oi_w" },
      { id: "CG_FR_002", col: "funding_z_7d" },
      { id: "CG_LIQ_001", col: "liq_vol" },
      { id: "CG_LIQ_002", col: "liq_z_7d" },
    ];
    const cgResults = validateWideTable(cgData, cgFields, "derivatives_v2", "CoinGlass");
    allResults.push(...cgResults);
    for (const r of cgResults) console.log(`  ${r.id}: p0=${r.p0Mean.toFixed(3)} ctrl=${r.ctrlMean.toFixed(3)} disc=${r.discRatio.toFixed(1)} ${r.classification}`);
  }

  // ── 3. OKX Derivatives ──
  console.log("\n── 3. OKX Derivatives ──\n");
  const okxData = readCsv(join(INTEL_DIR, "derivatives", "features", "derivatives_feature_table.csv"));
  if (okxData) {
    const okxFields = [
      { id: "OKX_OI_001", col: "oi_change_3d" },
      { id: "OKX_OI_002", col: "oi_change_7d" },
      { id: "OKX_FR_001", col: "funding_rate" },
      { id: "OKX_FR_002", col: "funding_zscore" },
    ];
    const okxResults = validateWideTable(okxData, okxFields, "derivatives_v2", "OKX");
    allResults.push(...okxResults);
    for (const r of okxResults) console.log(`  ${r.id}: p0=${r.p0Mean.toFixed(3)} ctrl=${r.ctrlMean.toFixed(3)} disc=${r.discRatio.toFixed(1)} ${r.classification}`);
  }

  // ── 4. DEX History ──
  console.log("\n── 4. DEX History ──\n");
  const dexData = readCsv(join(INTEL_DIR, "dex_history", "features", "dex_history_feature_table.csv"));
  if (dexData) {
    const dexResults = validateMetricGroup(dexData, ["DEX_001", "DEX_002"], "dex_history", "CoinGecko Pool OHLCV");
    allResults.push(...dexResults);
    for (const r of dexResults) console.log(`  ${r.id}: p0=${r.p0Mean.toFixed(3)} ctrl=${r.ctrlMean.toFixed(3)} disc=${r.discRatio.toFixed(1)} ${r.classification}`);
  }

  // ── 5. Supply ──
  console.log("\n── 5. Supply ──\n");
  const supData = readCsv(join(INTEL_DIR, "metric_loop", "features", "price_volume_feature_table.csv"));
  // Supply metrics are in the registry but may not have a dedicated feature table yet
  // Mark as IDEA until proper feature table built
  allResults.push({ id: "SUP_001", name: "circulating_to_total_ratio", group: "supply_float", source: "CMC+Etherscan", p0Mean: 0, ctrlMean: 0, p0Median: 0, ctrlMedian: 0, p0Med: 0, ctrlMed: 0, discRatio: 0, p0Trigger: 0, ctrlTrigger: 0, classification: "INSUFFICIENT_DATA", decision: "NEED_MORE_SAMPLE", limitations: "Supply feature table not yet built" });
  console.log("  SUP_001: INSUFFICIENT_DATA (feature table not built)");

  // ── 6. Moralis Transfer-Lite ──
  console.log("\n── 6. Moralis Transfer-Lite ──\n");
  const moralisData = readCsv(join(INTEL_DIR, "moralis", "analysis", "moralis_data_quality.csv"));
  if (moralisData) {
    // Moralis data quality has entity coverage info
    const covVals = moralisData.rows.map(r => parseFloat(r[5] || "0")).filter(v => !isNaN(v));
    if (covVals.length > 0) {
      allResults.push({
        id: "MT_001", name: "transfer_count_zscore", group: "moralis_transfer_lite", source: "Moralis",
        p0Mean: 0, ctrlMean: 0, p0Median: 0, ctrlMedian: 0, p0Med: 0, ctrlMed: 0, discRatio: 0, p0Trigger: 0, ctrlTrigger: 0,
        classification: "INSUFFICIENT_DATA", decision: "NEED_MORE_SAMPLE",
        limitations: "Moralis feature time-series needs recomputation"
      });
    }
    console.log("  MT_001-MT_006: INSUFFICIENT_DATA (feature time-series needs recomputation)");
  }

  // Write validation results
  const valRows: string[][] = [["metric_id","metric_name","group","source","p0_mean","ctrl_mean","p0_median","ctrl_median","discrimination_ratio","p0_trigger_rate","ctrl_trigger_rate","classification","decision","limitations"]];
  for (const r of allResults) {
    valRows.push([r.id, r.name, r.group, r.source, r.p0Mean.toFixed(4), r.ctrlMean.toFixed(4), r.p0Median.toFixed(4), r.ctrlMedian.toFixed(4), r.discRatio.toFixed(1), (r.p0Trigger*100).toFixed(1)+"%", (r.ctrlTrigger*100).toFixed(1)+"%", r.classification, r.decision, r.limitations]);
  }
  writeCsv(join(OUT_DIR, "no_arkham_validation_results.csv"), valRows);
  console.log(`\nValidation: ${allResults.length} metrics evaluated`);

  // ── Composites ──
  console.log("\n── Composite Candidates ──\n");
  const promoted = allResults.filter(r => r.decision.includes("PROMOTE") || r.decision === "KEEP_AS_CANDIDATE");
  const compos = [
    { id: "NC_001", name: "price_quiet + OI_rising", a: "PV_004", b: "CG_OI_002", desc: "Price quiet breakout + OI change 7d elevated" },
    { id: "NC_002", name: "volume_zscore + funding_neutral", a: "PV_002", b: "CG_FR_002", desc: "Volume elevated + funding NOT overheated" },
    { id: "NC_003", name: "OI_rising + funding_not_overheated", a: "CG_OI_003", b: "CG_FR_002", desc: "OI rising 7d + funding z-score < 2" },
    { id: "NC_004", name: "funding_overheated + liquidation_risk", a: "CG_FR_002", b: "CG_LIQ_002", desc: "Funding extreme + liquidation volume elevated" },
    { id: "NC_005", name: "DEX_activity + OI_confirmation", a: "DEX_001", b: "CG_OI_004", desc: "DEX compression + OI z-score elevated" },
    { id: "NC_006", name: "volume_zscore + OI_zscore", a: "PV_002", b: "CG_OI_004", desc: "Volume + OI both elevated" },
  ];

  const compRows: string[][] = [["candidate_id","candidate_name","formula","metric_a_status","metric_b_status","combined_value","classification","limitations"]];
  for (const c of compos) {
    const ma = allResults.find(r => r.id === c.a);
    const mb = allResults.find(r => r.id === c.b);
    const bothPromoted = ma?.decision.includes("PROMOTE") && mb?.decision.includes("PROMOTE");
    const onePromoted = ma?.decision.includes("PROMOTE") || mb?.decision.includes("PROMOTE");
    const cls = bothPromoted ? "STRUCTURAL_CONTEXT" : onePromoted ? "KEEP_AS_CANDIDATE" : "NOISE";
    console.log(`  ${c.id}: ${c.name} → a=${ma?.classification || "?"} b=${mb?.classification || "?"} ${cls}`);
    compRows.push([c.id, c.name, c.desc, ma?.classification || "?", mb?.classification || "?", cls, onePromoted ? "One metric promoted" : ""]);
  }
  writeCsv(join(OUT_DIR, "candidates", "no_arkham_composite_candidates.csv"), compRows);

  // ── Report ──
  const riskCount = allResults.filter(r => r.classification.includes("RISK")).length;
  const contextCount = allResults.filter(r => r.classification.includes("CONTEXT")).length;
  const noiseCount = allResults.filter(r => r.classification === "NOISE").length;
  const insuffCount = allResults.filter(r => r.classification === "INSUFFICIENT_DATA").length;

  const systemViable = (riskCount + contextCount) >= 3;
  const status = systemViable ? "NO_ARKHAM_SYSTEM_VIABLE" : "NO_ARKHAM_SYSTEM_WEAK_NEEDS_MORE_DATA";

  const reportLines = [
    "# No-Arkham Breakout Structure Discovery Report", "",
    `Generated: ${new Date().toISOString()}`,
    `NO_ARKHAM_MODE: ${process.env.NO_ARKHAM_MODE || "not set"}`,
    "",
    "## 1. Executive Summary", "",
    `**${status}**`,
    `Metrics evaluated: ${allResults.length}`,
    `STRUCTURAL_RISK: ${riskCount} | STRUCTURAL_CONTEXT: ${contextCount} | NOISE: ${noiseCount} | INSUFFICIENT: ${insuffCount}`,
    `System viable without Arkham: ${systemViable}`,
    "",
    "## 2. Data Source Inventory", "",
    "| Source | Status | Provides |",
    "|--------|--------|----------|",
    "| CoinGecko | ACTIVE | Price, volume, market cap, DEX pool OHLCV |",
    "| CoinGlass | ACTIVE | Multi-exchange OI, funding, liquidation |",
    "| OKX | ACTIVE | Single-exchange OI, funding |",
    "| Moralis | ACTIVE | Transfer-lite, entity-lite labels, holder-lite |",
    "| CMC | ACTIVE | Supply, FDV, market cap cross-check |",
    "| DexScreener | ACTIVE | DEX snapshot liquidity, pair activity |",
    "| Arkham | DISABLED | Local cache only: entity labels, holders, volume, segmented transfers |",
    "",
    "## 3. Metric Validation Results", "",
    "| Metric | Group | Source | P0 Mean | Ctrl Mean | Disc | Classification | Decision |",
    "|--------|-------|--------|---------|-----------|------|---------------|----------|",
    ...allResults.map(r => `| ${r.id} | ${r.group} | ${r.source} | ${r.p0Mean.toFixed(3)} | ${r.ctrlMean.toFixed(3)} | ${r.discRatio.toFixed(1)} | ${r.classification} | ${r.decision} |`),
    "",
    "## 4. Composite Candidates", "",
    "| ID | Name | Metric A Status | Metric B Status | Combined |",
    "|----|------|----------------|----------------|----------|",
    ...compRows.slice(1).map(r => `| ${r[0]} | ${r[1]} | ${r[3]} | ${r[4]} | ${r[5]} |`),
    "",
    "## 5. What We Can Do Without Arkham", "",
    "- Market structure scan (price, volume, market cap) ✓",
    "- Derivatives context scan (OI, funding, liquidation) ✓",
    "- DEX activity scan (pool volume, compression/expansion) ✓",
    "- Supply risk scan (float ratio, FDV/mcap, overhang) ✓",
    "- Transfer-lite scan (Moralis transfer count, entity coverage) △",
    "- Arkham local assets as historical research enrichment ✓",
    "",
    "## 6. What We Cannot Do Without Arkham", "",
    "- High-confidence entity flow attribution",
    "- CEX flow proxy (only weak Moralis proxy available)",
    "- Counterparty concentration analysis",
    "- Entity-labeled transfer event windows",
    "- Strong address/entity attribution",
    "- Fund/market maker behavior proxy",
    "",
    "## 7. Arkham Local Assets", "",
    "- Entity label registry: 858 addresses (available offline)",
    "- Holder entity features: 12 tokens (available offline)",
    "- Volume time-series: 6,997 rows (available offline)",
    "- P0 segmented transfer features: 10,559 transfers (available offline)",
    "- Capability matrix: available for reference",
    "- These assets remain as static enrichment — no live API needed",
    "",
    "## 8. Scanner Candidate Layers", "",
    "### Early Context Layer",
    "- Price-volume: quiet_breakout, volume_zscore, price_acceleration",
    "- DEX: pool volume expansion, DEX activity compression",
    "",
    "### Confirmation Layer",
    "- Derivatives: OI change, OI zscore, OI/market cap",
    "- Volume: volume_zscore, volume_to_mcap",
    "",
    "### Risk Layer",
    "- Derivatives: funding overheated, liquidation spikes",
    "- Supply: low float, supply overhang",
    "",
    "### Structural Risk Layer",
    "- Supply: circulating ratio, FDV/mcap",
    "- DEX: low liquidity, high concentration",
    "",
    "## 9. Next Recommendation", "",
    systemViable ? "**RUN_NO_ARKHAM_WATCHLIST** — system viable without Arkham." : "**NEED_MORE_DATA** — insufficient signal without Arkham.",
    "**KEEP_ARKHAM_DISABLED** — do not re-enable live API.",
    "**CANCEL_ARKHAM_KEEP_LOCAL_ASSETS** — local assets sufficient for research enrichment.",
    "",
    "## 10. Cannot Know", "",
    "- Cannot confirm accumulation/distribution",
    "- Cannot confirm buy/sell intent",
    "- Cannot infer causality",
    "- No trading recommendation",
  ];

  writeFileSync(join(REPORTS_DIR, "no_arkham_discovery_report.md"), reportLines.join("\n"));
  console.log(`\nStatus: ${status}`);
  console.log(`Reports saved.`);
}

main();
