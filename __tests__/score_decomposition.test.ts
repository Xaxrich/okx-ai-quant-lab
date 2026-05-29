import { describe, expect, it } from "vitest";
import { decomposeScore, liquidityTradabilityPoints, type ScannerScoreRow } from "../src/altcoin/intelligence/validation/score_decomposition.js";

function row(overrides: Partial<ScannerScoreRow>): ScannerScoreRow {
  return {
    token: "AAA",
    category: "meme",
    label: "WATCH",
    score: "0",
    confidence: "MEDIUM",
    data_quality_score: "1",
    supply_score: "0",
    dex_liq_score: "0",
    dex_turnover_score: "0",
    buy_sell_score: "0",
    relative_strength_score: "0",
    total_dex_liquidity_usd: "0",
    token_level_dex_turnover: "",
    buy_sell_ratio: "",
    triggered_rules: "",
    missing_required_data: "",
    ...overrides,
  };
}

describe("liquidityTradabilityPoints", () => {
  it("maps liquidity into execution tiers", () => {
    expect(liquidityTradabilityPoints(20_000_000)).toBe(50);
    expect(liquidityTradabilityPoints(2_000_000)).toBe(40);
    expect(liquidityTradabilityPoints(10_000)).toBe(0);
  });
});

describe("decomposeScore", () => {
  it("separates opportunity from fragility and tradability", () => {
    const split = decomposeScore(row({
      token: "LAB",
      score: "25",
      relative_strength_score: "20",
      token_level_dex_turnover: "26",
      buy_sell_ratio: "1.2",
      total_dex_liquidity_usd: "750000",
      supply_score: "10",
      dex_turnover_score: "15",
      triggered_rules: "SUPPLY_OVERHANG;DEX_TURNOVER_EXTREME",
    }));

    expect(split.opportunityScore).toBeGreaterThan(split.fragilityScore);
    expect(split.tradabilityScore).toBeGreaterThanOrEqual(60);
    expect(split.notes).toContain("DEX_TURNOVER_MOMENTUM");
    expect(split.notes).toContain("SUPPLY_OVERHANG_FRAGILITY");
  });

  it("penalizes missing data and critical liquidity", () => {
    const split = decomposeScore(row({
      token: "FET",
      score: "15",
      data_quality_score: "0.5",
      dex_liq_score: "15",
      total_dex_liquidity_usd: "10000",
      triggered_rules: "DEX_LIQUIDITY_CRITICAL",
      missing_required_data: "dex_data",
    }));

    expect(split.fragilityScore).toBeGreaterThanOrEqual(40);
    expect(split.tradabilityTier).toBe("POOR");
    expect(split.notes).toContain("POOR_TRADABILITY");
    expect(split.notes).toContain("MISSING_DATA");
  });
});
