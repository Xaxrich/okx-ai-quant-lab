import type { PhaseLabel, PhaseSignal } from "../schemas/phase_signal_schema.js";
import type { HolderTimeSeriesFeatures } from "../schemas/holder_snapshot_schema.js";
import type { TransferFlowSnapshot } from "../schemas/transfer_flow_schema.js";
import type { DexLiquidityTimeSeriesFeatures } from "../schemas/dex_liquidity_schema.js";

// All scores are 0-100. Confidence is capped by data availability.

interface ClassifierInput {
  token: string;
  // Market
  isPriceCompressing: boolean;
  isVolumeNotExtreme: boolean;
  hasQuietBreakout: boolean;
  hasRelativeStrength: boolean;
  isPriceHigh: boolean;
  isVolumeHigh: boolean;
  isEfficiencyDecaying: boolean;
  isPriceCrashing: boolean;
  isPostCrash: boolean;
  // Holder (may be null = unavailable)
  holder: HolderTimeSeriesFeatures | null;
  // Transfer (may be null)
  transfer: TransferFlowSnapshot | null;
  // DEX (may be null)
  dex: DexLiquidityTimeSeriesFeatures | null;
  // Supply
  hasSupplyOverhang: boolean;
}

export function classifyPhase(input: ClassifierInput): PhaseSignal {
  const evidence: string[] = [];
  const missing: string[] = [];
  const limitations: string[] = [];

  let accScore = 0;
  let markupScore = 0;
  let distScore = 0;
  let fragScore = 0;

  // ── ACCUMULATION PROXY ──
  if (input.isPriceCompressing) { accScore += 20; evidence.push("Price range compression detected."); }
  if (input.isVolumeNotExtreme) { accScore += 15; evidence.push("Volume not extreme during compression."); }

  if (input.holder) {
    if (input.holder.accumulationProxy === "STRONG") { accScore += 25; evidence.push("Holder data: strong accumulation proxy."); }
    else if (input.holder.accumulationProxy === "MODERATE") { accScore += 15; evidence.push("Holder data: moderate accumulation proxy."); }
    constraints(input.holder.confidence);
  } else {
    missing.push("holder_data");
    limitations.push("Holder data unavailable. Accumulation assessment limited to price-volume only.");
  }

  if (input.dex) {
    if (input.dex.liquidityTrend7d === "INCREASING") { accScore += 10; evidence.push("DEX liquidity increasing."); }
  } else {
    missing.push("dex_liquidity_history");
  }

  if (input.transfer) {
    if (input.transfer.netCexFlowProxy !== null && input.transfer.netCexFlowProxy < 0) {
      accScore += 10;
      evidence.push("Net CEX outflow detected (accumulation proxy).");
    }
  } else {
    missing.push("transfer_flow");
  }

  // ── MARKUP CONFIRMATION ──
  if (input.hasQuietBreakout) { markupScore += 25; evidence.push("Quiet breakout detected."); }
  if (input.hasRelativeStrength) { markupScore += 20; evidence.push("Relative strength vs BTC/ETH."); }
  if (input.isVolumeNotExtreme === false) { markupScore += 15; evidence.push("Volume expansion confirming trend."); }

  // ── DISTRIBUTION RISK ──
  if (input.isEfficiencyDecaying) { distScore += 20; evidence.push("Effort/result decay: high volume, low price progress."); }
  if (input.hasSupplyOverhang) { distScore += 15; evidence.push("Supply overhang detected."); }

  if (input.holder) {
    if (input.holder.distributionRiskProxy === "STRONG") { distScore += 25; evidence.push("Holder data: strong distribution risk proxy."); }
    else if (input.holder.distributionRiskProxy === "MODERATE") { distScore += 15; evidence.push("Holder data: moderate distribution risk proxy."); }
  }

  if (input.transfer) {
    if (input.transfer.toCexVolume !== null && input.transfer.toCexVolume > 0) {
      distScore += 15;
      evidence.push("Large transfers to CEX detected.");
    }
  }

  if (input.dex) {
    if (input.dex.liquidityDropFlag) { distScore += 10; evidence.push("DEX liquidity withdrawal detected."); }
  }

  // ── LIQUIDITY FRAGILITY ──
  if (input.dex) {
    if (input.dex.liquidityFragilityScore > 50) fragScore = input.dex.liquidityFragilityScore;
  }
  if (!input.dex) missing.push("dex_liquidity_history");

  // ── Phase determination ──
  let label: PhaseLabel;
  let confidence: "HIGH" | "MEDIUM" | "LOW";

  if (missing.length >= 4) {
    label = "INSUFFICIENT_DATA";
    confidence = "LOW";
  } else if (input.isPostCrash) {
    label = "POST_CRASH_REBALANCE";
    confidence = missing.includes("holder_data") ? "MEDIUM" : "HIGH";
  } else if (input.isPriceCrashing) {
    label = "LIQUIDITY_FRAGILITY";
    confidence = "MEDIUM";
  } else if (distScore >= 40) {
    label = "DISTRIBUTION_RISK";
    confidence = missing.includes("holder_data") ? "LOW" : missing.includes("transfer_flow") ? "MEDIUM" : "HIGH";
  } else if (markupScore >= 30 && input.isVolumeHigh) {
    label = "LATE_MOMENTUM";
    confidence = "MEDIUM";
  } else if (markupScore >= 30) {
    label = "MARKUP_CONFIRMATION";
    confidence = "MEDIUM";
  } else if (input.hasQuietBreakout && markupScore >= 20) {
    label = "EARLY_BREAKOUT";
    confidence = "MEDIUM";
  } else if (accScore >= 40) {
    label = "ACCUMULATION_PROXY";
    confidence = missing.includes("holder_data") ? "LOW" : "MEDIUM";
  } else if (input.isPriceCompressing && input.isVolumeNotExtreme) {
    label = "COMPRESSION";
    confidence = "MEDIUM";
  } else {
    label = "NO_CLEAR_PHASE";
    confidence = "MEDIUM";
  }

  return {
    token: input.token,
    timestamp: new Date().toISOString(),
    phaseLabel: label,
    phaseConfidence: confidence,
    accumulationProxyScore: accScore,
    markupConfirmationScore: markupScore,
    distributionRiskScore: distScore,
    liquidityFragilityScore: fragScore,
    evidence,
    missingEvidence: missing,
    limitations,
  };
}

function constraints(c: string): void {
  // No-op for now — confidence tracking handled in phase determination
}
