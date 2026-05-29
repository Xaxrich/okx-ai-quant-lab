import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  chooseMarketRow,
  classifyEnrichmentStatus,
  marketCapBucket,
} from "../src/altcoin/intelligence/coingecko/coingecko_okx_universe_enrichment.js";

describe("CoinGecko OKX universe enrichment helpers", () => {
  it("prefers registry CoinGecko id when a symbol is ambiguous", () => {
    const result = chooseMarketRow("ABC", "abc-small", [
      { id: "abc-large", symbol: "abc", market_cap: 1_000_000_000 },
      { id: "abc-small", symbol: "abc", market_cap: 10_000_000 },
    ]);
    expect(result.row?.id).toBe("abc-small");
    expect(result.status).toBe("REGISTRY_MARKET_MATCH");
  });

  it("falls back to the largest exact-symbol market row", () => {
    const result = chooseMarketRow("ABC", undefined, [
      { id: "abc-small", symbol: "abc", market_cap: 10_000_000 },
      { id: "abc-large", symbol: "abc", market_cap: 1_000_000_000 },
    ]);
    expect(result.row?.id).toBe("abc-large");
    expect(result.status).toBe("SYMBOL_MARKET_MATCH");
  });

  it("classifies market-cap buckets using rank first", () => {
    expect(marketCapBucket(500_000_000, 12)).toBe("LARGE_CAP_TOP30");
    expect(marketCapBucket(5_000_000_000, null)).toBe("MID_LARGE_1B_10B");
    expect(marketCapBucket(null, null)).toBe("UNKNOWN_MCAP");
  });

  it("classifies enrichment readiness", () => {
    expect(classifyEnrichmentStatus(null, undefined)).toBe("UNRESOLVED");
    expect(classifyEnrichmentStatus({ id: "hype" }, undefined)).toBe("MARKET_ONLY");
    expect(classifyEnrichmentStatus({ id: "hype" }, { id: "hype", categories: [], assetPlatformId: "", platforms: {} })).toBe("MARKET_AND_DETAILS_READY");
  });
});

describe("package scripts", () => {
  it("includes the CoinGecko OKX universe command", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8"));
    expect(pkg.scripts["intelligence:coingecko:okx-universe"]).toBeDefined();
  });
});
