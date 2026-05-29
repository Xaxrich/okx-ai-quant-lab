import { describe, expect, it } from "vitest";
import { promotionHint } from "../src/altcoin/intelligence/onchain/light_chain_scan.js";

describe("promotionHint", () => {
  it("promotes strong scans with usable on-chain rows", () => {
    expect(promotionHint({
      scanStatus: "OK",
      opportunityScore: 45,
      transferEntityHits: 0,
      transferLabelHits: 1,
      holdersRows: 20,
      transfersRows: 20,
    })).toBe("PROMOTE_ENTITY_FLOW_REVIEW");
  });

  it("requires retry for failed scans", () => {
    expect(promotionHint({
      scanStatus: "FAILED",
      opportunityScore: 80,
      transferEntityHits: 10,
      transferLabelHits: 10,
      holdersRows: 20,
      transfersRows: 20,
    })).toBe("RETRY_REQUIRED");
  });
});
