import { describe, expect, it } from "vitest";
import {
  classifyCurrentMarketRegime,
  estimateTradePlan,
  type CalibrationSummary,
  type ParsedContractSignal,
} from "../src/altcoin/intelligence/validation/contract_signal_research_review.js";

const CALIBRATION: CalibrationSummary = {
  status: "PIT_SAMPLE_TOO_SMALL",
  snapshotCount: 1,
  selectedCount: 5,
  precision: 0.4,
  avgExcessReturn: 0.13,
  note: "test",
};

function signal(overrides: Partial<ParsedContractSignal>): ParsedContractSignal {
  return {
    checkedAt: "2026-05-14T08:52:36.754Z",
    token: "AAA",
    instId: "AAA-USDT-SWAP",
    chain: "eth",
    contractAddress: "0x0",
    discoveryStatus: "READY_EVM_CHAIN_SCAN",
    priority: "P1",
    contractState: "LONG_WATCH_NEEDS_CONFIRMATION",
    evidenceState: "SHALLOW_WATCH",
    readinessDecision: "READY_FOR_DEEP_SCAN",
    holderDecision: "IDENTITY_RESOLVED",
    holderDeltaDecision: "",
    entityDecision: "",
    cex1hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
    cex4hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
    cex24hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
    netCex24hValue: -100_000,
    spreadBps: 4,
    return24h: 0.04,
    return7d: 0.12,
    rangePosition24h: 0.7,
    volumeQuote24h: 20_000_000,
    volumeAcceleration: 0.5,
    oiUsd: 10_000_000,
    oiChange7d: 0.2,
    fundingLatest: 0.0001,
    dataQuality: 1,
    setupScore: 80,
    riskScore: 20,
    squeezeScore: 50,
    confidence: "MEDIUM",
    thesis: "test thesis",
    invalidation: "test invalidation",
    nextAction: "test action",
    evidence: "",
    entityCoverage: 0.9,
    readinessReason: "",
    ...overrides,
  };
}

describe("classifyCurrentMarketRegime", () => {
  it("classifies current new-swap cross-section stress and risk-on regimes", () => {
    expect(classifyCurrentMarketRegime([
      signal({ token: "A", return24h: -0.04, return7d: -0.1 }),
      signal({ token: "B", return24h: -0.05, return7d: -0.09 }),
      signal({ token: "C", return24h: -0.03, return7d: -0.08 }),
      signal({ token: "D", return24h: -0.02, return7d: -0.07 }),
      signal({ token: "E", return24h: 0.01, return7d: -0.06 }),
    ])).toBe("ALT_NEW_SWAP_STRESS");

    expect(classifyCurrentMarketRegime([
      signal({ token: "A", return24h: 0.03, return7d: 0.08 }),
      signal({ token: "B", return24h: 0.04, return7d: 0.09 }),
      signal({ token: "C", return24h: 0.02, return7d: 0.07 }),
      signal({ token: "D", return24h: 0.05, return7d: 0.06 }),
      signal({ token: "E", return24h: -0.01, return7d: 0.05 }),
    ])).toBe("ALT_NEW_SWAP_RISK_ON");
  });
});

describe("estimateTradePlan", () => {
  it("blocks distribution-risk rows instead of producing a long plan", () => {
    const plan = estimateTradePlan(signal({
      contractState: "DISTRIBUTION_RISK_NO_LONG",
      cex24hDecision: "CEX_INFLOW_RISK",
      netCex24hValue: 5_000_000,
      setupScore: 40,
      riskScore: 100,
    }), "ALT_NEW_SWAP_MIXED", CALIBRATION, "2026-05-14T09:00:00.000Z");

    expect(plan.tradeDecision).toBe("NO_TRADE_RISK");
    expect(plan.tradeGate).toContain("blocked");
  });

  it("keeps a BLEND-like deleveraging reset as observe-only when confidence is low", () => {
    const plan = estimateTradePlan(signal({
      token: "BLEND",
      contractState: "DELEVERAGING_RESET_WATCH",
      setupScore: 50,
      riskScore: 41,
      squeezeScore: 8,
      confidence: "LOW",
      spreadBps: 16.65,
      volumeQuote24h: 3_486_892,
      oiUsd: 612_500,
      return24h: -0.0008,
      return7d: 0.0628,
      oiChange7d: -0.2777,
    }), "ALT_NEW_SWAP_MIXED", CALIBRATION, "2026-05-14T09:00:00.000Z");

    expect(plan.tradeDecision).toBe("OBSERVE_ONLY");
    expect(plan.holdHoursMin).toBe(24);
    expect(plan.executionStatus).toBe("EXECUTION_LIMIT_ONLY");
  });

  it("requires capacity and spread to pass before paper-watch status", () => {
    const blocked = estimateTradePlan(signal({ spreadBps: 45 }), "ALT_NEW_SWAP_RISK_ON", CALIBRATION, "2026-05-14T09:00:00.000Z");
    const paper = estimateTradePlan(signal({ spreadBps: 4 }), "ALT_NEW_SWAP_RISK_ON", CALIBRATION, "2026-05-14T09:00:00.000Z");

    expect(blocked.tradeDecision).toBe("BLOCKED_EXECUTION");
    expect(paper.tradeDecision).toBe("PAPER_TRADE_WATCH");
  });

  it("keeps non-EVM identity gaps explicit for Solana and Sui rows", () => {
    const sol = estimateTradePlan(signal({
      chain: "solana",
      discoveryStatus: "METADATA_REPAIR",
    }), "ALT_NEW_SWAP_MIXED", CALIBRATION, "2026-05-14T09:00:00.000Z");
    const sui = estimateTradePlan(signal({
      chain: "sui",
      discoveryStatus: "METADATA_REPAIR",
    }), "ALT_NEW_SWAP_MIXED", CALIBRATION, "2026-05-14T09:00:00.000Z");

    expect(sol.identityGap).toBe("SOLANA_METADATA_AND_ENTITY_GAP");
    expect(sui.identityGap).toBe("SUI_METADATA_AND_ENTITY_GAP");
  });
});
