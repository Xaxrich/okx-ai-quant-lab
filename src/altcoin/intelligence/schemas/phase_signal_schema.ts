export type PhaseLabel =
  | "NO_CLEAR_PHASE"
  | "COMPRESSION"
  | "ACCUMULATION_PROXY"
  | "EARLY_BREAKOUT"
  | "MARKUP_CONFIRMATION"
  | "LATE_MOMENTUM"
  | "DISTRIBUTION_RISK"
  | "LIQUIDITY_FRAGILITY"
  | "POST_CRASH_REBALANCE"
  | "INSUFFICIENT_DATA";

export const ALL_PHASE_LABELS: PhaseLabel[] = [
  "NO_CLEAR_PHASE", "COMPRESSION", "ACCUMULATION_PROXY",
  "EARLY_BREAKOUT", "MARKUP_CONFIRMATION", "LATE_MOMENTUM",
  "DISTRIBUTION_RISK", "LIQUIDITY_FRAGILITY", "POST_CRASH_REBALANCE",
  "INSUFFICIENT_DATA",
];

export interface PhaseSignal {
  token: string;
  timestamp: string;
  phaseLabel: PhaseLabel;
  phaseConfidence: "HIGH" | "MEDIUM" | "LOW";
  accumulationProxyScore: number;
  markupConfirmationScore: number;
  distributionRiskScore: number;
  liquidityFragilityScore: number;
  evidence: string[];
  missingEvidence: string[];
  limitations: string[];
}
