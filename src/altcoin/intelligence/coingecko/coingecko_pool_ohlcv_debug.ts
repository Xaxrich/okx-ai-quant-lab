import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getCoinGeckoAuth } from "../../data_sources/coingecko_auth.js";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const auth = getCoinGeckoAuth();
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "coingecko", "pools");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "coingecko");

const CHAIN_NETWORK: Record<string, string> = {
  ethereum: "eth", bsc: "bsc", base: "base", arbitrum: "arbitrum", optimism: "optimism",
  polygon: "polygon_pos", solana: "solana", avalanche: "avalanche",
};

interface DebugRow {
  token: string; network: string; poolId: string; poolAddress: string;
  dexId: string; poolName: string; targetPosition: string;
  timeframe: string; aggregate: number; currency: string; tokenParam: string;
  includeEmptyIntervals: string;
  statusCode: number; responseStatus: string; rowsReturned: number;
  firstTs: string; lastTs: string; errorMessage: string;
  likelyFailureReason: string;
}

interface PoolInfo {
  poolAddress: string; poolId: string; dexId: string; poolName: string;
  reserveInUsd: number; volumeH24Usd: number; baseTokenSymbol: string; quoteTokenSymbol: string;
}

async function fetchPools(token: string, contract: string): Promise<PoolInfo[]> {
  const netId = "eth"; // Default, will be overridden per token
  // Use the previously saved top_pools.csv
  const csvPath = join(OUT_DIR, "token_top_pools.csv");
  if (!existsSync(csvPath)) return [];

  const lines = readFileSync(csvPath, "utf-8").split("\n").slice(1);
  return lines.filter(l => l.startsWith(token)).map(l => {
    const p = l.split(",");
    return {
      poolAddress: p[2], poolId: p[2], dexId: p[3], poolName: p[4],
      reserveInUsd: parseFloat(p[5]), volumeH24Usd: parseFloat(p[6]),
      baseTokenSymbol: "", quoteTokenSymbol: "",
    };
  });
}

import { readFileSync } from "fs";

const TOKENS = [
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", isBase: "LAB", isQuote: "USDT" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", isBase: "PEPE", isQuote: "WETH" },
  { sym: "WIF", chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", isBase: "WIF", isQuote: "SOL" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", isBase: "FLOKI", isQuote: "WETH" },
];

async function debugOhlcv(token: typeof TOKENS[0], pool: PoolInfo): Promise<DebugRow[]> {
  const netId = CHAIN_NETWORK[token.chain] || token.chain;
  const results: DebugRow[] = [];

  const configs = [
    { timeframe: "hour", aggregate: 1, limit: 24, tokenParam: "base", includeEmpty: "true" },
    { timeframe: "hour", aggregate: 1, limit: 24, tokenParam: "quote", includeEmpty: "true" },
    { timeframe: "hour", aggregate: 4, limit: 42, tokenParam: "base", includeEmpty: "false" },
    { timeframe: "minute", aggregate: 15, limit: 100, tokenParam: "base", includeEmpty: "false" },
    { timeframe: "day", aggregate: 1, limit: 30, tokenParam: "base", includeEmpty: "true" },
    { timeframe: "day", aggregate: 1, limit: 30, tokenParam: token.isBase, includeEmpty: "true" },
  ];

  for (const cfg of configs) {
    const url = `${auth.baseUrl}/onchain/networks/${netId}/pools/${pool.poolAddress}/ohlcv/${cfg.timeframe}?aggregate=${cfg.aggregate}&limit=${cfg.limit}&currency=usd&token=${cfg.tokenParam}&include_empty_intervals=${cfg.includeEmpty}`;
    let statusCode = 0, rowsReturned = 0, firstTs = "", lastTs = "", errMsg = "", respStatus = "";

    try {
      const r = await fetch(url, { headers: auth.headers });
      statusCode = r.status;
      const d = await r.json() as any;

      if (d.error) {
        errMsg = d.error || "";
        respStatus = "ERROR";
      } else {
        const ohlcvList = d?.data?.attributes?.ohlcv_list;
        const rows: any[] = Array.isArray(ohlcvList) ? ohlcvList : [];
        rowsReturned = rows.length;
        respStatus = "OK";
        if (rows.length > 0) {
          firstTs = new Date(parseInt(rows[0][0] as string) * 1000).toISOString().slice(0, 10);
          lastTs = new Date(parseInt(rows[rows.length - 1][0] as string) * 1000).toISOString().slice(0, 10);
        }
      }
    } catch (e: any) {
      errMsg = e.message;
      respStatus = "FETCH_ERROR";
    }

    let reason = "UNKNOWN_ERROR";
    if (rowsReturned > 0) reason = "OK";
    else if (statusCode === 404) reason = "POOL_NOT_TRACKED";
    else if (statusCode === 403 || statusCode === 402) reason = "PLAN_LIMITED";
    else if (errMsg && errMsg.includes("not found")) reason = "POOL_NOT_FOUND";
    else if (rowsReturned === 0 && respStatus === "OK") reason = "EMPTY_BUT_NO_ERROR";
    else if (statusCode === 400) reason = "BAD_REQUEST";

    results.push({
      token: token.sym, network: netId, poolId: pool.poolId, poolAddress: pool.poolAddress,
      dexId: pool.dexId, poolName: pool.poolName.slice(0, 30),
      targetPosition: cfg.tokenParam, timeframe: cfg.timeframe, aggregate: cfg.aggregate,
      currency: "usd", tokenParam: cfg.tokenParam, includeEmptyIntervals: cfg.includeEmpty,
      statusCode, responseStatus: respStatus, rowsReturned, firstTs, lastTs, errorMessage: errMsg.slice(0, 120),
      likelyFailureReason: reason,
    });
  }

  return results;
}

async function main() {
  console.log("=== CoinGecko Pool OHLCV Debug ===\n");
  console.log(`Auth: ${auth.mode} | ${auth.baseUrl}\n`);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  // Load pools from saved CSV
  const poolsCsv = readFileSync(join(OUT_DIR, "primary_pools.csv"), "utf-8").split("\n").slice(1);
  const primaryPools = new Map<string, { address: string; network: string }>();
  for (const line of poolsCsv) {
    const p = line.split(",");
    primaryPools.set(p[0], { address: p[1], network: p[2] });
  }

  const allResults: DebugRow[] = [];

  for (const token of TOKENS) {
    const primary = primaryPools.get(token.sym);
    if (!primary) { console.log(`${token.sym}: no primary pool in cache`); continue; }

    console.log(`${token.sym} (${CHAIN_NETWORK[token.chain]}): debug OHLCV for ${primary.address.slice(0, 14)}...`);
    const pool: PoolInfo = { poolAddress: primary.address, poolId: primary.address, dexId: "", poolName: "", reserveInUsd: 0, volumeH24Usd: 0, baseTokenSymbol: token.isBase, quoteTokenSymbol: token.isQuote };
    const results = await debugOhlcv(token, pool);
    allResults.push(...results);

    const anySuccess = results.filter(r => r.rowsReturned > 0);
    if (anySuccess.length > 0) {
      const best = anySuccess.sort((a, b) => b.rowsReturned - a.rowsReturned)[0];
      console.log(`  SUCCESS! ${best.timeframe}/${best.tokenParam}: ${best.rowsReturned} rows [${best.firstTs} → ${best.lastTs}]`);
    } else {
      // Diagnose
      const statuses = [...new Set(results.map(r => `${r.statusCode}:${r.likelyFailureReason}`))];
      console.log(`  ALL EMPTY. Statuses: ${statuses.join(", ")}`);
    }
    console.log("");
  }

  // Write debug CSV
  const csvH = "token,network,pool_address,timeframe,token_param,status_code,rows,first_ts,last_ts,likely_reason";
  const csvR = [csvH];
  for (const r of allResults) {
    csvR.push(`${r.token},${r.network},${r.poolAddress},${r.timeframe},${r.tokenParam},${r.statusCode},${r.rowsReturned},${r.firstTs},${r.lastTs},${r.likelyFailureReason}`);
  }
  writeFileSync(join(OUT_DIR, "pool_ohlcv_debug_results.csv"), csvR.join("\n"));

  const anySuccess = allResults.filter(r => r.rowsReturned > 0).length;
  const total = allResults.length;

  console.log(`=== Summary: ${anySuccess}/${total} requests returned data ===`);
  const reasons = new Map<string, number>();
  for (const r of allResults) { reasons.set(r.likelyFailureReason, (reasons.get(r.likelyFailureReason) || 0) + 1); }
  for (const [r, c] of reasons) console.log(`  ${r}: ${c}`);

  // Report
  const reportLines = [
    "# Pool OHLCV Debug Report", "", `Generated: ${new Date().toISOString()}`,
    `Auth: ${auth.mode} | ${auth.baseUrl}`,
    "", "## Results", "",
    `**${anySuccess}/${total} requests returned OHLCV data.**`,
    "", "## Failure Reasons", "",
  ];
  for (const [r, c] of reasons) reportLines.push(`- ${r}: ${c}`);
  reportLines.push("", "## Decision", "",
    anySuccess > 0 ? "**COINGECKO_POOL_OHLCV_USABLE** — data returned with correct parameters." : "**COINGECKO_POOL_OHLCV_NOT_USABLE** — all requests returned empty. Likely plan limitation or pool tracking gap.",
    "", "## Next Step", "",
    anySuccess > 0 ? "Integrate OHLCV into DEX time-series pipeline." : "Retain Top Pools + DexScreener snapshot. Prioritize OKX OI history.",
  );
  writeFileSync(join(REPORTS_DIR, "pool_ohlcv_debug_report.md"), reportLines.join("\n"));
  console.log(`\nReports saved.`);
}

main().catch(console.error);
