export type AccumulationLabel =
  | "STRONG_ACCUMULATION"
  | "EARLY_ACCUMULATION"
  | "WATCH_ACCUMULATION"
  | "DISTRIBUTION_RISK"
  | "MOMENTUM_CHASE"
  | "NO_CLEAR_ACCUMULATION"
  | "INSUFFICIENT_DATA";

export interface AccumulationEvidenceInput {
  token: string;
  observedAt?: string;
  price?: {
    return3d?: number | null;
    range3d?: number | null;
    volatility7d?: number | null;
    compression?: boolean | null;
    expansion?: boolean | null;
    volumeZ7d?: number | null;
  };
  dex?: {
    liquidityUsd?: number | null;
    turnoverRatio?: number | null;
    demandSupplyRatio?: number | null;
    poolVolumeZ?: number | null;
  };
  holders?: {
    holderCoverage?: number | null;
    top1Share?: number | null;
    top10Share?: number | null;
    topEntityShare?: number | null;
    cexHolderRatio?: number | null;
    unknownHolderRatio?: number | null;
    holderCountGrowth7d?: number | null;
  };
  flows?: {
    cex1hDecision?: string;
    cex4hDecision?: string;
    cex24hDecision?: string;
    netCex1hValue?: number | null;
    netCex4hValue?: number | null;
    netCex24hValue?: number | null;
    entityCoverage?: number | null;
  };
  derivatives?: {
    oiChange1d?: number | null;
    oiChange7d?: number | null;
    oiZ7d?: number | null;
    fundingRate?: number | null;
    fundingZ7d?: number | null;
    fundingOverheated?: boolean | null;
    liquidationZ7d?: number | null;
    longShortRatio?: number | null;
  };
  scanner?: {
    opportunityScore?: number | null;
    fragilityScore?: number | null;
    tradabilityScore?: number | null;
    dataQualityScore?: number | null;
  };
}

export interface AccumulationDecision {
  token: string;
  label: AccumulationLabel;
  totalScore: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  subscores: {
    compression: number;
    absorption: number;
    holderQuality: number;
    flowQuality: number;
    derivativesQuality: number;
    scannerContext: number;
  };
  riskPenalty: number;
  dataCompleteness: number;
  evidenceGroups: string[];
  missingGroups: string[];
  positiveEvidence: string[];
  riskEvidence: string[];
  limitations: string[];
}

function hasNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(clamp(value));
}

function between(value: number | null | undefined, min: number, max: number): boolean {
  return hasNumber(value) && value >= min && value <= max;
}

function boolScore(value: boolean | null | undefined, score: number): number {
  return value === true ? score : 0;
}

function scoreRangeLow(range: number | null | undefined): number {
  if (!hasNumber(range)) return 0;
  if (range <= 0.06) return 25;
  if (range <= 0.12) return 18;
  if (range <= 0.2) return 8;
  return 0;
}

function scoreVolatility(volatility: number | null | undefined): number {
  if (!hasNumber(volatility)) return 0;
  if (volatility <= 0.03) return 20;
  if (volatility <= 0.06) return 14;
  if (volatility <= 0.1) return 6;
  return 0;
}

function scoreQuietReturn(value: number | null | undefined): number {
  if (!hasNumber(value)) return 0;
  const abs = Math.abs(value);
  if (abs <= 0.05) return 15;
  if (abs <= 0.12) return 10;
  if (abs <= 0.2) return 4;
  return 0;
}

function compressionScore(input: AccumulationEvidenceInput): number {
  const price = input.price || {};
  return round(
    boolScore(price.compression, 35) +
    scoreRangeLow(price.range3d) +
    scoreVolatility(price.volatility7d) +
    scoreQuietReturn(price.return3d) +
    (between(price.volumeZ7d, -0.75, 1.75) ? 5 : 0)
  );
}

function scoreLiquidity(value: number | null | undefined): number {
  if (!hasNumber(value)) return 0;
  if (value >= 10_000_000) return 22;
  if (value >= 1_000_000) return 18;
  if (value >= 500_000) return 12;
  if (value >= 100_000) return 6;
  return 0;
}

function scoreTurnover(value: number | null | undefined): number {
  if (!hasNumber(value)) return 0;
  if (value >= 3 && value <= 20) return 24;
  if (value > 20 && value <= 45) return 12;
  if (value > 0.5 && value < 3) return 10;
  return 0;
}

function scoreDemandSupply(value: number | null | undefined): number {
  if (!hasNumber(value) || value <= 0) return 0;
  if (value >= 0.95 && value <= 1.45) return 18;
  if (value >= 0.75 && value < 0.95) return 8;
  if (value > 1.45 && value <= 2.2) return 10;
  return 0;
}

function absorptionScore(input: AccumulationEvidenceInput): number {
  const dex = input.dex || {};
  const price = input.price || {};
  return round(
    scoreLiquidity(dex.liquidityUsd) +
    scoreTurnover(dex.turnoverRatio) +
    scoreDemandSupply(dex.demandSupplyRatio) +
    (between(price.volumeZ7d ?? dex.poolVolumeZ, 0.25, 2.5) ? 16 : 0) +
    (between(price.return3d, -0.08, 0.18) ? 12 : 0) +
    (price.expansion === true ? -10 : 0)
  );
}

function holderQualityScore(input: AccumulationEvidenceInput): number {
  const holders = input.holders || {};
  let score = 0;
  if (hasNumber(holders.holderCoverage)) score += holders.holderCoverage >= 0.5 ? 18 : holders.holderCoverage >= 0.25 ? 10 : 2;
  if (hasNumber(holders.top10Share)) score += holders.top10Share <= 0.4 ? 22 : holders.top10Share <= 0.65 ? 12 : 0;
  if (hasNumber(holders.topEntityShare)) score += holders.topEntityShare <= 0.45 ? 16 : holders.topEntityShare <= 0.7 ? 8 : 0;
  if (hasNumber(holders.cexHolderRatio)) score += holders.cexHolderRatio <= 0.35 ? 10 : holders.cexHolderRatio <= 0.55 ? 5 : 0;
  if (hasNumber(holders.unknownHolderRatio)) score += holders.unknownHolderRatio <= 0.45 ? 10 : holders.unknownHolderRatio <= 0.7 ? 4 : 0;
  if (hasNumber(holders.holderCountGrowth7d)) score += holders.holderCountGrowth7d > 0 ? 14 : 0;
  return round(score);
}

function cexDecisionScore(decision: string | undefined): number {
  if (!decision) return 0;
  if (decision === "CEX_OUTFLOW_OR_NEUTRAL") return 18;
  if (decision === "CEX_INFLOW_RISK") return -25;
  if (decision === "LOW_COVERAGE" || decision === "PARTIAL_WINDOW") return -6;
  return 0;
}

function netCexScore(value: number | null | undefined): number {
  if (!hasNumber(value)) return 0;
  if (value <= 0) return 10;
  if (value > 0) return -10;
  return 0;
}

function flowQualityScore(input: AccumulationEvidenceInput): number {
  const flows = input.flows || {};
  return round(
    cexDecisionScore(flows.cex1hDecision) +
    cexDecisionScore(flows.cex4hDecision) +
    cexDecisionScore(flows.cex24hDecision) +
    netCexScore(flows.netCex4hValue) +
    netCexScore(flows.netCex24hValue) +
    (hasNumber(flows.entityCoverage) && flows.entityCoverage >= 0.5 ? 18 : hasNumber(flows.entityCoverage) && flows.entityCoverage >= 0.25 ? 8 : 0)
  );
}

function derivativesQualityScore(input: AccumulationEvidenceInput): number {
  const d = input.derivatives || {};
  let score = 0;
  if (hasNumber(d.oiChange7d)) score += d.oiChange7d > 0 && d.oiChange7d < 0.75 ? 22 : d.oiChange7d >= 0.75 ? 8 : 0;
  if (hasNumber(d.oiChange1d)) score += d.oiChange1d > -0.15 && d.oiChange1d < 0.25 ? 10 : 0;
  if (hasNumber(d.oiZ7d)) score += d.oiZ7d > -0.5 && d.oiZ7d < 2 ? 16 : 0;
  if (hasNumber(d.fundingZ7d)) score += Math.abs(d.fundingZ7d) <= 1.5 ? 18 : 0;
  if (hasNumber(d.fundingRate)) score += Math.abs(d.fundingRate) <= 0.001 ? 10 : 0;
  if (d.fundingOverheated === false) score += 12;
  if (hasNumber(d.liquidationZ7d)) score += d.liquidationZ7d < 2 ? 12 : 0;
  if (hasNumber(d.longShortRatio)) score += d.longShortRatio >= 0.75 && d.longShortRatio <= 1.4 ? 10 : 0;
  return round(score);
}

function scannerContextScore(input: AccumulationEvidenceInput): number {
  const scanner = input.scanner || {};
  let score = 0;
  if (hasNumber(scanner.opportunityScore)) score += scanner.opportunityScore * 0.45;
  if (hasNumber(scanner.tradabilityScore)) score += scanner.tradabilityScore * 0.25;
  if (hasNumber(scanner.fragilityScore)) score += Math.max(0, 40 - scanner.fragilityScore) * 0.35;
  if (hasNumber(scanner.dataQualityScore)) score += scanner.dataQualityScore * 15;
  return round(score);
}

function evidenceGroups(input: AccumulationEvidenceInput): string[] {
  const groups: string[] = [];
  if (input.price && Object.values(input.price).some((value) => value !== null && value !== undefined)) groups.push("price");
  if (input.dex && Object.values(input.dex).some((value) => value !== null && value !== undefined)) groups.push("dex");
  if (input.holders && Object.values(input.holders).some((value) => value !== null && value !== undefined)) groups.push("holders");
  if (input.flows && Object.values(input.flows).some((value) => value !== null && value !== undefined && value !== "")) groups.push("flows");
  if (input.derivatives && Object.values(input.derivatives).some((value) => value !== null && value !== undefined)) groups.push("derivatives");
  if (input.scanner && Object.values(input.scanner).some((value) => value !== null && value !== undefined)) groups.push("scanner");
  return groups;
}

function riskPenalty(input: AccumulationEvidenceInput): { value: number; evidence: string[] } {
  const evidence: string[] = [];
  let penalty = 0;
  const scanner = input.scanner || {};
  const holders = input.holders || {};
  const flows = input.flows || {};
  const d = input.derivatives || {};
  const dex = input.dex || {};
  const price = input.price || {};

  if (hasNumber(scanner.fragilityScore) && scanner.fragilityScore >= 60) {
    penalty += 18;
    evidence.push("high_fragility_score");
  }
  if (hasNumber(scanner.tradabilityScore) && scanner.tradabilityScore < 40) {
    penalty += 16;
    evidence.push("poor_tradability");
  }
  if (hasNumber(dex.liquidityUsd) && dex.liquidityUsd < 100_000) {
    penalty += 18;
    evidence.push("thin_liquidity");
  }
  if (hasNumber(dex.turnoverRatio) && dex.turnoverRatio > 45) {
    penalty += 12;
    evidence.push("turnover_extreme");
  }
  if (flows.cex1hDecision === "CEX_INFLOW_RISK" || flows.cex4hDecision === "CEX_INFLOW_RISK" || flows.cex24hDecision === "CEX_INFLOW_RISK") {
    penalty += 28;
    evidence.push("cex_inflow_risk");
  }
  if (hasNumber(flows.entityCoverage) && flows.entityCoverage < 0.2) {
    penalty += 10;
    evidence.push("low_entity_coverage");
  }
  if (hasNumber(holders.top10Share) && holders.top10Share > 0.8) {
    penalty += 18;
    evidence.push("top10_holder_concentration");
  }
  if (hasNumber(holders.unknownHolderRatio) && holders.unknownHolderRatio > 0.75) {
    penalty += 10;
    evidence.push("unknown_holder_concentration");
  }
  if (d.fundingOverheated === true || (hasNumber(d.fundingZ7d) && Math.abs(d.fundingZ7d) > 2.5)) {
    penalty += 20;
    evidence.push("funding_overheated");
  }
  if (hasNumber(d.liquidationZ7d) && d.liquidationZ7d >= 3) {
    penalty += 18;
    evidence.push("liquidation_spike");
  }
  if (price.expansion === true && hasNumber(price.return3d) && price.return3d > 0.25) {
    penalty += 14;
    evidence.push("already_expanding");
  }

  return { value: round(penalty), evidence };
}

function confidence(dataCompleteness: number, risk: number): "HIGH" | "MEDIUM" | "LOW" {
  if (dataCompleteness >= 0.75 && risk < 25) return "HIGH";
  if (dataCompleteness >= 0.5 && risk < 45) return "MEDIUM";
  return "LOW";
}

function positiveEvidence(input: AccumulationEvidenceInput, subscores: AccumulationDecision["subscores"]): string[] {
  const evidence: string[] = [];
  if (subscores.compression >= 55) evidence.push("price_range_compression");
  if (subscores.absorption >= 55) evidence.push("dex_absorption_context");
  if (subscores.flowQuality >= 55) evidence.push("cex_outflow_or_neutral_flow");
  if (subscores.derivativesQuality >= 55) evidence.push("derivatives_not_overheated");
  if (subscores.holderQuality >= 45) evidence.push("holder_quality_acceptable");
  if (hasNumber(input.scanner?.opportunityScore) && input.scanner.opportunityScore >= 45) evidence.push("scanner_opportunity_context");
  return evidence;
}

function labelFor(totalScore: number, risk: number, groups: string[], input: AccumulationEvidenceInput, subscores: AccumulationDecision["subscores"]): AccumulationLabel {
  if (groups.length < 3) return "INSUFFICIENT_DATA";
  if (risk >= 45 || (groups.includes("flows") && subscores.flowQuality <= 10)) return "DISTRIBUTION_RISK";
  if (input.price?.expansion === true && hasNumber(input.price.return3d) && input.price.return3d > 0.25 && subscores.absorption < 45) {
    return "MOMENTUM_CHASE";
  }
  if (totalScore >= 70 && risk < 25) return "STRONG_ACCUMULATION";
  if (totalScore >= 55 && risk < 35) return "EARLY_ACCUMULATION";
  if (
    groups.includes("flows") &&
    groups.length >= 5 &&
    subscores.scannerContext >= 60 &&
    subscores.holderQuality >= 40 &&
    subscores.flowQuality >= 45 &&
    risk < 25
  ) {
    return "WATCH_ACCUMULATION";
  }
  if (totalScore >= 42 && risk < 45) return "WATCH_ACCUMULATION";
  return "NO_CLEAR_ACCUMULATION";
}

export function detectAccumulationPattern(input: AccumulationEvidenceInput): AccumulationDecision {
  const groups = evidenceGroups(input);
  const missingGroups = ["price", "dex", "holders", "flows", "derivatives", "scanner"].filter((group) => !groups.includes(group));
  const subscores = {
    compression: compressionScore(input),
    absorption: absorptionScore(input),
    holderQuality: holderQualityScore(input),
    flowQuality: flowQualityScore(input),
    derivativesQuality: derivativesQualityScore(input),
    scannerContext: scannerContextScore(input),
  };
  const risk = riskPenalty(input);
  const weighted =
    subscores.compression * 0.18 +
    subscores.absorption * 0.24 +
    subscores.holderQuality * 0.12 +
    subscores.flowQuality * 0.22 +
    subscores.derivativesQuality * 0.16 +
    subscores.scannerContext * 0.08;
  const dataCompleteness = groups.length / 6;
  const totalScore = round(weighted - risk.value * 0.45 - (1 - dataCompleteness) * 10);
  const label = labelFor(totalScore, risk.value, groups, input, subscores);
  const limitations: string[] = [];
  if (missingGroups.length > 0) limitations.push(`missing_groups=${missingGroups.join(";")}`);
  if (groups.length < 4) limitations.push("low_cross_source_confirmation");
  if (input.flows?.cex24hDecision === "PARTIAL_WINDOW" || input.flows?.cex24hDecision === "LOW_COVERAGE") limitations.push("flow_window_not_clean");

  return {
    token: input.token,
    label,
    totalScore,
    confidence: confidence(dataCompleteness, risk.value),
    subscores,
    riskPenalty: risk.value,
    dataCompleteness,
    evidenceGroups: groups,
    missingGroups,
    positiveEvidence: positiveEvidence(input, subscores),
    riskEvidence: risk.evidence,
    limitations,
  };
}
