import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const ONCHAIN_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");
const CANDIDATES_PATH = join(ROOT, "data", "altcoin", "intelligence", "validation", "chain_scan_candidates_latest.csv");
const ENTITY_FLOW_PATH = join(ONCHAIN_DIR, "entity_flow_review_latest.csv");
const HOLDER_IDENTITY_PATH = join(ONCHAIN_DIR, "holder_identity_review_latest.csv");
const HOLDER_DELTA_PATH = join(ONCHAIN_DIR, "holder_flow_delta_review_latest.csv");
const CEX_FLOW_PATH = join(ONCHAIN_DIR, "cex_flow_window_scan_latest.csv");

export type ScanReadinessDecision =
  | "READY_FOR_DEEP_SCAN"
  | "RISK_MONITOR_CEX_FLOW"
  | "BLOCKED_HOLDER_IDENTITY"
  | "LOW_CONFIDENCE_SCAN"
  | "REPAIR_REQUIRED";
export type ScanStage = "PROMOTE_DEEP_SCAN" | "BLOCK";

interface CandidateRow {
  token: string;
  scan_stage?: string;
  priority: string;
  scan_chain: string;
  contract_address: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
}

interface EntityFlowRow {
  token: string;
  decision: string;
  entity_label_coverage: string;
  cex_in_count: string;
  cex_out_count: string;
  top_holder_pct_supply: string;
}

interface HolderIdentityRow {
  token: string;
  contract_name: string;
  identity_class: string;
  decision: string;
  reason: string;
}

interface HolderDeltaRow {
  token: string;
  decision: string;
  confidence: string;
  net_top_holder_value: string;
  top_to_cex_value: string;
}

interface CexFlowRow {
  token: string;
  window_hours: string;
  decision: string;
  transfers: string;
  label_coverage: string;
  net_cex_count: string;
  net_cex_value: string;
  window_coverage_ratio?: string;
  fetch_pages?: string;
  fetch_stop_reason?: string;
  fetch_status?: string;
}

export interface ReadinessInput {
  candidatePriority: string;
  opportunityScore: number;
  tradabilityScore: number;
  fragilityScore: number;
  entityDecision: string;
  entityCoverage: number;
  holderDecision: string;
  holderDeltaDecision?: string;
  shortWindowDecision: string;
  mediumWindowDecision: string;
  longWindowDecision: string;
}

export interface ReadinessResult {
  decision: ScanReadinessDecision;
  scanStage: ScanStage;
  scanDepth: "DEEP_ENTITY_FLOW" | "RISK_MONITOR" | "IDENTITY_REVIEW" | "LOW_CONFIDENCE" | "REPAIR";
  reason: string;
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

function loadDotenv(): void {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [name, valueRaw] = line.split(/=(.*)/s);
    if (!name || process.env[name]) continue;
    process.env[name] = (valueRaw || "").trim().replace(/^["']|["']$/g, "");
  }
}

export function decideScanReadiness(input: ReadinessInput): ReadinessResult {
  const persistentCexRisk = input.mediumWindowDecision === "CEX_INFLOW_RISK" || input.longWindowDecision === "CEX_INFLOW_RISK";
  const shortOnlyCexRisk = input.shortWindowDecision === "CEX_INFLOW_RISK" && !persistentCexRisk;
  const incompleteCexWindows = [input.shortWindowDecision, input.mediumWindowDecision, input.longWindowDecision].some((decision) => decision === "PARTIAL_WINDOW" || decision === "NO_DATA");
  const mediumOrLongLowCoverage = input.mediumWindowDecision === "LOW_COVERAGE" || input.longWindowDecision === "LOW_COVERAGE";
  const holderAccumulation = input.holderDeltaDecision === "TOP_HOLDER_ACCUMULATION_PROXY";
  const holderDistribution = input.holderDeltaDecision === "TOP_HOLDER_DISTRIBUTION_RISK";

  if (holderDistribution) {
    return { decision: "RISK_MONITOR_CEX_FLOW", scanStage: "BLOCK", scanDepth: "RISK_MONITOR", reason: "top-holder delta shows direct distribution risk" };
  }
  if (input.holderDecision === "HIGH_CONCENTRATION_UNRESOLVED" && !holderAccumulation) {
    return { decision: "BLOCKED_HOLDER_IDENTITY", scanStage: "BLOCK", scanDepth: "IDENTITY_REVIEW", reason: "top holder concentration remains unresolved" };
  }
  if (input.entityCoverage < 0.25 || mediumOrLongLowCoverage) {
    return { decision: "LOW_CONFIDENCE_SCAN", scanStage: "BLOCK", scanDepth: "LOW_CONFIDENCE", reason: "entity label coverage is too low for directional interpretation" };
  }
  if (incompleteCexWindows) {
    return { decision: "LOW_CONFIDENCE_SCAN", scanStage: "BLOCK", scanDepth: "LOW_CONFIDENCE", reason: "CEX flow window coverage is incomplete; extend Moralis pagination before directional interpretation" };
  }
  if (persistentCexRisk) {
    return { decision: "RISK_MONITOR_CEX_FLOW", scanStage: "BLOCK", scanDepth: "RISK_MONITOR", reason: "CEX proxy inflow risk persists beyond short window" };
  }
  if (shortOnlyCexRisk) {
    return { decision: "RISK_MONITOR_CEX_FLOW", scanStage: "BLOCK", scanDepth: "RISK_MONITOR", reason: "short-window CEX proxy inflow spike; monitor before deep opportunity scan" };
  }
  if (input.opportunityScore >= 40 && input.tradabilityScore >= 40 && input.fragilityScore <= 60) {
    return {
      decision: "READY_FOR_DEEP_SCAN",
      scanStage: "PROMOTE_DEEP_SCAN",
      scanDepth: "DEEP_ENTITY_FLOW",
      reason: holderAccumulation
        ? "scores pass, CEX flow is neutral/outflow, and top-holder delta is accumulation-like"
        : "scores pass, holder identity is acceptable, and CEX flow is neutral/outflow",
    };
  }
  return { decision: "REPAIR_REQUIRED", scanStage: "BLOCK", scanDepth: "REPAIR", reason: "candidate no longer passes scan thresholds" };
}

function buildReport(rows: any[]): string {
  const lines = [
    "# Onchain Scan Readiness",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| token | stage | decision | depth | holder | holder_delta | cex_1h | cex_4h | cex_24h | reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(`| ${row.token} | ${row.scan_stage} | ${row.decision} | ${row.scan_depth} | ${row.holder_decision} | ${row.holder_delta_decision || ""} | ${row.cex_1h_decision} | ${row.cex_4h_decision} | ${row.cex_24h_decision} | ${row.reason} |`);
  }
  return lines.join("\n");
}

function coveragePct(row: CexFlowRow | undefined): string {
  const value = num(row?.window_coverage_ratio);
  return row ? `${(value * 100).toFixed(1)}%` : "missing";
}

function cexRepairReason(baseReason: string, cex1: CexFlowRow | undefined, cex4: CexFlowRow | undefined, cex24: CexFlowRow | undefined): string {
  const decisions = [cex1?.decision, cex4?.decision, cex24?.decision];
  if (!decisions.some((decision) => decision === "PARTIAL_WINDOW" || decision === "NO_DATA")) return baseReason;
  const fetchPages = cex24?.fetch_pages || cex4?.fetch_pages || cex1?.fetch_pages || "unknown";
  const stopReason = cex24?.fetch_stop_reason || cex4?.fetch_stop_reason || cex1?.fetch_stop_reason || "unknown";
  const fetchStatus = cex24?.fetch_status || cex4?.fetch_status || cex1?.fetch_status || "unknown";
  return `${baseReason}; coverage 1h=${coveragePct(cex1)}, 4h=${coveragePct(cex4)}, 24h=${coveragePct(cex24)}, fetch=${fetchPages}:${stopReason}:${fetchStatus}`;
}

function effectiveEntityCoverage(entity: EntityFlowRow | undefined, cex1: CexFlowRow | undefined, cex4: CexFlowRow | undefined, cex24: CexFlowRow | undefined): number {
  return Math.max(
    num(entity?.entity_label_coverage),
    num(cex1?.label_coverage),
    num(cex4?.label_coverage),
    num(cex24?.label_coverage),
  );
}

function appendCoverageSource(reason: string, entity: EntityFlowRow | undefined, effectiveCoverage: number): string {
  const entityCoverage = num(entity?.entity_label_coverage);
  if (effectiveCoverage > entityCoverage && effectiveCoverage >= 0.25) {
    return `${reason}; entity coverage supplemented from CEX-flow labels (${(effectiveCoverage * 100).toFixed(1)}%)`;
  }
  return reason;
}

async function main() {
  loadDotenv();
  if (!existsSync(ONCHAIN_DIR)) mkdirSync(ONCHAIN_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const candidates = rowsToObjects<CandidateRow>(CANDIDATES_PATH);
  const entityMap = new Map(rowsToObjects<EntityFlowRow>(ENTITY_FLOW_PATH).map((row) => [row.token, row]));
  const holderMap = new Map(rowsToObjects<HolderIdentityRow>(HOLDER_IDENTITY_PATH).map((row) => [row.token, row]));
  const holderDeltaMap = new Map(rowsToObjects<HolderDeltaRow>(HOLDER_DELTA_PATH).map((row) => [row.token, row]));
  const cexRows = rowsToObjects<CexFlowRow>(CEX_FLOW_PATH);
  const cexMap = new Map<string, CexFlowRow>();
  for (const row of cexRows) cexMap.set(`${row.token}:${row.window_hours}`, row);

  const outputRows = candidates.map((candidate) => {
    const entity = entityMap.get(candidate.token);
    const holder = holderMap.get(candidate.token);
    const holderDelta = holderDeltaMap.get(candidate.token);
    const cex1 = cexMap.get(`${candidate.token}:1`);
    const cex4 = cexMap.get(`${candidate.token}:4`);
    const cex24 = cexMap.get(`${candidate.token}:24`);
    const entityCoverage = effectiveEntityCoverage(entity, cex1, cex4, cex24);
    const readiness = decideScanReadiness({
      candidatePriority: candidate.priority,
      opportunityScore: num(candidate.opportunity_score),
      tradabilityScore: num(candidate.tradability_score),
      fragilityScore: num(candidate.fragility_score),
      entityDecision: entity?.decision || "",
      entityCoverage,
      holderDecision: holder?.decision || "",
      holderDeltaDecision: holderDelta?.decision || "",
      shortWindowDecision: cex1?.decision || "",
      mediumWindowDecision: cex4?.decision || "",
      longWindowDecision: cex24?.decision || "",
    });
    const reason = appendCoverageSource(cexRepairReason(readiness.reason, cex1, cex4, cex24), entity, entityCoverage);

    return {
      token: candidate.token,
      priority: candidate.priority,
      chain: candidate.scan_chain,
      contract_address: candidate.contract_address,
      opportunity_score: candidate.opportunity_score,
      fragility_score: candidate.fragility_score,
      tradability_score: candidate.tradability_score,
      entity_decision: entity?.decision || "",
      entity_label_coverage: entityCoverage > 0 ? entityCoverage.toFixed(4) : "",
      holder_decision: holder?.decision || "",
      holder_delta_decision: holderDelta?.decision || "",
      holder_identity_class: holder?.identity_class || "",
      holder_contract_name: holder?.contract_name || "",
      cex_1h_decision: cex1?.decision || "",
      cex_4h_decision: cex4?.decision || "",
      cex_24h_decision: cex24?.decision || "",
      net_cex_1h_value: cex1?.net_cex_value || "",
      net_cex_4h_value: cex4?.net_cex_value || "",
      net_cex_24h_value: cex24?.net_cex_value || "",
      decision: readiness.decision,
      scan_stage: readiness.scanStage,
      scan_depth: readiness.scanDepth,
      reason,
    };
  });

  const outPath = join(ONCHAIN_DIR, "scan_readiness_latest.csv");
  const reportPath = join(REPORTS_DIR, "scan_readiness_latest.md");
  writeCsv(outPath, [
    ["checked_at", "token", "priority", "chain", "contract_address", "opportunity_score", "fragility_score", "tradability_score", "entity_decision", "entity_label_coverage", "holder_decision", "holder_delta_decision", "holder_identity_class", "holder_contract_name", "cex_1h_decision", "cex_4h_decision", "cex_24h_decision", "net_cex_1h_value", "net_cex_4h_value", "net_cex_24h_value", "decision", "scan_stage", "scan_depth", "reason"],
    ...outputRows.map((row) => [new Date().toISOString(), row.token, row.priority, row.chain, row.contract_address, row.opportunity_score, row.fragility_score, row.tradability_score, row.entity_decision, row.entity_label_coverage, row.holder_decision, row.holder_delta_decision, row.holder_identity_class, row.holder_contract_name, row.cex_1h_decision, row.cex_4h_decision, row.cex_24h_decision, row.net_cex_1h_value, row.net_cex_4h_value, row.net_cex_24h_value, row.decision, row.scan_stage, row.scan_depth, row.reason]),
  ]);
  writeFileSync(reportPath, buildReport(outputRows), "utf-8");

  console.log("=== Onchain Scan Readiness ===");
  for (const row of outputRows) {
    console.log(`${row.token}: ${row.decision} (${row.scan_depth}) - ${row.reason}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("scan_readiness");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
