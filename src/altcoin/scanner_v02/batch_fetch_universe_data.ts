import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../utils/http.js";

const REGISTRY_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "registry");
const FEATURES_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "features");
const CACHE_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_v02", "cache");
const CMC_KEY = process.env.COINMARKETCAP_API_KEY || "";
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || "";

interface RegistryRow {
  symbol: string; name: string; category: string; coingecko_id: string; cmc_id: string;
  primary_chain: string; contract_address: string; is_multichain: string;
  dex_enabled: string; supply_enabled: string; manual_confirmation_required: string;
}

function loadRegistry(): RegistryRow[] {
  const p = join(REGISTRY_DIR, "token_metadata_registry.csv");
  const lines = readFileSync(p, "utf-8").split("\n");
  const headers = lines[0].split(",");
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const r: any = {};
    headers.forEach((h, j) => r[h.trim()] = vals[j]?.trim() || "");
    rows.push(r as RegistryRow);
  }
  return rows;
}

async function fetchDexPairs(contract: string): Promise<any | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${contract}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchCmcQuote(cmcId: string): Promise<any | null> {
  if (!CMC_KEY) return null;
  try {
    const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=${cmcId}`;
    const r = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": CMC_KEY } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchCgChart(cgId: string, days: number = 90): Promise<any | null> {
  try {
    const cachePath = join(CACHE_DIR, `${cgId}_${days}d.json`);
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, "utf-8"));
    }
    const url = `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=usd&days=${days}`;
    const r = await fetch(url);
    if (r.status === 429) { console.log(`    Rate limited, skipping ${cgId}`); return null; }
    if (!r.ok) return null;
    const data = await r.json();
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(data));
    return data;
  } catch { return null; }
}

async function main() {
  console.log("=== Batch Universe Data Fetcher ===\n");
  if (!existsSync(FEATURES_DIR)) mkdirSync(FEATURES_DIR, { recursive: true });
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const registry = loadRegistry();
  console.log(`Registry: ${registry.length} tokens\n`);

  // ── DEX Aggregation ──
  console.log("── DEX Pair Aggregation ──");
  const dexRows: string[][] = [["token","pair_count","total_dex_liquidity_usd","total_dex_volume_24h","total_buys_24h","total_sells_24h","token_level_buy_sell_ratio","token_level_dex_turnover","primary_pair_liquidity_share","dex_data_status","dex_limitations"]];
  let dexCoverage = 0;

  for (const reg of registry) {
    if (!reg.contract_address || reg.contract_address.length < 5) {
      const isNative = reg.symbol === "BTC" || reg.symbol === "ETH" || reg.symbol === "SOL" || reg.symbol === "DOGE" || reg.symbol === "TAO" || reg.symbol === "SEI" || reg.symbol === "SUI" || reg.symbol === "TIA";
      dexRows.push([reg.symbol, "0", "0", "0", "0", "0", "", "", "", isNative ? "NATIVE_ASSET_NO_DEX_REQUIRED" : "NO_CONTRACT", isNative ? "Native asset" : "No contract address"]);
      if (isNative) dexCoverage++;
      continue;
    }

    console.log(`  ${reg.symbol}: fetching DEX pairs...`);
    const dex = await fetchDexPairs(reg.contract_address);
    const pairs = dex?.pairs || [];

    if (pairs.length === 0) {
      dexRows.push([reg.symbol, "0", "0", "0", "0", "0", "", "", "", "DEX_PAIRS_NOT_FOUND", "No pairs found"]);
      continue;
    }

    const totalLiq = pairs.reduce((s: number, p: any) => s + (p.liquidity?.usd || 0), 0);
    const totalVol = pairs.reduce((s: number, p: any) => s + (p.volume?.h24 || 0), 0);
    const totalBuys = pairs.reduce((s: number, p: any) => s + (p.txns?.h24?.buys || 0), 0);
    const totalSells = pairs.reduce((s: number, p: any) => s + (p.txns?.h24?.sells || 0), 0);
    const bsRatio = totalSells > 0 ? totalBuys / totalSells : null;
    const turnover = totalLiq > 0 ? totalVol / totalLiq : null;
    const primaryShare = pairs[0]?.liquidity?.usd && totalLiq > 0 ? pairs[0].liquidity.usd / totalLiq : null;

    dexRows.push([
      reg.symbol, pairs.length.toString(), totalLiq.toFixed(0), totalVol.toFixed(0),
      totalBuys.toString(), totalSells.toString(),
      bsRatio?.toFixed(3) || "", turnover?.toFixed(2) || "",
      primaryShare?.toFixed(2) || "", "OK", ""
    ]);
    dexCoverage++;
    console.log(`    ${pairs.length} pairs, liq=$${(totalLiq/1e6).toFixed(2)}M, vol=$${(totalVol/1e6).toFixed(2)}M`);
  }
  writeFileSync(join(FEATURES_DIR, "dex_token_level_features_universe.csv"), dexRows.map(r => r.join(",")).join("\n"));
  console.log(`  DEX coverage: ${dexCoverage}/${registry.length}\n`);

  // ── Supply Scope (CMC quotes) ──
  console.log("── Supply Scope ──");
  const supplyRows: string[][] = [["token","cmc_circulating_supply","cmc_total_supply","onchain_total_supply","canonical_total_supply_best_effort","supply_scope","circulating_to_cmc_total_supply_ratio","circulating_to_onchain_supply_ratio","supply_confidence","supply_data_status","supply_limitations"]];
  let supplyCoverage = 0;

  for (const reg of registry) {
    if (!reg.cmc_id) {
      supplyRows.push([reg.symbol, "", "", "", "", "INSUFFICIENT_SUPPLY_SCOPE", "", "", "NONE", "NEED_MANUAL_CMC_ID", "CMC ID not resolved"]);
      continue;
    }

    const cmc = await fetchCmcQuote(reg.cmc_id);
    if (!cmc?.data) {
      supplyRows.push([reg.symbol, "", "", "", "", "CMC_ONLY", "", "", "LOW", "CMC_FETCH_FAILED", "CMC API returned no data"]);
      continue;
    }

    const tData = cmc.data[reg.cmc_id];
    const circSupply = tData?.circulating_supply || null;
    const totalSupply = tData?.total_supply || null;
    const circRatio = circSupply && totalSupply ? circSupply / totalSupply : null;

    let scope = "CMC_ONLY";
    if (reg.contract_address && reg.contract_address.length > 5) scope = "SINGLE_CHAIN_ONLY";
    if (reg.is_multichain === "true") scope = "MULTICHAIN_PARTIAL";
    const isNative = ["BTC", "ETH", "SOL", "DOGE", "TAO", "SEI", "SUI", "TIA"].includes(reg.symbol);
    if (isNative) scope = "NATIVE_ASSET_SUPPLY_MODEL";

    supplyRows.push([
      reg.symbol,
      circSupply?.toString() || "", totalSupply?.toString() || "",
      "", totalSupply?.toString() || "",
      scope,
      circRatio?.toFixed(4) || "",
      "",
      scope === "MULTICHAIN_PARTIAL" ? "LOW_TO_MEDIUM" : isNative ? "HIGH" : "MEDIUM",
      "OK", isNative ? "Native asset — supply model well-understood" : ""
    ]);
    supplyCoverage++;
    if (circRatio !== null) console.log(`  ${reg.symbol}: circ/total=${(circRatio*100).toFixed(0)}%`);
  }
  writeFileSync(join(FEATURES_DIR, "supply_scope_summary_universe.csv"), supplyRows.map(r => r.join(",")).join("\n"));
  console.log(`  Supply coverage: ${supplyCoverage}/${registry.length}\n`);

  // ── Price Features ──
  console.log("── Price-Volume Features (90d) ──");
  const priceRows: string[][] = [["token","cg_id","data_points","latest_price","return_1d","return_3d","return_7d","volume_zscore_7d","realized_volatility_7d","distance_to_7d_high","price_data_status"]];
  let priceCoverage = 0;

  for (const reg of registry) {
    if (!reg.coingecko_id) {
      priceRows.push([reg.symbol, "", "0", "", "", "", "", "", "", "", "NO_COINGECKO_ID"]);
      continue;
    }

    const cg = await fetchCgChart(reg.coingecko_id);
    if (!cg?.prices || cg.prices.length < 7) {
      priceRows.push([reg.symbol, reg.coingecko_id, cg?.prices?.length?.toString() || "0", "", "", "", "", "", "", "", "CG_FETCH_FAILED"]);
      continue;
    }

    const prices = cg.prices.map((p: number[]) => p[1]);
    const n = prices.length;
    const latest = prices[n - 1];
    const ret1d = n >= 2 ? (prices[n-1] - prices[n-2]) / prices[n-2] : 0;
    const ret3d = n >= 4 ? (prices[n-1] - prices[n-4]) / prices[n-4] : 0;
    const ret7d = n >= 8 ? (prices[n-1] - prices[n-8]) / prices[n-8] : 0;
    const volData = cg.total_volumes?.map((v: number[]) => v[1]) || [];
    const volRecent = volData.slice(-7);
    const volAvg = volRecent.reduce((a: number, b: number) => a + b, 0) / Math.max(volRecent.length, 1);
    const volAll = volData.slice(-30);
    const volAllAvg = volAll.reduce((a: number, b: number) => a + b, 0) / Math.max(volAll.length, 1);
    const volStd = Math.sqrt(volAll.reduce((s: number, v: number) => s + (v - volAllAvg) ** 2, 0) / Math.max(volAll.length, 1));
    const volZ7d = volStd > 0 ? (volAvg - volAllAvg) / volStd : 0;
    const rets: number[] = [];
    for (let i = Math.max(1, n-7); i < n; i++) rets.push(Math.log(prices[i] / prices[i-1]));
    const rv7d = rets.length > 0 ? Math.sqrt(rets.reduce((s, r) => s + r*r, 0) / rets.length) : 0;
    const high7d = Math.max(...prices.slice(-7));
    const dist7d = (latest - high7d) / high7d;

    priceRows.push([
      reg.symbol, reg.coingecko_id, n.toString(),
      latest.toFixed(8), ret1d.toFixed(4), ret3d.toFixed(4), ret7d.toFixed(4),
      volZ7d.toFixed(2), rv7d.toFixed(4), dist7d.toFixed(4), "OK"
    ]);
    priceCoverage++;
    console.log(`  ${reg.symbol}: ${n} data points, latest=$${latest.toFixed(4)}`);
  }
  writeFileSync(join(FEATURES_DIR, "price_volume_features_universe.csv"), priceRows.map(r => r.join(",")).join("\n"));
  console.log(`  Price coverage: ${priceCoverage}/${registry.length}\n`);

  console.log(`=== Complete ===`);
  console.log(`DEX: ${dexCoverage}/${registry.length} | Supply: ${supplyCoverage}/${registry.length} | Price: ${priceCoverage}/${registry.length}`);
}

main().catch(console.error);
