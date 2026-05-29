import { describe, expect, it } from "vitest";
import { classifyEntityKind, classifyTransferDirection, reviewDecision } from "../src/altcoin/intelligence/onchain/entity_flow_review.js";

describe("entity classification", () => {
  it("classifies major venue and protocol labels", () => {
    expect(classifyEntityKind("Binance", "")).toBe("CEX");
    expect(classifyEntityKind("", "Uniswap V3 Pool")).toBe("DEX");
    expect(classifyEntityKind("Stargate Finance", "Bridge")).toBe("BRIDGE");
    expect(classifyEntityKind("Wintermute", "")).toBe("FUND_OR_MM");
    expect(classifyEntityKind("Pendle Finance", "Voting Escrow")).toBe("PROJECT_OR_PROTOCOL");
    expect(classifyEntityKind("", "")).toBe("UNKNOWN");
  });

  it("classifies proxy transfer direction", () => {
    expect(classifyTransferDirection("UNKNOWN", "CEX")).toBe("TO_CEX_PROXY");
    expect(classifyTransferDirection("CEX", "UNKNOWN")).toBe("FROM_CEX_PROXY");
    expect(classifyTransferDirection("UNKNOWN", "DEX")).toBe("TO_DEX_POOL");
    expect(classifyTransferDirection("PROJECT_OR_PROTOCOL", "UNKNOWN")).toBe("BETWEEN_LABELED_ENTITIES");
  });
});

describe("reviewDecision", () => {
  const base = {
    transferStatus: "OK",
    transferRows: 100,
    entityLabelCoverage: 0.5,
    cexInCount: 0,
    cexOutCount: 0,
    fragilityScore: 10,
    opportunityScore: 45,
    tradabilityScore: 70,
    topHolderPctSupply: 10,
    topHolderEntity: "Known Treasury",
  };

  it("promotes usable entity flow", () => {
    expect(reviewDecision(base).decision).toBe("DEEPEN_ENTITY_FLOW");
  });

  it("flags dominant CEX inflow risk", () => {
    expect(reviewDecision({ ...base, cexInCount: 5, cexOutCount: 1 }).decision).toBe("WATCH_CEX_INFLOW_RISK");
  });

  it("requires enough label coverage", () => {
    expect(reviewDecision({ ...base, entityLabelCoverage: 0.1 }).decision).toBe("WATCH_LOW_CONFIDENCE");
  });

  it("promotes high unlabeled holder concentration to identity review", () => {
    expect(reviewDecision({ ...base, topHolderPctSupply: 40, topHolderEntity: "" }).decision).toBe("DEEPEN_HOLDER_IDENTITY_REVIEW");
  });
});
