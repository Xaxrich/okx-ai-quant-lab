import { describe, expect, it } from "vitest";
import { classifyContractOpportunity } from "../src/altcoin/intelligence/okx/okx_contract_opportunity_review.js";

const BASE = {
  discoveryStatus: "READY_EVM_CHAIN_SCAN",
  priority: "P1",
  opportunityScore: 42,
  fragilityScore: 0,
  tradabilityScore: 70,
  evidenceState: "SHALLOW_WATCH",
  readinessDecision: "BLOCKED_HOLDER_IDENTITY",
  holderDecision: "HIGH_CONCENTRATION_UNRESOLVED",
  holderDeltaDecision: "",
  entityDecision: "DEEPEN_HOLDER_IDENTITY_REVIEW",
  cex1hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  cex4hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  cex24hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  netCex24hValue: -100_000,
  return24h: 0.04,
  return7d: 0.12,
  oiChange7d: 0.2,
  fundingLatest: 0.0002,
  fundingZScore: 0.3,
  volumeAcceleration: 0.6,
  spreadBps: 4,
  dataQuality: 1,
};

describe("classifyContractOpportunity", () => {
  it("blocks long thesis when severe CEX inflow conflicts with otherwise strong scores", () => {
    const result = classifyContractOpportunity({
      ...BASE,
      priority: "P0",
      opportunityScore: 48,
      evidenceState: "EVIDENCE_CONFLICT",
      entityDecision: "WATCH_CEX_INFLOW_RISK",
      cex4hDecision: "CEX_INFLOW_RISK",
      cex24hDecision: "CEX_INFLOW_RISK",
      netCex24hValue: 38_000_000,
    });

    expect(result.state).toBe("DISTRIBUTION_RISK_NO_LONG");
    expect(result.riskScore).toBeGreaterThan(result.setupScore);
    expect(result.evidence).toContain("4h_or_24h_cex_inflow_risk");
  });

  it("keeps supportive flow as long watch when risk is not dominant", () => {
    const result = classifyContractOpportunity({
      ...BASE,
      return24h: 0.04,
      oiChange7d: 0.2,
    });

    expect(result.state).toBe("LONG_WATCH_NEEDS_CONFIRMATION");
    expect(result.setupScore).toBeGreaterThanOrEqual(58);
    expect(result.confidence).toBe("MEDIUM");
  });

  it("does not promote a sharp price breakdown with rising OI as a long watch", () => {
    const result = classifyContractOpportunity({
      ...BASE,
      evidenceState: "UNDER_MINED",
      readinessDecision: "READY_FOR_DEEP_SCAN",
      return24h: -0.18,
      oiChange7d: 0.2,
      netCex24hValue: -1_000_000,
    });

    expect(result.state).not.toBe("LONG_WATCH_NEEDS_CONFIRMATION");
    expect(result.evidence).toContain("price_breakdown_with_oi_rising");
  });

  it("separates deleveraging reset from direct long watch", () => {
    const result = classifyContractOpportunity({
      ...BASE,
      return24h: 0.01,
      oiChange7d: -0.12,
      fundingLatest: 0.00005,
    });

    expect(result.state).toBe("DELEVERAGING_RESET_WATCH");
    expect(result.nextAction).toContain("do not chase");
  });

  it("keeps a complete deleveraging reset watch when chain context is under-mined", () => {
    const result = classifyContractOpportunity({
      ...BASE,
      evidenceState: "UNDER_MINED",
      readinessDecision: "BLOCKED_HOLDER_IDENTITY",
      return24h: 0.01,
      oiChange7d: -0.12,
      fundingLatest: 0.00005,
    });

    expect(result.state).toBe("DELEVERAGING_RESET_WATCH");
    expect(result.confidence).toBe("LOW");
    expect(result.evidence).toContain("under_mined_chain_context");
  });

  it("promotes accumulation-like top-holder delta only as a confirmation watch", () => {
    const result = classifyContractOpportunity({
      ...BASE,
      readinessDecision: "READY_FOR_DEEP_SCAN",
      holderDeltaDecision: "TOP_HOLDER_ACCUMULATION_PROXY",
      return24h: 0.03,
      oiChange7d: 0.16,
    });

    expect(result.state).toBe("ACCUMULATION_WATCH_NEEDS_CONFIRMATION");
    expect(result.evidence).toContain("top_holder_accumulation_proxy");
  });

  it("does not rank sparse market history as a contract opportunity", () => {
    const result = classifyContractOpportunity({
      ...BASE,
      return24h: null,
      oiChange7d: null,
      dataQuality: 0,
    });

    expect(result.state).toBe("MARKET_DATA_GAP_NO_EDGE");
    expect(result.confidence).toBe("LOW");
    expect(result.evidence).toContain("market_history_insufficient");
  });

  it("keeps metadata-repair rows as market-only instead of on-chain opportunities", () => {
    const result = classifyContractOpportunity({
      ...BASE,
      discoveryStatus: "METADATA_REPAIR",
      evidenceState: "",
      readinessDecision: "",
      holderDecision: "",
      entityDecision: "",
      cex1hDecision: "",
      cex4hDecision: "",
      cex24hDecision: "",
      netCex24hValue: 0,
      oiChange7d: 0.25,
      return24h: 0.09,
    });

    expect(result.state).toBe("MARKET_ONLY_MOMENTUM_WATCH");
    expect(result.evidence).toContain("metadata_or_chain_missing");
  });
});
