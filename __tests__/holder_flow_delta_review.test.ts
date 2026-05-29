import { describe, expect, it } from "vitest";
import { classifyHolderFlowDelta } from "../src/altcoin/intelligence/onchain/holder_flow_delta_review.js";

const BASE = {
  topHolderPctSupply: 35,
  observedTransfers: 100,
  topHolderTransfers: 6,
  inboundCount: 6,
  outboundCount: 0,
  inboundValue: 500_000,
  outboundValue: 0,
  cexToTopCount: 1,
  topToCexCount: 0,
  cexToTopValue: 100_000,
  topToCexValue: 0,
  dexToTopCount: 1,
  topToDexCount: 0,
  unknownToTopCount: 4,
  topToUnknownCount: 0,
};

describe("classifyHolderFlowDelta", () => {
  it("flags top-holder net inflow without CEX/DEX outflow as accumulation proxy", () => {
    const result = classifyHolderFlowDelta(BASE);

    expect(result.decision).toBe("TOP_HOLDER_ACCUMULATION_PROXY");
    expect(result.accumulationPressure).toBeGreaterThan(result.distributionPressure);
    expect(result.confidence).toBe("HIGH");
  });

  it("overrides accumulation when the top holder sends tokens to CEX proxies", () => {
    const result = classifyHolderFlowDelta({
      ...BASE,
      inboundCount: 2,
      outboundCount: 3,
      inboundValue: 80_000,
      outboundValue: 240_000,
      cexToTopCount: 0,
      cexToTopValue: 0,
      topToCexCount: 2,
      topToCexValue: 200_000,
      topToUnknownCount: 1,
    });

    expect(result.decision).toBe("TOP_HOLDER_DISTRIBUTION_RISK");
    expect(result.distributionPressure).toBeGreaterThan(result.accumulationPressure);
  });

  it("separates inactive top holders from weak directional evidence", () => {
    const result = classifyHolderFlowDelta({
      ...BASE,
      topHolderTransfers: 0,
      inboundCount: 0,
      outboundCount: 0,
      inboundValue: 0,
      outboundValue: 0,
      cexToTopCount: 0,
      cexToTopValue: 0,
      dexToTopCount: 0,
      unknownToTopCount: 0,
    });

    expect(result.decision).toBe("NO_RECENT_TOP_HOLDER_FLOW");
    expect(result.confidence).toBe("LOW");
  });
});
