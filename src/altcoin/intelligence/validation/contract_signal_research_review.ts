import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { csvEscape, readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const OKX_DIR = join(ROOT, "data", "altcoin", "intelligence", "okx");
const ONCHAIN_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const VALIDATION_DIR = join(ROOT, "data", "altcoin", "intelligence", "validation");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "validation");

const CONTRACT_REVIEW_PATH = join(OKX_DIR, "okx_contract_opportunity_review_latest.csv");
const NEW_SWAPS_PATH = join(OKX_DIR, "okx_new_swap_candidates_latest.csv");
const READINESS_PATH = join(ONCHAIN_DIR, "scan_readiness_latest.csv");
const TOPK_BACKTEST_PATH = join(VALIDATION_DIR, "topk_backtest_opportunity_score_7d.csv");
const TOPK_REGIME_PATH = join(VALIDATION_DIR, "topk_backtest_regime_opportunity_score_7d.csv");

const OUT_PATH = join(VALIDATION_DIR, "contract_signal_research_review_latest.csv");
const LEDGER_PATH = join(VALIDATION_DIR, "contract_signal_research_ledger.csv");
const REPORT_PATH = join(REPORTS_DIR, "contract_signal_research_review_latest.md");

export type CurrentMarketRegime = "ALT_NEW_SWAP_RISK_ON" | "ALT_NEW_SWAP_MIXED" | "ALT_NEW_SWAP_STRESS" | "MARKET_REGIME_DATA_MISSING";
export type CalibrationStatus = "CALIBRATED" | "PIT_SAMPLE_TOO_SMALL" | "PIT_DATA_MISSING";
export type ExecutionStatus = "EXECUTION_OK" | "EXECUTION_LIMIT_ONLY" | "EXECUTION_BLOCKED" | "EXECUTION_DATA_MISSING";
export type TradeDecision = "PAPER_TRADE_WATCH" | "OBSERVE_ONLY" | "NO_TRADE_RISK" | "BLOCKED_DATA" | "BLOCKED_EXECUTION" | "NO_EDGE";

interface ContractReviewRow {
  checked_at: string;
  token: string;
  inst_id: string;
  discovery_status: string;
  priority: string;
  evidence_state: string;
  readiness_decision: string;
  holder_decision: string;
  holder_delta_decision: string;
  entity_decision: string;
  cex_1h_decision: string;
  cex_4h_decision: string;
  cex_24h_decision: string;
  net_cex_24h_value: string;
  last_price: string;
  spread_bps: string;
  return_1h: string;
  return_4h: string;
  return_24h: string;
  return_7d: string;
  range_position_24h: string;
  volume_quote_24h: string;
  volume_acceleration: string;
  oi_usd: string;
  oi_change_7d: string;
  funding_latest: string;
  data_quality: string;
  contract_state: string;
  setup_score: string;
  risk_score: string;
  squeeze_score: string;
  confidence: string;
  thesis: string;
  invalidation: string;
  next_action: string;
  evidence: string;
}

interface NewSwapRow {
  token: string;
  scan_chain: string;
  primary_chain: string;
  contract_address: string;
  discovery_status: string;
}

interface ReadinessRow {
  token: string;
  entity_label_coverage: string;
  reason: string;
}

export interface ParsedContractSignal {
  checkedAt: string;
  token: string;
  instId: string;
  chain: string;
  contractAddress: string;
  discoveryStatus: string;
  priority: string;
  contractState: string;
  evidenceState: string;
  readinessDecision: string;
  holderDecision: string;
  holderDeltaDecision: string;
  entityDecision: string;
  cex1hDecision: string;
  cex4hDecision: string;
  cex24hDecision: string;
  netCex24hValue: number;
  spreadBps: number | null;
  return24h: number | null;
  return7d: number | null;
  rangePosition24h: number | null;
  volumeQuote24h: number | null;
  volumeAcceleration: number | null;
  oiUsd: number | null;
  oiChange7d: number | null;
  fundingLatest: number | null;
  dataQuality: number;
  setupScore: number;
  riskScore: number;
  squeezeScore: number;
  confidence: string;
  thesis: string;
  invalidation: string;
  nextAction: string;
  evidence: string;
  entityCoverage: number | null;
  readinessReason: string;
}

export interface CalibrationSummary {
  status: CalibrationStatus;
  snapshotCount: number;
  selectedCount: number;
  precision: number | null;
  avgExcessReturn: number | null;
  note: string;
}

export interface TradePlan {
  reviewedAt: string;
  token: string;
  instId: string;
  chain: string;
  contractState: string;
  marketRegime: CurrentMarketRegime;
  calibrationStatus: CalibrationStatus;
  tradeDecision: TradeDecision;
  probabilityWin: number;
  targetReturn: number;
  stopLoss: number;
  invalidationProbability: number;
  expectedValue: number;
  holdHoursMin: number;
  holdHoursMax: number;
  maxPositionUsd: number | null;
  estimatedRoundTripCostBps: number | null;
  executionStatus: ExecutionStatus;
  identityGap: string;
  tradeGate: string;
  modelFactors: string;
  thesis: string;
  invalidation: string;
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

function numOrNull(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePct(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const clean = value.trim().replace("%", "");
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

function parseMoney(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const clean = value.trim().replace(/[$,\s]/g, "");
  const match = clean.match(/^(-?\d+(?:\.\d+)?)([KMB])?$/i);
  if (!match) {
    const plain = Number(clean);
    return Number.isFinite(plain) ? plain : null;
  }
  const base = Number(match[1]);
  const suffix = (match[2] || "").toUpperCase();
  const multiplier = suffix === "B" ? 1_000_000_000 : suffix === "M" ? 1_000_000 : suffix === "K" ? 1_000 : 1;
  return Number.isFinite(base) ? base * multiplier : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function pct(value: number | null, digits = 2): string {
  return value === null ? "" : `${(value * 100).toFixed(digits)}%`;
}

function money(value: number | null): string {
  return value === null ? "" : value.toFixed(2);
}

function isPositiveState(state: string): boolean {
  return [
    "LONG_WATCH_NEEDS_CONFIRMATION",
    "ACCUMULATION_WATCH_NEEDS_CONFIRMATION",
    "DELEVERAGING_RESET_WATCH",
    "SQUEEZE_WATCH",
  ].includes(state);
}

function isCexRisk(decision: string): boolean {
  return decision.includes("INFLOW_RISK");
}

function isCexSupport(decision: string): boolean {
  return decision.includes("OUTFLOW_OR_NEUTRAL");
}

function mapByToken<T extends { token: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.token, row]));
}

function parseSignal(row: ContractReviewRow, meta?: NewSwapRow, readiness?: ReadinessRow): ParsedContractSignal {
  return {
    checkedAt: row.checked_at,
    token: row.token,
    instId: row.inst_id,
    chain: meta?.scan_chain || meta?.primary_chain || "",
    contractAddress: meta?.contract_address || "",
    discoveryStatus: row.discovery_status,
    priority: row.priority,
    contractState: row.contract_state,
    evidenceState: row.evidence_state,
    readinessDecision: row.readiness_decision,
    holderDecision: row.holder_decision,
    holderDeltaDecision: row.holder_delta_decision,
    entityDecision: row.entity_decision,
    cex1hDecision: row.cex_1h_decision,
    cex4hDecision: row.cex_4h_decision,
    cex24hDecision: row.cex_24h_decision,
    netCex24hValue: num(row.net_cex_24h_value),
    spreadBps: numOrNull(row.spread_bps),
    return24h: parsePct(row.return_24h),
    return7d: parsePct(row.return_7d),
    rangePosition24h: numOrNull(row.range_position_24h),
    volumeQuote24h: numOrNull(row.volume_quote_24h),
    volumeAcceleration: parsePct(row.volume_acceleration),
    oiUsd: parseMoney(row.oi_usd),
    oiChange7d: parsePct(row.oi_change_7d),
    fundingLatest: parsePct(row.funding_latest),
    dataQuality: num(row.data_quality),
    setupScore: num(row.setup_score),
    riskScore: num(row.risk_score),
    squeezeScore: num(row.squeeze_score),
    confidence: row.confidence,
    thesis: row.thesis,
    invalidation: row.invalidation,
    nextAction: row.next_action,
    evidence: row.evidence,
    entityCoverage: numOrNull(readiness?.entity_label_coverage),
    readinessReason: readiness?.reason || "",
  };
}

export function classifyCurrentMarketRegime(signals: ParsedContractSignal[]): CurrentMarketRegime {
  const r24 = signals.map((row) => row.return24h).filter((value): value is number => value !== null);
  const r7 = signals.map((row) => row.return7d).filter((value): value is number => value !== null);
  if (r24.length < 5 && r7.length < 5) return "MARKET_REGIME_DATA_MISSING";
  const median24 = median(r24) ?? 0;
  const median7 = median(r7) ?? 0;
  const neg24Share = r24.length === 0 ? 0 : r24.filter((value) => value < 0).length / r24.length;
  const pos24Share = r24.length === 0 ? 0 : r24.filter((value) => value > 0).length / r24.length;

  if ((median24 <= -0.03 && neg24Share >= 0.65) || median7 <= -0.08) return "ALT_NEW_SWAP_STRESS";
  if (median24 >= 0.02 && pos24Share >= 0.6 && median7 >= 0.04) return "ALT_NEW_SWAP_RISK_ON";
  return "ALT_NEW_SWAP_MIXED";
}

function readTopKRows(): Record<string, string>[] {
  const regimeRows = rowsToObjects<Record<string, string>>(TOPK_REGIME_PATH);
  if (regimeRows.length > 0) return regimeRows.filter((row) => row.top_k === "5" || row.topK === "5");
  return rowsToObjects<Record<string, string>>(TOPK_BACKTEST_PATH).filter((row) => row.top_k === "5" || row.topK === "5");
}

export function loadCalibrationSummary(): CalibrationSummary {
  const rows = readTopKRows();
  if (rows.length === 0) {
    return {
      status: "PIT_DATA_MISSING",
      snapshotCount: 0,
      selectedCount: 0,
      precision: null,
      avgExcessReturn: null,
      note: "No resolved PIT TopK validation rows for opportunity_score 7d.",
    };
  }

  const snapshotIds = new Set(rows.map((row) => row.snapshot_id || row.market_regime || ""));
  const selectedCount = rows.reduce((sum, row) => sum + num(row.selected_count), 0);
  const hitCount = rows.reduce((sum, row) => sum + num(row.hit_count), 0);
  const weightedExcessNumerator = rows.reduce((sum, row) => sum + num(row.excess_avg_fwd_return) * Math.max(1, num(row.selected_count)), 0);
  const weightedExcessDenominator = rows.reduce((sum, row) => sum + Math.max(1, num(row.selected_count)), 0);
  const precision = selectedCount > 0 ? hitCount / selectedCount : null;
  const avgExcessReturn = weightedExcessDenominator > 0 ? weightedExcessNumerator / weightedExcessDenominator : null;
  const status: CalibrationStatus = snapshotIds.size >= 20 && selectedCount >= 100 ? "CALIBRATED" : "PIT_SAMPLE_TOO_SMALL";
  return {
    status,
    snapshotCount: snapshotIds.size,
    selectedCount,
    precision,
    avgExcessReturn,
    note: status === "CALIBRATED"
      ? "PIT sample is large enough to use as a live probability prior."
      : "Probability output is heuristic and capped because PIT validation sample is too small.",
  };
}

function estimateExecution(input: ParsedContractSignal): Pick<TradePlan, "maxPositionUsd" | "estimatedRoundTripCostBps" | "executionStatus"> {
  const volumeCap = input.volumeQuote24h === null ? null : input.volumeQuote24h * 0.0025;
  const oiCap = input.oiUsd === null ? null : input.oiUsd * 0.01;
  const caps = [volumeCap, oiCap].filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const maxPositionUsd = caps.length > 0 ? Math.min(...caps) : null;
  const estimatedRoundTripCostBps = input.spreadBps === null
    ? null
    : input.spreadBps + (maxPositionUsd === null ? 20 : maxPositionUsd < 10_000 ? 18 : maxPositionUsd < 25_000 ? 12 : 7);

  let executionStatus: ExecutionStatus = "EXECUTION_OK";
  if (input.spreadBps === null || maxPositionUsd === null) executionStatus = "EXECUTION_DATA_MISSING";
  else if (input.spreadBps > 35 || maxPositionUsd < 5_000) executionStatus = "EXECUTION_BLOCKED";
  else if (input.spreadBps > 12 || maxPositionUsd < 25_000) executionStatus = "EXECUTION_LIMIT_ONLY";

  return { maxPositionUsd, estimatedRoundTripCostBps, executionStatus };
}

function identityGap(input: ParsedContractSignal): string {
  const chain = input.chain.toLowerCase();
  if (chain === "bsc" && input.readinessReason.includes("BSCSCAN_NOT_CONFIGURED")) return "BSC_BSCSCAN_KEY_REQUIRED";
  if (chain === "solana") return input.discoveryStatus === "READY_EVM_CHAIN_SCAN" ? "SOLANA_ENTITY_PROVIDER_GAP" : "SOLANA_METADATA_AND_ENTITY_GAP";
  if (chain === "sui") return input.discoveryStatus === "READY_EVM_CHAIN_SCAN" ? "SUI_ENTITY_PROVIDER_GAP" : "SUI_METADATA_AND_ENTITY_GAP";
  if (input.discoveryStatus !== "READY_EVM_CHAIN_SCAN") return "METADATA_REPAIR_REQUIRED";
  if (input.holderDecision === "HIGH_CONCENTRATION_UNRESOLVED") return "TOP_HOLDER_IDENTITY_UNRESOLVED";
  if ((input.entityCoverage ?? 1) < 0.5) return "ENTITY_LABEL_COVERAGE_LOW";
  return "IDENTITY_USABLE";
}

function baseHoldHours(state: string): { min: number; max: number } {
  if (state === "SQUEEZE_WATCH") return { min: 8, max: 36 };
  if (state === "DELEVERAGING_RESET_WATCH") return { min: 24, max: 72 };
  if (state === "ACCUMULATION_WATCH_NEEDS_CONFIRMATION") return { min: 24, max: 96 };
  if (state === "LONG_WATCH_NEEDS_CONFIRMATION") return { min: 12, max: 48 };
  return { min: 0, max: 0 };
}

function targetReturnForState(input: ParsedContractSignal): number {
  const base = input.contractState === "ACCUMULATION_WATCH_NEEDS_CONFIRMATION" ? 0.16
    : input.contractState === "LONG_WATCH_NEEDS_CONFIRMATION" ? 0.15
    : input.contractState === "SQUEEZE_WATCH" ? 0.14
    : input.contractState === "DELEVERAGING_RESET_WATCH" ? 0.11
    : 0.04;
  const adjusted = base
    + input.setupScore / 100 * 0.04
    + input.squeezeScore / 100 * 0.03
    - input.riskScore / 100 * 0.035
    - ((input.return24h ?? 0) > 0.18 ? 0.035 : 0);
  return clamp(adjusted, 0.03, 0.32);
}

function stopLossForState(input: ParsedContractSignal): number {
  const base = input.contractState === "SQUEEZE_WATCH" ? 0.07
    : input.contractState === "DELEVERAGING_RESET_WATCH" ? 0.08
    : input.contractState === "ACCUMULATION_WATCH_NEEDS_CONFIRMATION" ? 0.10
    : input.contractState === "LONG_WATCH_NEEDS_CONFIRMATION" ? 0.09
    : 0.06;
  const volatilityFloor = Math.abs(input.return24h ?? 0) * 0.65;
  const spreadPenalty = (input.spreadBps ?? 0) > 20 ? 0.01 : 0;
  return clamp(Math.max(base + spreadPenalty, volatilityFloor), 0.05, 0.22);
}

function probabilityForSignal(input: ParsedContractSignal, regime: CurrentMarketRegime, calibration: CalibrationSummary): { p: number; factors: string[] } {
  const factors: string[] = [];
  let logit = -0.8 + (input.setupScore - input.riskScore) * 0.035 + input.squeezeScore * 0.006 + input.dataQuality * 0.25;

  if (input.contractState === "LONG_WATCH_NEEDS_CONFIRMATION") { logit += 0.45; factors.push("state_long_watch"); }
  if (input.contractState === "ACCUMULATION_WATCH_NEEDS_CONFIRMATION") { logit += 0.35; factors.push("state_accumulation_watch"); }
  if (input.contractState === "DELEVERAGING_RESET_WATCH") { logit += 0.15; factors.push("state_deleveraging_reset"); }
  if (input.contractState === "SQUEEZE_WATCH") { logit += 0.2; factors.push("state_squeeze_watch"); }
  if (input.contractState === "DISTRIBUTION_RISK_NO_LONG") { logit -= 1.6; factors.push("distribution_risk"); }
  if (input.contractState === "UNDER_MINED_NO_EDGE") { logit -= 0.6; factors.push("under_mined"); }
  if (input.contractState === "MARKET_DATA_GAP_NO_EDGE") { logit -= 1.0; factors.push("market_data_gap"); }

  if (input.confidence === "HIGH") { logit += 0.25; factors.push("high_confidence"); }
  if (input.confidence === "LOW") { logit -= 0.35; factors.push("low_confidence_cap"); }
  if (isCexRisk(input.cex24hDecision) || isCexRisk(input.cex4hDecision)) { logit -= 1.2; factors.push("medium_long_cex_inflow"); }
  if (isCexSupport(input.cex24hDecision) && isCexSupport(input.cex4hDecision)) { logit += 0.2; factors.push("cex_non_hostile"); }
  if (input.netCex24hValue < 0) { logit += 0.1; factors.push("net_cex_outflow_24h"); }
  if ((input.return24h ?? 0) <= -0.12 && (input.oiChange7d ?? 0) > 0.05) { logit -= 0.7; factors.push("falling_price_with_oi_rising"); }
  if ((input.fundingLatest ?? 0) > 0.001) { logit -= 0.25; factors.push("funding_expensive"); }
  if ((input.fundingLatest ?? 0) > -0.0001 && (input.fundingLatest ?? 0) < 0.0003) { logit += 0.1; factors.push("funding_cool"); }
  if (regime === "ALT_NEW_SWAP_RISK_ON") { logit += 0.15; factors.push("risk_on_regime"); }
  if (regime === "ALT_NEW_SWAP_STRESS") { logit -= 0.25; factors.push("stress_regime"); }

  const cap = calibration.status === "CALIBRATED" ? 0.78 : 0.62;
  const p = clamp(sigmoid(logit), 0.05, cap);
  if (calibration.status !== "CALIBRATED") factors.push("probability_uncalibrated_cap");
  return { p, factors };
}

export function estimateTradePlan(input: ParsedContractSignal, regime: CurrentMarketRegime, calibration: CalibrationSummary, reviewedAt = new Date().toISOString()): TradePlan {
  const execution = estimateExecution(input);
  const idGap = identityGap(input);
  const targetReturn = targetReturnForState(input);
  const stopLoss = stopLossForState(input);
  const { p, factors } = probabilityForSignal(input, regime, calibration);
  const cost = (execution.estimatedRoundTripCostBps ?? 25) / 10000;
  const expectedValue = p * targetReturn - (1 - p) * stopLoss - cost;
  const hold = baseHoldHours(input.contractState);

  let tradeDecision: TradeDecision = "NO_EDGE";
  let tradeGate = "no positive contract state";

  if (input.contractState === "DISTRIBUTION_RISK_NO_LONG") {
    tradeDecision = "NO_TRADE_RISK";
    tradeGate = "blocked by CEX inflow/evidence conflict";
  } else if (input.dataQuality < 0.6) {
    tradeDecision = "BLOCKED_DATA";
    tradeGate = "market history or derivative data is incomplete";
  } else if (execution.executionStatus === "EXECUTION_BLOCKED") {
    tradeDecision = "BLOCKED_EXECUTION";
    tradeGate = "capacity/spread gate failed";
  } else if (execution.executionStatus === "EXECUTION_DATA_MISSING") {
    tradeDecision = "BLOCKED_DATA";
    tradeGate = "execution data missing";
  } else if (isPositiveState(input.contractState) && p >= 0.52 && expectedValue >= 0.015 && input.confidence !== "LOW") {
    tradeDecision = "PAPER_TRADE_WATCH";
    tradeGate = calibration.status === "CALIBRATED"
      ? "research gate passed; still requires manual pre-trade review"
      : "paper only because PIT calibration is not yet strong enough";
  } else if (isPositiveState(input.contractState) && expectedValue > -0.01) {
    tradeDecision = "OBSERVE_ONLY";
    tradeGate = "watch state exists but probability/EV/confidence is not trade-grade";
  }

  return {
    reviewedAt,
    token: input.token,
    instId: input.instId,
    chain: input.chain,
    contractState: input.contractState,
    marketRegime: regime,
    calibrationStatus: calibration.status,
    tradeDecision,
    probabilityWin: p,
    targetReturn,
    stopLoss,
    invalidationProbability: 1 - p,
    expectedValue,
    holdHoursMin: hold.min,
    holdHoursMax: hold.max,
    maxPositionUsd: execution.maxPositionUsd,
    estimatedRoundTripCostBps: execution.estimatedRoundTripCostBps,
    executionStatus: execution.executionStatus,
    identityGap: idGap,
    tradeGate,
    modelFactors: factors.join(";"),
    thesis: input.thesis,
    invalidation: input.invalidation,
    nextAction: input.nextAction,
  };
}

function outputHeader(): string[] {
  return [
    "reviewed_at", "source_checked_at", "token", "inst_id", "chain", "contract_state", "market_regime", "calibration_status",
    "trade_decision", "probability_win", "target_return", "stop_loss", "invalidation_probability", "expected_value",
    "hold_hours_min", "hold_hours_max", "max_position_usd", "estimated_round_trip_cost_bps", "execution_status",
    "identity_gap", "trade_gate", "setup_score", "risk_score", "squeeze_score", "confidence", "cex_24h_decision",
    "net_cex_24h_value", "return_24h", "oi_change_7d", "funding_latest", "spread_bps", "volume_quote_24h",
    "oi_usd", "model_factors", "thesis", "invalidation", "next_action",
  ];
}

function toOutputRow(plan: TradePlan, signal: ParsedContractSignal): (string | number | null)[] {
  return [
    plan.reviewedAt,
    signal.checkedAt,
    plan.token,
    plan.instId,
    plan.chain,
    plan.contractState,
    plan.marketRegime,
    plan.calibrationStatus,
    plan.tradeDecision,
    pct(plan.probabilityWin, 2),
    pct(plan.targetReturn, 2),
    pct(plan.stopLoss, 2),
    pct(plan.invalidationProbability, 2),
    pct(plan.expectedValue, 2),
    plan.holdHoursMin,
    plan.holdHoursMax,
    money(plan.maxPositionUsd),
    plan.estimatedRoundTripCostBps === null ? "" : plan.estimatedRoundTripCostBps.toFixed(2),
    plan.executionStatus,
    plan.identityGap,
    plan.tradeGate,
    signal.setupScore,
    signal.riskScore,
    signal.squeezeScore,
    signal.confidence,
    signal.cex24hDecision,
    signal.netCex24hValue.toFixed(2),
    pct(signal.return24h, 2),
    pct(signal.oiChange7d, 2),
    pct(signal.fundingLatest, 4),
    signal.spreadBps === null ? "" : signal.spreadBps.toFixed(2),
    money(signal.volumeQuote24h),
    money(signal.oiUsd),
    plan.modelFactors,
    plan.thesis,
    plan.invalidation,
    plan.nextAction,
  ];
}

function appendLedger(header: string[], rows: (string | number | null)[][]): void {
  if (rows.length === 0) return;
  const encoded = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  if (!existsSync(LEDGER_PATH)) {
    appendFileSync(LEDGER_PATH, header.join(",") + "\n", "utf-8");
  }
  appendFileSync(LEDGER_PATH, encoded + "\n", "utf-8");
}

function mdTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "No rows.";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => cell.replace(/\|/g, "/").slice(0, 180)).join(" | ")} |`),
  ].join("\n");
}

function buildReport(plans: TradePlan[], signals: ParsedContractSignal[], calibration: CalibrationSummary, regime: CurrentMarketRegime): string {
  const byToken = new Map(signals.map((signal) => [signal.token, signal]));
  const sorted = [...plans].sort((a, b) => b.expectedValue - a.expectedValue);
  const actionable = sorted.filter((plan) => plan.tradeDecision === "PAPER_TRADE_WATCH" || plan.tradeDecision === "OBSERVE_ONLY");
  const blocked = sorted.filter((plan) => plan.tradeDecision !== "PAPER_TRADE_WATCH" && plan.tradeDecision !== "OBSERVE_ONLY").slice(0, 20);
  const gapCounts = new Map<string, number>();
  for (const plan of plans) gapCounts.set(plan.identityGap, (gapCounts.get(plan.identityGap) || 0) + 1);

  return [
    "# Contract Signal Research Review",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Calibration",
    "",
    mdTable(["field", "value"], [
      ["status", calibration.status],
      ["snapshots", String(calibration.snapshotCount)],
      ["selected", String(calibration.selectedCount)],
      ["precision", pct(calibration.precision, 2)],
      ["avg_excess_return", pct(calibration.avgExcessReturn, 2)],
      ["note", calibration.note],
      ["current_market_regime", regime],
    ]),
    "",
    "## Trade Watch",
    "",
    mdTable(["token", "decision", "state", "p_win", "EV", "target", "stop", "hold_h", "cap_usd", "exec", "identity_gap", "gate"], actionable.map((plan) => [
      plan.token,
      plan.tradeDecision,
      plan.contractState,
      pct(plan.probabilityWin, 1),
      pct(plan.expectedValue, 2),
      pct(plan.targetReturn, 1),
      pct(plan.stopLoss, 1),
      `${plan.holdHoursMin}-${plan.holdHoursMax}`,
      money(plan.maxPositionUsd),
      plan.executionStatus,
      plan.identityGap,
      plan.tradeGate,
    ])),
    "",
    "## Blocked And Risk",
    "",
    mdTable(["token", "decision", "state", "EV", "risk", "cex24", "exec", "identity_gap", "reason"], blocked.map((plan) => {
      const signal = byToken.get(plan.token);
      return [
        plan.token,
        plan.tradeDecision,
        plan.contractState,
        pct(plan.expectedValue, 2),
        signal ? String(signal.riskScore) : "",
        signal?.cex24hDecision || "",
        plan.executionStatus,
        plan.identityGap,
        plan.tradeGate,
      ];
    })),
    "",
    "## Identity Coverage Gaps",
    "",
    mdTable(["gap", "count"], [...gapCounts.entries()].sort((a, b) => b[1] - a[1]).map(([gap, count]) => [gap, String(count)])),
    "",
    "## Method Notes",
    "",
    "- Probability is capped when PIT sample is small; no row is a live order approval.",
    "- Expected value uses target-return, stop-loss, and estimated round-trip cost from spread/capacity.",
    "- Capacity is constrained by 0.25% of 24h quote volume and 1% of OKX OI, whichever is smaller.",
    "- Continuous tracking is written to `contract_signal_research_ledger.csv` on every run.",
  ].join("\n");
}

async function main() {
  if (!existsSync(VALIDATION_DIR)) mkdirSync(VALIDATION_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const reviewRows = rowsToObjects<ContractReviewRow>(CONTRACT_REVIEW_PATH);
  const metaMap = mapByToken(rowsToObjects<NewSwapRow>(NEW_SWAPS_PATH));
  const readinessMap = mapByToken(rowsToObjects<ReadinessRow>(READINESS_PATH));
  const signals = reviewRows.map((row) => parseSignal(row, metaMap.get(row.token), readinessMap.get(row.token)));
  const regime = classifyCurrentMarketRegime(signals);
  const calibration = loadCalibrationSummary();
  const reviewedAt = new Date().toISOString();
  const plans = signals.map((signal) => estimateTradePlan(signal, regime, calibration, reviewedAt));
  const header = outputHeader();
  const outputRows = plans.map((plan) => {
    const signal = signals.find((candidate) => candidate.token === plan.token)!;
    return toOutputRow(plan, signal);
  });

  writeCsv(OUT_PATH, [header, ...outputRows]);
  appendLedger(header, outputRows);
  writeFileSync(REPORT_PATH, buildReport(plans, signals, calibration, regime), "utf-8");

  console.log("=== Contract Signal Research Review ===");
  console.log(`Regime: ${regime}`);
  console.log(`Calibration: ${calibration.status} snapshots=${calibration.snapshotCount} selected=${calibration.selectedCount}`);
  for (const plan of [...plans].sort((a, b) => b.expectedValue - a.expectedValue).slice(0, 12)) {
    console.log(`${plan.token}: ${plan.tradeDecision} state=${plan.contractState} p=${pct(plan.probabilityWin, 1)} EV=${pct(plan.expectedValue, 2)} cap=${money(plan.maxPositionUsd)} exec=${plan.executionStatus}`);
  }
  console.log(`Output: ${OUT_PATH}`);
  console.log(`Ledger: ${LEDGER_PATH}`);
  console.log(`Report: ${REPORT_PATH}`);
}

const isMain = process.argv[1]?.includes("contract_signal_research_review");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
