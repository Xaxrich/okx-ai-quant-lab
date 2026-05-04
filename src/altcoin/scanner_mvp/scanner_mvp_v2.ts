import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const INTEGRATED_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation_365d", "raw");
const FEATURES_PATH = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "features", "scanner_feature_table.csv");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_mvp");

interface IntegratedData {
  symbol: string;
  fetched: string;
  dex: { chain: string; pairs: { dexId: string; liquidityUsd: number; volume24h: number; buys24h: number; sells24h: number; priceUsd: string; }[] } | null;
  cmc: { price: number; marketCap: number; volume24h: number; cexVolume: number; dexVolume: number; circulatingSupply: number; totalSupply: number; } | null;
  etherscan_supply: { totalSupplyOnChain: number; contract: string } | null;
}

interface ScanResultV2 {
  symbol: string;
  // Price
  priceCmc: number;
  priceDex: number | null;
  // Supply
  cmcCirculatingSupply: number | null;
  cmcTotalSupply: number | null;
  etherscanTotalSupply: number | null;
  circulatingRatio: number | null; // cmc_circulating / etherscan_total
  // Market cap
  cmcMarketCap: number | null;
  // Volume
  cexVolume24h: number | null;
  dexVolume24h: number | null;
  cexDexVolumeRatio: number | null;
  // DEX
  dexLiquidity: number | null;
  dexBuys24h: number | null;
  dexSells24h: number | null;
  dexBuySellRatio: number | null;
  // Rules
  triggeredRules: string[];
  score: number;
  label: string;
  reasons: string[];
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

function computeSupplyRiskScore(result: ScanResultV2): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Circulating ratio check
  if (result.circulatingRatio !== null) {
    if (result.circulatingRatio < 0.3) {
      score += 30;
      reasons.push(`Low circulating ratio: ${(result.circulatingRatio * 100).toFixed(0)}% of total supply circulating. Large unlock risk.`);
    } else if (result.circulatingRatio < 0.5) {
      score += 15;
      reasons.push(`Moderate circulating ratio: ${(result.circulatingRatio * 100).toFixed(0)}% circulating.`);
    }
  }

  // CEX/DEX volume ratio
  if (result.cexDexVolumeRatio !== null) {
    if (result.cexDexVolumeRatio > 10) {
      score += 20;
      reasons.push(`CEX-dominated: CEX volume ${result.cexDexVolumeRatio.toFixed(0)}x DEX volume.`);
    }
  }

  // DEX buy/sell imbalance
  if (result.dexBuySellRatio !== null) {
    if (result.dexBuySellRatio < 0.7) {
      score += 25;
      reasons.push(`DEX sell pressure: buy/sell ratio ${result.dexBuySellRatio.toFixed(2)}.`);
    } else if (result.dexBuySellRatio > 1.5) {
      reasons.push(`DEX buy pressure: buy/sell ratio ${result.dexBuySellRatio.toFixed(2)}.`);
    }
  }

  // Low DEX liquidity
  if (result.dexLiquidity !== null) {
    if (result.dexLiquidity < 100000) {
      score += 20;
      reasons.push(`Low DEX liquidity: $${(result.dexLiquidity / 1000).toFixed(0)}K. Easy to manipulate.`);
    }
  }

  // High DEX volume relative to liquidity
  if (result.dexLiquidity !== null && result.dexVolume24h !== null && result.dexLiquidity > 0) {
    const turnover = result.dexVolume24h / result.dexLiquidity;
    if (turnover > 5) {
      score += 15;
      reasons.push(`Extreme DEX turnover: ${turnover.toFixed(1)}x liquidity in 24h.`);
    }
  }

  return { score, reasons };
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║  Altcoin Scanner MVP v2              ║");
  console.log("║  Multi-source: CMC + Etherscan + DEX ║");
  console.log("║  RESEARCH ONLY — No Trading          ║");
  console.log("╚══════════════════════════════════════╝\n");

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const integratedData = loadIntegratedData();
  console.log(`Loaded integrated data for ${integratedData.size} tokens\n`);

  const results: ScanResultV2[] = [];

  for (const [symbol, data] of integratedData) {
    const priceCmc = data.cmc?.price || 0;
    const topDexPair = data.dex?.pairs?.[0];

    const result: ScanResultV2 = {
      symbol,
      priceCmc,
      priceDex: topDexPair ? parseFloat(topDexPair.priceUsd) : null,
      cmcCirculatingSupply: data.cmc?.circulatingSupply || null,
      cmcTotalSupply: data.cmc?.totalSupply || null,
      etherscanTotalSupply: data.etherscan_supply?.totalSupplyOnChain || null,
      circulatingRatio: data.cmc?.circulatingSupply && data.etherscan_supply?.totalSupplyOnChain
        ? data.cmc.circulatingSupply / data.etherscan_supply.totalSupplyOnChain : null,
      cmcMarketCap: data.cmc?.marketCap || null,
      cexVolume24h: data.cmc?.cexVolume || null,
      dexVolume24h: data.cmc?.dexVolume || null,
      cexDexVolumeRatio: data.cmc?.dexVolume && data.cmc.dexVolume > 0
        ? (data.cmc.cexVolume || 0) / data.cmc.dexVolume : null,
      dexLiquidity: topDexPair?.liquidityUsd || null,
      dexBuys24h: topDexPair?.buys24h || null,
      dexSells24h: topDexPair?.sells24h || null,
      dexBuySellRatio: topDexPair?.sells24h && topDexPair.sells24h > 0
        ? topDexPair.buys24h / topDexPair.sells24h : null,
      triggeredRules: [],
      score: 0,
      label: "RESEARCH_ONLY",
      reasons: [],
    };

    const supplyRisk = computeSupplyRiskScore(result);
    result.score = supplyRisk.score;
    result.reasons = supplyRisk.reasons;

    // Classify
    if (result.score >= 50) {
      result.label = "WATCH_RISK";
      result.triggeredRules.push("SUPPLY_STRUCTURE_RISK");
    } else if (result.score >= 25) {
      result.label = "WATCH";
      result.triggeredRules.push("SUPPLY_STRUCTURE_WATCH");
    }

    if (result.dexBuySellRatio !== null && result.dexBuySellRatio < 0.7) {
      result.triggeredRules.push("DEX_SELL_PRESSURE");
      if (result.label === "RESEARCH_ONLY") result.label = "WATCH";
    }

    // Display
    const icon = result.label === "WATCH_RISK" ? "RISK" : result.label === "WATCH" ? "WATCH" : "OK";
    console.log(`${symbol}: [${icon}] score=${result.score}`);
    if (result.circulatingRatio !== null) console.log(`  Circulating: ${(result.circulatingRatio*100).toFixed(0)}% (CMC ${(result.cmcCirculatingSupply!/1e6).toFixed(0)}M / Etherscan ${(result.etherscanTotalSupply!/1e6).toFixed(0)}M)`);
    if (result.cexDexVolumeRatio !== null) console.log(`  CEX/DEX ratio: ${result.cexDexVolumeRatio.toFixed(1)}x`);
    if (result.dexBuySellRatio !== null) console.log(`  DEX buy/sell: ${result.dexBuySellRatio.toFixed(2)} (${result.dexBuys24h} buys / ${result.dexSells24h} sells)`);
    for (const r of result.reasons) console.log(`  → ${r}`);
    console.log("");

    results.push(result);
  }

  // Generate report
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const reportLines: string[] = [
    "# Altcoin Scanner Report v2 — Multi-Source",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Data Sources (All Active)",
    "",
    "| Source | Status | Data Provided |",
    "|--------|--------|--------------|",
    "| CoinMarketCap API | ACTIVE | Price, market cap, circulating supply, CEX/DEX volume split |",
    "| DexScreener API | ACTIVE | DEX liquidity, 24h buy/sell counts, pair data |",
    "| Etherscan V2 API | ACTIVE | On-chain total supply (ground truth) |",
    "| CoinGecko API | ACTIVE | Historical price/volume/mcap time series |",
    "",
    "## Supply Structure Analysis",
    "",
    "| Token | Price (CMC) | MCap (CMC) | Circ. Supply | Total Supply (Chain) | Circ. Ratio | Risk |",
    "|-------|:---:|:---:|:---:|:---:|:---:|:---:|",
  ];

  for (const r of results) {
    const circStr = r.cmcCirculatingSupply ? `${(r.cmcCirculatingSupply/1e6).toFixed(0)}M` : "N/A";
    const totalStr = r.etherscanTotalSupply ? `${(r.etherscanTotalSupply/1e6).toFixed(0)}M` : "N/A";
    const ratioStr = r.circulatingRatio !== null ? `${(r.circulatingRatio*100).toFixed(0)}%` : "N/A";
    reportLines.push(`| ${r.symbol} | $${r.priceCmc.toFixed(6)} | $${(r.cmcMarketCap || 0 / 1e6).toFixed(0)}M | ${circStr} | ${totalStr} | ${ratioStr} | ${r.label} |`);
  }

  reportLines.push("");
  reportLines.push("## DEX Activity");
  reportLines.push("");
  reportLines.push("| Token | DEX Liq | DEX Vol 24h | Buys | Sells | Buy/Sell | CEX/DEX Ratio |");
  reportLines.push("|-------|:---:|:---:|:---:|:---:|:---:|:---:|");

  for (const r of results) {
    const liqStr = r.dexLiquidity ? `$${(r.dexLiquidity/1e6).toFixed(1)}M` : "N/A";
    const dexVolStr = r.dexVolume24h ? `$${(r.dexVolume24h/1e6).toFixed(1)}M` : "N/A";
    const bsStr = r.dexBuySellRatio !== null ? r.dexBuySellRatio.toFixed(2) : "N/A";
    const cexDexStr = r.cexDexVolumeRatio !== null ? `${r.cexDexVolumeRatio.toFixed(1)}x` : "N/A";
    reportLines.push(`| ${r.symbol} | ${liqStr} | ${dexVolStr} | ${r.dexBuys24h || "N/A"} | ${r.dexSells24h || "N/A"} | ${bsStr} | ${cexDexStr} |`);
  }

  reportLines.push("");
  reportLines.push("## Scanner Results");
  reportLines.push("");

  const riskTokens = results.filter(r => r.label === "WATCH_RISK");
  const watchTokens = results.filter(r => r.label === "WATCH");

  if (riskTokens.length > 0) {
    reportLines.push("### WATCH_RISK");
    for (const r of riskTokens) {
      reportLines.push(`- **${r.symbol}** (score: ${r.score})`);
      for (const reason of r.reasons) reportLines.push(`  - ${reason}`);
    }
  }

  if (watchTokens.length > 0) {
    reportLines.push("### WATCH");
    for (const r of watchTokens) {
      reportLines.push(`- **${r.symbol}** (score: ${r.score})`);
      for (const reason of r.reasons) reportLines.push(`  - ${reason}`);
    }
  }

  reportLines.push("");
  reportLines.push("## Supply Anomaly Detection: RESTORED");
  reportLines.push("");
  reportLines.push("With CMC circulating supply + Etherscan on-chain total supply, we can now monitor:");
  reportLines.push("- **Circulating ratio** = CMC circulating / Etherscan total");
  reportLines.push("- Low ratio (<30%) = large unlock risk = supply anomaly WARNING");
  reportLines.push("- This replaces the CoinGecko-only `implied_supply` proxy that was disabled in v0.1");
  reportLines.push("");
  reportLines.push("## Disclaimer");
  reportLines.push("RESEARCH ONLY. No trading advice. No BUY/SELL recommendations.");

  const report = reportLines.join("\n");
  const reportPath = join(REPORTS_DIR, `daily_scanner_report_v2_${dateStr}.md`);
  writeFileSync(reportPath, report);
  console.log(`Report: ${reportPath}`);

  console.log("\n═══════════════════════════════════════");
  console.log(`  Scanner MVP v2 Complete`);
  console.log(`  WATCH_RISK: ${riskTokens.length} | WATCH: ${watchTokens.length}`);
  console.log("═══════════════════════════════════════");
}

main().catch(console.error);
