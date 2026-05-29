import { describe, expect, it } from "vitest";
import {
  isCryptoUsdtSwapInstrument,
  normalizePlatformToChain,
  scoreNewSwapCandidate,
  selectDexScreenerMetadata,
} from "../src/altcoin/intelligence/okx/okx_new_swap_discovery.js";

describe("isCryptoUsdtSwapInstrument", () => {
  it("keeps live crypto USDT swaps and excludes non-crypto derivatives", () => {
    expect(isCryptoUsdtSwapInstrument({ instId: "BSB-USDT-SWAP", state: "live", instCategory: "1" })).toBe(true);
    expect(isCryptoUsdtSwapInstrument({ instId: "COHR-USDT-SWAP", state: "live", instCategory: "3" })).toBe(false);
    expect(isCryptoUsdtSwapInstrument({ instId: "XPD-USDT-SWAP", state: "live", instCategory: "4" })).toBe(false);
    expect(isCryptoUsdtSwapInstrument({ instId: "BSB-USDT", state: "live", instCategory: "1" })).toBe(false);
  });
});

describe("normalizePlatformToChain", () => {
  it("maps common CMC EVM platform names to supported scan chains", () => {
    expect(normalizePlatformToChain("Ethereum")).toEqual({ primaryChain: "ethereum", scanChain: "eth" });
    expect(normalizePlatformToChain("BNB Smart Chain (BEP20)")).toEqual({ primaryChain: "bsc", scanChain: "bsc" });
    expect(normalizePlatformToChain("Arbitrum One")).toEqual({ primaryChain: "arbitrum", scanChain: "arbitrum" });
    expect(normalizePlatformToChain("Base")).toEqual({ primaryChain: "base", scanChain: "base" });
  });

  it("keeps non-EVM platforms out of the EVM scan path", () => {
    expect(normalizePlatformToChain("Solana")).toEqual({ primaryChain: "solana", scanChain: "" });
    expect(normalizePlatformToChain("Sui Network")).toEqual({ primaryChain: "sui", scanChain: "" });
  });
});

describe("scoreNewSwapCandidate", () => {
  it("promotes young, liquid, supported contracts", () => {
    const scored = scoreNewSwapCandidate({
      ageDays: 4,
      openInterestUsd: 120_000_000,
      fundingRate: 0.0001,
      maxLeverage: 50,
      hasContract: true,
      supportedChain: true,
    });

    expect(scored.priority).toBe("P0");
    expect(scored.opportunityScore).toBeGreaterThanOrEqual(45);
    expect(scored.tradabilityScore).toBeGreaterThanOrEqual(70);
    expect(scored.fragilityScore).toBeLessThanOrEqual(35);
  });

  it("penalizes unsupported or unresolved contract metadata", () => {
    const scored = scoreNewSwapCandidate({
      ageDays: 4,
      openInterestUsd: 120_000_000,
      fundingRate: 0.0012,
      maxLeverage: 50,
      hasContract: false,
      supportedChain: false,
    });

    expect(scored.priority).toBe("P1");
    expect(scored.fragilityScore).toBeGreaterThanOrEqual(30);
  });
});

describe("selectDexScreenerMetadata", () => {
  it("uses exact symbol, liquid quote pair, and maps supported EVM chain metadata", () => {
    const selected = selectDexScreenerMetadata("KITE", [
      {
        chainId: "ethereum",
        baseToken: { symbol: "KITE2", address: "0xwrong", name: "Wrong Kite" },
        quoteToken: { symbol: "USDT" },
        liquidity: { usd: 5_000_000 },
        volume: { h24: 1_000_000 },
      },
      {
        chainId: "base",
        baseToken: { symbol: "KITE", address: "0xabc", name: "Kite AI" },
        quoteToken: { symbol: "USDT" },
        liquidity: { usd: 250_000 },
        volume: { h24: 180_000 },
        txns: { h24: { buys: 90, sells: 70 } },
        priceUsd: "0.2",
      },
    ]);

    expect(selected).toEqual({
      source: "DEXSCREENER",
      name: "Kite AI",
      cmcId: "",
      primaryChain: "base",
      scanChain: "base",
      contractAddress: "0xabc",
    });
  });

  it("does not force an EVM clone over a stronger exact non-EVM market", () => {
    const selected = selectDexScreenerMetadata("PIPPIN", [
      {
        chainId: "base",
        baseToken: { symbol: "PIPPIN", address: "0xclone", name: "Pippin Clone" },
        quoteToken: { symbol: "WETH" },
        liquidity: { usd: 8_000 },
        volume: { h24: 4_000 },
        txns: { h24: { buys: 4, sells: 2 } },
      },
      {
        chainId: "solana",
        baseToken: { symbol: "PIPPIN", address: "So111pippin", name: "Pippin" },
        quoteToken: { symbol: "SOL" },
        liquidity: { usd: 2_000_000 },
        volume: { h24: 900_000 },
        txns: { h24: { buys: 400, sells: 380 } },
      },
    ]);

    expect(selected?.primaryChain).toBe("solana");
    expect(selected?.scanChain).toBe("");
    expect(selected?.contractAddress).toBe("So111pippin");
  });

  it("returns null for thin or non-exact search matches", () => {
    expect(selectDexScreenerMetadata("OPG", [
      {
        chainId: "bsc",
        baseToken: { symbol: "OPGX", address: "0xwrong", name: "OPG X" },
        quoteToken: { symbol: "USDT" },
        liquidity: { usd: 500_000 },
        volume: { h24: 200_000 },
      },
      {
        chainId: "bsc",
        baseToken: { symbol: "OPG", address: "0xthin", name: "OPG" },
        quoteToken: { symbol: "USDT" },
        liquidity: { usd: 10 },
        volume: { h24: 5 },
        txns: { h24: { buys: 0, sells: 0 } },
      },
    ])).toBeNull();
  });
});
