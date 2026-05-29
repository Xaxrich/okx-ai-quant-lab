import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../utils/http.js";

const FEATURES_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "features");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_v02");

interface DexPair {
  token: string; chain: string; pairAddress: string; dexId: string;
  priceUsd: string; liquidityUsd: number; volume24h: number;
  buys24h: number; sells24h: number; pairCreatedAt: number; pairAgeDays: number;
}

interface TokenDexSummary {
  token: string;
  pairCount: number; chainCount: number;
  totalDexLiquidityUsd: number; totalDexVolume24h: number;
  totalBuys24h: number; totalSells24h: number;
  tokenLevelBuySellRatio: number | null;
  primaryPairLiquidityUsd: number; primaryPairLiquidityShare: number;
  primaryPairVolume24h: number;
  pairLevelTurnoverPrimary: number | null;
  tokenLevelDexTurnover: number | null;
  liquidityConcentrationScore: number | null;
  cmcDexVolume: number | null;
  dexVolumeSourceMismatch: boolean;
  dexDataQualityScore: number;
  limitations: string[];
}

async function fetchDexPairs(contractAddress: string): Promise<any[]> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const d = await r.json() as any;
    return d.pairs || [];
  } catch {
    return [];
  }
}

async function main() {
  console.log("=== DEX Pair Aggregation ===\n");
  if (!existsSync(FEATURES_DIR)) mkdirSync(FEATURES_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const tokens = [
    { symbol: "BSB", contracts: ["0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411"] },
    { symbol: "LAB", contracts: ["0x7ec43Cf65F1663F820427C62A5780b8f2E25593A"] },
    { symbol: "PEPE", contracts: ["0x6982508145454ce325ddbe47a25d4ec3d2311933"] },
    { symbol: "WIF", contracts: ["EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"] },
    { symbol: "BONK", contracts: ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"] },
  ];

  const allPairs: DexPair[] = [];
  const summaries: TokenDexSummary[] = [];

  for (const token of tokens) {
    console.log(`${token.symbol}: fetching DEX pairs...`);
    let allTokenPairs: any[] = [];
    for (const contract of token.contracts) {
      const pairs = await fetchDexPairs(contract);
      allTokenPairs = allTokenPairs.concat(pairs);
    }

    console.log(`  Found ${allTokenPairs.length} pairs across ${new Set(allTokenPairs.map(p => p.chainId)).size} chains`);

    const parsedPairs: DexPair[] = allTokenPairs.map(p => ({
      token: token.symbol, chain: p.chainId || "unknown", pairAddress: p.pairAddress || "",
      dexId: p.dexId || "", priceUsd: p.priceUsd || "0",
      liquidityUsd: p.liquidity?.usd || 0, volume24h: p.volume?.h24 || 0,
      buys24h: p.txns?.h24?.buys || 0, sells24h: p.txns?.h24?.sells || 0,
      pairCreatedAt: p.pairCreatedAt || 0,
      pairAgeDays: p.pairCreatedAt ? Math.floor((Date.now() - p.pairCreatedAt) / 86400000) : 0,
    })).sort((a, b) => b.liquidityUsd - a.liquidityUsd);

    allPairs.push(...parsedPairs);

    const totalLiq = parsedPairs.reduce((s, p) => s + p.liquidityUsd, 0);
    const totalVol = parsedPairs.reduce((s, p) => s + p.volume24h, 0);
    const totalBuys = parsedPairs.reduce((s, p) => s + p.buys24h, 0);
    const totalSells = parsedPairs.reduce((s, p) => s + p.sells24h, 0);
    const primaryPair = parsedPairs[0];

    const summary: TokenDexSummary = {
      token: token.symbol,
      pairCount: parsedPairs.length,
      chainCount: new Set(parsedPairs.map(p => p.chain)).size,
      totalDexLiquidityUsd: totalLiq,
      totalDexVolume24h: totalVol,
      totalBuys24h: totalBuys,
      totalSells24h: totalSells,
      tokenLevelBuySellRatio: totalSells > 0 ? totalBuys / totalSells : null,
      primaryPairLiquidityUsd: primaryPair?.liquidityUsd || 0,
      primaryPairLiquidityShare: totalLiq > 0 ? (primaryPair?.liquidityUsd || 0) / totalLiq : 0,
      primaryPairVolume24h: primaryPair?.volume24h || 0,
      pairLevelTurnoverPrimary: primaryPair?.liquidityUsd > 0 ? (primaryPair?.volume24h || 0) / primaryPair.liquidityUsd : null,
      tokenLevelDexTurnover: totalLiq > 0 ? totalVol / totalLiq : null,
      liquidityConcentrationScore: totalLiq > 0 && primaryPair ? primaryPair.liquidityUsd / totalLiq : null,
      cmcDexVolume: null, // Will be filled from CMC data
      dexVolumeSourceMismatch: false,
      dexDataQualityScore: parsedPairs.length >= 3 ? 0.8 : parsedPairs.length >= 1 ? 0.5 : 0.1,
      limitations: [],
    };

    if (summary.liquidityConcentrationScore !== null && summary.liquidityConcentrationScore > 0.9) {
      summary.limitations.push("Liquidity highly concentrated in single pair — total DEX liquidity dominated by one pool.");
    }

    console.log(`  Total liq: $${(totalLiq/1e6).toFixed(2)}M | Total vol24: $${(totalVol/1e6).toFixed(2)}M`);
    console.log(`  Primary pair: ${primaryPair?.dexId} ${primaryPair?.chain} — liq=$${(primaryPair?.liquidityUsd/1e6).toFixed(2)}M (${(summary.primaryPairLiquidityShare*100).toFixed(0)}% share)`);
    console.log(`  Token-level turnover: ${summary.tokenLevelDexTurnover?.toFixed(1) || "N/A"}x | Primary turnover: ${summary.pairLevelTurnoverPrimary?.toFixed(1) || "N/A"}x`);
    console.log(`  Buy/sell: ${summary.tokenLevelBuySellRatio?.toFixed(2) || "N/A"} (${totalBuys} buys / ${totalSells} sells)`);
    console.log("");

    summaries.push(summary);
  }

  // Write pair-level CSV
  const pairHeader = "token,chain,pairAddress,dexId,priceUsd,liquidityUsd,volume24h,buys24h,sells24h,pairAgeDays";
  const pairRows = [pairHeader, ...allPairs.map(p =>
    `${p.token},${p.chain},${p.pairAddress},${p.dexId},${p.priceUsd},${p.liquidityUsd},${p.volume24h},${p.buys24h},${p.sells24h},${p.pairAgeDays}`
  )];
  writeFileSync(join(FEATURES_DIR, "dex_pair_level_features.csv"), pairRows.join("\n"));

  // Write token-level CSV
  const tokenHeader = "token,pairCount,chainCount,totalDexLiquidityUsd,totalDexVolume24h,totalBuys24h,totalSells24h,tokenLevelBuySellRatio,primaryPairLiquidityUsd,primaryPairLiquidityShare,primaryPairVolume24h,pairLevelTurnoverPrimary,tokenLevelDexTurnover,liquidityConcentrationScore,dexDataQualityScore";
  const tokenRows = [tokenHeader, ...summaries.map(s =>
    `${s.token},${s.pairCount},${s.chainCount},${s.totalDexLiquidityUsd},${s.totalDexVolume24h},${s.totalBuys24h},${s.totalSells24h},${s.tokenLevelBuySellRatio ?? ""},${s.primaryPairLiquidityUsd},${(s.primaryPairLiquidityShare*100).toFixed(1)}%,${s.primaryPairVolume24h},${s.pairLevelTurnoverPrimary ?? ""},${s.tokenLevelDexTurnover ?? ""},${s.liquidityConcentrationScore?.toFixed(2) ?? ""},${s.dexDataQualityScore}`
  )];
  writeFileSync(join(FEATURES_DIR, "dex_token_level_features.csv"), tokenRows.join("\n"));

  // Generate report
  const reportLines = [
    "# DEX Scope Reconciliation Report",
    "", `Generated: ${new Date().toISOString()}`,
    "", "## Token-Level DEX Summary",
    "", "| Token | Pairs | Chains | Total Liq | Total Vol 24h | Token Turnover | Primary Turnover | Buy/Sell | Liq Concentration |",
    "|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|",
  ];

  for (const s of summaries) {
    reportLines.push(`| ${s.token} | ${s.pairCount} | ${s.chainCount} | $${(s.totalDexLiquidityUsd/1e6).toFixed(2)}M | $${(s.totalDexVolume24h/1e6).toFixed(2)}M | ${s.tokenLevelDexTurnover?.toFixed(1) || "N/A"}x | ${s.pairLevelTurnoverPrimary?.toFixed(1) || "N/A"}x | ${s.tokenLevelBuySellRatio?.toFixed(2) || "N/A"} | ${(s.liquidityConcentrationScore!*100).toFixed(0)}% |`);
  }

  reportLines.push("", "## BSB: The $50K / 123x Turnover Question", "");
  const bsbSummary = summaries.find(s => s.token === "BSB");
  if (bsbSummary) {
    reportLines.push(`- **Original finding (v2):** DEX liquidity $50K, turnover 123x`);
    reportLines.push(`- **After pair aggregation:** ${bsbSummary.pairCount} pairs found, total liquidity $${(bsbSummary.totalDexLiquidityUsd/1e6).toFixed(2)}M`);
    reportLines.push(`- Primary pair liquidity: $${(bsbSummary.primaryPairLiquidityUsd/1000).toFixed(0)}K (${(bsbSummary.primaryPairLiquidityShare*100).toFixed(0)}% of total)`);
    reportLines.push(`- **Token-level turnover: ${bsbSummary.tokenLevelDexTurnover?.toFixed(1) || "N/A"}x** (using sum(vol)/sum(liq) — correct methodology)`);
    reportLines.push(`- Primary pair turnover: ${bsbSummary.pairLevelTurnoverPrimary?.toFixed(1) || "N/A"}x (using primary vol / primary liq)`);
    reportLines.push("");
    reportLines.push(`**Was the 123x turnover correct?**`);
    if (bsbSummary.tokenLevelDexTurnover !== null && bsbSummary.tokenLevelDexTurnover < 123) {
      reportLines.push(`No. Token-level turnover is ${bsbSummary.tokenLevelDexTurnover?.toFixed(1)}x — significantly lower than 123x. The original 123x used CMC DEX volume / single pair liquidity, which inflated the ratio.`);
    }
    if (bsbSummary.totalDexLiquidityUsd > 50000) {
      reportLines.push(`Total DEX liquidity is $${(bsbSummary.totalDexLiquidityUsd/1000).toFixed(0)}K — ${bsbSummary.pairCount > 1 ? "higher than" : "same as"} the $50K single-pair estimate.`);
    }
  }

  reportLines.push("", "## Methodology Changes", "");
  reportLines.push("| Metric | Old (v0.1/v2) | New (v02) |");
  reportLines.push("|--------|:---|:---|");
  reportLines.push("| DEX liquidity | Single top pair | Sum of all discovered pairs |");
  reportLines.push("| DEX volume | CMC DEX volume (aggregated by CMC) | Sum of all pair volumes from DexScreener |");
  reportLines.push("| DEX turnover | CMC vol / single pair liq (INVALID) | total_volume / total_liquidity (valid) |");
  reportLines.push("| Buy/sell ratio | Single pair | Token-level aggregation |");

  writeFileSync(join(REPORTS_DIR, "dex_scope_reconciliation_report.md"), reportLines.join("\n"));
  console.log(`Reports: ${REPORTS_DIR}`);
}

main().catch(console.error);
