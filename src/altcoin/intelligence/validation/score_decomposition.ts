import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const SCANNER_SCORE_PATH = join(ROOT, "data", "altcoin", "scanner_v02", "features", "scanner_v02_universe_scores.csv");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "validation");

export interface ScannerScoreRow {
  token: string;
  category: string;
  label: string;
  score: string;
  confidence: string;
  data_quality_score: string;
  supply_score: string;
  dex_liq_score: string;
  dex_turnover_score: string;
  buy_sell_score: string;
  relative_strength_score: string;
  total_dex_liquidity_usd: string;
  token_level_dex_turnover: string;
  buy_sell_ratio: string;
  triggered_rules: string;
  missing_required_data: string;
}

export interface ScoreDecomposition {
  token: string;
  category: string;
  source_score: number;
  opportunityScore: number;
  fragilityScore: number;
  tradabilityScore: number;
  opportunityTier: "HIGH" | "MEDIUM" | "LOW";
  fragilityTier: "HIGH" | "MEDIUM" | "LOW";
  tradabilityTier: "GOOD" | "LIMITED" | "POOR";
  stateMatrix: string;
  notes: string[];
}

function num(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function liquidityTradabilityPoints(liquidityUsd: number): number {
  if (liquidityUsd >= 10_000_000) return 50;
  if (liquidityUsd >= 1_000_000) return 40;
  if (liquidityUsd >= 500_000) return 30;
  if (liquidityUsd >= 100_000) return 20;
  if (liquidityUsd >= 50_000) return 10;
  return 0;
}

function tier(value: number, high: number, medium: number): "HIGH" | "MEDIUM" | "LOW" {
  if (value >= high) return "HIGH";
  if (value >= medium) return "MEDIUM";
  return "LOW";
}

function tradabilityTier(value: number): "GOOD" | "LIMITED" | "POOR" {
  if (value >= 70) return "GOOD";
  if (value >= 40) return "LIMITED";
  return "POOR";
}

export function decomposeScore(row: ScannerScoreRow): ScoreDecomposition {
  const sourceScore = num(row.score);
  const dataQuality = num(row.data_quality_score);
  const supplyScore = num(row.supply_score);
  const dexLiqScore = num(row.dex_liq_score);
  const dexTurnoverScore = num(row.dex_turnover_score);
  const sellPressureScore = num(row.buy_sell_score);
  const relativeStrengthScore = num(row.relative_strength_score);
  const liquidityUsd = num(row.total_dex_liquidity_usd);
  const turnover = num(row.token_level_dex_turnover);
  const buySellRatio = num(row.buy_sell_ratio);
  const missing = row.missing_required_data || "";
  const triggered = row.triggered_rules || "";
  const notes: string[] = [];

  const buyPressurePoints = buySellRatio >= 1.25 ? 20 : buySellRatio >= 1.05 ? 10 : 0;
  const turnoverOpportunityPoints = turnover >= 10 && turnover <= 35 ? 20 : turnover > 35 ? 10 : turnover >= 3 ? 8 : 0;
  const liquidityOpportunityPoints = liquidityUsd >= 500_000 ? 10 : liquidityUsd >= 100_000 ? 5 : 0;
  const opportunityScore = clamp(relativeStrengthScore + turnoverOpportunityPoints + buyPressurePoints + liquidityOpportunityPoints + dataQuality * 20);

  const missingPenalty = missing ? 15 : 0;
  const turnoverFragilityPoints = turnover > 35 ? 20 : turnover > 20 ? 12 : turnover > 10 ? 6 : 0;
  const fragilityScore = clamp(supplyScore + dexLiqScore + sellPressureScore + turnoverFragilityPoints + (1 - dataQuality) * 20 + missingPenalty);

  const dataQualityPoints = dataQuality * 30;
  const metadataPoints = missing.includes("contract_address") ? 0 : 10;
  const turnoverKnownPoints = row.token_level_dex_turnover ? 5 : 0;
  const buySellKnownPoints = row.buy_sell_ratio ? 5 : 0;
  const tradabilityPenalty = triggered.includes("DEX_LIQUIDITY_CRITICAL") ? 15 : triggered.includes("DEX_LIQUIDITY_LOW") ? 8 : 0;
  const tradabilityScore = clamp(liquidityTradabilityPoints(liquidityUsd) + dataQualityPoints + metadataPoints + turnoverKnownPoints + buySellKnownPoints - tradabilityPenalty);

  if (buyPressurePoints > 0) notes.push("BUY_PRESSURE");
  if (turnoverOpportunityPoints > 0) notes.push("DEX_TURNOVER_MOMENTUM");
  if (supplyScore > 0) notes.push("SUPPLY_OVERHANG_FRAGILITY");
  if (sellPressureScore > 0) notes.push("SELL_PRESSURE_FRAGILITY");
  if (tradabilityScore < 40) notes.push("POOR_TRADABILITY");
  if (missing) notes.push("MISSING_DATA");

  const opportunityTier = tier(opportunityScore, 70, 45);
  const fragilityTier = tier(fragilityScore, 60, 30);
  const tradTier = tradabilityTier(tradabilityScore);

  return {
    token: row.token,
    category: row.category,
    source_score: sourceScore,
    opportunityScore,
    fragilityScore,
    tradabilityScore,
    opportunityTier,
    fragilityTier,
    tradabilityTier: tradTier,
    stateMatrix: `${opportunityTier}_OPP__${fragilityTier}_FRAG__${tradTier}_TRAD`,
    notes,
  };
}

function rowsToObjects<T extends object>(path: string): T[] {
  const csv = readCsv(path);
  if (!csv) return [];
  return csv.rows.map((row) => {
    const out: Record<string, string> = {};
    csv.h.forEach((header, index) => {
      out[header] = row[index] || "";
    });
    return out as T;
  });
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const rows = rowsToObjects<ScannerScoreRow>(SCANNER_SCORE_PATH);
  const decomposed = rows.map(decomposeScore);
  const outPath = join(OUT_DIR, "score_decomposition_latest.csv");

  writeCsv(outPath, [
    ["token", "category", "source_score", "opportunity_score", "fragility_score", "tradability_score", "opportunity_tier", "fragility_tier", "tradability_tier", "state_matrix", "score_notes"],
    ...decomposed.map((row) => [row.token, row.category, row.source_score, row.opportunityScore, row.fragilityScore, row.tradabilityScore, row.opportunityTier, row.fragilityTier, row.tradabilityTier, row.stateMatrix, row.notes.join(";")]),
  ]);

  console.log("=== Score Decomposition ===");
  console.log(`Tokens: ${decomposed.length}`);
  console.log(`Output: ${outPath}`);
}

const isMain = process.argv[1]?.includes("score_decomposition");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
