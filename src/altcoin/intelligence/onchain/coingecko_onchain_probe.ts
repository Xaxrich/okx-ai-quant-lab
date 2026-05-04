import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";
const CG_BASE = CG_KEY ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
const HEADERS: Record<string, string> = CG_KEY ? { "x-cg-pro-api-key": CG_KEY } : {};

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "onchain");

interface OnchainProbe {
  token: string; chain: string; networkId: string; contract: string;
  poolsFound: number; primaryPoolAddress: string;
  poolOhlcvHour: boolean; poolOhlcvDay: boolean; poolTrades: boolean;
  topHoldersAvailable: boolean; topHoldersCount: number;
  earliestOhlcvTs: string; latestOhlcvTs: string; rowsReturned: number;
  limitations: string[];
}

const TOKENS = [
  { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411" },
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e" },
  { sym: "PENDLE", chain: "ethereum", contract: "0x808507121b80c02388fad14726482e061b8da827" },
  { sym: "ONDO", chain: "ethereum", contract: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3" },
];

const CHAIN_NETWORK_MAP: Record<string, string> = {
  ethereum: "eth", bsc: "bsc", base: "base", arbitrum: "arbitrum", optimism: "optimism", polygon: "polygon_pos",
};

async function probeCoinGeckoOnchain(token: typeof TOKENS[0]): Promise<OnchainProbe> {
  const netId = CHAIN_NETWORK_MAP[token.chain] || token.chain;
  const result: OnchainProbe = {
    token: token.sym, chain: token.chain, networkId: netId, contract: token.contract,
    poolsFound: 0, primaryPoolAddress: "",
    poolOhlcvHour: false, poolOhlcvDay: false, poolTrades: false,
    topHoldersAvailable: false, topHoldersCount: 0,
    earliestOhlcvTs: "", latestOhlcvTs: "", rowsReturned: 0,
    limitations: [],
  };

  // 1. Search pools by token
  try {
    const poolR = await fetch(`${CG_BASE}/onchain/networks/${netId}/tokens/${token.contract}/pools`, { headers: HEADERS });
    if (poolR.ok) {
      const poolD = await poolR.json() as any;
      const pools = poolD.data || [];
      result.poolsFound = pools.length;
      if (pools.length > 0) result.primaryPoolAddress = pools[0]?.attributes?.address || pools[0]?.id || "";
    } else if (poolR.status === 404) {
      result.limitations.push("No pools found for this token on this network");
    }
  } catch { result.limitations.push("Pool search failed"); }

  // 2. Pool OHLCV (day)
  if (result.primaryPoolAddress) {
    try {
      const ohlcvR = await fetch(`${CG_BASE}/onchain/networks/${netId}/pools/${result.primaryPoolAddress}/ohlcv/day`, { headers: HEADERS });
      if (ohlcvR.ok) {
        const ohlcvD = await ohlcvR.json() as any;
        const rows = ohlcvD.data || [];
        result.poolOhlcvDay = rows.length > 0;
        result.rowsReturned = rows.length;
        if (rows.length > 0) {
          result.earliestOhlcvTs = new Date(parseInt(rows[0][0])).toISOString().slice(0, 10);
          result.latestOhlcvTs = new Date(parseInt(rows[rows.length - 1][0])).toISOString().slice(0, 10);
        }
      }
    } catch { result.limitations.push("Pool OHLCV day failed"); }

    // 3. Pool OHLCV (hour)
    try {
      const ohlcvHR = await fetch(`${CG_BASE}/onchain/networks/${netId}/pools/${result.primaryPoolAddress}/ohlcv/hour`, { headers: HEADERS });
      result.poolOhlcvHour = ohlcvHR.ok;
    } catch { result.limitations.push("Pool OHLCV hour failed"); }

    // 4. Pool trades
    try {
      const tradesR = await fetch(`${CG_BASE}/onchain/networks/${netId}/pools/${result.primaryPoolAddress}/trades`, { headers: HEADERS });
      result.poolTrades = tradesR.ok;
    } catch { result.limitations.push("Pool trades failed"); }
  }

  // 5. Top holders
  try {
    const holdersR = await fetch(`${CG_BASE}/onchain/networks/${netId}/tokens/${token.contract}/top_holders`, { headers: HEADERS });
    if (holdersR.ok) {
      const holdersD = await holdersR.json() as any;
      const holders = holdersD.data || [];
      result.topHoldersAvailable = holders.length > 0;
      result.topHoldersCount = holders.length;
    }
  } catch { result.limitations.push("Top holders unavailable"); }

  if (result.limitations.length === 0) result.limitations.push("All endpoints probed successfully");

  return result;
}

async function main() {
  console.log("=== CoinGecko Onchain Capability Probe ===\n");
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  if (!CG_KEY) { console.log("ERROR: COINGECKO_PRO_API_KEY not set. Onchain endpoints require Pro."); return; }

  const allResults: OnchainProbe[] = [];

  for (const token of TOKENS) {
    console.log(`${token.sym} (${token.chain}): probing onchain...`);
    const result = await probeCoinGeckoOnchain(token);
    allResults.push(result);

    console.log(`  Pools: ${result.poolsFound} | OHLCV day: ${result.poolOhlcvDay} | OHLCV hour: ${result.poolOhlcvHour} | Trades: ${result.poolTrades} | Top holders: ${result.topHoldersAvailable ? result.topHoldersCount + " holders" : "NO"}`);
    if (result.rowsReturned > 0) console.log(`  OHLCV range: ${result.earliestOhlcvTs} → ${result.latestOhlcvTs} (${result.rowsReturned} rows)`);
    if (result.limitations.length > 0) console.log(`  Limits: ${result.limitations.join("; ")}`);
    console.log("");
  }

  // Write CSV
  const csvH = "token,chain,network_id,pools_found,primary_pool,ohlcv_day,ohlcv_hour,trades,top_holders,top_holders_count,ohlcv_rows,earliest,latest";
  const csvR = [csvH];
  for (const r of allResults) {
    csvR.push(`${r.token},${r.chain},${r.networkId},${r.poolsFound},${r.primaryPoolAddress?.slice(0, 12) || ""},${r.poolOhlcvDay},${r.poolOhlcvHour},${r.poolTrades},${r.topHoldersAvailable},${r.topHoldersCount},${r.rowsReturned},${r.earliestOhlcvTs},${r.latestOhlcvTs}`);
  }
  writeFileSync(join(OUT_DIR, "coingecko_onchain_capability_probe.csv"), csvR.join("\n"));

  const withPools = allResults.filter(r => r.poolsFound > 0).length;
  const withOhlcv = allResults.filter(r => r.poolOhlcvDay).length;
  const withHolders = allResults.filter(r => r.topHoldersAvailable).length;

  console.log(`=== Summary ===`);
  console.log(`  Tokens with pools: ${withPools}/${TOKENS.length}`);
  console.log(`  Tokens with OHLCV day: ${withOhlcv}/${TOKENS.length}`);
  console.log(`  Tokens with top holders: ${withHolders}/${TOKENS.length}`);
  console.log(`  Can replace DexScreener snapshot: ${withOhlcv >= 4 ? "PARTIAL" : "NO"}`);
  console.log(`  Can provide DEX history: ${withOhlcv >= 3 ? "YES" : "NO"}`);
  console.log(`  Can provide top holders: ${withHolders >= 3 ? "YES" : "NO"}`);
}

main().catch(console.error);
