import { describe, expect, it } from "vitest";
import {
  cexFlowScoreAdjustment,
  classifyOkxAccumulation,
  coinGeckoContextFromRow,
  computeCexFlowGate,
  computeExecutionScore,
  computeCoinGeckoContextPenalty,
  isMajorOrStable,
  normalizeTargetCap,
  symbolFromInstId,
  targetCapMatches,
  targetReviewLimit,
  targetUniverseLimit,
} from "../src/altcoin/intelligence/accumulation/okx_accumulation_scan.js";

describe("symbolFromInstId", () => {
  it("extracts OKX swap base symbols", () => {
    expect(symbolFromInstId("ONDO-USDT-SWAP")).toBe("ONDO");
  });
});

describe("isMajorOrStable", () => {
  it("blocks majors and stablecoins from the default altcoin scan", () => {
    expect(isMajorOrStable("BTC")).toBe(true);
    expect(isMajorOrStable("USDC")).toBe(true);
    expect(isMajorOrStable("ONDO")).toBe(false);
  });
});

describe("computeExecutionScore", () => {
  it("rewards liquid, tight, well-covered contracts", () => {
    const score = computeExecutionScore({
      spreadBps: 5,
      volumeQuote24h: 80_000_000,
      oiUsd: 150_000_000,
      dataQuality: 1,
    });
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it("penalizes thin contracts", () => {
    const score = computeExecutionScore({
      spreadBps: 120,
      volumeQuote24h: 100_000,
      oiUsd: 250_000,
      dataQuality: 0.2,
    });
    expect(score).toBeLessThan(20);
  });
});

describe("classifyOkxAccumulation", () => {
  it("promotes high-quality accumulation to watch status", () => {
    expect(classifyOkxAccumulation({
      accumulationScore: 72,
      riskScore: 20,
      executionScore: 70,
      dataQuality: 0.9,
      label: "EARLY_ACCUMULATION",
      confidence: "MEDIUM",
      cexFlowGate: "SUPPORTED",
    })).toBe("READY_TO_WATCH");
  });

  it("lets distribution risk override attractive scores", () => {
    expect(classifyOkxAccumulation({
      accumulationScore: 90,
      riskScore: 80,
      executionScore: 90,
      dataQuality: 1,
      label: "DISTRIBUTION_RISK",
      confidence: "HIGH",
      cexFlowGate: "BLOCKED",
    })).toBe("DISTRIBUTION_RISK");
  });

  it("does not allow WAIT_CONFIRMATION without supported CEX flow", () => {
    expect(classifyOkxAccumulation({
      accumulationScore: 58,
      riskScore: 28,
      executionScore: 55,
      dataQuality: 0.9,
      label: "WATCH_ACCUMULATION",
      confidence: "MEDIUM",
      cexFlowGate: "MISSING_OR_WEAK",
    })).toBe("NO_EDGE");
  });
});

describe("CEX flow gate", () => {
  it("requires clean medium and long windows for support", () => {
    expect(computeCexFlowGate({
      cex1hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      cex4hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      cex24hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      netCex1hValue: -1_000,
      netCex4hValue: -5_000,
      netCex24hValue: -9_000,
      entityCoverage: 0.5,
    })).toBe("SUPPORTED");
    expect(cexFlowScoreAdjustment("SUPPORTED")).toBeGreaterThan(0);
  });

  it("blocks promotion when any CEX inflow risk is present", () => {
    expect(computeCexFlowGate({
      cex4hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      cex24hDecision: "CEX_INFLOW_RISK",
      netCex24hValue: 25_000,
      entityCoverage: 0.7,
    })).toBe("BLOCKED");
  });

  it("does not treat missing or partial windows as supported even with neutral net flow", () => {
    expect(computeCexFlowGate({
      cex1hDecision: "NO_DATA",
      cex4hDecision: "NO_DATA",
      cex24hDecision: "NO_DATA",
      netCex4hValue: 0,
      netCex24hValue: 0,
      entityCoverage: 0.5,
    })).toBe("MISSING_OR_WEAK");
    expect(computeCexFlowGate({
      cex1hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      cex4hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      cex24hDecision: "PARTIAL_WINDOW",
      netCex24hValue: -100_000,
      entityCoverage: 0.5,
    })).toBe("MISSING_OR_WEAK");
  });
});

describe("CoinGecko context overlay", () => {
  it("parses enrichment rows into scanner context", () => {
    const context = coinGeckoContextFromRow({
      coingecko_id: "solana",
      resolution_status: "MARKET_AND_DETAILS_READY",
      primary_category: "Layer 1 (L1)",
      market_cap_bucket: "LARGE_CAP_TOP30",
      market_cap: "90000000000",
      fdv_to_mcap: "1.05",
      volume_to_mcap: "0.08",
      market_cap_rank: "6",
      trending_rank: "2",
      limitations: "coin_details_not_fetched",
    });
    expect(context.coingeckoId).toBe("solana");
    expect(context.marketCap).toBe(90_000_000_000);
    expect(context.limitations).toContain("coin_details_not_fetched");
  });

  it("adds context penalty for large-cap rotation and high FDV overhang", () => {
    const penalty = computeCoinGeckoContextPenalty({
      resolutionStatus: "MARKET_AND_DETAILS_READY",
      marketCapBucket: "LARGE_CAP_TOP30",
      fdvToMcap: 9,
      volumeToMcap: 0.2,
    });
    expect(penalty).toBeGreaterThanOrEqual(20);
  });

  it("does not penalize a resolved mid-cap context by default", () => {
    const penalty = computeCoinGeckoContextPenalty({
      resolutionStatus: "MARKET_ONLY",
      marketCapBucket: "MID_CAP_100M_1B",
      fdvToMcap: 1.8,
      volumeToMcap: 0.25,
    });
    expect(penalty).toBe(0);
  });

  it("normalizes target-cap and matches the small-mid market-cap bucket", () => {
    expect(normalizeTargetCap("small-mid")).toBe("small-mid");
    expect(normalizeTargetCap("unknown")).toBe("all");
    expect(targetCapMatches("small-mid", { marketCapBucket: "SMALL_CAP_10M_100M" })).toBe(true);
    expect(targetCapMatches("small-mid", { marketCapBucket: "MID_CAP_100M_1B" })).toBe(true);
    expect(targetCapMatches("small-mid", { marketCapBucket: "LARGE_CAP_TOP30" })).toBe(false);
  });

  it("expands target-cap scans enough to get past large-cap volume leaders", () => {
    expect(targetUniverseLimit({ limit: 20, targetCap: "all" })).toBe(20);
    expect(targetUniverseLimit({ limit: 20, targetCap: "large" })).toBe(40);
    expect(targetUniverseLimit({ limit: 20, targetCap: "mid-large" })).toBe(80);
    expect(targetUniverseLimit({ limit: 20, targetCap: "small-mid" })).toBe(120);
    expect(targetUniverseLimit({ limit: 40, targetCap: "micro-small" })).toBe(240);
  });

  it("reviews a wider target-cap pool before ranking final accumulation rows", () => {
    expect(targetReviewLimit({ limit: 20, targetCap: "all" })).toBe(20);
    expect(targetReviewLimit({ limit: 20, targetCap: "small-mid" })).toBe(60);
    expect(targetReviewLimit({ limit: 40, targetCap: "micro-small" })).toBe(120);
  });
});
