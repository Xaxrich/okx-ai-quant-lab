import { describe, expect, it } from "vitest";
import { decideShortExecutability } from "../src/altcoin/intelligence/onchain/short_executability_scan.js";

const base = {
  shortBucket: "SHORT_SETUP",
  swapAvailable: true,
  swapState: "live",
  maxLeverage: 50,
  spreadBps: 5,
  bidDepth1PctUsd: 100_000,
  okxOiUsd: 2_000_000,
  okxFundingRate: 0.00005,
  coinGlassTrend: "CROWDED_LONGS" as const,
  cgFundingPercent: 0.5,
  cgOiChange24hPct: 8,
};

describe("decideShortExecutability", () => {
  it("marks a liquid live swap with supportive CoinGlass trend as execution-ready", () => {
    const result = decideShortExecutability(base);
    expect(result.decision).toBe("SHORT_EXEC_READY");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("blocks tokens without a live OKX swap", () => {
    const result = decideShortExecutability({ ...base, swapAvailable: false, swapState: "" });
    expect(result.decision).toBe("BLOCKED_NO_SWAP");
  });

  it("blocks thin or wide books even when the thesis is short", () => {
    const result = decideShortExecutability({ ...base, spreadBps: 45, bidDepth1PctUsd: 5_000 });
    expect(result.decision).toBe("BLOCKED_THIN_BOOK");
  });

  it("keeps non-short candidates out of short execution checks", () => {
    const result = decideShortExecutability({ ...base, shortBucket: "NO_SHORT" });
    expect(result.decision).toBe("NOT_SHORT_CANDIDATE");
  });

  it("downgrades when CoinGlass trend argues against the short", () => {
    const result = decideShortExecutability({
      ...base,
      coinGlassTrend: "SHORT_CROWDED_OR_NEGATIVE_FUNDING",
      cgFundingPercent: -0.2,
      cgOiChange24hPct: 3,
    });
    expect(result.decision).toBe("SHORT_WATCH_ONLY");
    expect(result.blockers).toContain("COINGLASS_AGAINST_SHORT");
  });
});
