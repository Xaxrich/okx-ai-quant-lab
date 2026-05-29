import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const CMC_KEY = process.env.COINMARKETCAP_API_KEY || "";
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || "";
const CG_PRO_KEY = process.env.COINGECKO_PRO_API_KEY || "";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "data_supply");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "data_supply");

interface TokenCapability {
  token: string;
  // CoinGecko
  has_coingecko_market_chart: boolean;
  has_coingecko_ohlc: boolean;
  has_coingecko_onchain_pools: boolean;
  cg_id: string;
  // CMC
  has_cmc_supply: boolean;
  cmc_id: string;
  // DexScreener
  has_dexscreener_pairs: boolean;
  dexscreener_pair_count: number;
  dexscreener_liquidity_usd: number;
  // Etherscan
  has_etherscan_holderlist: boolean;
  has_etherscan_tokentx: boolean;
  // OKX
  has_okx_spot: boolean;
  has_okx_swap: boolean;
  has_okx_funding: boolean;
  has_okx_open_interest: boolean;
  okx_inst_id: string;
  // Scores
  market_data_score: number;
  supply_data_score: number;
  dex_snapshot_score: number;
  dex_history_score: number;
  holder_score: number;
  transfer_flow_score: number;
  derivatives_score: number;
  social_score: number;
  overall_research_readiness_score: number;
  missing_data_layers: string[];
}

const TOKENS = [
  { sym: "BSB", cg: "block-street", cmc: "38889", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411" },
  { sym: "LAB", cg: "lab", cmc: "", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A" },
  { sym: "PEPE", cg: "pepe", cmc: "", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933" },
  { sym: "WIF", cg: "dogwifcoin", cmc: "", chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { sym: "BONK", cg: "bonk", cmc: "", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { sym: "FLOKI", cg: "floki", cmc: "", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e" },
];

async function probeCoinGecko(token: typeof TOKENS[0]): Promise<{ hasMarketChart: boolean; hasOhlc: boolean; hasOnchainPools: boolean }> {
  const base = CG_PRO_KEY ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
  const headers: Record<string, string> = CG_PRO_KEY ? { "x-cg-pro-api-key": CG_PRO_KEY } : {};

  // Market chart
  let hasMarketChart = false;
  try {
    const r = await fetch(`${base}/coins/${token.cg}/market_chart?vs_currency=usd&days=1`, { headers });
    hasMarketChart = r.ok;
  } catch {}

  // OHLC
  let hasOhlc = false;
  try {
    const r = await fetch(`${base}/coins/${token.cg}/ohlc?vs_currency=usd&days=1`, { headers });
    hasOhlc = r.ok;
  } catch {}

  // On-chain pools (CoinGecko Pro only)
  let hasOnchainPools = false;
  try {
    const r = await fetch(`${base}/onchain/networks?page=1`, { headers });
    hasOnchainPools = r.ok;
  } catch {}

  return { hasMarketChart, hasOhlc, hasOnchainPools };
}

async function probeCMC(cmcId: string): Promise<boolean> {
  if (!CMC_KEY || !cmcId) return false;
  try {
    const r = await fetch(`https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=${cmcId}`, {
      headers: { "X-CMC_PRO_API_KEY": CMC_KEY },
    });
    return r.ok;
  } catch { return false; }
}

async function probeDexScreener(contract: string): Promise<{ hasPairs: boolean; pairCount: number; liqUsd: number }> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contract}`);
    if (!r.ok) return { hasPairs: false, pairCount: 0, liqUsd: 0 };
    const d = await r.json() as any;
    const pairs = d.pairs || [];
    const liq = pairs.reduce((s: number, p: any) => s + (p.liquidity?.usd || 0), 0);
    return { hasPairs: pairs.length > 0, pairCount: pairs.length, liqUsd: liq };
  } catch { return { hasPairs: false, pairCount: 0, liqUsd: 0 }; }
}

async function probeEtherscan(contract: string): Promise<{ hasHolderlist: boolean; hasTokentx: boolean }> {
  if (!ETHERSCAN_KEY) return { hasHolderlist: false, hasTokentx: false };
  let hasHolderlist = false, hasTokentx = false;

  // Holder list
  try {
    const r = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=token&action=tokenholderlist&contractaddress=${contract}&page=1&offset=5&apikey=${ETHERSCAN_KEY}`);
    const d = await r.json() as any;
    hasHolderlist = d.status === "1" || d.message === "OK";
  } catch {}

  // Token transfers
  try {
    const r = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&contractaddress=${contract}&page=1&offset=5&apikey=${ETHERSCAN_KEY}`);
    const d = await r.json() as any;
    hasTokentx = d.status === "1" || d.message === "OK";
  } catch {}

  return { hasHolderlist, hasTokentx };
}

async function probeOKX(symbol: string): Promise<{ hasSpot: boolean; hasSwap: boolean; hasFunding: boolean; hasOI: boolean; instId: string }> {
  let instId = "";
  let hasSpot = false, hasSwap = false, hasFunding = false, hasOI = false;

  // Spot ticker
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}-USDT`);
    const d = await r.json() as any;
    if (d.code === "0" && d.data?.length > 0) { hasSpot = true; instId = `${symbol}-USDT`; }
  } catch {}

  // Swap
  try {
    const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${symbol}-USDT-SWAP`);
    const d = await r.json() as any;
    if (d.code === "0") hasSwap = true;
  } catch {}

  // Funding rate history
  if (hasSwap) {
    try {
      const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${symbol}-USDT-SWAP&limit=1`);
      const d = await r.json() as any;
      hasFunding = d.code === "0";
    } catch {}
  }

  // Open interest
  if (hasSwap) {
    try {
      const r = await fetch(`https://www.okx.com/api/v5/public/open-interest?instId=${symbol}-USDT-SWAP`);
      const d = await r.json() as any;
      hasOI = d.code === "0";
    } catch {}
  }

  return { hasSpot, hasSwap, hasFunding, hasOI, instId };
}

async function main() {
  console.log("=== API Capability Probe ===\n");
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const results: TokenCapability[] = [];

  for (const token of TOKENS) {
    console.log(`${token.sym}: probing...`);
    const cg = await probeCoinGecko(token);
    const cmcSupply = await probeCMC(token.cmc);
    const dex = await probeDexScreener(token.contract);
    const etherscan = token.chain === "ethereum" ? await probeEtherscan(token.contract) : { hasHolderlist: false, hasTokentx: false };
    const okx = await probeOKX(token.sym);

    // Scores
    const marketScore = cg.hasMarketChart ? 90 : cg.hasOhlc ? 85 : 40;
    const supplyScore = cmcSupply ? 75 : (token.cmc ? 50 : 20);
    const dexSnapshotScore = dex.hasPairs ? 80 : 30;
    const dexHistoryScore = cg.hasOnchainPools ? 50 : 10; // CoinGecko onchain available
    const holderScore = etherscan.hasHolderlist ? 60 : 10; // Snapshot OK, history needs own storage
    const transferScore = etherscan.hasTokentx ? 50 : 10; // Transfers OK, entity labels missing
    const derivativesScore = okx.hasSwap ? 80 : okx.hasSpot ? 20 : 0;
    const socialScore = 10; // No social API configured
    const overall = Math.round((marketScore + supplyScore + dexSnapshotScore + dexHistoryScore + holderScore + transferScore + derivativesScore + socialScore) / 8);

    const missing: string[] = [];
    if (!cg.hasMarketChart) missing.push("coingecko_market_chart");
    if (!cg.hasOnchainPools) missing.push("coingecko_onchain_pools (dex history)");
    if (!cmcSupply) missing.push("cmc_supply");
    if (!dex.hasPairs) missing.push("dexscreener_pairs");
    if (!etherscan.hasHolderlist) missing.push("etherscan_holderlist");
    if (!etherscan.hasTokentx) missing.push("etherscan_tokentx");
    if (!okx.hasSpot) missing.push("okx_spot");
    if (!okx.hasSwap) missing.push("okx_swap (derivatives)");
    if (socialScore < 30) missing.push("social_data");

    const cap: TokenCapability = {
      token: token.sym,
      has_coingecko_market_chart: cg.hasMarketChart,
      has_coingecko_ohlc: cg.hasOhlc,
      has_coingecko_onchain_pools: cg.hasOnchainPools,
      cg_id: token.cg,
      has_cmc_supply: cmcSupply,
      cmc_id: token.cmc,
      has_dexscreener_pairs: dex.hasPairs,
      dexscreener_pair_count: dex.pairCount,
      dexscreener_liquidity_usd: dex.liqUsd,
      has_etherscan_holderlist: etherscan.hasHolderlist,
      has_etherscan_tokentx: etherscan.hasTokentx,
      has_okx_spot: okx.hasSpot,
      has_okx_swap: okx.hasSwap,
      has_okx_funding: okx.hasFunding,
      has_okx_open_interest: okx.hasOI,
      okx_inst_id: okx.instId,
      market_data_score: marketScore,
      supply_data_score: supplyScore,
      dex_snapshot_score: dexSnapshotScore,
      dex_history_score: dexHistoryScore,
      holder_score: holderScore,
      transfer_flow_score: transferScore,
      derivatives_score: derivativesScore,
      social_score: socialScore,
      overall_research_readiness_score: overall,
      missing_data_layers: missing,
    };

    results.push(cap);
    console.log(`  OKX: spot=${okx.hasSpot} swap=${okx.hasSwap} | Etherscan: holder=${etherscan.hasHolderlist} tx=${etherscan.hasTokentx} | CG: chart=${cg.hasMarketChart} onchain=${cg.hasOnchainPools}`);
    console.log(`  DEX: ${dex.pairCount} pairs, $${(dex.liqUsd/1e6).toFixed(2)}M | Overall: ${overall}/100 | Missing: ${missing.slice(0, 3).join(", ")}`);
    console.log("");
  }

  // Write CSV
  const headers = ["token","market_data_score","supply_data_score","dex_snapshot_score","dex_history_score","holder_score","transfer_flow_score","derivatives_score","social_score","overall","has_okx_spot","has_okx_swap","has_okx_funding","has_okx_oi","has_etherscan_holderlist","has_etherscan_tokentx","has_coingecko_market_chart","has_coingecko_onchain_pools","has_cmc_supply","has_dexscreener_pairs","dexscreener_pair_count","missing_data_layers"];
  const csvRows = [headers.join(",")];
  for (const r of results) {
    csvRows.push(`${r.token},${r.market_data_score},${r.supply_data_score},${r.dex_snapshot_score},${r.dex_history_score},${r.holder_score},${r.transfer_flow_score},${r.derivatives_score},${r.social_score},${r.overall_research_readiness_score},${r.has_okx_spot},${r.has_okx_swap},${r.has_okx_funding},${r.has_okx_open_interest},${r.has_etherscan_holderlist},${r.has_etherscan_tokentx},${r.has_coingecko_market_chart},${r.has_coingecko_onchain_pools},${r.has_cmc_supply},${r.has_dexscreener_pairs},${r.dexscreener_pair_count},"${r.missing_data_layers.join("; ")}"`);
  }
  writeFileSync(join(OUT_DIR, "api_capability_probe.csv"), csvRows.join("\n"));

  // Summary
  const avgOverall = Math.round(results.reduce((s, r) => s + r.overall_research_readiness_score, 0) / results.length);
  const withDerivatives = results.filter(r => r.has_okx_swap).length;
  const withHolder = results.filter(r => r.has_etherscan_holderlist).length;
  console.log(`=== Summary ===`);
  console.log(`  Avg overall readiness: ${avgOverall}/100`);
  console.log(`  OKX derivatives available: ${withDerivatives}/${results.length}`);
  console.log(`  Etherscan holder list: ${withHolder}/${results.length}`);
  console.log(`  CoinGecko on-chain pools: ${results.filter(r => r.has_coingecko_onchain_pools).length}/${results.length}`);
  console.log(`\n  DATA_SUPPLY_INSUFFICIENT_FOR_ACCUMULATION_DISTRIBUTION: true (holder history missing)`);
  console.log(`  DERIVATIVES_LAYER_REQUIRED: true (${results.length - withDerivatives}/${results.length} tokens lack derivatives)`);
  console.log(`  DEX_HISTORY_LAYER_REQUIRED: true (on-chain pools not yet accessed)`);

  writeFileSync(join(OUT_DIR, "data_supply_scorecard.csv"), csvRows.join("\n"));
}

main().catch(console.error);
