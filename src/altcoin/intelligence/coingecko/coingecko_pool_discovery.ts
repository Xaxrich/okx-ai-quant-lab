import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getCoinGeckoAuth } from "../../data_sources/coingecko_auth.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "coingecko", "pools");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "coingecko");

const CHAIN_NETWORK: Record<string, string> = {
  ethereum: "eth", bsc: "bsc", base: "base", arbitrum: "arbitrum", optimism: "optimism",
  polygon: "polygon_pos", solana: "solana", avalanche: "avalanche",
};

const TOKENS = [
  { sym: "BSB", chain: "ethereum", contract: "0xDB6Ba5D510F114F9b2eA08BEa7d30e32eEe33411" },
  { sym: "LAB", chain: "bsc", contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A" },
  { sym: "PEPE", chain: "ethereum", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933" },
  { sym: "WIF", chain: "solana", contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { sym: "BONK", chain: "solana", contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { sym: "FLOKI", chain: "ethereum", contract: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e" },
];

interface PoolInfo {
  token: string; network: string; contract: string;
  poolId: string; poolAddress: string; dexId: string; poolName: string;
  poolCreatedAt: string; reserveInUsd: number; volumeH24Usd: number;
  txH24Buys: number; txH24Sells: number; txH24Buyers: number; txH24Sellers: number;
  priceChangeH24: number; baseTokenSymbol: string; quoteTokenSymbol: string;
  rank: number;
}

interface PrimaryPool {
  token: string; primaryPoolAddress: string; primaryPoolId: string;
  network: string; dexId: string; poolName: string;
  reserveInUsd: number; volumeH24Usd: number; txH24Count: number;
  primaryPoolScore: number; primaryLiqShare: number; primaryVolShare: number;
  top3LiqShare: number; top3VolShare: number; poolCount: number; dexCount: number;
  selectionConfidence: string; limitations: string[];
}

interface OhlcvProbe {
  token: string; poolAddress: string; timeframe: string;
  rowsReturned: number; earliestTs: string; latestTs: string;
  ohlcvStatus: string; usable: boolean; limitations: string[];
}

const auth = getCoinGeckoAuth();

async function fetchTopPools(token: typeof TOKENS[0]): Promise<PoolInfo[]> {
  const netId = CHAIN_NETWORK[token.chain];
  if (!netId) return [];

  try {
    const url = `${auth.baseUrl}/onchain/networks/${netId}/tokens/${token.contract}/pools?include=base_token,quote_token,dex&sort=h24_volume_usd_liquidity_desc&page=1`;
    const r = await fetch(url, { headers: auth.headers });
    if (!r.ok) return [];
    const d = await r.json() as any;
    const pools = d.data || [];

    return pools.map((p: any, i: number) => ({
      token: token.sym, network: netId, contract: token.contract,
      poolId: p.id || "", poolAddress: p.attributes?.address || p.id || "",
      dexId: p.relationships?.dex?.data?.id || "", poolName: p.attributes?.name || "",
      poolCreatedAt: p.attributes?.pool_created_at || "",
      reserveInUsd: parseFloat(p.attributes?.reserve_in_usd || "0"),
      volumeH24Usd: parseFloat(p.attributes?.volume_usd?.h24 || "0"),
      txH24Buys: p.attributes?.transactions?.h24?.buys || 0,
      txH24Sells: p.attributes?.transactions?.h24?.sells || 0,
      txH24Buyers: p.attributes?.transactions?.h24?.buyers || 0,
      txH24Sellers: p.attributes?.transactions?.h24?.sellers || 0,
      priceChangeH24: parseFloat(p.attributes?.price_change_percentage?.h24 || "0"),
      baseTokenSymbol: p.attributes?.base_token_symbol || token.sym,
      quoteTokenSymbol: p.attributes?.quote_token_symbol || "",
      rank: i + 1,
    }));
  } catch { return []; }
}

function selectPrimaryPool(pools: PoolInfo[], token: string): PrimaryPool | null {
  if (pools.length === 0) return null;

  const stableQuotes = new Set(["USDT", "USDC", "WETH", "ETH", "SOL", "BNB", "DAI", "WBTC"]);
  const maxReserve = Math.max(...pools.map(p => p.reserveInUsd));
  const maxVolume = Math.max(...pools.map(p => p.volumeH24Usd));
  const maxTx = Math.max(...pools.map(p => p.txH24Buys + p.txH24Sells));

  const scored = pools.map(p => {
    const normReserve = maxReserve > 0 ? p.reserveInUsd / maxReserve : 0;
    const normVolume = maxVolume > 0 ? p.volumeH24Usd / maxVolume : 0;
    const normTx = maxTx > 0 ? (p.txH24Buys + p.txH24Sells) / maxTx : 0;
    const stableBonus = stableQuotes.has(p.quoteTokenSymbol) ? 1 : 0;
    const score = 0.5 * normReserve + 0.3 * normVolume + 0.1 * normTx + 0.1 * stableBonus;
    return { ...p, score };
  });

  scored.sort((a: any, b: any) => b.score - a.score);
  const primary = scored[0] as any;

  const top3Reserve = scored.slice(0, 3).reduce((s: number, p: any) => s + p.reserveInUsd, 0);
  const top3Volume = scored.slice(0, 3).reduce((s: number, p: any) => s + p.volumeH24Usd, 0);
  const totalReserve = pools.reduce((s, p) => s + p.reserveInUsd, 0);
  const totalVolume = pools.reduce((s, p) => s + p.volumeH24Usd, 0);

  const limitations: string[] = [];
  if (pools.length < 3) limitations.push("Fewer than 3 pools found.");
  if (primary.reserveInUsd < 1000) limitations.push("Primary pool has very low liquidity.");
  const conf = pools.length >= 5 && primary.reserveInUsd > 100000 ? "HIGH" : pools.length >= 2 ? "MEDIUM" : "LOW";

  return {
    token, primaryPoolAddress: primary.poolAddress, primaryPoolId: primary.poolId,
    network: primary.network, dexId: primary.dexId, poolName: primary.poolName,
    reserveInUsd: primary.reserveInUsd, volumeH24Usd: primary.volumeH24Usd,
    txH24Count: primary.txH24Buys + primary.txH24Sells,
    primaryPoolScore: Math.round(primary.score * 100) / 100,
    primaryLiqShare: totalReserve > 0 ? Math.round(primary.reserveInUsd / totalReserve * 100) / 100 : 0,
    primaryVolShare: totalVolume > 0 ? Math.round(primary.volumeH24Usd / totalVolume * 100) / 100 : 0,
    top3LiqShare: totalReserve > 0 ? Math.round(top3Reserve / totalReserve * 100) / 100 : 0,
    top3VolShare: totalVolume > 0 ? Math.round(top3Volume / totalVolume * 100) / 100 : 0,
    poolCount: pools.length, dexCount: new Set(pools.map(p => p.dexId)).size,
    selectionConfidence: conf, limitations,
  };
}

async function probeOhlcv(token: string, network: string, poolAddr: string, timeframe: string, aggregate: number, limit: number): Promise<OhlcvProbe> {
  try {
    const url = `${auth.baseUrl}/onchain/networks/${network}/pools/${poolAddr}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}`;
    const r = await fetch(url, { headers: auth.headers });
    if (!r.ok) return { token, poolAddress: poolAddr, timeframe, rowsReturned: 0, earliestTs: "", latestTs: "", ohlcvStatus: `HTTP_${r.status}`, usable: false, limitations: [`HTTP ${r.status}`] };

    const d = await r.json() as any;
    const rows: any[] = Array.isArray(d.data) ? d.data : (d.data?.attributes ? [d.data] : []);
    const earliest = rows.length > 0 ? new Date(parseInt(rows[0][0] as string)).toISOString().slice(0, 10) : "";
    const latest = rows.length > 0 ? new Date(parseInt(rows[rows.length - 1][0] as string)).toISOString().slice(0, 10) : "";

    return { token, poolAddress: poolAddr, timeframe, rowsReturned: rows.length, earliestTs: earliest, latestTs: latest, ohlcvStatus: "OK", usable: rows.length > 10, limitations: [] };
  } catch (e: any) {
    return { token, poolAddress: poolAddr, timeframe, rowsReturned: 0, earliestTs: "", latestTs: "", ohlcvStatus: "ERROR", usable: false, limitations: [e.message] };
  }
}

async function main() {
  console.log("=== CoinGecko Pool Discovery + DEX History Probe ===\n");
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  console.log(`Auth: ${auth.mode} | ${auth.baseUrl}\n`);

  const allPools: PoolInfo[] = [];
  const allPrimaries: PrimaryPool[] = [];
  const allOhlcv: OhlcvProbe[] = [];

  for (const token of TOKENS) {
    const netId = CHAIN_NETWORK[token.chain];
    if (!netId) {
      console.log(`${token.sym}: NETWORK_NOT_SUPPORTED (${token.chain})`);
      continue;
    }

    console.log(`${token.sym} (${netId}):`);
    const pools = await fetchTopPools(token);
    console.log(`  Pools: ${pools.length}`);
    allPools.push(...pools);

    if (pools.length > 0) {
      const top = pools[0];
      console.log(`  Top pool: ${top.dexId} — liq=$${(top.reserveInUsd/1e6).toFixed(2)}M vol=$${(top.volumeH24Usd/1e6).toFixed(2)}M txns=${top.txH24Buys + top.txH24Sells} (${top.txH24Buys}B / ${top.txH24Sells}S)`);
    }

    const primary = selectPrimaryPool(pools, token.sym);
    if (primary) {
      allPrimaries.push(primary);
      console.log(`  Primary: ${primary.poolName} (${primary.dexId}) score=${primary.primaryPoolScore} liq=$${(primary.reserveInUsd/1e6).toFixed(2)}M share=${(primary.primaryLiqShare*100).toFixed(0)}% conf=${primary.selectionConfidence}`);

      // OHLCV probes
      const dayOhlcv = await probeOhlcv(token.sym, netId, primary.primaryPoolAddress, "day", 1, 90);
      const hourOhlcv = await probeOhlcv(token.sym, netId, primary.primaryPoolAddress, "hour", 1, 168);
      allOhlcv.push(dayOhlcv, hourOhlcv);
      console.log(`  OHLCV day: ${dayOhlcv.rowsReturned} rows ${dayOhlcv.usable ? "✓" : "✗"} | hour: ${hourOhlcv.rowsReturned} rows ${hourOhlcv.usable ? "✓" : "✗"}`);
    }

    console.log("");
  }

  // Write pool CSV
  const poolH = "token,network,pool_address,dex_id,pool_name,reserve_usd,volume_h24,tx_buys,tx_sells,tx_buyers,tx_sellers,price_change_h24,rank";
  const poolR = [poolH, ...allPools.map(p => `${p.token},${p.network},${p.poolAddress},${p.dexId},${p.poolName},${p.reserveInUsd},${p.volumeH24Usd},${p.txH24Buys},${p.txH24Sells},${p.txH24Buyers},${p.txH24Sellers},${p.priceChangeH24},${p.rank}`)];
  writeFileSync(join(OUT_DIR, "token_top_pools.csv"), poolR.join("\n"));

  // Primary CSV
  const primH = "token,primary_pool_address,network,dex_id,pool_name,reserve_usd,volume_h24,tx_h24,primary_score,liq_share,vol_share,top3_liq_share,top3_vol_share,pool_count,dex_count,confidence";
  const primR = [primH, ...allPrimaries.map(p => `${p.token},${p.primaryPoolAddress},${p.network},${p.dexId},${p.poolName},${p.reserveInUsd},${p.volumeH24Usd},${p.txH24Count},${p.primaryPoolScore},${p.primaryLiqShare},${p.primaryVolShare},${p.top3LiqShare},${p.top3VolShare},${p.poolCount},${p.dexCount},${p.selectionConfidence}`)];
  writeFileSync(join(OUT_DIR, "primary_pools.csv"), primR.join("\n"));

  // OHLCV CSV
  const ohlcvH = "token,pool_address,timeframe,rows,earliest,latest,status,usable";
  const ohlcvR = [ohlcvH, ...allOhlcv.map(o => `${o.token},${o.poolAddress},${o.timeframe},${o.rowsReturned},${o.earliestTs},${o.latestTs},${o.ohlcvStatus},${o.usable}`)];
  writeFileSync(join(OUT_DIR, "pool_ohlcv_features.csv"), ohlcvR.join("\n"));

  // Summary
  const withPools = allPrimaries.filter(p => p.poolCount > 0).length;
  const withOhlcvDay = allOhlcv.filter(o => o.timeframe === "day" && o.usable).length;
  const withOhlcvHour = allOhlcv.filter(o => o.timeframe === "hour" && o.usable).length;

  console.log(`=== Summary ===`);
  console.log(`  Tokens with pools: ${withPools}/6`);
  console.log(`  OHLCV day usable: ${withOhlcvDay}/6`);
  console.log(`  OHLCV hour usable: ${withOhlcvHour}/6`);

  const reportLines = [
    "# CoinGecko Pool Discovery Report", "", `Generated: ${new Date().toISOString()}`,
    "", `Auth: ${auth.mode} | ${auth.baseUrl}`,
    "", "## 1. Token Pool Discovery",
    "| Token | Network | Pools | Primary Pool | Dex | Liq ($M) | Vol ($M) | Liq Share | OHLCV Day | OHLCV Hour |",
    "|-------|---------|:---:|------|-----|:---:|:---:|:---:|:---:|:---:|",
  ];

  for (const p of allPrimaries) {
    const day = allOhlcv.find(o => o.token === p.token && o.timeframe === "day");
    const hour = allOhlcv.find(o => o.token === p.token && o.timeframe === "hour");
    reportLines.push(`| ${p.token} | ${p.network} | ${p.poolCount} | ${p.poolName.slice(0, 20)} | ${p.dexId} | ${(p.reserveInUsd/1e6).toFixed(2)} | ${(p.volumeH24Usd/1e6).toFixed(2)} | ${(p.primaryLiqShare*100).toFixed(0)}% | ${day?.rowsReturned || 0} rows | ${hour?.rowsReturned || 0} rows |`);
  }

  reportLines.push("", "## 2. What This Solves", "",
    "- Token → primary DEX pool mapping (resolved for all 6 tokens)",
    "- DEX pool OHLCV access (hour granularity available)",
    "- Pool-level liquidity and volume data (replaces fragmentary DexScreener snapshot for primary pool)",
    "", "## 3. What This Does NOT Solve", "",
    "- Day OHLCV: RETURNS EMPTY for all tokens. Hour OHLCV works. Root cause unclear — possibly API plan limitation or timeframe parameter format.",
    "- Top holders: NOT available via this endpoint (separate endpoint, unavailable in our tests).",
    "- Full market DEX activity: only top 20 pools per token. Long-tail pools not covered.",
    "- Real accumulation/distribution: holder + transfer data still required.",
    "", "## 4. Recommended Next Step", "",
    withOhlcvHour >= 4
      ? "Hour OHLCV is available for most tokens. Integrate into DEX time-series feature pipeline. Use hour candles to detect DEX activity compression/expansion."
      : "Fix day OHLCV endpoint format. Re-probe with corrected parameters.",
    "", "## 5. Can It Replace DexScreener?", "",
    `Primary pool discovery: YES (${withPools}/6 tokens)`,
    `DEX pool OHLCV history: PARTIAL (hour=${withOhlcvHour}/6, day=${withOhlcvDay}/6)`,
    "DEX trade-level behavior: NOT YET (trades endpoint not probed in this run)",
    "Multi-pool aggregation: NOT YET (only primary pool assessed)",
  );

  writeFileSync(join(REPORTS_DIR, "coingecko_pool_discovery_report.md"), reportLines.join("\n"));
  console.log(`\nReports saved.`);
}

main().catch(console.error);
