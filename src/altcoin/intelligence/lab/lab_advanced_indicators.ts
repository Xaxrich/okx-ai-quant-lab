import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const INTEL_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const CG_API = process.env.COINGLASS_API_KEY || "";
const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";

// ── Exchange OI ──
async function fetchExchangeOI(): Promise<any[]> {
  if (!CG_API) return [];
  const r = await fetch("https://open-api-v4.coinglass.com/api/futures/open-interest/exchange-list?symbol=LAB", { headers: { "CG-API-KEY": CG_API } });
  const data = await r.json();
  return data?.data || [];
}

// ── DEX pool activity ──
async function fetchDexActivity(): Promise<any> {
  if (!CG_KEY) return null;
  try {
    // Get LAB pools from CoinGecko
    const r = await fetch(`https://pro-api.coingecko.com/api/v3/coins/lab?localization=false&tickers=true&community_data=false&developer_data=false&sparkline=false&x_cg_pro_api_key=${CG_KEY}`);
    const j = await r.json();
    const tickers = j?.tickers || [];
    const dexTickers = tickers.filter((t: any) => t.market?.identifier?.includes("dex") || t.market?.name?.toLowerCase().includes("uniswap") || t.market?.name?.toLowerCase().includes("pancake"));
    const topPool = dexTickers[0];
    return {
      dex_pairs: dexTickers.length,
      top_pool_volume_24h: topPool?.volume || 0,
      top_pool_liquidity: topPool?.converted_volume?.usd || 0,
      top_pool_exchange: topPool?.market?.name || "unknown",
      top_pool_price: topPool?.last || 0,
      bid_ask_spread: topPool?.bid_ask_spread_percentage || 0,
    };
  } catch { return null; }
}

// ── OI Concentration (Herfindahl) ──
function computeConcentration(exchanges: any[], total: any): number {
  if (!total || exchanges.length === 0) return 0;
  const shares = exchanges.map((e: any) => e.open_interest_usd / total.open_interest_usd);
  return shares.reduce((s: number, v: number) => s + v * v, 0);
}

// ── Main ──
async function main() {
  console.log("=== LAB 高级指标计算 ===\n");
  for (const d of [OUT_DIR, REPORTS_DIR]) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

  // 1. Exchange OI
  console.log("── 1. 交易所 OI ──");
  const exchanges = await fetchExchangeOI();
  if (exchanges.length === 0) { console.log("不可用"); return; }
  const total = exchanges.find((e: any) => e.exchange === "All");
  const sorted = exchanges.filter((e: any) => e.exchange !== "All").sort((a: any, b: any) => b.open_interest_usd - a.open_interest_usd);
  const hhi = computeConcentration(sorted, total);
  const top3Share = total ? sorted.slice(0, 3).reduce((s: number, e: any) => s + e.open_interest_usd, 0) / total.open_interest_usd : 0;
  const growing1h = sorted.filter((e: any) => e.open_interest_change_percent_1h > 0);
  const shrinking1h = sorted.filter((e: any) => e.open_interest_change_percent_1h < 0);
  console.log(`  总OI: $${(total?.open_interest_usd / 1e6).toFixed(1)}M | HHI: ${hhi.toFixed(3)} | 前3: ${(top3Share * 100).toFixed(0)}%`);
  console.log(`  1h增长: ${growing1h.length}所 | 缩减: ${shrinking1h.length}所`);

  // 2. Read fast-watch history
  const fw = readCsv(join(OUT_DIR, "lab_fast_watch_v2.csv"));
  if (!fw || fw.rows.length < 5) { console.log("快照不足"); return; }
  const h = fw.h, rows = fw.rows;
  const idx = (n: string) => h.indexOf(n);
  const lastN = rows.slice(-6);

  // Extract time series
  const oiSeries = rows.map(r => parseFloat(r[idx("coinglass_oi_usd")] || "0")).filter(v => v > 0);
  const fundSeries = rows.map(r => parseFloat(r[idx("funding_rate_percent")] || "0")).filter(v => v !== 0);
  const liqSeries = rows.map(r => parseFloat(r[idx("liq_4h")] || "0"));
  const priceSeries = rows.map(r => parseFloat(r[idx("price_usd")] || "0")).filter(v => v > 0);

  // 3. OI Acceleration (2nd derivative)
  const oiDeltas: number[] = [];
  for (let i = 1; i < oiSeries.length; i++) oiDeltas.push(oiSeries[i] - oiSeries[i - 1]);
  const oiAccel: number[] = [];
  for (let i = 1; i < oiDeltas.length; i++) oiAccel.push(oiDeltas[i] - oiDeltas[i - 1]);
  const curAccel = oiAccel.length > 0 ? oiAccel[oiAccel.length - 1] : 0;
  const prevAccel = oiAccel.length > 1 ? oiAccel[oiAccel.length - 2] : 0;
  const accelTrend = curAccel > prevAccel ? "加速" : curAccel < prevAccel ? "减速" : "持平";
  console.log(`\n── 2. OI 加速度 ──`);
  console.log(`  当前二阶导: ${(curAccel / 1e6).toFixed(1)}M | 趋势: ${accelTrend}`);

  // 4. Funding-OI divergence
  const recentOI = oiSeries.slice(-4), recentFund = fundSeries.slice(-4);
  const oiDir = recentOI[recentOI.length - 1] > recentOI[0] ? 1 : -1;
  const fundDir = recentFund[recentFund.length - 1] > recentFund[0] ? 1 : -1;
  const divergence = oiDir !== fundDir; // healthy when OI up + fund down, or OI down + fund up
  const crowded = oiDir > 0 && fundDir > 0; // both rising = crowding
  const healthy = (oiDir > 0 && fundDir < 0) || (oiDir < 0 && fundDir > 0);
  console.log(`\n── 3. 资金-OI 背离 ──`);
  console.log(`  OI方向: ${oiDir > 0 ? "↑" : "↓"} | 资金方向: ${fundDir > 0 ? "↑" : "↓"}`);
  console.log(`  状态: ${healthy ? "健康（背离=均衡调整）" : crowded ? "拥挤（同向=单边堆积）" : "中性"}`);

  // 5. Price-OI efficiency
  const oiChg = oiSeries[oiSeries.length - 1] - oiSeries[oiSeries.length - 4];
  const priceChg = priceSeries[priceSeries.length - 1] - priceSeries[priceSeries.length - 4];
  const efficiency = oiChg !== 0 ? Math.abs(priceChg / (oiChg / 1e6)) : 0;
  console.log(`\n── 4. 价格-OI 效率 ──`);
  console.log(`  近4次: OI${oiChg >= 0 ? "+" : ""}$${(oiChg / 1e6).toFixed(1)}M → 价格${priceChg >= 0 ? "+" : ""}$${priceChg.toFixed(2)}`);
  console.log(`  效率: ${efficiency.toFixed(2)} (每$1M OI变化推动的价格变化)`);

  // 6. Liquidation direction
  const liqUp = lastN.map(r => parseFloat(r[idx("liq_upward")] || "0")).filter(v => v > 0);
  const liqDown = lastN.map(r => parseFloat(r[idx("liq_downward")] || "0")).filter(v => v > 0);
  const upTotal = liqUp.reduce((a, b) => a + b, 0), downTotal = liqDown.reduce((a, b) => a + b, 0);
  const liqBias = upTotal + downTotal > 0 ? (upTotal - downTotal) / (upTotal + downTotal) : 0;
  console.log(`\n── 5. 清算方向 ──`);
  console.log(`  上行清算: $${(upTotal / 1e3).toFixed(0)}K | 下行: $${(downTotal / 1e3).toFixed(0)}K`);
  console.log(`  偏向: ${liqBias > 0.1 ? "上行多于下行" : liqBias < -0.1 ? "下行多于上行" : "均衡"}`);

  // 7. DEX activity
  console.log(`\n── 6. DEX 活动 ──`);
  const dex = await fetchDexActivity();
  if (dex) {
    console.log(`  DEX交易对: ${dex.dex_pairs} | 最大池: ${dex.top_pool_exchange}`);
    console.log(`  24h成交量: $${(dex.top_pool_volume_24h / 1e6).toFixed(1)}M | 价差: ${dex.bid_ask_spread?.toFixed(2)}%`);
  } else { console.log("  不可用"); }

  // 8. Write indicator snapshot
  const cur = lastN[lastN.length - 1];
  const snapshot = {
    timestamp: new Date().toISOString(),
    price: parseFloat(cur[idx("price_usd")] || "0"),
    oi_total: total?.open_interest_usd || 0,
    oi_concentration_hhi: hhi,
    oi_top3_share: top3Share,
    oi_growing_exchanges: growing1h.length,
    oi_shrinking_exchanges: shrinking1h.length,
    oi_acceleration: curAccel,
    oi_accel_trend: accelTrend,
    funding_oi_divergence: divergence ? "DIVERGENT" : crowded ? "CROWDED" : "NEUTRAL",
    price_oi_efficiency: efficiency,
    liq_up_total: upTotal,
    liq_down_total: downTotal,
    liq_bias: liqBias,
    dex_volume_24h: dex?.top_pool_volume_24h || 0,
    dex_spread: dex?.bid_ask_spread || 0,
  };
  writeFileSync(join(OUT_DIR, "lab_advanced_indicators.json"), JSON.stringify(snapshot, null, 2));

  console.log(`\n高级指标已保存: lab_advanced_indicators.json`);
  console.log(`CG调用: 1 (交易所OI)`);
}

main().catch(console.error);
