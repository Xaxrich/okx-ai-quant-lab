import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../utils/http.js";

const DATA_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation_365d", "raw");
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || "";
const CMC_KEY = process.env.COINMARKETCAP_API_KEY || "";

interface TokenInfo {
  symbol: string;
  cmcId: number | null;
  contracts: { chain: string; address: string }[];
  isPositive: boolean;
  eventDate: string;
}

const TOKENS: TokenInfo[] = [
  { symbol: "BSB", cmcId: 38889, contracts: [{ chain: "ethereum", address: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411" }], isPositive: true, eventDate: "2026-04-25" },
  { symbol: "LAB", cmcId: null, contracts: [{ chain: "bsc", address: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A" }], isPositive: true, eventDate: "2026-04-23" },
  { symbol: "PEPE", cmcId: null, contracts: [{ chain: "ethereum", address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" }], isPositive: true, eventDate: "2025-12-28" },
  { symbol: "BONK", cmcId: null, contracts: [{ chain: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }], isPositive: true, eventDate: "2025-07-12" },
  { symbol: "WIF", cmcId: null, contracts: [{ chain: "solana", address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" }], isPositive: true, eventDate: "2025-12-30" },
];

async function fetchDexScreener(contractAddress: string): Promise<any> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

async function fetchCMCQuote(cmcId: number): Promise<any> {
  const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=${cmcId}`;
  const r = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": CMC_KEY } });
  if (!r.ok) return null;
  return r.json();
}

async function fetchEtherscanSupply(contractAddress: string): Promise<number | null> {
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=stats&action=tokensupply&contractaddress=${contractAddress}&apikey=${ETHERSCAN_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json() as any;
  if (d.status === "1" && d.result) {
    return parseFloat(d.result) / 1e18;
  }
  return null;
}

async function main() {
  console.log("=== Integrated Data Fetcher (Etherscan + CMC + DexScreener) ===\n");
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  for (const token of TOKENS) {
    const result: any = { symbol: token.symbol, fetched: new Date().toISOString(), dex: null, cmc: null, etherscan_supply: null };

    // DexScreener
    for (const c of token.contracts) {
      console.log(`DexScreener: ${token.symbol} (${c.chain}: ${c.address.slice(0, 10)}...)`);
      const dex = await fetchDexScreener(c.address);
      if (dex?.pairs) {
        const topPairs = dex.pairs.slice(0, 5).map((p: any) => ({
          dexId: p.dexId, chainId: p.chainId,
          liquidityUsd: p.liquidity?.usd || 0,
          volume24h: p.volume?.h24 || 0,
          buys24h: p.txns?.h24?.buys || 0,
          sells24h: p.txns?.h24?.sells || 0,
          priceUsd: p.priceUsd,
          pairCreatedAt: p.pairCreatedAt,
        }));
        result.dex = { chain: c.chain, pairs: topPairs };
        const topPair = topPairs[0];
        console.log(`  Top pair: ${topPair.dexId} | liq=$${(topPair.liquidityUsd/1e6).toFixed(1)}M | vol24=$${(topPair.volume24h/1e6).toFixed(1)}M | buys=${topPair.buys24h} sells=${topPair.sells24h}`);
      }
    }

    // CoinMarketCap
    if (token.cmcId) {
      console.log(`CMC: ${token.symbol} (id=${token.cmcId})`);
      const cmc = await fetchCMCQuote(token.cmcId);
      if (cmc?.data) {
        const tData = cmc.data[token.cmcId];
        result.cmc = {
          price: tData.quote?.USD?.price,
          marketCap: tData.quote?.USD?.market_cap,
          volume24h: tData.quote?.USD?.volume_24h,
          cexVolume: tData.quote?.USD?.cex_volume_24h,
          dexVolume: tData.quote?.USD?.dex_volume_24h,
          circulatingSupply: tData.circulating_supply,
          totalSupply: tData.total_supply,
          percentChange7d: tData.quote?.USD?.percent_change_7d,
          percentChange30d: tData.quote?.USD?.percent_change_30d,
        };
        console.log(`  Price: $${result.cmc.price} | MCap: $${(result.cmc.marketCap/1e6).toFixed(1)}M | Supply: ${(result.cmc.circulatingSupply/1e6).toFixed(1)}M`);
      }
    }

    // Etherscan total supply (Ethereum chain only)
    const ethContract = token.contracts.find(c => c.chain === "ethereum");
    if (ethContract) {
      console.log(`Etherscan: ${token.symbol} total supply`);
      const supply = await fetchEtherscanSupply(ethContract.address);
      if (supply !== null) {
        result.etherscan_supply = { totalSupplyOnChain: supply, contract: ethContract.address };
        console.log(`  On-chain total supply: ${(supply/1e6).toFixed(1)}M`);
      }
    }

    const path = join(DATA_DIR, `${token.symbol}_integrated.json`);
    writeFileSync(path, JSON.stringify(result, null, 2));
    console.log("");
  }

  console.log(`Data saved to ${DATA_DIR}`);
}

main().catch(console.error);
