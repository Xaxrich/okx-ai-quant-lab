import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const FEATURES_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "features");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_v02");

type Label = "STRUCTURAL_RISK_HIGH" | "WATCH_RISK_HIGH" | "WATCH_RISK" | "WATCH" | "NEED_MORE_DATA" | "NO_CURRENT_FLAG";

interface DexTokenRow {
  token: string; pairCount: number; chainCount: number;
  totalDexLiquidityUsd: number; totalDexVolume24h: number;
  totalBuys24h: number; totalSells24h: number;
  tokenLevelBuySellRatio: number | null;
  primaryPairLiquidityUsd: number; primaryPairLiquidityShare: number;
  pairLevelTurnoverPrimary: number | null;
  tokenLevelDexTurnover: number | null;
  liquidityConcentrationScore: number | null;
  dexDataQualityScore: number;
}

interface SupplyScopeRow {
  token: string;
  cmc_circulating_supply: number | null; cmc_total_supply: number | null;
  single_chain_total_supply: number | null; multichain_total_supply_sum: number | null;
  canonical_total_supply_best_effort: number | null;
  supply_scope: string;
  circulating_to_single_chain_ratio: number | null;
  circulating_to_multichain_ratio: number | null;
  circulating_to_cmc_total_ratio: number | null;
  confidence: string; limitations: string;
}

interface TokenScore {
  token: string;
  label: Label;
  score: number;
  confidence: string;
  supplyScore: number; dexLiqScore: number; dexTurnoverScore: number; buySellScore: number;
  dataQualityScore: number;
  supplyScope: string;
  totalDexLiquidityUsd: number | null;
  tokenLevelDexTurnover: number | null;
  buySellRatio: number | null;
  triggeredRules: string[];
  limitations: string[];
}

function loadDexFeatures(): Map<string, DexTokenRow> {
  const map = new Map<string, DexTokenRow>();
  const path = join(FEATURES_DIR, "dex_token_level_features.csv");
  if (!existsSync(path)) return map;
  const lines = readFileSync(path, "utf-8").split("\n");
  const headers = lines[0].split(",");
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const r: any = {};
    headers.forEach((h, j) => { const v = vals[j]; const trimmed = v.trim(); r[h.trim()] = trimmed === "" ? null : (isNaN(+trimmed) ? trimmed : +trimmed); });
    map.set(r.token, r as DexTokenRow);
  }
  return map;
}

function loadSupplyScope(): Map<string, SupplyScopeRow> {
  const map = new Map<string, SupplyScopeRow>();
  const path = join(FEATURES_DIR, "supply_scope_summary.csv");
  if (!existsSync(path)) return map;
  const lines = readFileSync(path, "utf-8").split("\n");
  const headers = lines[0].split(",");
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const r: any = {};
    headers.forEach((h, j) => { const v = vals[j]; const trimmed = v.trim(); r[h.trim()] = trimmed === "" ? null : (isNaN(+trimmed) ? trimmed : +trimmed); });
    map.set(r.token, r as SupplyScopeRow);
  }
  return map;
}

function scoreToken(token: string, dex: DexTokenRow | undefined, supply: SupplyScopeRow | undefined): TokenScore {
  const limitations: string[] = [];
  const triggered: string[] = [];
  let supplyScore = 0, dexLiqScore = 0, dexTurnoverScore = 0, buySellScore = 0;
  let dataQuality = 0.1;

  // ── Supply scoring ──
  if (supply && supply.supply_scope !== "INSUFFICIENT_SUPPLY_SCOPE") {
    dataQuality += 0.3;
    let supplyMultiplier = 0;

    if (supply.supply_scope === "MULTICHAIN_AGGREGATED") supplyMultiplier = 1.0;
    else if (supply.supply_scope === "MULTICHAIN_PARTIAL") supplyMultiplier = 0.7;
    else if (supply.supply_scope === "SINGLE_CHAIN_ONLY") supplyMultiplier = 0.5;
    else if (supply.supply_scope === "CMC_ONLY") supplyMultiplier = 0.4;

    // Check ratios
    const ratios = [
      supply.circulating_to_cmc_total_ratio,
      supply.circulating_to_single_chain_ratio,
      supply.circulating_to_multichain_ratio,
    ].filter(r => r !== null && r !== undefined && r > 0) as number[];

    const minRatio = ratios.length > 0 ? Math.min(...ratios) : null;

    if (minRatio !== null && minRatio > 0 && minRatio < 0.3) {
      supplyScore = Math.round(20 * supplyMultiplier);
      triggered.push("SUPPLY_OVERHANG");
      limitations.push(`Supply overhang: circulating/total ratio ${(minRatio*100).toFixed(0)}%. Scope: ${supply.supply_scope}. Confidence: ${supply.confidence}. Requires unlock schedule + multi-chain verification.`);
    } else if (minRatio !== null && minRatio > 0 && minRatio < 0.5) {
      supplyScore = Math.round(10 * supplyMultiplier);
      triggered.push("SUPPLY_OVERHANG_MODERATE");
    }

    if (supply.confidence === "LOW_TO_MEDIUM") limitations.push(`Supply confidence LOW_TO_MEDIUM — multi-chain supply incomplete.`);
  } else {
    limitations.push(`Supply data unavailable — CMC ID may not be configured or on-chain fetch failed.`);
    dataQuality += 0.05;
  }

  // ── DEX scoring ──
  if (dex && dex.totalDexLiquidityUsd > 0) {
    dataQuality += 0.3;

    // Liquidity
    if (dex.totalDexLiquidityUsd < 50000) {
      dexLiqScore = 15;
      triggered.push("DEX_LIQUIDITY_CRITICAL");
      limitations.push(`Critical DEX liquidity: $${(dex.totalDexLiquidityUsd/1000).toFixed(0)}K total across ${dex.pairCount} pairs.`);
    } else if (dex.totalDexLiquidityUsd < 100000) {
      dexLiqScore = 10;
      triggered.push("DEX_LIQUIDITY_LOW");
      limitations.push(`Low DEX liquidity: $${(dex.totalDexLiquidityUsd/1000).toFixed(0)}K total.`);
    } else if (dex.totalDexLiquidityUsd < 1000000) {
      dexLiqScore = 3;
    }

    // Concentration
    if (dex.liquidityConcentrationScore !== null && dex.liquidityConcentrationScore > 0.8) {
      dexLiqScore += 5;
      limitations.push(`DEX liquidity concentrated in single pair (${(dex.liquidityConcentrationScore*100).toFixed(0)}% in primary).`);
    }

    // Turnover — CORRECT methodology: sum(vol) / sum(liq)
    if (dex.tokenLevelDexTurnover !== null) {
      if (dex.tokenLevelDexTurnover > 25) {
        dexTurnoverScore = 15;
        triggered.push("DEX_TURNOVER_EXTREME");
        limitations.push(`Extreme DEX turnover: ${dex.tokenLevelDexTurnover.toFixed(1)}x token-level (sum vol/sum liq). ${dex.totalBuys24h + dex.totalSells24h} txns/24h.`);
      } else if (dex.tokenLevelDexTurnover > 10) {
        dexTurnoverScore = 10;
        triggered.push("DEX_TURNOVER_HIGH");
      }
    }

    // Buy/sell
    if (dex.tokenLevelBuySellRatio !== null) {
      if (dex.tokenLevelBuySellRatio < 0.7) {
        buySellScore = 10;
        triggered.push("DEX_SELL_PRESSURE");
        limitations.push(`DEX sell pressure: buy/sell ratio ${dex.tokenLevelBuySellRatio.toFixed(2)}.`);
      } else if (dex.tokenLevelBuySellRatio > 1.5) {
        buySellScore = 5;
        triggered.push("DEX_BUY_PRESSURE");
      } else {
        // balanced
      }
    }

    // LAB-specific: high turnover + balanced = ambiguous
    if (dex.tokenLevelDexTurnover !== null && dex.tokenLevelDexTurnover > 20 &&
        dex.tokenLevelBuySellRatio !== null && dex.tokenLevelBuySellRatio > 0.8 && dex.tokenLevelBuySellRatio < 1.2) {
      limitations.push(`High DEX turnover (${dex.tokenLevelDexTurnover.toFixed(1)}x) with balanced buy/sell (${dex.tokenLevelBuySellRatio.toFixed(2)}). This could indicate: (a) active organic trading, (b) wash trading, or (c) bot activity. Cannot distinguish without additional data.`);
    }
  } else {
    dataQuality += 0.1;
    limitations.push(`No DEX pair data available.`);
  }

  // ── Data quality check ──
  if (dex && dex.pairCount < 3) {
    limitations.push(`Only ${dex.pairCount} DEX pairs found — limited DEX coverage.`);
  }

  // ── Total score ──
  const totalScore = supplyScore + dexLiqScore + dexTurnoverScore + buySellScore;

  // ── Label assignment ──
  let label: Label;
  let confidence = "MEDIUM";

  if (supply) confidence = supply.confidence === "LOW_TO_MEDIUM" ? "LOW_TO_MEDIUM" : supply.confidence;

  if (dataQuality < 0.3) {
    label = "NEED_MORE_DATA";
  } else if (totalScore >= 60 && confidence !== "LOW" && confidence !== "LOW_TO_MEDIUM") {
    label = "STRUCTURAL_RISK_HIGH";
  } else if (totalScore >= 40) {
    label = "WATCH_RISK_HIGH";
  } else if (totalScore >= 25) {
    label = "WATCH_RISK";
  } else if (totalScore >= 10) {
    label = "WATCH";
  } else {
    label = "NO_CURRENT_FLAG";
  }

  // Override: if supply scope is INSUFFICIENT and totalScore comes only from DEX
  if ((!supply || supply.supply_scope === "INSUFFICIENT_SUPPLY_SCOPE") && totalScore < 25) {
    label = "NEED_MORE_DATA";
    limitations.push("Supply data unavailable. Cannot assess structural supply risk. Only DEX metrics available.");
  }

  return {
    token, label, score: totalScore, confidence,
    supplyScore, dexLiqScore, dexTurnoverScore, buySellScore,
    dataQualityScore: Math.round(dataQuality * 100) / 100,
    supplyScope: supply?.supply_scope || "INSUFFICIENT_SUPPLY_SCOPE",
    totalDexLiquidityUsd: dex?.totalDexLiquidityUsd || null,
    tokenLevelDexTurnover: dex?.tokenLevelDexTurnover || null,
    buySellRatio: dex?.tokenLevelBuySellRatio || null,
    triggeredRules: triggered,
    limitations,
  };
}

async function main() {
  console.log("=== Token Scoring (Integrated) ===\n");
  if (!existsSync(FEATURES_DIR)) mkdirSync(FEATURES_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const dexMap = loadDexFeatures();
  const supplyMap = loadSupplyScope();
  console.log(`Loaded ${dexMap.size} DEX summaries, ${supplyMap.size} supply summaries\n`);

  const tokens = ["BSB", "LAB", "PEPE", "WIF", "BONK"];
  const scores: TokenScore[] = [];

  for (const token of tokens) {
    const s = scoreToken(token, dexMap.get(token), supplyMap.get(token));
    scores.push(s);

    const icon = s.label === "STRUCTURAL_RISK_HIGH" ? "🔴" : s.label === "WATCH_RISK_HIGH" ? "⚠️" : s.label === "WATCH_RISK" ? "⚡" : s.label === "WATCH" ? "👁" : s.label === "NO_CURRENT_FLAG" ? "—" : "?";
    console.log(`${icon} ${token}: [${s.label}] score=${s.score} | supply=${s.supplyScore} dexLiq=${s.dexLiqScore} dexTurn=${s.dexTurnoverScore} buySell=${s.buySellScore} | dq=${s.dataQualityScore}`);
    for (const l of s.limitations.slice(0, 2)) console.log(`  → ${l}`);
    console.log("");
  }

  // Write scores CSV
  const csvHeader = "token,label,score,confidence,supply_score,dex_liquidity_score,dex_turnover_score,buy_sell_score,data_quality_score,supply_scope,total_dex_liquidity_usd,token_level_dex_turnover,buy_sell_ratio,triggered_rules,limitations";
  const csvRows = [csvHeader];
  for (const s of scores) {
    csvRows.push(`${s.token},${s.label},${s.score},${s.confidence},${s.supplyScore},${s.dexLiqScore},${s.dexTurnoverScore},${s.buySellScore},${s.dataQualityScore},${s.supplyScope},${s.totalDexLiquidityUsd ?? ""},${s.tokenLevelDexTurnover ?? ""},${s.buySellRatio ?? ""},"${s.triggeredRules.join(";")}","${s.limitations.join(" | ")}"`);
  }
  writeFileSync(join(FEATURES_DIR, "scanner_v02_integrated_scores.csv"), csvRows.join("\n"));

  // Generate integrated report
  const reportLines = [
    "# Scanner v02 Integrated Report",
    "", `Generated: ${new Date().toISOString()}`,
    "", "## 1. What Changed",
    "", "- DEX aggregation (`dex_token_level_features.csv`) now used as primary DEX data source",
    "- Supply scope summary (`supply_scope_summary.csv`) now used for supply assessment",
    "- **Removed:** CMC DEX volume / single pair liquidity (invalid cross-source ratio)",
    "- **Removed:** OK label, AVOID_HIGH_RISK label",
    "- **Added:** STRUCTURAL_RISK_HIGH, WATCH_RISK_HIGH labels",
    "- **Added:** Supply confidence multiplier (MULTICHAIN_PARTIAL caps score at 0.7x)",
    "- **Added:** Token-level DEX turnover = sum(pair_vol) / sum(pair_liq)",
    "", "## 2. Final Token Scores",
    "", "| Token | Label | Score | Confidence | Supply | DEX Liq | DEX Turn | Buy/Sell | DQ | Main Reason |",
    "|-------|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|------|",
  ];

  for (const s of scores) {
    reportLines.push(`| ${s.token} | **${s.label}** | ${s.score} | ${s.confidence} | ${s.supplyScore} | ${s.dexLiqScore} | ${s.dexTurnoverScore} | ${s.buySellScore} | ${s.dataQualityScore} | ${s.limitations[0]?.slice(0, 80) || "—"} |`);
  }

  reportLines.push("");
  reportLines.push("## 3. Deprecated Metrics (Removed)");
  reportLines.push("");
  reportLines.push("| Metric | Why Removed |");
  reportLines.push("|--------|------------|");
  reportLines.push("| CMC DEX volume / single pair liquidity | Cross-source ratio — numerator and denominator from different aggregations. Replaced by token-level sum(vol)/sum(liq). |");
  reportLines.push("| OK label | Implied safety assessment. Replaced by NO_CURRENT_FLAG. |");
  reportLines.push("| AVOID_HIGH_RISK label | Trading-advice connotation. Replaced by STRUCTURAL_RISK_HIGH. |");
  reportLines.push("| 123x BSB DEX turnover | Based on invalid cross-source ratio. Correct value: 0.2x token-level. |");
  reportLines.push("");
  reportLines.push("## 4. Current Scanner Status");
  reportLines.push("");
  reportLines.push("**LIMITED_SNAPSHOT_SCANNER**");
  reportLines.push("");
  reportLines.push("- Supply: snapshot only (CMC + single-chain on-chain). No historical supply tracking.");
  reportLines.push("- DEX: snapshot only (DexScreener current pairs). No historical liquidity/volume trend.");
  reportLines.push("- N=5 tokens. Not statistically meaningful.");
  reportLines.push("- No on-chain holder/transfer data integrated.");
  reportLines.push("");
  reportLines.push("## 5. Next Step");
  reportLines.push("");
  reportLines.push("Integrated scores stable. Ready to expand to N=20-30 tokens after:");
  reportLines.push("1. Configure CMC IDs for LAB, PEPE, WIF, BONK");
  reportLines.push("2. Set up BaseScan/BscScan API for multi-chain supply verification");
  reportLines.push("3. Add CoinGecko price/volume history back for time-series features");

  writeFileSync(join(REPORTS_DIR, "scanner_v02_integrated_report.md"), reportLines.join("\n"));
  console.log(`Report: ${join(REPORTS_DIR, "scanner_v02_integrated_report.md")}`);
}

main().catch(console.error);
