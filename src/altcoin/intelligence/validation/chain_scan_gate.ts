import { existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const VALIDATION_DIR = join(ROOT, "data", "altcoin", "intelligence", "validation");
const REGISTRY_PATH = join(ROOT, "data", "altcoin", "scanner_v02", "registry", "token_metadata_registry.csv");
const HEALTH_PATH = join(ROOT, "data", "health", "api_smoke_latest.csv");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "validation");

interface GateOptions {
  minOpportunity: number;
  minTradability: number;
  maxFragility: number;
  input: string;
}

interface RegistryRow {
  symbol: string;
  category: string;
  primary_chain: string;
  contract_address: string;
  coingecko_id: string;
  cmc_id: string;
  dex_enabled: string;
  cex_enabled: string;
}

export interface CandidateRow {
  snapshot_id: string;
  observed_at: string;
  token: string;
  decision?: string;
  primary_chain?: string;
  scan_chain?: string;
  contract_address?: string;
  scanner_label: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
  state_matrix: string;
  triggered_rules: string;
  missing_required_data: string;
}

export interface ChainGateDecision {
  token: string;
  snapshotId: string;
  observedAt: string;
  primaryChain: string;
  scanChain: string;
  contractAddress: string;
  opportunityScore: number;
  fragilityScore: number;
  tradabilityScore: number;
  scannerLabel: string;
  stateMatrix: string;
  decision: "READY_FOR_CHAIN_SCAN" | "DATA_REPAIR_REQUIRED" | "WATCH_ONLY";
  scanStage: "GO_LIGHT_SCAN" | "BLOCK";
  priority: "P0" | "P1" | "P2";
  scanChannel: string;
  reason: string;
  nextAction: string;
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
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestPitFile(input: string): string | null {
  if (input.endsWith(".csv") && existsSync(input)) return input;
  if (!existsSync(input)) return null;
  const files = readdirSync(input)
    .filter((file) => file.startsWith("point_in_time_labels_") && file.endsWith(".csv"))
    .map((file) => join(input, file))
    .sort();
  return files.at(-1) || null;
}

export function normalizeChain(chain: string): string {
  const value = chain.trim().toLowerCase();
  const map: Record<string, string> = {
    ethereum: "eth",
    eth: "eth",
    bsc: "bsc",
    binance: "bsc",
    "binance-smart-chain": "bsc",
    base: "base",
    arbitrum: "arbitrum",
    "arbitrum-one": "arbitrum",
    arb: "arbitrum",
    polygon: "polygon",
    "polygon-pos": "polygon",
    matic: "polygon",
    optimism: "optimism",
    "optimistic-ethereum": "optimism",
    avalanche: "avalanche",
    "avalanche-contract-chain": "avalanche",
    avax: "avalanche",
  };
  return map[value] || "";
}

function apiOk(service: string): boolean {
  const rows = rowsToObjects<{ service: string; status: string }>(HEALTH_PATH);
  return rows.some((row) => row.service === service && row.status === "OK");
}

function priorityFor(opportunity: number, fragility: number, tradability: number): "P0" | "P1" | "P2" {
  if (opportunity >= 45 && tradability >= 60 && fragility <= 35) return "P0";
  if (opportunity >= 35 && tradability >= 40 && fragility <= 60) return "P1";
  return "P2";
}

export function decideChainGate(row: CandidateRow, registry: RegistryRow | undefined, opts: GateOptions, availability: { moralisOk: boolean; arkhamOk: boolean }): ChainGateDecision {
  const opportunity = num(row.opportunity_score);
  const fragility = num(row.fragility_score);
  const tradability = num(row.tradability_score);
  const primaryChain = row.primary_chain || registry?.primary_chain || "";
  const scanChain = row.scan_chain || normalizeChain(primaryChain);
  const contractAddress = row.contract_address || registry?.contract_address || "";
  const hasMissingData = Boolean(row.missing_required_data);
  const blockedLabel = ["INSUFFICIENT_DEEP_DATA", "NEED_MORE_DATA"].includes(row.scanner_label);
  const preblockedDecision = row.decision === "DATA_REPAIR_REQUIRED" || row.decision === "WATCH_ONLY";
  const scorePass = opportunity >= opts.minOpportunity && tradability >= opts.minTradability && fragility <= opts.maxFragility;
  const supportedChain = Boolean(scanChain);
  const hasApi = availability.moralisOk || availability.arkhamOk;

  let decision: ChainGateDecision["decision"] = "WATCH_ONLY";
  let reason = "FILTER_NOT_MET";
  let nextAction = "Keep in watch-only table; do not spend on-chain requests yet.";
  let scanChannel = "";

  if (preblockedDecision || blockedLabel || hasMissingData || !contractAddress || !supportedChain) {
    decision = "DATA_REPAIR_REQUIRED";
    const reasons = [
      preblockedDecision ? `source_decision=${row.decision}` : "",
      blockedLabel ? `label=${row.scanner_label}` : "",
      hasMissingData ? `missing=${row.missing_required_data}` : "",
      !contractAddress ? "missing_contract_address" : "",
      !supportedChain ? `unsupported_chain=${primaryChain}` : "",
    ].filter(Boolean);
    reason = reasons.join(";") || "data_repair_required";
    nextAction = "Fix metadata/contract/DEX coverage before chain scan.";
  } else if (scorePass && hasApi) {
    decision = "READY_FOR_CHAIN_SCAN";
    reason = "SCORES_AND_METADATA_PASS";
    scanChannel = availability.moralisOk ? "MORALIS_PRIMARY" : "ARKHAM_PRIMARY";
    nextAction = "Run light holders/transfers/price scan, then promote to deeper entity-flow scan if abnormal.";
  } else if (scorePass && !hasApi) {
    decision = "DATA_REPAIR_REQUIRED";
    reason = "CHAIN_API_NOT_READY";
    nextAction = "Restore Moralis or Arkham API before chain scan.";
  }

  return {
    token: row.token,
    snapshotId: row.snapshot_id,
    observedAt: row.observed_at,
    primaryChain,
    scanChain,
    contractAddress,
    opportunityScore: opportunity,
    fragilityScore: fragility,
    tradabilityScore: tradability,
    scannerLabel: row.scanner_label,
    stateMatrix: row.state_matrix,
    decision,
    scanStage: decision === "READY_FOR_CHAIN_SCAN" ? "GO_LIGHT_SCAN" : "BLOCK",
    priority: priorityFor(opportunity, fragility, tradability),
    scanChannel,
    reason,
    nextAction,
  };
}

function parseArgs(): GateOptions {
  const arg = (name: string): string | undefined => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
  return {
    minOpportunity: Number(arg("min-opportunity") || "40"),
    minTradability: Number(arg("min-tradability") || "40"),
    maxFragility: Number(arg("max-fragility") || "60"),
    input: arg("input") || VALIDATION_DIR,
  };
}

function buildReport(decisions: ChainGateDecision[]): string {
  const ready = decisions.filter((row) => row.decision === "READY_FOR_CHAIN_SCAN");
  const repair = decisions.filter((row) => row.decision === "DATA_REPAIR_REQUIRED");
  const watch = decisions.filter((row) => row.decision === "WATCH_ONLY");
  const lines = [
    "# Chain Scan Gate",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Ready for chain scan: ${ready.length}`,
    `- Data repair required: ${repair.length}`,
    `- Watch only: ${watch.length}`,
    "",
    "## Ready",
    "",
    "| priority | token | stage | chain | opportunity | fragility | tradability | channel | reason |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
  ];

  for (const row of ready) {
    lines.push(`| ${row.priority} | ${row.token} | ${row.scanStage} | ${row.scanChain} | ${row.opportunityScore} | ${row.fragilityScore} | ${row.tradabilityScore} | ${row.scanChannel} | ${row.reason} |`);
  }

  lines.push("", "## Repair Queue", "", "| token | chain | reason | next_action |", "| --- | --- | --- | --- |");
  for (const row of repair.slice(0, 30)) {
    lines.push(`| ${row.token} | ${row.primaryChain} | ${row.reason} | ${row.nextAction} |`);
  }

  return lines.join("\n");
}

async function main() {
  const opts = parseArgs();
  if (!existsSync(VALIDATION_DIR)) mkdirSync(VALIDATION_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const input = latestPitFile(opts.input);
  if (!input) throw new Error("No point_in_time_labels CSV found.");

  const registry = new Map(rowsToObjects<RegistryRow>(REGISTRY_PATH).map((row) => [row.symbol, row]));
  const availability = { moralisOk: apiOk("MORALIS"), arkhamOk: apiOk("ARKHAM") };
  const rows = rowsToObjects<CandidateRow>(input);
  const decisions = rows.map((row) => decideChainGate(row, registry.get(row.token), opts, availability));

  const ready = decisions.filter((row) => row.decision === "READY_FOR_CHAIN_SCAN").sort((a, b) => {
    if (a.priority !== b.priority) return a.priority.localeCompare(b.priority);
    if (b.opportunityScore !== a.opportunityScore) return b.opportunityScore - a.opportunityScore;
    return b.tradabilityScore - a.tradabilityScore;
  });
  const repair = decisions.filter((row) => row.decision === "DATA_REPAIR_REQUIRED");

  const candidatesPath = join(VALIDATION_DIR, "chain_scan_candidates_latest.csv");
  const repairPath = join(VALIDATION_DIR, "data_repair_queue_latest.csv");
  const reportPath = join(REPORTS_DIR, "chain_scan_gate_latest.md");

  const header = ["snapshot_id", "observed_at", "token", "decision", "scan_stage", "priority", "primary_chain", "scan_chain", "contract_address", "opportunity_score", "fragility_score", "tradability_score", "scanner_label", "state_matrix", "scan_channel", "reason", "next_action"];
  const toRow = (row: ChainGateDecision) => [row.snapshotId, row.observedAt, row.token, row.decision, row.scanStage, row.priority, row.primaryChain, row.scanChain, row.contractAddress, row.opportunityScore, row.fragilityScore, row.tradabilityScore, row.scannerLabel, row.stateMatrix, row.scanChannel, row.reason, row.nextAction];

  writeCsv(candidatesPath, [header, ...ready.map(toRow)]);
  writeCsv(repairPath, [header, ...repair.map(toRow)]);
  await import("fs").then(({ writeFileSync }) => writeFileSync(reportPath, buildReport(decisions), "utf-8"));

  console.log("=== Chain Scan Gate ===");
  console.log(`Input: ${input}`);
  console.log(`Thresholds: opp>=${opts.minOpportunity} trad>=${opts.minTradability} frag<=${opts.maxFragility}`);
  console.log(`Moralis: ${availability.moralisOk ? "OK" : "NOT_READY"} | Arkham: ${availability.arkhamOk ? "OK" : "NOT_READY"}`);
  console.log(`Ready: ${ready.length}`);
  console.log(`Repair: ${repair.length}`);
  console.log(`Candidates: ${candidatesPath}`);
  console.log(`Repair queue: ${repairPath}`);
  console.log(`Report: ${reportPath}`);

  if (ready.length === 0) process.exitCode = 2;
}

const isMain = process.argv[1]?.includes("chain_scan_gate");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
