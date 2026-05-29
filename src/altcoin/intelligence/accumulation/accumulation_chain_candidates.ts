import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { projectRoot } from "../../../config/env.js";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { normalizeChain } from "../validation/chain_scan_gate.js";

const ROOT = projectRoot();
const ACCUMULATION_PATH = join(ROOT, "data", "altcoin", "intelligence", "accumulation", "okx_accumulation_features_latest.csv");
const COINGECKO_PATH = join(ROOT, "data", "altcoin", "intelligence", "coingecko", "okx_universe", "coingecko_okx_universe_enrichment_latest.csv");
const REGISTRY_PATH = join(ROOT, "data", "altcoin", "scanner_v02", "registry", "token_metadata_registry.csv");
const VALIDATION_DIR = join(ROOT, "data", "altcoin", "intelligence", "validation");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "validation");

type Obj = Record<string, string>;

export interface AccumulationCandidateOptions {
  limit: number;
  minAccumulation: number;
  minExecution: number;
  maxRisk: number;
  writeChainCandidates: boolean;
  researchScan: boolean;
}

export interface CandidateInput {
  snapshotId: string;
  observedAt: string;
  token: string;
  state: string;
  accumulationScore: number;
  riskScore: number;
  executionScore: number;
  confidence: string;
  marketCapBucket: string;
  cexFlowGate: string;
  cgChain: string;
  cgContract: string;
  registryChain: string;
  registryContract: string;
}

export interface AccumulationChainCandidate {
  snapshotId: string;
  observedAt: string;
  token: string;
  decision: "READY_FOR_CHAIN_SCAN" | "DATA_REPAIR_REQUIRED" | "WATCH_ONLY";
  scanStage: "GO_LIGHT_SCAN" | "BLOCK";
  priority: "P0" | "P1" | "P2";
  primaryChain: string;
  scanChain: string;
  contractAddress: string;
  opportunityScore: number;
  fragilityScore: number;
  tradabilityScore: number;
  scannerLabel: string;
  stateMatrix: string;
  scanChannel: string;
  reason: string;
  nextAction: string;
}

function rowsToObjects(path: string): Obj[] {
  const csv = readCsv(path);
  if (!csv) return [];
  return csv.rows.map((row) => {
    const out: Obj = {};
    csv.h.forEach((header, index) => {
      out[header] = row[index] || "";
    });
    return out;
  });
}

function num(value: unknown): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function byToken(rows: Obj[]): Map<string, Obj> {
  return new Map(rows.filter((row) => row.token || row.symbol).map((row) => [String(row.token || row.symbol).toUpperCase(), row]));
}

function priorityFor(input: CandidateInput): "P0" | "P1" | "P2" {
  if (input.state === "READY_TO_WATCH") return "P0";
  if (input.state === "WAIT_CONFIRMATION") return "P1";
  if (input.accumulationScore >= 45 && input.executionScore >= 55 && input.riskScore <= 45) return "P1";
  return "P2";
}

function stateMatrix(input: CandidateInput): string {
  return [
    input.state,
    `ACC_${Math.round(input.accumulationScore)}`,
    `RISK_${Math.round(input.riskScore)}`,
    `EXEC_${Math.round(input.executionScore)}`,
    input.cexFlowGate || "FLOW_UNKNOWN",
    input.marketCapBucket || "MCAP_UNKNOWN",
  ].join("__");
}

export function decideAccumulationChainCandidate(input: CandidateInput, options: Pick<AccumulationCandidateOptions, "minAccumulation" | "minExecution" | "maxRisk"> & { researchScan?: boolean }): AccumulationChainCandidate {
  const primaryChain = input.cgChain || input.registryChain;
  const scanChain = normalizeChain(primaryChain);
  const contractAddress = input.cgContract || input.registryContract;
  const hasMetadata = Boolean(scanChain && contractAddress);
  const scorePass = input.accumulationScore >= options.minAccumulation && input.executionScore >= options.minExecution && input.riskScore <= options.maxRisk;
  const hardRisk = input.state === "DISTRIBUTION_RISK" || input.cexFlowGate === "BLOCKED";
  const researchPass = Boolean(options.researchScan) && hasMetadata && input.executionScore >= options.minExecution && input.riskScore <= options.maxRisk;

  let decision: AccumulationChainCandidate["decision"] = "WATCH_ONLY";
  let reason = "ACCUMULATION_FILTER_NOT_MET";
  let nextAction = "Keep in accumulation watch-only table; do not spend chain requests yet.";

  if (!hasMetadata) {
    decision = "DATA_REPAIR_REQUIRED";
    reason = [
      !contractAddress ? "missing_contract_address" : "",
      !scanChain ? `unsupported_chain=${primaryChain || "missing"}` : "",
    ].filter(Boolean).join(";") || "metadata_repair_required";
    nextAction = "Repair CoinGecko/registry chain and contract mapping before chain scan.";
  } else if (hardRisk && !researchPass) {
    decision = "WATCH_ONLY";
    reason = input.state === "DISTRIBUTION_RISK" ? "distribution_risk_blocks_accumulation_scan" : "cex_flow_gate_blocked";
    nextAction = "Keep as risk monitor only; do not scan as long-side accumulation candidate.";
  } else if (scorePass) {
    decision = "READY_FOR_CHAIN_SCAN";
    reason = "ACCUMULATION_CONTEXT_AND_METADATA_PASS";
    nextAction = "Run light holders/transfers/CEX-flow scan, then promote only if 4h/24h CEX windows and holder identity pass.";
  } else if (researchPass) {
    decision = "READY_FOR_CHAIN_SCAN";
    reason = hardRisk ? "RESEARCH_RISK_MONITOR_SCAN" : "RESEARCH_WATCH_SCAN";
    nextAction = hardRisk
      ? "Run CEX-flow and directional scan as risk/short research only; do not promote to long accumulation without risk clearing."
      : "Run CEX-flow and directional scan as broader research; promote only if directional gates pass.";
  }

  return {
    snapshotId: input.snapshotId,
    observedAt: input.observedAt,
    token: input.token,
    decision,
    scanStage: decision === "READY_FOR_CHAIN_SCAN" ? "GO_LIGHT_SCAN" : "BLOCK",
    priority: priorityFor(input),
    primaryChain,
    scanChain,
    contractAddress,
    opportunityScore: input.accumulationScore,
    fragilityScore: input.riskScore,
    tradabilityScore: input.executionScore,
    scannerLabel: `ACCUMULATION_${input.state}`,
    stateMatrix: stateMatrix(input),
    scanChannel: decision === "READY_FOR_CHAIN_SCAN" ? "MORALIS_PRIMARY" : "",
    reason,
    nextAction,
  };
}

function parseArgs(): AccumulationCandidateOptions {
  const arg = (name: string): string | undefined => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
  const numArg = (name: string, fallback: number): number => {
    const raw = arg(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    limit: Math.max(1, Math.floor(numArg("limit", 20))),
    minAccumulation: numArg("min-accumulation", 35),
    minExecution: numArg("min-execution", 45),
    maxRisk: numArg("max-risk", 55),
    writeChainCandidates: process.argv.includes("--write-chain-candidates"),
    researchScan: process.argv.includes("--research-scan"),
  };
}

function buildInputs(): CandidateInput[] {
  const cg = byToken(rowsToObjects(COINGECKO_PATH));
  const registry = byToken(rowsToObjects(REGISTRY_PATH));
  return rowsToObjects(ACCUMULATION_PATH).map((row) => {
    const token = String(row.token || "").toUpperCase();
    const cgRow = cg.get(token) || {};
    const regRow = registry.get(token) || {};
    return {
      snapshotId: row.snapshot_id || "",
      observedAt: row.observed_at || "",
      token,
      state: row.state || "",
      accumulationScore: num(row.accumulation_score),
      riskScore: num(row.risk_score),
      executionScore: num(row.execution_score),
      confidence: row.confidence || "",
      marketCapBucket: row.market_cap_bucket || cgRow.market_cap_bucket || "",
      cexFlowGate: row.cex_flow_gate || "",
      cgChain: cgRow.asset_platform_id || "",
      cgContract: cgRow.primary_contract || "",
      registryChain: regRow.primary_chain || "",
      registryContract: regRow.contract_address || "",
    };
  }).filter((row) => row.token);
}

function sortCandidates(rows: AccumulationChainCandidate[]): AccumulationChainCandidate[] {
  return [...rows].sort((a, b) => {
    if (a.decision !== b.decision) return a.decision === "READY_FOR_CHAIN_SCAN" ? -1 : b.decision === "READY_FOR_CHAIN_SCAN" ? 1 : a.decision.localeCompare(b.decision);
    if (a.priority !== b.priority) return a.priority.localeCompare(b.priority);
    return (b.opportunityScore + b.tradabilityScore * 0.3 - b.fragilityScore * 0.6) - (a.opportunityScore + a.tradabilityScore * 0.3 - a.fragilityScore * 0.6);
  });
}

function writeOutputs(rows: AccumulationChainCandidate[], options: AccumulationCandidateOptions): void {
  if (!existsSync(VALIDATION_DIR)) mkdirSync(VALIDATION_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const ready = rows.filter((row) => row.decision === "READY_FOR_CHAIN_SCAN").slice(0, options.limit);
  const allRows = rows.slice(0, options.limit);
  const header = ["snapshot_id", "observed_at", "token", "decision", "scan_stage", "priority", "primary_chain", "scan_chain", "contract_address", "opportunity_score", "fragility_score", "tradability_score", "scanner_label", "state_matrix", "scan_channel", "reason", "next_action"];
  const toCsvRow = (row: AccumulationChainCandidate) => [row.snapshotId, row.observedAt, row.token, row.decision, row.scanStage, row.priority, row.primaryChain, row.scanChain, row.contractAddress, row.opportunityScore, row.fragilityScore, row.tradabilityScore, row.scannerLabel, row.stateMatrix, row.scanChannel, row.reason, row.nextAction];

  writeCsv(join(VALIDATION_DIR, "accumulation_chain_candidates_latest.csv"), [header, ...allRows.map(toCsvRow)]);
  if (options.writeChainCandidates) writeCsv(join(VALIDATION_DIR, "chain_scan_candidates_latest.csv"), [header, ...ready.map(toCsvRow)]);

  const report = [
    "# Accumulation Chain Candidates",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Write chain candidates: ${options.writeChainCandidates}`,
    `Research scan mode: ${options.researchScan}`,
    "",
    "## Ready For Light Chain Scan",
    "",
    "| token | priority | stage | acc | risk | exec | chain | reason |",
    "| --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ...ready.map((row) => `| ${row.token} | ${row.priority} | ${row.scanStage} | ${row.opportunityScore} | ${row.fragilityScore} | ${row.tradabilityScore} | ${row.scanChain} | ${row.reason} |`),
    "",
    "## Blocked / Watch Only",
    "",
    "| token | decision | acc | risk | exec | chain | reason |",
    "| --- | --- | ---: | ---: | ---: | --- | --- |",
    ...allRows.filter((row) => row.decision !== "READY_FOR_CHAIN_SCAN").map((row) => `| ${row.token} | ${row.decision} | ${row.opportunityScore} | ${row.fragilityScore} | ${row.tradabilityScore} | ${row.scanChain} | ${row.reason} |`),
  ].join("\n");
  writeFileSync(join(REPORTS_DIR, "accumulation_chain_candidates_latest.md"), report, "utf-8");
}

function main(): void {
  const options = parseArgs();
  const rows = sortCandidates(buildInputs().map((input) => decideAccumulationChainCandidate(input, options)));
  writeOutputs(rows, options);
  const ready = rows.filter((row) => row.decision === "READY_FOR_CHAIN_SCAN").length;
  console.log("=== Accumulation Chain Candidates ===");
  console.log(`Rows: ${rows.length} | ready=${ready} | writeChainCandidates=${options.writeChainCandidates}`);
  for (const row of rows.slice(0, options.limit)) {
    console.log(`${row.token}: ${row.decision} ${row.scanStage} acc=${row.opportunityScore} risk=${row.fragilityScore} exec=${row.tradabilityScore} ${row.reason}`);
  }
  console.log(`Output: ${join(VALIDATION_DIR, "accumulation_chain_candidates_latest.csv")}`);
  console.log(`Report: ${join(REPORTS_DIR, "accumulation_chain_candidates_latest.md")}`);
}

const isMain = process.argv[1]?.includes("accumulation_chain_candidates");
if (isMain) main();
