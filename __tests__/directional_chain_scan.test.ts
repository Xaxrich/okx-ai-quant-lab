import { describe, expect, it } from "vitest";
import { decideDirectionalScan } from "../src/altcoin/intelligence/onchain/directional_chain_scan.js";

const base = {
  opportunityScore: 47,
  fragilityScore: 3,
  tradabilityScore: 76,
  entityCoverage: 0.5,
  holderDecision: "IDENTITY_RESOLVED",
  holderIdentityClass: "ARKHAM_MISC_RESOLVED",
  readinessDecision: "READY_FOR_DEEP_SCAN",
  cex1hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  cex4hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  cex24hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  netCex1hValue: -10,
  netCex4hValue: -20,
  netCex24hValue: -20,
};

describe("decideDirectionalScan", () => {
  it("routes clean opportunity candidates into long ambush", () => {
    const result = decideDirectionalScan(base);
    expect(result.primaryDirection).toBe("LONG_AMBUSH");
    expect(result.longBucket).toBe("LONG_AMBUSH");
    expect(result.shortBucket).toBe("NO_SHORT");
  });

  it("keeps short-window CEX inflow as short watch instead of long ambush", () => {
    const result = decideDirectionalScan({
      ...base,
      readinessDecision: "RISK_MONITOR_CEX_FLOW",
      cex1hDecision: "CEX_INFLOW_RISK",
      netCex1hValue: 100,
    });
    expect(result.primaryDirection).toBe("SHORT_WATCH");
    expect(result.longBucket).toBe("LONG_WATCH");
    expect(result.shortBucket).toBe("SHORT_WATCH");
  });

  it("routes persistent CEX inflow plus fragility into a short setup", () => {
    const result = decideDirectionalScan({
      ...base,
      fragilityScore: 22,
      readinessDecision: "RISK_MONITOR_CEX_FLOW",
      holderIdentityClass: "ARKHAM_CEX_RESOLVED",
      cex1hDecision: "CEX_INFLOW_RISK",
      cex4hDecision: "CEX_INFLOW_RISK",
      cex24hDecision: "CEX_INFLOW_RISK",
      netCex1hValue: 100,
      netCex4hValue: 100,
      netCex24hValue: 100,
    });
    expect(result.primaryDirection).toBe("SHORT_SETUP");
    expect(result.longBucket).toBe("NO_LONG");
    expect(result.shortBucket).toBe("SHORT_SETUP");
  });

  it("refuses directional interpretation when identity is unresolved", () => {
    const result = decideDirectionalScan({
      ...base,
      holderDecision: "HIGH_CONCENTRATION_UNRESOLVED",
      readinessDecision: "BLOCKED_HOLDER_IDENTITY",
    });
    expect(result.primaryDirection).toBe("DATA_REPAIR");
    expect(result.longBucket).toBe("NO_LONG");
    expect(result.shortBucket).toBe("NO_SHORT");
  });

  it("refuses directional interpretation when readiness is low confidence", () => {
    const result = decideDirectionalScan({
      ...base,
      readinessDecision: "LOW_CONFIDENCE_SCAN",
    });
    expect(result.primaryDirection).toBe("DATA_REPAIR");
  });
});
