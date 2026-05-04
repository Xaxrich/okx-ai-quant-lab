// DEPRECATED: This is the legacy integrated scanner. Use score_universe.ts instead.
// Run via: npm run scanner:v02:legacy-integrated
// The new main entry is: npm run scanner:v02 → score_universe.ts

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const INTEGRATED_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation_365d", "raw");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_v02");

// ── Allowed Labels ──
type ScannerLabel = "WATCH" | "WATCH_RISK" | "WATCH_RISK_HIGH" | "STRUCTURAL_RISK_HIGH" | "NEED_MORE_DATA" | "NO_CURRENT_FLAG" | "RESEARCH_ONLY";
const FORBIDDEN = new Set(["OK", "SAFE", "BUY", "SELL", "LONG", "SHORT", "AVOID_HIGH_RISK"]);

interface IntegratedData {
  symbol: string; fetched: string;
  dex: { chain: string; pairs: { dexId: string; liquidityUsd: number; volume24h: number; buys24h: number; sells24h: number; priceUsd: string; pairCreatedAt: number; }[] } | null;
  cmc: { price: number; marketCap: number; volume24h: number; cexVolume: number; dexVolume: number; circulatingSupply: number; totalSupply: number; } | null;
  etherscan_supply: { totalSupplyOnChain: number; contract: string } | null;
}

interface ScanResult {
  symbol: string;
  priceCmc: number | null; priceDex: number | null;
  cmcMarketCap: number | null;
  // Supply metrics (corrected naming)
  circulating_supply_cmc: number | null;
  total_supply_onchain: number | null;
  circulating_to_onchain_supply_ratio: number | null;
  non_circulating_supply_estimate: number | null;
  supply_scope: "SINGLE_CHAIN_ONLY" | "MULTICHAIN_AGGREGATED" | "CMC_ONLY" | "ONCHAIN_PARTIAL" | "INSUFFICIENT_SUPPLY_SCOPE";
  supply_scope_confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  supply_overhang_risk_score: number; // 0-100
  // Volume
  cexVolume24h: number | null; dexVolume24h: number | null;
  cexDexVolumeRatio: number | null;
  // DEX
  dexLiquidity: number | null;
  dexBuys24h: number | null; dexSells24h: number | null;
  dexBuySellRatio: number | null;
  dexTurnoverRatio: number | null;
  // Result
  triggeredRules: string[];
  score: number;
  label: ScannerLabel;
  reasons: string[];
  dataQuality: number;
}

function loadIntegratedData(): Map<string, IntegratedData> {
  const map = new Map<string, IntegratedData>();
  if (!existsSync(INTEGRATED_DIR)) return map;
  const files = readdirSync(INTEGRATED_DIR).filter((f: string) => f.endsWith("_integrated.json"));
  for (const file of files) {
    const symbol = file.replace("_integrated.json", "");
    const data = JSON.parse(readFileSync(join(INTEGRATED_DIR, file), "utf-8")) as IntegratedData;
    map.set(symbol, data);
  }
  return map;
}

function analyzeSupply(r: ScanResult): { score: number; reasons: string[]; scope: ScanResult["supply_scope"]; confidence: ScanResult["supply_scope_confidence"] } {
  let score = 0;
  const reasons: string[] = [];
  let scope: ScanResult["supply_scope"] = "INSUFFICIENT_SUPPLY_SCOPE";
  let confidence: ScanResult["supply_scope_confidence"] = "NONE";

  const hasCmcSupply = r.circulating_supply_cmc !== null;
  const hasOnchainSupply = r.total_supply_onchain !== null;

  if (hasCmcSupply && hasOnchainSupply) {
    // Both sources available
    r.circulating_to_onchain_supply_ratio = r.circulating_supply_cmc! / r.total_supply_onchain!;
    r.non_circulating_supply_estimate = r.total_supply_onchain! - r.circulating_supply_cmc!;

    // Determine scope
    scope = "SINGLE_CHAIN_ONLY";
    confidence = "MEDIUM";

    if (r.circulating_to_onchain_supply_ratio > 1.0) {
      // CMC reports MORE circulating than on-chain total — possible multi-chain or data issue
      scope = "ONCHAIN_PARTIAL";
      confidence = "LOW";
      reasons.push("CMC circulating supply exceeds single-chain on-chain total. Multi-chain token — supply_scope is ONCHAIN_PARTIAL. Circulating ratio may be overestimated.");
    }

    // Risk assessment
    if (r.circulating_to_onchain_supply_ratio < 0.3 && r.circulating_to_onchain_supply_ratio > 0) {
      score += 30;
      reasons.push(`Supply overhang: circulating supply is ${(r.circulating_to_onchain_supply_ratio * 100).toFixed(0)}% of on-chain total. Non-circulating supply estimate: ${(r.non_circulating_supply_estimate! / 1e6).toFixed(0)}M tokens. Large supply overhang. Requires unlock schedule, vesting records, and holder distribution data for confirmation.`);
    } else if (r.circulating_to_onchain_supply_ratio < 0.5 && r.circulating_to_onchain_supply_ratio > 0) {
      score += 15;
      reasons.push(`Moderate supply overhang: ${(r.circulating_to_onchain_supply_ratio * 100).toFixed(0)}% circulating.`);
    }
  } else if (hasCmcSupply) {
    scope = "CMC_ONLY";
    confidence = "LOW";
    reasons.push("CMC circulating supply available but no on-chain total supply to compare. Cannot assess supply overhang.");
  } else if (hasOnchainSupply) {
    scope = "ONCHAIN_PARTIAL";
    confidence = "LOW";
    reasons.push("On-chain supply available but no CMC circulating supply to compare. Cannot assess supply overhang.");
  } else {
    scope = "INSUFFICIENT_SUPPLY_SCOPE";
    confidence = "NONE";
    reasons.push("Insufficient supply data for assessment.");
  }

  r.supply_scope = scope;
  r.supply_scope_confidence = confidence;
  r.supply_overhang_risk_score = score > 0 ? Math.min(100, score + (confidence === "MEDIUM" ? 10 : 0)) : 0;

  return { score, reasons, scope, confidence };
}

function analyzeDex(r: ScanResult): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // DEX liquidity assessment
  if (r.dexLiquidity !== null) {
    if (r.dexLiquidity < 100000) {
      score += 15;
      reasons.push(`Low DEX liquidity: $${(r.dexLiquidity / 1000).toFixed(0)}K. Liquidity fragility risk. Note: only top DEX pair assessed. Multi-chain DEX pairs may provide additional liquidity.`);
    } else if (r.dexLiquidity < 1000000) {
      score += 5;
      reasons.push(`Moderate DEX liquidity: $${(r.dexLiquidity / 1e6).toFixed(1)}M.`);
    }
  }

  // DEX turnover — uses token-level: sum(pair_vol) / sum(pair_liq) from DexScreener aggregation
  if (r.dexLiquidity !== null && r.dexVolume24h !== null && r.dexLiquidity > 0) {
    r.dexTurnoverRatio = r.dexVolume24h / r.dexLiquidity;
    if (r.dexTurnoverRatio > 20) {
      score += 15;
      reasons.push(`Extreme DEX turnover: ${r.dexTurnoverRatio.toFixed(0)}x token-level liquidity in 24h. Note: turnover uses sum(pair_vol)/sum(pair_liq) across all discovered DEX pairs.`);
    } else if (r.dexTurnoverRatio > 5) {
      score += 5;
      reasons.push(`Elevated DEX turnover: ${r.dexTurnoverRatio.toFixed(0)}x token-level liquidity.`);
    }
  }

  // CEX/DEX ratio
  if (r.cexDexVolumeRatio !== null) {
    if (r.cexDexVolumeRatio > 10) {
      score += 10;
      reasons.push(`CEX-dominated volume: CEX ${r.cexDexVolumeRatio.toFixed(0)}x DEX. Note: CEX volume from CMC; DEX volume from CMC may aggregate all DEX pairs.`);
    }
  }

  return { score, reasons };
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║  Altcoin Scanner v02                 ║");
  console.log("║  Multi-source + Corrected Labels     ║");
  console.log("║  RESEARCH ONLY — No Trading          ║");
  console.log("╚══════════════════════════════════════╝\n");

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const integratedData = loadIntegratedData();
  console.log(`Loaded integrated data for ${integratedData.size} tokens\n`);

  const results: ScanResult[] = [];

  for (const [symbol, data] of integratedData) {
    const topDexPair = data.dex?.pairs?.[0];

    const result: ScanResult = {
      symbol,
      priceCmc: data.cmc?.price || null,
      priceDex: topDexPair ? parseFloat(topDexPair.priceUsd) : null,
      cmcMarketCap: data.cmc?.marketCap || null,
      circulating_supply_cmc: data.cmc?.circulatingSupply || null,
      total_supply_onchain: data.etherscan_supply?.totalSupplyOnChain || null,
      circulating_to_onchain_supply_ratio: null,
      non_circulating_supply_estimate: null,
      supply_scope: "INSUFFICIENT_SUPPLY_SCOPE",
      supply_scope_confidence: "NONE",
      supply_overhang_risk_score: 0,
      cexVolume24h: data.cmc?.cexVolume || null,
      dexVolume24h: data.cmc?.dexVolume || null,
      cexDexVolumeRatio: data.cmc?.dexVolume && data.cmc.dexVolume > 0 ? (data.cmc.cexVolume || 0) / data.cmc.dexVolume : null,
      dexLiquidity: topDexPair?.liquidityUsd || null,
      dexBuys24h: topDexPair?.buys24h || null,
      dexSells24h: topDexPair?.sells24h || null,
      dexBuySellRatio: topDexPair?.sells24h && topDexPair.sells24h > 0 ? topDexPair.buys24h / topDexPair.sells24h : null,
      dexTurnoverRatio: null,
      triggeredRules: [], score: 0,
      label: "NO_CURRENT_FLAG",
      reasons: [], dataQuality: 0,
    };

    // Data quality
    result.dataQuality = (data.cmc ? 0.4 : 0) + (data.etherscan_supply ? 0.2 : 0) + (data.dex ? 0.2 : 0);

    const supplyAnalysis = analyzeSupply(result);
    const dexAnalysis = analyzeDex(result);
    result.score = supplyAnalysis.score + dexAnalysis.score;
    result.reasons = [...supplyAnalysis.reasons, ...dexAnalysis.reasons];

    // Classify
    if (result.score >= 60) {
      result.label = "STRUCTURAL_RISK_HIGH";
      result.triggeredRules.push("SUPPLY_OVERHANG_RISK");
    } else if (result.score >= 30) {
      result.label = "WATCH_RISK";
      if (supplyAnalysis.score > 0) result.triggeredRules.push("SUPPLY_OVERHANG_WATCH");
      if (dexAnalysis.score > 0) result.triggeredRules.push("LIQUIDITY_FRAGILITY_WATCH");
    } else if (result.score > 0) {
      result.label = "WATCH";
      result.triggeredRules.push("MINOR_FLAGS");
    } else {
      result.label = "NO_CURRENT_FLAG";
    }

    if (result.dataQuality < 0.3) {
      result.label = "NEED_MORE_DATA";
      result.reasons.push("Data quality insufficient for reliable assessment.");
    }

    // Display
    const icon = result.label === "STRUCTURAL_RISK_HIGH" ? "🔴" : result.label === "WATCH_RISK" ? "⚠️" : result.label === "WATCH" ? "👁" : result.label === "NO_CURRENT_FLAG" ? "—" : "?";
    console.log(`${icon} ${symbol}: [${result.label}] score=${result.score}`);
    if (result.circulating_to_onchain_supply_ratio !== null) {
      console.log(`  Supply: circ/onchain=${(result.circulating_to_onchain_supply_ratio*100).toFixed(0)}% | scope=${result.supply_scope} | confidence=${result.supply_scope_confidence}`);
    }
    for (const r of result.reasons.slice(0, 3)) console.log(`  → ${r}`);
    console.log("");

    results.push(result);
  }

  // Report
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const reportLines: string[] = [
    "# Altcoin Scanner v02 Report", "", `Generated: ${new Date().toISOString()}`,
    "", "## Summary",
    `| Tokens scanned | ${results.length} |`,
    `| WATCH_RISK / AVOID_HIGH_RISK | ${results.filter(r => r.label === "WATCH_RISK" || r.label === "STRUCTURAL_RISK_HIGH").length} |`,
    `| WATCH | ${results.filter(r => r.label === "WATCH").length} |`,
    `| NO_CURRENT_FLAG | ${results.filter(r => r.label === "NO_CURRENT_FLAG").length} |`,
    `| NEED_MORE_DATA | ${results.filter(r => r.label === "NEED_MORE_DATA").length} |`,
    "", "## Supply Structure",
    "| Token | Circ/Onchain Ratio | Supply Scope | Confidence | Overhang Score |",
    "|-------|:---:|:---:|:---:|:---:|",
  ];
  for (const r of results) {
    const ratio = r.circulating_to_onchain_supply_ratio !== null ? `${(r.circulating_to_onchain_supply_ratio*100).toFixed(0)}%` : "N/A";
    reportLines.push(`| ${r.symbol} | ${ratio} | ${r.supply_scope} | ${r.supply_scope_confidence} | ${r.supply_overhang_risk_score} |`);
  }
  reportLines.push("", "## Results", "");
  for (const r of results.filter(r => r.label !== "NO_CURRENT_FLAG")) {
    reportLines.push(`### ${r.symbol} — ${r.label} (score: ${r.score})`);
    for (const reason of r.reasons) reportLines.push(`- ${reason}`);
    reportLines.push("");
  }
  reportLines.push("## Disclaimer", "", "RESEARCH ONLY. No trading advice. No BUY/SELL. Labels are risk indicators, not predictions.");
  writeFileSync(join(REPORTS_DIR, `scanner_v02_report_${dateStr}.md`), reportLines.join("\n"));
  console.log(`Report: reports/altcoin/scanner_v02/scanner_v02_report_${dateStr}.md`);
  console.log(`\nWATCH_RISK/AVOID: ${results.filter(r => r.label === "WATCH_RISK" || r.label === "STRUCTURAL_RISK_HIGH").length} | WATCH: ${results.filter(r => r.label === "WATCH").length} | NO_FLAG: ${results.filter(r => r.label === "NO_CURRENT_FLAG").length}`);
}

main().catch(console.error);
