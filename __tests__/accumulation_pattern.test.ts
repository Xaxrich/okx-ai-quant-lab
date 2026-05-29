import { describe, expect, it } from "vitest";
import { detectAccumulationPattern, type AccumulationEvidenceInput } from "../src/altcoin/intelligence/accumulation/accumulation_pattern.js";

function baseInput(overrides: Partial<AccumulationEvidenceInput> = {}): AccumulationEvidenceInput {
  return {
    token: "AAA",
    price: {
      return3d: 0.03,
      range3d: 0.05,
      volatility7d: 0.025,
      compression: true,
      expansion: false,
      volumeZ7d: 1.1,
    },
    dex: {
      liquidityUsd: 2_500_000,
      turnoverRatio: 8,
      demandSupplyRatio: 1.08,
      poolVolumeZ: 1.1,
    },
    holders: {
      holderCoverage: 0.62,
      top10Share: 0.38,
      topEntityShare: 0.28,
      cexHolderRatio: 0.2,
      unknownHolderRatio: 0.35,
    },
    flows: {
      cex1hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      cex4hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      cex24hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      netCex1hValue: -1000,
      netCex4hValue: -5000,
      netCex24hValue: -8000,
      entityCoverage: 0.55,
    },
    derivatives: {
      oiChange1d: 0.04,
      oiChange7d: 0.18,
      oiZ7d: 0.7,
      fundingRate: 0.0002,
      fundingZ7d: 0.4,
      fundingOverheated: false,
      liquidationZ7d: 0.5,
    },
    scanner: {
      opportunityScore: 55,
      fragilityScore: 18,
      tradabilityScore: 80,
      dataQualityScore: 0.9,
    },
    ...overrides,
  };
}

describe("detectAccumulationPattern", () => {
  it("promotes a multi-source quiet accumulation candidate", () => {
    const decision = detectAccumulationPattern(baseInput());

    expect(["STRONG_ACCUMULATION", "EARLY_ACCUMULATION"]).toContain(decision.label);
    expect(decision.totalScore).toBeGreaterThanOrEqual(55);
    expect(decision.positiveEvidence).toContain("price_range_compression");
    expect(decision.positiveEvidence).toContain("cex_outflow_or_neutral_flow");
    expect(decision.riskPenalty).toBeLessThan(25);
  });

  it("rejects CEX inflow and overheated derivatives as distribution risk", () => {
    const decision = detectAccumulationPattern(baseInput({
      flows: {
        cex1hDecision: "CEX_INFLOW_RISK",
        cex4hDecision: "CEX_INFLOW_RISK",
        cex24hDecision: "CEX_INFLOW_RISK",
        netCex1hValue: 20_000,
        netCex4hValue: 50_000,
        netCex24hValue: 120_000,
        entityCoverage: 0.6,
      },
      derivatives: {
        oiChange1d: 0.5,
        oiChange7d: 1.4,
        oiZ7d: 3.2,
        fundingRate: 0.003,
        fundingZ7d: 3,
        fundingOverheated: true,
        liquidationZ7d: 4,
      },
    }));

    expect(decision.label).toBe("DISTRIBUTION_RISK");
    expect(decision.riskEvidence).toContain("cex_inflow_risk");
    expect(decision.riskEvidence).toContain("funding_overheated");
    expect(decision.riskEvidence).toContain("liquidation_spike");
  });

  it("does not overclaim when cross-source evidence is missing", () => {
    const decision = detectAccumulationPattern({
      token: "CCC",
      price: {
        return3d: 0.01,
        range3d: 0.04,
        volatility7d: 0.02,
        compression: true,
      },
      scanner: {
        opportunityScore: 70,
        fragilityScore: 10,
        tradabilityScore: 90,
        dataQualityScore: 1,
      },
    });

    expect(decision.label).toBe("INSUFFICIENT_DATA");
    expect(decision.limitations.join(";")).toContain("missing_groups");
  });
});
