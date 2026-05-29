import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const ONCHAIN_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const VALIDATION_DIR = join(ROOT, "data", "altcoin", "intelligence", "validation");
const ACCUMULATION_DIR = join(ROOT, "data", "altcoin", "intelligence", "accumulation");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");

const CANDIDATES_PATH = join(VALIDATION_DIR, "chain_scan_candidates_latest.csv");
const LIGHT_PATH = join(ONCHAIN_DIR, "light_chain_scan_latest.csv");
const ENTITY_PATH = join(ONCHAIN_DIR, "entity_flow_review_latest.csv");
const HOLDER_PATH = join(ONCHAIN_DIR, "holder_identity_review_latest.csv");
const HOLDER_DELTA_PATH = join(ONCHAIN_DIR, "holder_flow_delta_review_latest.csv");
const CEX_PATH = join(ONCHAIN_DIR, "cex_flow_window_scan_latest.csv");
const READINESS_PATH = join(ONCHAIN_DIR, "scan_readiness_latest.csv");
const ACCUMULATION_PATH = join(ACCUMULATION_DIR, "accumulation_signals_latest.csv");

export type EvidenceState =
  | "EVIDENCE_CONFLICT"
  | "UNDER_MINED"
  | "RISK_CONFIRMED"
  | "CANDIDATE_CLEAN"
  | "SHALLOW_WATCH";

interface CandidateRow {
  token: string;
  priority: string;
  scan_chain: string;
  contract_address: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
}

interface LightRow {
  token: string;
  price_status: string;
  holders_status: string;
  holders_rows: string;
  transfers_status: string;
  transfers_rows: string;
  scan_status: string;
}

interface EntityRow {
  token: string;
  transfer_status: string;
  transfer_rows: string;
  entity_label_coverage: string;
  decision: string;
  top_holder_pct_supply: string;
  top10_holder_pct_supply: string;
}

interface HolderRow {
  token: string;
  decision: string;
  identity_class: string;
  contract_name: string;
}

interface HolderDeltaRow {
  token: string;
  decision: string;
  confidence: string;
  net_top_holder_value: string;
  top_to_cex_value: string;
}

interface CexRow {
  token: string;
  window_hours: string;
  decision: string;
  transfers: string;
  label_coverage: string;
  net_cex_value: string;
  window_coverage_ratio: string;
  fetch_pages: string;
  fetch_stop_reason: string;
  fetch_status: string;
}

interface ReadinessRow {
  token: string;
  decision: string;
  scan_depth: string;
  reason: string;
}

interface AccumulationRow {
  token: string;
  label: string;
  confidence: string;
  data_completeness: string;
  risk_penalty: string;
  positive_evidence: string;
  risk_evidence: string;
  limitations: string;
}

export interface EvidenceDepthInput {
  opportunityScore: number;
  fragilityScore: number;
  tradabilityScore: number;
  lightScanOk: boolean;
  lightHolderRows: number;
  lightTransferRows: number;
  entityTransferRows: number;
  entityCoverage: number;
  entityDecision: string;
  holderDecision: string;
  holderIdentityClass: string;
  holderDeltaDecision?: string;
  cex1hDecision: string;
  cex4hDecision: string;
  cex24hDecision: string;
  cex1hTransfers: number;
  cex4hTransfers: number;
  cex24hTransfers: number;
  cex1hCoverage: number;
  cex4hCoverage: number;
  cex24hCoverage: number;
  cex1hFetchStop: string;
  cex4hFetchStop: string;
  cex24hFetchStop: string;
  cex1hFetchStatus: string;
  cex4hFetchStatus: string;
  cex24hFetchStatus: string;
  netCex1hValue: number;
  netCex4hValue: number;
  netCex24hValue: number;
  readinessDecision: string;
  accumulationLabel: string;
  accumulationConfidence: string;
}

export interface EvidenceDepthDecision {
  evidenceState: EvidenceState;
  depthScore: number;
  conflictScore: number;
  insufficiencyScore: number;
  conclusion: string;
  nextProbe: string;
  reasons: string[];
}

function rowsToObjects<T extends object>(path: string): T[] {
  const csv = readCsv(path);
  if (!csv) return [];
  return csv.rows.map((row) => {
    const out: Record<string, string> = {};
    csv.h.forEach((header, index) => {
      out[header] = row[index] || "";
    });
    return out as T;
  });
}

function num(value: string | undefined): number {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function isResolvedHolder(decision: string): boolean {
  return decision === "IDENTITY_RESOLVED" || decision === "PROJECT_CONTRACT_LIKELY" || decision === "LOW_PRIORITY";
}

function isCexGood(decision: string): boolean {
  return decision === "CEX_OUTFLOW_OR_NEUTRAL" || decision === "CEX_INFLOW_RISK";
}

function isCexRisk(decision: string): boolean {
  return decision === "CEX_INFLOW_RISK";
}

function cexWindowInsufficient(decision: string, transfers: number, coverage: number, fetchStop: string, fetchStatus: string): boolean {
  if (decision === "PARTIAL_WINDOW" || decision === "LOW_COVERAGE" || decision === "NO_DATA") return true;
  if (transfers === 0) return true;
  if (coverage < 0.95) return true;
  if (fetchStop === "FETCH_ERROR" || /^HTTP_[45]/.test(fetchStatus)) return true;
  return false;
}

function effectiveEntityCoverage(entity: EntityRow | undefined, cex1: CexRow | undefined, cex4: CexRow | undefined, cex24: CexRow | undefined): number {
  return Math.max(
    num(entity?.entity_label_coverage),
    num(cex1?.label_coverage),
    num(cex4?.label_coverage),
    num(cex24?.label_coverage),
  );
}

function effectiveEntityTransferRows(entity: EntityRow | undefined, cex1: CexRow | undefined, cex4: CexRow | undefined, cex24: CexRow | undefined): number {
  return Math.max(
    num(entity?.transfer_rows),
    num(cex1?.transfers),
    num(cex4?.transfers),
    num(cex24?.transfers),
  );
}

export function classifyEvidenceDepth(input: EvidenceDepthInput): EvidenceDepthDecision {
  const reasons: string[] = [];
  let depth = 0;
  let conflict = 0;
  let insufficiency = 0;

  if (input.lightScanOk) depth += 12;
  else { insufficiency += 15; reasons.push("light_scan_not_clean"); }

  if (input.lightHolderRows >= 20) depth += 8;
  else { insufficiency += 8; reasons.push("light_holder_sample_small"); }

  if (input.lightTransferRows >= 20) depth += 8;
  else { insufficiency += 8; reasons.push("light_transfer_sample_small"); }

  if (input.entityTransferRows >= 100) depth += 12;
  else if (input.entityTransferRows >= 20) depth += 6;
  else { insufficiency += 10; reasons.push("entity_transfer_sample_small"); }

  if (input.entityCoverage >= 0.5) depth += 12;
  else if (input.entityCoverage >= 0.35) depth += 8;
  else if (input.entityCoverage >= 0.25) depth += 4;
  else { insufficiency += 18; reasons.push("entity_label_coverage_low"); }

  if (isResolvedHolder(input.holderDecision)) depth += 14;
  else { insufficiency += 15; reasons.push("holder_identity_unresolved"); }

  if (input.holderDeltaDecision === "TOP_HOLDER_ACCUMULATION_PROXY") {
    depth += 8;
    reasons.push("holder_delta_accumulation_proxy");
  } else if (input.holderDeltaDecision === "TOP_HOLDER_DISTRIBUTION_RISK") {
    conflict += 30;
    reasons.push("top_holder_distribution_to_cex");
  } else if (input.holderDeltaDecision === "TOP_HOLDER_FLOW_MIXED") {
    depth += 4;
    conflict += 8;
    reasons.push("holder_delta_mixed");
  } else if (input.holderDeltaDecision === "NO_RECENT_TOP_HOLDER_FLOW") {
    insufficiency += 6;
    reasons.push("holder_delta_no_recent_top_holder_flow");
  }

  const cexWindows = [
    { name: "1h", decision: input.cex1hDecision, transfers: input.cex1hTransfers, coverage: input.cex1hCoverage, stop: input.cex1hFetchStop, status: input.cex1hFetchStatus },
    { name: "4h", decision: input.cex4hDecision, transfers: input.cex4hTransfers, coverage: input.cex4hCoverage, stop: input.cex4hFetchStop, status: input.cex4hFetchStatus },
    { name: "24h", decision: input.cex24hDecision, transfers: input.cex24hTransfers, coverage: input.cex24hCoverage, stop: input.cex24hFetchStop, status: input.cex24hFetchStatus },
  ];

  for (const row of cexWindows) {
    if (isCexGood(row.decision) && row.transfers > 0 && row.coverage >= 0.95) depth += 8;
    else if (cexWindowInsufficient(row.decision, row.transfers, row.coverage, row.stop, row.status)) {
      insufficiency += row.name === "24h" ? 14 : 8;
      reasons.push(`cex_${row.name}_insufficient`);
    }
  }

  const longOrMediumCexRisk = isCexRisk(input.cex4hDecision) || isCexRisk(input.cex24hDecision);
  const anyCexRisk = isCexRisk(input.cex1hDecision) || longOrMediumCexRisk;
  const completeCexWindows = cexWindows.filter((row) => isCexGood(row.decision) && row.transfers > 0 && row.coverage >= 0.95).length;
  const completeLongOrMediumCexRisk = longOrMediumCexRisk && completeCexWindows >= 2;
  const strongScores = input.opportunityScore >= 40 && input.tradabilityScore >= 60 && input.fragilityScore <= 35;

  if (strongScores && anyCexRisk) {
    conflict += longOrMediumCexRisk ? 35 : 22;
    reasons.push("strong_scores_conflict_with_cex_inflow");
  }
  if (input.accumulationLabel.includes("ACCUMULATION") && anyCexRisk) {
    conflict += 25;
    reasons.push("accumulation_label_conflicts_with_cex_inflow");
  }
  if (input.entityDecision === "WATCH_CEX_INFLOW_RISK") {
    conflict += 22;
    reasons.push("entity_flow_detected_cex_inflow_risk");
  }
  if (input.holderDecision === "HIGH_CONCENTRATION_UNRESOLVED") {
    conflict += 25;
    reasons.push("high_concentration_unresolved");
  }
  if (input.netCex24hValue > 0 && input.opportunityScore >= 35) {
    conflict += 12;
    reasons.push("positive_24h_net_cex_value");
  }

  depth = clamp(Math.round(depth));
  conflict = clamp(Math.round(conflict));
  insufficiency = clamp(Math.round(insufficiency));

  if (
    (depth >= 70 && conflict >= 35)
    || (depth >= 60 && conflict >= 70)
    || (depth >= 60 && longOrMediumCexRisk && conflict >= 35)
    || (completeLongOrMediumCexRisk && conflict >= 70 && depth >= 40)
  ) {
    return {
      evidenceState: "EVIDENCE_CONFLICT",
      depthScore: depth,
      conflictScore: conflict,
      insufficiencyScore: insufficiency,
      conclusion: "evidence is strong enough to say the opportunity is not clean",
      nextProbe: "monitor whether 4h/24h CEX inflow clears; do not treat as accumulation until flow and holder deltas confirm",
      reasons,
    };
  }
  if (input.readinessDecision === "RISK_MONITOR_CEX_FLOW" && depth >= 60) {
    return {
      evidenceState: "RISK_CONFIRMED",
      depthScore: depth,
      conflictScore: conflict,
      insufficiencyScore: insufficiency,
      conclusion: "risk signal is supported by enough flow coverage",
      nextProbe: "track next fresh CEX-flow cycle and compare net exchange value against price response",
      reasons,
    };
  }
  if (insufficiency >= 30 || depth < 60) {
    return {
      evidenceState: "UNDER_MINED",
      depthScore: depth,
      conflictScore: conflict,
      insufficiencyScore: insufficiency,
      conclusion: "current result is not clear because data depth is insufficient",
      nextProbe: "repair missing transfer windows, holder time-series, and entity label coverage before directional judgment",
      reasons,
    };
  }
  if (input.readinessDecision === "READY_FOR_DEEP_SCAN") {
    return {
      evidenceState: "CANDIDATE_CLEAN",
      depthScore: depth,
      conflictScore: conflict,
      insufficiencyScore: insufficiency,
      conclusion: "candidate passes current evidence depth checks",
      nextProbe: "deepen liquidity, holder-delta, and invalidation checks before any execution decision",
      reasons,
    };
  }
  return {
    evidenceState: "SHALLOW_WATCH",
    depthScore: depth,
    conflictScore: conflict,
    insufficiencyScore: insufficiency,
    conclusion: "enough for watchlist only, not enough for directional opportunity",
    nextProbe: "keep shallow monitoring and promote only if score or flow structure improves",
    reasons,
  };
}

function buildReport(rows: any[]): string {
  const lines = [
    "# Evidence Depth Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Purpose: distinguish true evidence conflict from under-mined candidates.",
    "",
    "| token | state | depth | conflict | insufficiency | conclusion | next_probe | reasons |",
    "| --- | --- | ---: | ---: | ---: | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(`| ${row.token} | ${row.evidence_state} | ${row.depth_score} | ${row.conflict_score} | ${row.insufficiency_score} | ${row.conclusion} | ${row.next_probe} | ${row.reasons} |`);
  }
  lines.push(
    "",
    "## Method Notes",
    "",
    "- Entity-level signals are weighted above raw address counts.",
    "- CEX windows require non-empty 1h/4h/24h samples with usable coverage before directional interpretation.",
    "- Strong scores plus CEX inflow are treated as conflicting evidence, not as a clean long setup.",
    "- Complete multi-window CEX risk can confirm conflict even if a separate light-scan source is temporarily unavailable.",
    "- Missing holder history, low entity coverage, empty transfer windows, or API fetch errors are classified as under-mined."
  );
  return lines.join("\n");
}

async function main() {
  if (!existsSync(ONCHAIN_DIR)) mkdirSync(ONCHAIN_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const lightMap = new Map(rowsToObjects<LightRow>(LIGHT_PATH).map((row) => [row.token, row]));
  const entityMap = new Map(rowsToObjects<EntityRow>(ENTITY_PATH).map((row) => [row.token, row]));
  const holderMap = new Map(rowsToObjects<HolderRow>(HOLDER_PATH).map((row) => [row.token, row]));
  const holderDeltaMap = new Map(rowsToObjects<HolderDeltaRow>(HOLDER_DELTA_PATH).map((row) => [row.token, row]));
  const readinessMap = new Map(rowsToObjects<ReadinessRow>(READINESS_PATH).map((row) => [row.token, row]));
  const accumulationMap = new Map(rowsToObjects<AccumulationRow>(ACCUMULATION_PATH).map((row) => [row.token, row]));
  const cexMap = new Map<string, CexRow>();
  for (const row of rowsToObjects<CexRow>(CEX_PATH)) cexMap.set(`${row.token}:${row.window_hours}`, row);

  const outputRows = rowsToObjects<CandidateRow>(CANDIDATES_PATH).map((candidate) => {
    const light = lightMap.get(candidate.token);
    const entity = entityMap.get(candidate.token);
    const holder = holderMap.get(candidate.token);
    const holderDelta = holderDeltaMap.get(candidate.token);
    const readiness = readinessMap.get(candidate.token);
    const accumulation = accumulationMap.get(candidate.token);
    const cex1 = cexMap.get(`${candidate.token}:1`);
    const cex4 = cexMap.get(`${candidate.token}:4`);
    const cex24 = cexMap.get(`${candidate.token}:24`);
    const entityCoverage = effectiveEntityCoverage(entity, cex1, cex4, cex24);
    const entityTransferRows = effectiveEntityTransferRows(entity, cex1, cex4, cex24);
    const decision = classifyEvidenceDepth({
      opportunityScore: num(candidate.opportunity_score),
      fragilityScore: num(candidate.fragility_score),
      tradabilityScore: num(candidate.tradability_score),
      lightScanOk: light?.scan_status === "OK" || light?.scan_status === "PARTIAL",
      lightHolderRows: num(light?.holders_rows),
      lightTransferRows: num(light?.transfers_rows),
      entityTransferRows,
      entityCoverage,
      entityDecision: entity?.decision || "",
      holderDecision: holder?.decision || "",
      holderIdentityClass: holder?.identity_class || "",
      holderDeltaDecision: holderDelta?.decision || "",
      cex1hDecision: cex1?.decision || "",
      cex4hDecision: cex4?.decision || "",
      cex24hDecision: cex24?.decision || "",
      cex1hTransfers: num(cex1?.transfers),
      cex4hTransfers: num(cex4?.transfers),
      cex24hTransfers: num(cex24?.transfers),
      cex1hCoverage: num(cex1?.window_coverage_ratio),
      cex4hCoverage: num(cex4?.window_coverage_ratio),
      cex24hCoverage: num(cex24?.window_coverage_ratio),
      cex1hFetchStop: cex1?.fetch_stop_reason || "",
      cex4hFetchStop: cex4?.fetch_stop_reason || "",
      cex24hFetchStop: cex24?.fetch_stop_reason || "",
      cex1hFetchStatus: cex1?.fetch_status || "",
      cex4hFetchStatus: cex4?.fetch_status || "",
      cex24hFetchStatus: cex24?.fetch_status || "",
      netCex1hValue: num(cex1?.net_cex_value),
      netCex4hValue: num(cex4?.net_cex_value),
      netCex24hValue: num(cex24?.net_cex_value),
      readinessDecision: readiness?.decision || "",
      accumulationLabel: accumulation?.label || "",
      accumulationConfidence: accumulation?.confidence || "",
    });
    return {
      checked_at: new Date().toISOString(),
      token: candidate.token,
      priority: candidate.priority,
      chain: candidate.scan_chain,
      opportunity_score: candidate.opportunity_score,
      fragility_score: candidate.fragility_score,
      tradability_score: candidate.tradability_score,
      readiness_decision: readiness?.decision || "",
      accumulation_label: accumulation?.label || "",
      entity_coverage: entityCoverage > 0 ? entityCoverage.toFixed(4) : "",
      holder_decision: holder?.decision || "",
      holder_delta_decision: holderDelta?.decision || "",
      cex_1h_decision: cex1?.decision || "",
      cex_4h_decision: cex4?.decision || "",
      cex_24h_decision: cex24?.decision || "",
      net_cex_24h_value: cex24?.net_cex_value || "",
      evidence_state: decision.evidenceState,
      depth_score: decision.depthScore,
      conflict_score: decision.conflictScore,
      insufficiency_score: decision.insufficiencyScore,
      conclusion: decision.conclusion,
      next_probe: decision.nextProbe,
      reasons: decision.reasons.join(";"),
    };
  });

  const outPath = join(ONCHAIN_DIR, "evidence_depth_audit_latest.csv");
  const reportPath = join(REPORTS_DIR, "evidence_depth_audit_latest.md");
  writeCsv(outPath, [
    ["checked_at", "token", "priority", "chain", "opportunity_score", "fragility_score", "tradability_score", "readiness_decision", "accumulation_label", "entity_coverage", "holder_decision", "holder_delta_decision", "cex_1h_decision", "cex_4h_decision", "cex_24h_decision", "net_cex_24h_value", "evidence_state", "depth_score", "conflict_score", "insufficiency_score", "conclusion", "next_probe", "reasons"],
    ...outputRows.map((row) => [row.checked_at, row.token, row.priority, row.chain, row.opportunity_score, row.fragility_score, row.tradability_score, row.readiness_decision, row.accumulation_label, row.entity_coverage, row.holder_decision, row.holder_delta_decision, row.cex_1h_decision, row.cex_4h_decision, row.cex_24h_decision, row.net_cex_24h_value, row.evidence_state, row.depth_score, row.conflict_score, row.insufficiency_score, row.conclusion, row.next_probe, row.reasons]),
  ]);
  writeFileSync(reportPath, buildReport(outputRows), "utf-8");

  console.log("=== Evidence Depth Audit ===");
  for (const row of outputRows) {
    console.log(`${row.token}: ${row.evidence_state} depth=${row.depth_score} conflict=${row.conflict_score} insuff=${row.insufficiency_score}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("evidence_depth_audit");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
