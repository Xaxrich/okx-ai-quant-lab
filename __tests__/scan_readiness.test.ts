import { describe, expect, it } from "vitest";
import { decideScanReadiness } from "../src/altcoin/intelligence/onchain/scan_readiness.js";

const base = {
  candidatePriority: "P0",
  opportunityScore: 47,
  tradabilityScore: 76,
  fragilityScore: 3,
  entityDecision: "DEEPEN_ENTITY_FLOW",
  entityCoverage: 0.5,
  holderDecision: "PROJECT_CONTRACT_LIKELY",
  shortWindowDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  mediumWindowDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  longWindowDecision: "CEX_OUTFLOW_OR_NEUTRAL",
};

describe("decideScanReadiness", () => {
  it("allows deep scan when holder and CEX flow checks pass", () => {
    const result = decideScanReadiness(base);
    expect(result.decision).toBe("READY_FOR_DEEP_SCAN");
    expect(result.scanStage).toBe("PROMOTE_DEEP_SCAN");
  });

  it("blocks unresolved high-concentration holders", () => {
    expect(decideScanReadiness({ ...base, holderDecision: "HIGH_CONCENTRATION_UNRESOLVED" }).decision).toBe("BLOCKED_HOLDER_IDENTITY");
  });

  it("allows unresolved holder to continue when holder delta is accumulation-like", () => {
    const result = decideScanReadiness({
      ...base,
      holderDecision: "HIGH_CONCENTRATION_UNRESOLVED",
      holderDeltaDecision: "TOP_HOLDER_ACCUMULATION_PROXY",
    });

    expect(result.decision).toBe("READY_FOR_DEEP_SCAN");
    expect(result.scanStage).toBe("PROMOTE_DEEP_SCAN");
    expect(result.reason).toContain("top-holder delta");
  });

  it("moves top-holder CEX distribution into risk monitor", () => {
    const result = decideScanReadiness({
      ...base,
      holderDeltaDecision: "TOP_HOLDER_DISTRIBUTION_RISK",
    });

    expect(result.decision).toBe("RISK_MONITOR_CEX_FLOW");
  });

  it("keeps short-term CEX inflow spikes in risk monitor", () => {
    expect(decideScanReadiness({ ...base, shortWindowDecision: "CEX_INFLOW_RISK" }).decision).toBe("RISK_MONITOR_CEX_FLOW");
  });

  it("does not interpret low label coverage as deep-scan ready", () => {
    const result = decideScanReadiness({ ...base, entityCoverage: 0.1 });
    expect(result.decision).toBe("LOW_CONFIDENCE_SCAN");
    expect(result.scanStage).toBe("BLOCK");
  });

  it("does not interpret partial CEX windows as deep-scan ready", () => {
    expect(decideScanReadiness({ ...base, longWindowDecision: "PARTIAL_WINDOW" }).decision).toBe("LOW_CONFIDENCE_SCAN");
  });

  it("does not let short-window low coverage override usable 4h and 24h windows", () => {
    expect(decideScanReadiness({ ...base, shortWindowDecision: "LOW_COVERAGE" }).decision).toBe("READY_FOR_DEEP_SCAN");
  });
});
