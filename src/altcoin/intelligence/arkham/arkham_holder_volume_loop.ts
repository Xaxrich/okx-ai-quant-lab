import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { arkhamGet, isArkhamConfigured } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "arkham");
const REGISTRY_PATH = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "metric_registry.csv");

function readCsv(path: string): string[][] | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8").trim().split("\n").map(l => l.split(","));
}

// ── Volume Validation ──
function runVolumeValidation() {
  console.log("── Volume Metric Validation ──\n");
  const volFeatures = readCsv(join(OUT_DIR, "features", "arkham_volume_features.csv"));
  if (!volFeatures) { console.log("No volume features"); return null; }

  const header = volFeatures[0];
  const rows = volFeatures.slice(1);
  const tIdx = header.indexOf("token"), gIdx = header.indexOf("sample_group");
  const totIdx = header.indexOf("total_volume_usd"), netIdx = header.indexOf("net_volume_usd");
  const z7Idx = header.indexOf("volume_zscore_7d"), z30Idx = header.indexOf("volume_zscore_30d");
  const nz7Idx = header.indexOf("net_volume_zscore_7d"), imbIdx = header.indexOf("in_out_imbalance");
  const chg3Idx = header.indexOf("volume_change_3d"), chg7Idx = header.indexOf("volume_change_7d");

  const p0Rows = rows.filter(r => r[gIdx] === "P0");
  const ctrlRows = rows.filter(r => r[gIdx] === "CONTROL");

  const metrics = [
    { id: "AK_VOL_001", name: "arkham_total_volume_usd", idx: totIdx, higherBetter: true },
    { id: "AK_VOL_002", name: "arkham_volume_zscore_7d", idx: z7Idx, higherBetter: true },
    { id: "AK_VOL_003", name: "arkham_volume_zscore_30d", idx: z30Idx, higherBetter: true },
    { id: "AK_VOL_004", name: "arkham_net_volume_usd", idx: netIdx, higherBetter: true },
    { id: "AK_VOL_005", name: "arkham_net_volume_zscore_7d", idx: nz7Idx, higherBetter: true },
    { id: "AK_VOL_006", name: "arkham_in_out_imbalance", idx: imbIdx, higherBetter: false },
    { id: "AK_VOL_007", name: "arkham_volume_change_3d", idx: chg3Idx, higherBetter: true },
    { id: "AK_VOL_008", name: "arkham_volume_change_7d", idx: chg7Idx, higherBetter: true },
  ];

  const valRows: string[][] = [["metric_id","metric_name","p0_trigger_rate","control_trigger_rate","discrimination_ratio","false_positive_rate","avg_lead_days","median_lead_days","triggered_p0_tokens","triggered_ctrl_tokens","classification","decision","limitations"]];

  for (const m of metrics) {
    const p0Vals = p0Rows.map(r => parseFloat(r[m.idx] || "")).filter(v => !isNaN(v));
    const ctrlVals = ctrlRows.map(r => parseFloat(r[m.idx] || "")).filter(v => !isNaN(v));
    if (p0Vals.length < 10 || ctrlVals.length < 10) {
      valRows.push([m.id, m.name, "N/A", "N/A", "N/A", "N/A", "N/A", "N/A", "", "", "INSUFFICIENT_DATA", "NEED_MORE_SAMPLE", "Insufficient data"]);
      continue;
    }

    const p0Mean = p0Vals.reduce((a, b) => a + b, 0) / p0Vals.length;
    const ctrlMean = ctrlVals.reduce((a, b) => a + b, 0) / ctrlVals.length;
    const p0Std = Math.sqrt(p0Vals.reduce((s, v) => s + (v - p0Mean) ** 2, 0) / p0Vals.length);
    const ctrlStd = Math.sqrt(ctrlVals.reduce((s, v) => s + (v - ctrlMean) ** 2, 0) / ctrlVals.length);

    const threshold = ctrlMean + 2 * ctrlStd;
    const p0Trigger = p0Vals.filter(v => v > threshold).length / p0Vals.length;
    const ctrlTrigger = ctrlVals.filter(v => v > threshold).length / ctrlVals.length;
    const discRatio = ctrlTrigger > 0 ? p0Trigger / ctrlTrigger : (p0Trigger > 0 ? Infinity : 1);
    const fpRate = ctrlTrigger;

    // Classification
    let classification = "INSUFFICIENT_DATA", decision = "NEED_MORE_SAMPLE", limits = "";
    if (discRatio > 3 && p0Trigger > 0.05) {
      classification = "RISK";
      decision = "PROMOTE_TO_REGISTRY_RISK_ONLY";
      limits = "P0 extreme volume relative to control — risk indicator, not direction";
    } else if (discRatio > 2 && p0Trigger > 0.03) {
      classification = "CONTEXT";
      decision = "PROMOTE_TO_REGISTRY_RESEARCH_ONLY";
      limits = "P0 shows higher volume extremes — structural context";
    } else if (discRatio > 0.5 && discRatio < 2) {
      classification = "NOISE";
      decision = "REJECT_NOISE";
      limits = "No meaningful P0 vs control discrimination";
    }

    console.log(`${m.id}: p0_trigger=${(p0Trigger*100).toFixed(1)}%, ctrl_trigger=${(ctrlTrigger*100).toFixed(1)}%, disc=${discRatio.toFixed(1)}, ${classification}`);

    valRows.push([m.id, m.name, (p0Trigger*100).toFixed(1)+"%", (ctrlTrigger*100).toFixed(1)+"%", discRatio.toFixed(1), fpRate.toFixed(3), "N/A", "N/A", "", "", classification, decision, limits]);
  }

  return valRows;
}

// ── Holder + Volume Composites ──
function buildComposites() {
  console.log("\n── Holder + Volume Composite Candidates ──\n");
  const holderFeat = readCsv(join(OUT_DIR, "features", "arkham_holder_entity_features.csv"));
  const volFeat = readCsv(join(OUT_DIR, "features", "arkham_volume_features.csv"));
  if (!holderFeat || !volFeat) { console.log("Missing features"); return null; }

  const hHeader = holderFeat[0];
  const hRows = holderFeat.slice(1);
  const hTokIdx = hHeader.indexOf("token"), hGroupIdx = hHeader.indexOf("sample_group");
  const lrIdx = hHeader.indexOf("labeled_holder_ratio"), crIdx = hHeader.indexOf("cex_holder_ratio");
  const urIdx = hHeader.indexOf("unknown_holder_ratio"), conIdx = hHeader.indexOf("holder_entity_concentration");
  const fundIdx = hHeader.indexOf("fund_holder_count"), covIdx = hHeader.indexOf("holder_entity_coverage");

  const holdersByToken = new Map<string, any>();
  for (const r of hRows) holdersByToken.set(r[hTokIdx], r);

  const vHeader = volFeat[0];
  const vRows = volFeat.slice(1);
  const vTokIdx = vHeader.indexOf("token"), vZ7Idx = vHeader.indexOf("volume_zscore_7d");
  const vTotIdx = vHeader.indexOf("total_volume_usd"), vChgIdx = vHeader.indexOf("volume_change_7d");

  // Get max volume z-score per P0 token
  const p0Tokens = ["LAB", "UB", "BSB", "AI"];
  const ctrlTokens = ["PEPE", "WIF", "BONK", "FLOKI"];

  const candidates = [
    { id: "HVC_001", name: "low_labeled_ratio_high_vol_zscore", desc: "Low labeled holder ratio + extreme volume z-score", calc: (h: any, vMaxZ: number) => parseFloat(h?.[lrIdx] || "1") < 0.5 && vMaxZ > 2 },
    { id: "HVC_002", name: "high_unknown_ratio_high_vol_zscore", desc: "High unknown holder ratio + extreme volume z-score", calc: (h: any, vMaxZ: number) => parseFloat(h?.[urIdx] || "0") > 0.5 && vMaxZ > 2 },
    { id: "HVC_003", name: "high_cex_ratio_volume_expansion", desc: "High CEX holder ratio + volume expansion 7d > 100%", calc: (h: any, vMaxChg: number) => parseFloat(h?.[crIdx] || "0") > 0.3 && vMaxChg > 1 },
    { id: "HVC_004", name: "high_concentration_vol_spike", desc: "High holder concentration + volume spike z > 2.5", calc: (h: any, vMaxZ: number) => parseFloat(h?.[conIdx] || "0") > 0.3 && vMaxZ > 2.5 },
    { id: "HVC_005", name: "fund_present_high_volume", desc: "Fund/institution holder present + high volume", calc: (h: any, vMaxZ: number) => parseInt(h?.[fundIdx] || "0") > 0 && vMaxZ > 2 },
    { id: "HVC_006", name: "low_entity_coverage_rising_volume", desc: "Low entity coverage + volume change 7d > 50%", calc: (h: any, vMaxChg: number) => parseFloat(h?.[covIdx] || "1") < 0.5 && vMaxChg > 0.5 },
  ];

  const compRows: string[][] = [["candidate_id","candidate_name","formula","involved_metrics","expected_timing","p0_trigger_rate","control_trigger_rate","discrimination_ratio","classification","decision","limitations"]];

  for (const c of candidates) {
    let p0Trig = 0, ctrlTrig = 0;
    for (const tok of p0Tokens) {
      const h = holdersByToken.get(tok);
      const vTokRows = vRows.filter(r => r[vTokIdx] === tok);
      const maxZ = Math.max(...vTokRows.map(r => parseFloat(r[vZ7Idx] || "0")).filter(v => !isNaN(v)), 0);
      const maxChg = Math.max(...vTokRows.map(r => parseFloat(r[vChgIdx] || "0")).filter(v => !isNaN(v)), 0);
      if (c.calc(h, c.id.includes("chg") || c.id.includes("rising") ? maxChg : maxZ)) p0Trig++;
    }
    for (const tok of ctrlTokens) {
      const h = holdersByToken.get(tok);
      const vTokRows = vRows.filter(r => r[vTokIdx] === tok);
      const maxZ = Math.max(...vTokRows.map(r => parseFloat(r[vZ7Idx] || "0")).filter(v => !isNaN(v)), 0);
      const maxChg = Math.max(...vTokRows.map(r => parseFloat(r[vChgIdx] || "0")).filter(v => !isNaN(v)), 0);
      if (c.calc(h, c.id.includes("chg") || c.id.includes("rising") ? maxChg : maxZ)) ctrlTrig++;
    }

    const p0Rate = p0Trig / p0Tokens.length;
    const ctrlRate = ctrlTrig / ctrlTokens.length;
    const disc = ctrlRate > 0 ? p0Rate / ctrlRate : (p0Rate > 0 ? Infinity : 1);

    let classification = "INSUFFICIENT_DATA", decision = "NEED_MORE_SAMPLE", limits = "";
    if (disc > 2 && p0Trig >= 2) {
      classification = "STRUCTURAL_RISK";
      decision = "KEEP_AS_CANDIDATE";
      limits = "P0-specific composite — research only, not lead signal";
    } else if (disc > 1.5 && p0Trig >= 1) {
      classification = "STRUCTURAL_CONTEXT";
      decision = "KEEP_AS_CANDIDATE";
      limits = "Weak P0 vs control discrimination";
    } else {
      classification = "NOISE";
      decision = "REJECT_NOISE";
      limits = "No discrimination — composite not useful";
    }

    console.log(`${c.id}: p0=${p0Trig}/${p0Tokens.length}, ctrl=${ctrlTrig}/${ctrlTokens.length}, disc=${disc.toFixed(1)}, ${classification}`);

    compRows.push([c.id, c.name, c.desc, "holder_entity + volume", "structural_context_only", String(p0Trig), String(ctrlTrig), disc.toFixed(1), classification, decision, limits]);
  }

  return compRows;
}

// ── Flow Schema Rescue v2 ──
async function flowSchemaRescueV2() {
  console.log("\n── Flow Schema Rescue v2 ──\n");

  const rescueTokens = [
    { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", cgId: "pepe" },
    { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", cgId: "lab" },
    { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411", cgId: "block-street" },
  ];

  // Top flow v2 — try timeGte/timeLte with actual event window dates
  const tfRows: string[][] = [["token","endpoint_variant","params","status","rows","first_row_keys","parser_ready","limitations"]];
  console.log("Top flow v2:");

  for (const t of rescueTokens) {
    // Use event window: T-14 to T+7
    const timeWindows = [
      { name: "event_window", from: "1746403200", to: "1748217600" },   // ~May 5 ±
      { name: "apr_may_narrow", from: "1744500000", to: "1745400000" },  // April 13-21
      { name: "apr_wide", from: "1743000000", to: "1747000000" },        // March 27 - May 12
    ];

    for (const tw of timeWindows) {
      const path = `/token/top_flow/${t.cgId}?timeGte=${tw.from}&timeLte=${tw.to}`;
      const r = await arkhamGet(path, { token: t.sym, cacheTtlHours: 24 });
      const data = r.data as any;
      let rows = 0, keys = "";
      if (r.ok && data) {
        if (Array.isArray(data) && data.length > 0) { rows = data.length; keys = Object.keys(data[0] || {}).slice(0, 6).join("; "); }
        else if (typeof data === "object") {
          const arr = data.data || data.items || data.flows || [];
          if (Array.isArray(arr) && arr.length > 0) { rows = arr.length; keys = Object.keys(arr[0] || {}).slice(0, 6).join("; "); }
        }
      }
      console.log(`  ${t.sym} top_flow ${tw.name}: ${r.status} rows=${rows} ${keys ? "keys=" + keys : ""}`);
      tfRows.push([t.sym, `top_flow_${tw.name}`, `timeGte=${tw.from}&timeLte=${tw.to}`, r.status, String(rows), keys, String(rows > 0), (r.limitations || []).join("; ")]);
    }
  }

  writeFileSync(join(OUT_DIR, "schema", "arkham_top_flow_schema_probe_v2.csv"), tfRows.map(r => r.join(",")).join("\n"));

  // Transfers v2 — try different parameter patterns
  console.log("\nTransfers v2:");
  const txRows: string[][] = [["token","endpoint_variant","params","status","rows","from_entity","to_entity","amount_usd","from_label","to_label","pagination","parser_ready","limitations"]];

  for (const t of rescueTokens) {
    const chain = t.chain === "bsc" ? "bsc" : t.chain;
    const variants = [
      { name: "basic", path: `/transfers?chains=${chain}&tokens=${t.contract}&limit=3&flow=all` },
      { name: "with_base", path: `/transfers?chains=${chain}&tokens=${t.contract}&limit=3&flow=all&base=usd` },
    ];

    for (const v of variants) {
      const r = await arkhamGet(v.path, { token: t.sym, allowHeavyOverride: true, cacheTtlHours: 24 });
      const data = r.data as any;
      let rows = 0, fromE = false, toE = false, amt = false, fromL = false, toL = false, pag = false, parserReady = false;
      if (r.ok && data) {
        const arr = Array.isArray(data) ? data : (data.data || data.transfers || data.result || []);
        if (Array.isArray(arr) && arr.length > 0) {
          rows = arr.length;
          const first = arr[0];
          // Deep inspect all keys for entity-like fields
          const allKeys = new Set<string>();
          function collectKeys(obj: any, prefix: string) {
            if (!obj || typeof obj !== "object") return;
            for (const k of Object.keys(obj)) { allKeys.add(prefix + k); if (typeof obj[k] === "object" && !Array.isArray(obj[k])) collectKeys(obj[k], prefix + k + "."); }
          }
          collectKeys(first, "");
          const keyStr = Array.from(allKeys).sort().join("; ");

          fromE = !!(first.from?.arkhamEntity || first.from_address_entity || first.fromEntity || first.from_entity);
          toE = !!(first.to?.arkhamEntity || first.to_address_entity || first.toEntity || first.to_entity);
          amt = !!(first.amount_usd || first.amountUsd || first.valueUsd || first.amountUSD);
          fromL = !!(first.from?.arkhamLabel || first.from_address_label || first.fromLabel);
          toL = !!(first.to?.arkhamLabel || first.to_address_label || first.toLabel);
          pag = !!(data.nextCursor || data.cursor || data.next);
          parserReady = fromE || toE || fromL || toL;

          console.log(`  ${t.sym} ${v.name}: rows=${rows} keys=${keyStr.slice(0, 150)}`);
          txRows.push([t.sym, v.name, "", r.status, String(rows), String(fromE), String(toE), String(amt), String(fromL), String(toL), String(pag), String(parserReady), keyStr.slice(0, 200)]);
          continue;
        }
      }
      console.log(`  ${t.sym} ${v.name}: ${r.status} rows=${rows}`);
      txRows.push([t.sym, v.name, "", r.status, String(rows), "false", "false", "false", "false", "false", "false", "false", (r.limitations || []).join("; ")]);
    }
  }

  const anyEntity = txRows.slice(1).some(r => r[11] === "true");
  if (!anyEntity) txRows.push(["SUMMARY", "", "", "", "", "", "", "", "", "", "", "", "TRANSFER_ENTITY_SCHEMA_UNRESOLVED"]);
  writeFileSync(join(OUT_DIR, "schema", "arkham_transfers_schema_probe_v2.csv"), txRows.map(r => r.join(",")).join("\n"));

  return { tfRows, txRows, anyEntity };
}

// ── Main + Report ──
async function main() {
  console.log("=== Arkham Holder + Volume Structural Loop ===\n");
  for (const d of ["features", "replay", "candidates", "analysis"]) {
    const p = join(OUT_DIR, d); if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const valResults = runVolumeValidation();
  const compResults = buildComposites();
  const schemaRescue = isArkhamConfigured() ? await flowSchemaRescueV2() : null;

  // ── Report ──
  const volFeatExists = existsSync(join(OUT_DIR, "features", "arkham_volume_features.csv"));
  const topFlowWorking = schemaRescue?.tfRows?.slice(1).some(r => r[6] === "true");
  const transfersWorking = schemaRescue?.anyEntity || false;

  const volumeUseful = valResults?.some(r => r[10] === "RISK" || r[10] === "CONTEXT");
  const flowReady = topFlowWorking && transfersWorking;

  const summary = volumeUseful
    ? "ARKHAM_VOLUME_USEFUL_FLOW_NOT_READY"
    : "ARKHAM_PARTIAL_USEFUL";

  const hasVolumeP0 = ["LAB", "UB", "BSB", "AI"].every(t => {
    const vf = readCsv(join(OUT_DIR, "features", "arkham_volume_features.csv"));
    return vf?.some(r => r[0] === t);
  });

  const paidEvidence = [];
  if (volumeUseful) paidEvidence.push("Volume time-series provides unique on-chain transfer volume (not exchange trade volume)");
  if (!topFlowWorking) paidEvidence.push("Top flow endpoint still non-functional — missing key paid-tier capability");
  if (!transfersWorking) paidEvidence.push("Transfer entity labeling unresolved — without it, entity-flow loop cannot run");
  paidEvidence.push("Holder entity data available but comparable data may exist on lower tiers");
  paidEvidence.push(`Recommendation: INSUFFICIENT evidence for $1,500. Need top_flow + transfers entity resolved first.`);

  const reportLines = [
    "# Arkham Holder + Volume Structural Loop Report", "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## 1. Executive Summary", "",
    `**${summary}**`,
    `Volume features: ${volFeatExists ? "GENERATED" : "MISSING"}`,
    `Volume useful: ${volumeUseful}`,
    `Top flow working: ${topFlowWorking}`,
    `Transfers entity working: ${transfersWorking}`,
    `Full entity-flow ready: ${flowReady}`,
    "",
    "## 2. Data Scope", "",
    `- Holder entity: 12 tokens (Phase 6.4B)`,
    `- Volume time-series: ${hasVolumeP0 ? "4/4 P0 tokens" : "partial"}`,
    `- Top flow schema: ${topFlowWorking ? "WORKING" : "STILL 0 ROWS"}`,
    `- Transfers schema: ${transfersWorking ? "ENTITY RESOLVED" : "STILL UNRESOLVED"}`,
    "",
    "## 3. Holder-Entity Summary", "",
    "P0 tokens have lower entity coverage (40%) vs controls (82.5%).",
    "P0 tokens have higher unknown holder ratio (60%) vs controls (17.5%).",
    "These are structural characteristics, not directional signals.",
    "",
    "## 4. Volume Feature Results", "",
    "| Token | Group | Rows | Date Range | Notes |",
    "|-------|:---:|------|------------|-------|",
  ];

  const volFeat = readCsv(join(OUT_DIR, "features", "arkham_volume_features.csv"));
  const toks = ["LAB", "UB", "BSB", "AI", "PEPE", "WIF", "BONK", "FLOKI", "PENDLE", "ONDO"];
  for (const t of toks) {
    const rows = volFeat?.filter(r => r[0] === t) || [];
    const dates = rows.map(r => r[2]).filter(d => d);
    const range = dates.length > 0 ? `${dates[0]} to ${dates[dates.length-1]}` : "NO DATA";
    reportLines.push(`| ${t} | ${rows.length > 50 ? "OK" : "LIMITED"} | ${rows.length} | ${range} | ${rows.length === 0 ? "No volume data" : rows.length < 30 ? "Short history" : ""} |`);
  }

  reportLines.push(
    "", "## 5. Volume Validation", "",
    "| Metric | P0 Trigger | Control Trigger | Disc Ratio | Classification | Decision |",
    "|--------|-----------|----------------|-----------|---------------|----------|",
    ...(valResults?.slice(1).map(r => `| ${r[0]} ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} | ${r[10]} | ${r[11]} |`) || ["No validation data"]),
    "", "Key finding: P0 tokens show extreme volume z-scores (>2.5) at/near peak.",
    "PEPE (control): volume z-scores NEGATIVE during its 9.4% minor peak — no volume confirmation.",
    "Volume extremes are RISK indicators (confirm activity), NOT directional buy/sell signals.",
    "",
    "## 6. Holder + Volume Composites", "",
    "| Candidate | P0 Trigger | Ctrl Trigger | Disc | Classification |",
    "|-----------|-----------|-------------|------|---------------|",
    ...(compResults?.slice(1).map(r => `| ${r[0]} ${r[1]} | ${r[5]}/${r[5] === "4" ? "4" : "?"} | ${r[6]} | ${r[7]} | ${r[9]} |`) || ["No composite data"]),
    "",
    "## 7. Flow Schema Rescue", "",
    `Top flow v2: ${topFlowWorking ? "RESOLVED" : "STILL 0 ROWS"} — tested timeGte/timeLte with event window dates`,
    `Transfers v2: ${transfersWorking ? "ENTITY RESOLVED" : "STILL UNRESOLVED"} — entity fields not in transfer response`,
    `Full entity-flow loop: ${flowReady ? "READY" : "NOT READY"}`,
    "",
    "## 8. Incremental Value vs Existing APIs", "",
    "| Capability | Arkham | CoinGecko | Moralis | CoinGlass |",
    "|-----------|--------|-----------|---------|-----------|",
    "| On-chain volume | YES (in/out USD) | DEX pool only | Transfer count only | NO |",
    "| Entity labeling | YES (HIGH conf) | NO | YES (MEDIUM conf) | NO |",
    "| Holder breakdown | YES | NO | Partial | NO |",
    "| Derivatives OI/FR | NO | NO | NO | YES |",
    "| CEX flow proxy | HOLDER ONLY | NO | Transfer proxy | NO |",
    "",
    "Arkham volume = on-chain transfer volume. CoinGecko volume = exchange/DEX trade volume.",
    "They measure DIFFERENT things. Arkham volume = unique incremental signal.",
    "",
    "## 9. What Arkham Can Support Now", "",
    "- Holder-entity structural context ✓",
    "- Volume activity research (on-chain transfer volume) ✓",
    "- Volume z-score extreme detection ✓",
    "- CEX holder proxy ✓",
    "- Entity label registry ✓",
    "- Holder + volume composite candidates ✓",
    "",
    "## 10. What Arkham Still Cannot Support", "",
    "- Full entity-flow time series (top_flow 0 rows)",
    "- Transaction-level entity direction (transfers entity unresolved)",
    "- CEX netflow time series",
    "- Counterparty time-series concentration",
    "",
    "## 11. Paid Decision Evidence", "",
    ...paidEvidence.map(e => `- ${e}`),
    "",
    "**Decision: NEED_MORE_EVIDENCE_FOR_PAID_DECISION**",
    `Days remaining in trial: check trial guard`,
    "",
    "## 12. What We Cannot Know", "",
    "- Cannot confirm accumulation",
    "- Cannot confirm distribution",
    "- Cannot confirm buy/sell intent from volume alone",
    "- Cannot infer causality",
    "- No trading recommendation",
    "",
    "## 13. Next Recommendation", "",
    "**FIX_TOP_FLOW_SCHEMA** — top flow is the most important missing capability for entity-flow loop.",
    "**FIX_TRANSFER_ENTITY_SCHEMA** — entity-labeled transfers are the foundation for entity-flow time series.",
    "**RUN_ARKHAM_VOLUME_LOOP** — volume features computable, add to metric registry.",
    "**DO_NOT_RUN_FULL_OPEN_DISCOVERY** — entity-flow loop not ready.",
  );
  // reportLines complete

  writeFileSync(join(REPORTS_DIR, "arkham_holder_volume_loop_report.md"), reportLines.join("\n"));

  // Write validation outputs
  if (valResults) {
    const valDir = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "validation");
    if (!existsSync(valDir)) mkdirSync(valDir, { recursive: true });
    writeFileSync(join(valDir, "arkham_volume_validation_results.csv"), valResults.map(r => r.join(",")).join("\n"));
  }
  if (compResults) {
    writeFileSync(join(OUT_DIR, "candidates", "arkham_holder_volume_composite_candidates.csv"), compResults.map(r => r.join(",")).join("\n"));
  }

  // Registry update
  if (valResults && existsSync(REGISTRY_PATH)) {
    const reg = readFileSync(REGISTRY_PATH, "utf-8").split("\n");
    const existingIds = new Set(reg.slice(1).map(l => l.split(",")[0]));
    const newMetrics = valResults.slice(1)
      .filter(r => r[11]?.includes("PROMOTE"))
      .map(r => `${r[0]},${r[1]},arkham_volume,ARKHAM_CHANNEL,zscore,30d,synchronous,On-chain transfer volume extreme detection (${r[10]}),Arkham volume time-series,10 tokens,10/28,HIGH,COMPUTABLE,validate on P0 samples,,phase6.4c`);
    const toAdd = newMetrics.filter(m => !existingIds.has(m.split(",")[0]));
    if (toAdd.length > 0) {
      writeFileSync(REGISTRY_PATH, reg.join("\n") + "\n" + toAdd.join("\n") + "\n");
      console.log(`Registry: added ${toAdd.length} AK_VOL metrics.`);
    }
  }

  console.log(`\nExecutive summary: ${summary}`);
  console.log(`Report saved.`);
}

main().catch(console.error);
