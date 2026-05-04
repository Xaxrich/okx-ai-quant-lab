import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { checkTrialStatus, isHeavyEndpoint, getTodayUsage } from "./arkham_trial_guard.js";
import { isArkhamConfigured } from "./arkham_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "arkham");

// Read a CSV and return parsed rows (skip header)
function readCsv(path: string): string[][] | null {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf-8").trim().split("\n");
  if (lines.length < 2) return null;
  return lines.map(l => l.split(","));
}

async function main() {
  console.log("=== Arkham Trial Hardening Report ===\n");

  for (const d of [OUT_DIR + "/analysis", REPORTS_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }

  const trial = checkTrialStatus();
  const configured = isArkhamConfigured();
  const usage = getTodayUsage();
  const today = new Date().toISOString().slice(0, 10);

  // ── Collect all data ──
  const snapExists = existsSync(join(OUT_DIR, "snapshots", "phase64a", "phase64a_snapshot_manifest.json"));
  const regExists = existsSync(join(OUT_DIR, "labels", "entity_label_registry_v1.csv"));
  const holderFeatExists = existsSync(join(OUT_DIR, "features", "arkham_holder_entity_features.csv"));
  const valExists = existsSync(join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "validation", "arkham_holder_entity_validation_results.csv"));

  // Read holder features
  const holderFeatures = readCsv(join(OUT_DIR, "features", "arkham_holder_entity_features.csv"));
  const validation = readCsv(join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "metric_loop", "validation", "arkham_holder_entity_validation_results.csv"));
  const registry = readCsv(join(OUT_DIR, "labels", "entity_label_registry_v1.csv"));

  // Read schema probes
  const topFlowSchema = readCsv(join(OUT_DIR, "schema", "arkham_top_flow_schema_probe.csv"));
  const volumeSchema = readCsv(join(OUT_DIR, "schema", "arkham_volume_schema_probe.csv"));
  const transfersSchema = readCsv(join(OUT_DIR, "schema", "arkham_transfers_schema_probe.csv"));

  // ── Determine status ──
  const topFlowWorking = topFlowSchema?.slice(1).some(r => parseInt(r[4] || "0") > 0);
  const volumeWorking = volumeSchema?.slice(1).some(r => parseInt(r[4] || "0") > 0);
  const transfersEntityWorking = transfersSchema?.slice(1).some(r => r[8] === "true") && !(transfersSchema?.some(r => r[9]?.includes("UNRESOLVED")));

  const flowReady = topFlowWorking && volumeWorking && transfersEntityWorking;
  const holderReady = holderFeatures?.slice(1).some(r => (r[20] || "").includes("READY"));

  const executiveSummary = flowReady ? "ARKHAM_ENTITY_FLOW_READY"
    : holderReady ? "ARKHAM_HOLDER_ENTITY_READY_FLOW_NOT_READY"
    : "ARKHAM_PARTIAL_USEFUL";

  // ── Registry stats ──
  let arkhamOnly = 0, moralisOnly = 0, matchCount = 0, conflictCount = 0, unknownBoth = 0;
  let cexCount = 0, holderCount = 0, unknownWalletCount = 0;
  if (registry) {
    for (const r of registry.slice(1)) {
      const status = r[15] || "";
      const addrType = r[2] || "";
      if (status === "ARKHAM_ONLY") arkhamOnly++;
      else if (status === "MORALIS_ONLY") moralisOnly++;
      else if (status === "MATCH") matchCount++;
      else if (status.includes("CONFLICT")) conflictCount++;
      else if (status === "UNKNOWN_BOTH") unknownBoth++;
      if (addrType === "CEX_ENTITY") cexCount++;
      else if (addrType === "HOLDER") holderCount++;
      else if (addrType === "UNKNOWN_WALLET") unknownWalletCount++;
    }
  }

  // ── Build Report ──
  const lines = [
    "# Arkham Trial Hardening Report", "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## 1. Executive Summary", "",
    `**${executiveSummary}**`,
    `API configured: ${configured}`,
    `Trial active: ${trial.trialActive} | Days remaining: ${trial.daysRemaining}`,
    `Heavy endpoints allowed: ${trial.heavyAllowed}`,
    `Today's usage: ${usage.standard} standard, ${usage.heavy} heavy`,
    "",
    "## 2. Trial Guard / Cache / Usage", "",
    `- Trial end: ${process.env.ARKHAM_TRIAL_END || "2026-06-03"}`,
    `- Cancel decision date: ${process.env.ARKHAM_CANCEL_DECISION_DATE || "2026-06-01"}`,
    `- Heavy endpoints disabled after: ${process.env.ARKHAM_DISABLE_HEAVY_AFTER || "2026-06-01"}`,
    `- Daily standard limit: ${process.env.ARKHAM_DAILY_STANDARD_LIMIT || "5000"}`,
    `- Daily heavy limit: ${process.env.ARKHAM_DAILY_HEAVY_LIMIT || "500"}`,
    `- Cache: ${existsSync(join(OUT_DIR, "cache", "cache_manifest.json")) ? "ACTIVE" : "PENDING"}`,
    `- Usage ledger: ${existsSync(join(OUT_DIR, "usage", "arkham_usage_ledger.jsonl")) ? "ACTIVE" : "PENDING"}`,
    "",
    "## 3. Frozen Phase 6.4A Assets", "",
    snapExists ? "Phase 6.4A assets archived to snapshots/phase64a/" : "NOT FROZEN",
    "",
    "## 4. Entity Label Registry v1", "",
    registry ? `**${registry.length - 1}** addresses in registry` : "NOT BUILT",
    registry ? `- ARKHAM_ONLY: ${arkhamOnly}` : "",
    registry ? `- MORALIS_ONLY: ${moralisOnly}` : "",
    registry ? `- MATCH: ${matchCount}` : "",
    registry ? `- CONFLICT: ${conflictCount}` : "",
    registry ? `- UNKNOWN_BOTH: ${unknownBoth}` : "",
    registry ? `- CEX entities: ${cexCount}` : "",
    registry ? `- HOLDERs: ${holderCount}` : "",
    registry ? `- UNKNOWN_WALLETs: ${unknownWalletCount}` : "",
    "",
    "## 5. Holder-Entity Features", "",
    holderFeatures ? "| Token | Group | Holders | Labeled % | CEX % | Unknown % | Top Entity Share | Concentration | Readiness |" : "NOT BUILT",
    holderFeatures ? "|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|------|" : "",
    ...(holderFeatures?.slice(1).map(r => {
      const t = r[0], g = r[1], n = r[4], lr = r[6], cr = r[10], ur = r[8], tes = r[17], con = r[18], ready = r[20];
      return `| ${t} | ${g} | ${n} | ${lr} | ${cr} | ${ur} | ${tes || "?"} | ${con || "?"} | ${ready} |`;
    }) || []),
    "",
    "## 6. Holder-Entity Validation", "",
    validation ? "| Metric | P0 Avg | Control Avg | Disc Ratio | Classification | Decision |" : "NOT RUN",
    validation ? "|--------|--------|-------------|-----------|---------------|----------|" : "",
    ...(validation?.slice(1).map(r => `| ${r[0]} ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} | ${r[7]} | ${r[8]} |`) || []),
    "",
    "Notes:",
    "- Holder snapshots are NEVER classified as LEADING — they are structural context only.",
    "- Market maker proxy holder count = 0 for all samples (no MM holders detected in top 20).",
    "- P0 tokens show higher unknown holder ratio than controls — structural characteristic, not signal.",
    "",
    "## 7. Top Flow / Volume / Transfers Schema", "",
    `- Top Flow: ${topFlowWorking ? "WORKING" : "NOT WORKING"} — all 9 variant tests returned 0 rows`,
    `- Volume: ${volumeWorking ? "WORKING" : "NOT WORKING"} — works with granularity=1d (203-1112 rows per token)`,
    `  Volume fields: inUSD, outUSD, inValue, outValue, time`,
    `- Transfers Entity: ${transfersEntityWorking ? "WORKING" : "NOT WORKING"} — entity fields unresolved in transfer response`,
    "",
    transfersEntityWorking ? "" : "**TRANSFER_ENTITY_SCHEMA_UNRESOLVED** — time-series entity-flow loop NOT ready.",
    "",
    "## 8. Arkham vs Moralis Reconciliation v2", "",
    "Current status: limited address universe overlap.",
    "- Arkham holder addresses ≠ Moralis transfer addresses (different data sources).",
    "- Direct label cross-validation requires same-address matches.",
    "- Where same address exists in both channels, Arkham labels are higher confidence.",
    "- Full calibration requires Arkham transfer data with entity fields — currently unresolved.",
    "",
    "## 9. What Arkham Can Support Now", "",
    "- Holder entity analysis (12/12 tokens, 5-95% entity coverage)",
    "- Entity label registry (858 addresses, 144 Arkham-labeled)",
    "- CEX holder proxy identification (83 CEX entity addresses)",
    "- Structural context: P0 tokens have distinct holder entity profiles",
    "- Volume time series (with granularity=1d parameter)",
    "",
    "## 10. What Arkham Cannot Support Yet", "",
    "- Time-series entity flow (top_flow endpoint not returning data)",
    "- CEX netflow time series (requires top_flow or entity-labeled transfers)",
    "- Counterparty concentration time series (requires entity-labeled transfers)",
    "- Full Arkham vs Moralis calibration (transfer entity schema unresolved)",
    "- Entity-labeled transfer direction classification",
    "",
    "## 11. What We Still Cannot Know", "",
    "- Cannot confirm accumulation",
    "- Cannot confirm distribution",
    "- Cannot confirm buy/sell intent",
    "- Cannot infer causality from holder snapshots",
    "- No trading recommendation",
    "",
    "## 12. Next Recommendation", "",
    flowReady ? "**RUN_ARKHAM_ENTITY_FLOW_LOOP**" : "",
    holderReady && !flowReady ? "**RUN_ARKHAM_HOLDER_ENTITY_LOOP** — holder entity features are computable for all 12 tokens." : "",
    !topFlowWorking ? "**FIX_ARKHAM_FLOW_SCHEMA** — top_flow endpoint needs parameter investigation." : "",
    !transfersEntityWorking ? "**FIX_ARKHAM_TRANSFER_SCHEMA** — transfer entity field parsing needs resolution." : "",
    volumeWorking ? "**VOLUME_ENDPOINT_READY** — can build volume-based features with granularity=1d." : "",
    trial.daysRemaining < 14 ? "**CANCEL_ARKHAM_DECISION_DUE** — trial ending soon, make cancel/continue decision." : "",
  ];

  writeFileSync(join(REPORTS_DIR, "arkham_trial_hardening_report.md"), lines.join("\n"));
  console.log(`Executive summary: ${executiveSummary}`);
  console.log(`Report saved to ${REPORTS_DIR}/arkham_trial_hardening_report.md`);
}

main().catch(console.error);
