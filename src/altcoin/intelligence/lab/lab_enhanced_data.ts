import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fetchCompatWithFallback as fetch } from "../../../utils/http.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const SNAP_DIR = join(OUT_DIR, "enhanced_snapshots");
const CACHE_DIR = join(OUT_DIR, "cache_enhanced");
const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";
const CG_API = process.env.COINGLASS_API_KEY || "";
const LAB_CG_ID = "lab";

// ── Helpers ──
function cacheGet(key: string, maxAgeMin: number): string | null {
  const p = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(p)) return null;
  try {
    const s = JSON.parse(readFileSync(p, "utf-8"));
    if ((Date.now() - s._ts) / 60000 > maxAgeMin) return null;
    return s.data;
  } catch { return null; }
}
function cachePut(key: string, data: string) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify({ _ts: Date.now(), data }), "utf-8");
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ═══════════════════════════════════════════
// 1. CoinGecko — 全量市场数据
// ═══════════════════════════════════════════
async function fetchCoinGeckoFull(): Promise<any> {
  const cacheKey = "cg_full";
  const cached = cacheGet(cacheKey, 2);
  if (cached) return JSON.parse(cached);

  try {
    const j = await fetchJson(
      `https://pro-api.coingecko.com/api/v3/coins/${LAB_CG_ID}?tickers=false&community_data=false&developer_data=false&sparkline=false${CG_KEY ? "&x_cg_pro_api_key=" + CG_KEY : ""}`
    );
    const m = j.market_data || {};
    const result = {
      price_usd: m.current_price?.usd || 0,
      price_change_1h_pct: m.price_change_percentage_1h_in_currency?.usd || 0,
      price_change_24h_pct: m.price_change_percentage_24h || 0,
      price_change_7d_pct: m.price_change_percentage_7d || 0,
      price_change_30d_pct: m.price_change_percentage_30d || 0,
      market_cap_usd: m.market_cap?.usd || 0,
      fdv_usd: m.fully_diluted_valuation?.usd || 0,
      mcap_fdv_ratio: m.market_cap_fdv_ratio || 0,
      circulating_supply: m.circulating_supply || 0,
      total_supply: m.total_supply || 0,
      max_supply: m.max_supply || 0,
      volume_24h_usd: m.total_volume?.usd || 0,
      ath_usd: m.ath?.usd || 0,
      ath_date: m.ath_date?.usd || "",
      ath_change_pct: m.ath_change_percentage?.usd || 0,
      atl_usd: m.atl?.usd || 0,
      high_24h_usd: m.high_24h?.usd || 0,
      low_24h_usd: m.low_24h?.usd || 0,
      market_cap_rank: j.market_cap_rank || 0,
    };
    cachePut(cacheKey, JSON.stringify(result));
    return result;
  } catch { return null; }
}

// ═══════════════════════════════════════════
// 2. CoinGlass — OI矩阵 + 历史 + 清算
// ═══════════════════════════════════════════
async function fetchExchangeOIMatrix(): Promise<any> {
  if (!CG_API) return null;
  const cacheKey = "cg_ex_oi";
  const cached = cacheGet(cacheKey, 3);
  if (cached) return JSON.parse(cached);

  try {
    const j = await fetchJson(
      `https://open-api-v4.coinglass.com/api/futures/open-interest/exchange-list?symbol=LAB`,
      { "CG-API-KEY": CG_API }
    );
    const exs = (j.data || []).filter((e: any) => e.exchange !== "All");
    const total = (j.data || []).find((e: any) => e.exchange === "All");
    const matrix = exs.map((e: any) => ({
      exchange: e.exchange,
      oi_usd: e.open_interest_usd,
      oi_chg_5m: e.open_interest_change_percent_5m || 0,
      oi_chg_15m: e.open_interest_change_percent_15m || 0,
      oi_chg_30m: e.open_interest_change_percent_30m || 0,
      oi_chg_1h: e.open_interest_change_percent_1h || 0,
      oi_chg_4h: e.open_interest_change_percent_4h || 0,
      oi_chg_24h: e.open_interest_change_percent_24h || 0,
    }));
    // HHI
    const totalOi = total?.open_interest_usd || 0;
    const hhi = totalOi > 0 ? exs.reduce((s: number, e: any) => s + (e.open_interest_usd / totalOi) ** 2, 0) : 0;
    // Net flow direction
    const rising = exs.filter((e: any) => e.open_interest_change_percent_1h > 0).length;
    const falling = exs.filter((e: any) => e.open_interest_change_percent_1h < 0).length;
    // Weighted average change
    const weighted1h = totalOi > 0 ? exs.reduce((s: number, e: any) => s + e.open_interest_usd * (e.open_interest_change_percent_1h || 0), 0) / totalOi : 0;

    const result = { total_oi: totalOi, hhi, rising_exchanges: rising, falling_exchanges: falling, weighted_oi_change_1h: weighted1h, exchanges: matrix };
    cachePut(cacheKey, JSON.stringify(result));
    return result;
  } catch { return null; }
}

async function fetchOIHistory(): Promise<any> {
  if (!CG_API) return null;
  const cacheKey = "cg_oi_hist";
  const cached = cacheGet(cacheKey, 10);
  if (cached) return JSON.parse(cached);

  try {
    const j = await fetchJson(
      `https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=LAB&interval=4h&limit=12&unit=usd`,
      { "CG-API-KEY": CG_API }
    );
    const bars: Array<{ time: unknown; open: number; high: number; low: number; close: number }> = (j.data || []).map((d: any) => ({
      time: d.time, open: parseFloat(d.open), high: parseFloat(d.high), low: parseFloat(d.low), close: parseFloat(d.close),
    }));
    // Derived metrics
    const latest = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const chg = latest && prev ? latest.close - prev.close : 0;
    const chgPct = prev && prev.close > 0 ? chg / prev.close : 0;
    // OI volatility
    const spreads = bars.map((b) => b.close > 0 ? (b.high - b.low) / b.close : 0);
    const avgSpread = spreads.length > 0 ? spreads.reduce((a: number, b: number) => a + b, 0) / spreads.length : 0;

    const result = { bars, oi_latest: latest?.close || 0, oi_change_4h: chg, oi_change_4h_pct: chgPct, oi_avg_spread: avgSpread };
    cachePut(cacheKey, JSON.stringify(result));
    return result;
  } catch { return null; }
}

async function fetchLiquidationHistory(): Promise<any> {
  if (!CG_API) return null;
  const cacheKey = "cg_liq_hist";
  const cached = cacheGet(cacheKey, 15);
  if (cached) return JSON.parse(cached);

  try {
    const j = await fetchJson(
      `https://open-api-v4.coinglass.com/api/futures/liquidation/aggregated-history?symbol=LAB&interval=4h&limit=4&exchange_list=Binance,OKX,Bybit,KuCoin,Bitget,BingX,Gate`,
      { "CG-API-KEY": CG_API }
    );
    let totalLong = 0, totalShort = 0;
    const bars = (j.data || []).map((d: any) => {
      const lo = parseFloat(d.aggregated_long_liquidation_usd || "0");
      const sh = parseFloat(d.aggregated_short_liquidation_usd || "0");
      totalLong += lo; totalShort += sh;
      return { time: d.time, long_liq: lo, short_liq: sh, total: lo + sh, bias: lo + sh > 0 ? (sh - lo) / (lo + sh) : 0 };
    });
    const result = {
      bars,
      liq_4h_total: bars[bars.length - 1]?.total || 0,
      liq_4h_long: bars[bars.length - 1]?.long_liq || 0,
      liq_4h_short: bars[bars.length - 1]?.short_liq || 0,
      liq_bias: bars[bars.length - 1]?.bias || 0, // positive = more shorts liquidated
      liq_24h_total: totalLong + totalShort,
      liq_accelerating: bars.length >= 2 ? (bars[bars.length - 1]?.total || 0) > (bars[bars.length - 2]?.total || 0) : false,
    };
    cachePut(cacheKey, JSON.stringify(result));
    return result;
  } catch { return null; }
}

async function fetchFundingHistory(): Promise<any> {
  if (!CG_API) return null;
  const cacheKey = "cg_fund_hist";
  const cached = cacheGet(cacheKey, 10);
  if (cached) return JSON.parse(cached);

  try {
    const j = await fetchJson(
      `https://open-api-v4.coinglass.com/api/futures/funding-rate/oi-weight-history?symbol=LAB&interval=4h&limit=12`,
      { "CG-API-KEY": CG_API }
    );
    const rates = (j.data || []).map((d: any) => parseFloat(d.close || "0")).filter((v: number) => !isNaN(v));
    const latest = rates[rates.length - 1] || 0;
    // Funding streak
    let streak = 0;
    for (let i = rates.length - 1; i >= 0 && rates[i] > 0; i--) streak++;
    // Trend
    const half = Math.floor(rates.length / 2);
    const firstHalf = rates.slice(0, half);
    const secondHalf = rates.slice(half);
    const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length : 0;
    const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length : 0;
    // Peak
    const peak = Math.max(...rates);

    const result = { rates, funding_latest: latest, funding_pct: latest * 100, funding_streak: streak, funding_first_half_avg: firstAvg, funding_second_half_avg: secondAvg, funding_trend: secondAvg > firstAvg ? "rising" : secondAvg < firstAvg ? "falling" : "flat", funding_peak: peak, funding_from_peak: peak - latest };
    cachePut(cacheKey, JSON.stringify(result));
    return result;
  } catch { return null; }
}

// ═══════════════════════════════════════════
// 3. DexScreener — DEX微观结构
// ═══════════════════════════════════════════
async function fetchDexScreenerFull(): Promise<any> {
  const cacheKey = "dex_full";
  const cached = cacheGet(cacheKey, 3);
  if (cached) return JSON.parse(cached);

  try {
    const j = await fetchJson("https://api.dexscreener.com/latest/dex/search?q=LAB");
    const pairs = j?.pairs || [];
    const bsc: any[] = pairs.filter((p: any) => p.chainId === "bsc" && (p.volume?.h24 || 0) > 0);
    const topPool = bsc.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

    // Aggregate across all BSC pairs
    const agg = (field: string, timeframe: string) => bsc.reduce((s: number, p: any) => s + (p[field]?.[timeframe] || 0), 0);
    const totalBuys5m = agg("txns", "m5") ? bsc.reduce((s: number, p: any) => s + (p.txns?.m5?.buys || 0), 0) : 0;
    const totalSells5m = agg("txns", "m5") ? bsc.reduce((s: number, p: any) => s + (p.txns?.m5?.sells || 0), 0) : 0;
    const totalBuys1h = bsc.reduce((s: number, p: any) => s + (p.txns?.h1?.buys || 0), 0);
    const totalSells1h = bsc.reduce((s: number, p: any) => s + (p.txns?.h1?.sells || 0), 0);
    const totalBuys6h = bsc.reduce((s: number, p: any) => s + (p.txns?.h6?.buys || 0), 0);
    const totalSells6h = bsc.reduce((s: number, p: any) => s + (p.txns?.h6?.sells || 0), 0);
    const totalBuys24h = bsc.reduce((s: number, p: any) => s + (p.txns?.h24?.buys || 0), 0);
    const totalSells24h = bsc.reduce((s: number, p: any) => s + (p.txns?.h24?.sells || 0), 0);
    const totalVol = agg("volume", "h24");
    const totalLiq = bsc.reduce((s: number, p: any) => s + (p.liquidity?.usd || 0), 0);

    // Price change from top pool
    const pc = topPool?.priceChange || {};

    const result = {
      total_pairs_bsc: bsc.length,
      total_volume_24h: totalVol,
      total_liquidity: totalLiq,
      turnover_24h: totalLiq > 0 ? totalVol / totalLiq : 0,
      price_usd: parseFloat(topPool?.priceUsd || "0"),
      price_change: { m5: pc.m5 || 0, h1: pc.h1 || 0, h6: pc.h6 || 0, h24: pc.h24 || 0 },
      buys: { m5: totalBuys5m, h1: totalBuys1h, h6: totalBuys6h, h24: totalBuys24h },
      sells: { m5: totalSells5m, h1: totalSells1h, h6: totalSells6h, h24: totalSells24h },
      buy_ratio: { m5: totalBuys5m + totalSells5m > 0 ? totalBuys5m / (totalBuys5m + totalSells5m) : 0.5, h1: totalBuys1h + totalSells1h > 0 ? totalBuys1h / (totalBuys1h + totalSells1h) : 0.5, h6: totalBuys6h + totalSells6h > 0 ? totalBuys6h / (totalBuys6h + totalSells6h) : 0.5, h24: totalBuys24h + totalSells24h > 0 ? totalBuys24h / (totalBuys24h + totalSells24h) : 0.5 },
      top_pool_dex: topPool?.dexId || "?",
      top_pool_liquidity: topPool?.liquidity?.usd || 0,
      fdv: topPool?.fdv || 0,
      market_cap: topPool?.marketCap || 0,
    };
    cachePut(cacheKey, JSON.stringify(result));
    return result;
  } catch { return null; }
}

// ═══════════════════════════════════════════
// 4. Main — 采集全部 → 写入快照
// ═══════════════════════════════════════════
async function main() {
  console.log("=== LAB 增强数据采集 ===\n");
  for (const d of [OUT_DIR, SNAP_DIR, CACHE_DIR]) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

  const ts = new Date().toISOString();
  const tsBJ = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  // Parallel fetch (except CG calls share budget)
  console.log("采集 CoinGecko...");
  const cg = await fetchCoinGeckoFull();
  console.log(`  ${cg ? `$${cg.price_usd} | MCap $${(cg.market_cap_usd/1e6).toFixed(0)}M | FDV $${(cg.fdv_usd/1e9).toFixed(1)}B | 流通 ${(cg.mcap_fdv_ratio*100).toFixed(1)}%` : "FAIL"}`);

  console.log("采集 CoinGlass OI矩阵...");
  const oiMatrix = await fetchExchangeOIMatrix();
  console.log(`  ${oiMatrix ? `总OI $${(oiMatrix.total_oi/1e6).toFixed(0)}M | ${oiMatrix.rising_exchanges}↑/${oiMatrix.falling_exchanges}↓ | 加权1h ${oiMatrix.weighted_oi_change_1h?.toFixed(1)}%` : "FAIL"}`);

  console.log("采集 CoinGlass OI历史...");
  const oiHist = await fetchOIHistory();
  console.log(`  ${oiHist ? `${oiHist.bars.length}条 | 最新 $${(oiHist.oi_latest/1e6).toFixed(0)}M | OI波动率 ${(oiHist.oi_avg_spread*100).toFixed(1)}%` : "FAIL"}`);

  console.log("采集 CoinGlass 清算...");
  const liq = await fetchLiquidationHistory();
  console.log(`  ${liq ? `4h $${(liq.liq_4h_total/1e3).toFixed(0)}K | 长$${(liq.liq_4h_long/1e3).toFixed(0)}K/短$${(liq.liq_4h_short/1e3).toFixed(0)}K | 偏向 ${liq.liq_bias > 0 ? "空头被挤" : liq.liq_bias < 0 ? "多头被挤" : "均衡"}` : "FAIL"}`);

  console.log("采集 CoinGlass 资金费率...");
  const fund = await fetchFundingHistory();
  console.log(`  ${fund ? `${(fund.funding_pct).toFixed(2)}% | 连续${fund.funding_streak}期 | 趋势 ${fund.funding_trend} | 距峰值${(fund.funding_from_peak*100).toFixed(1)}%` : "FAIL"}`);

  console.log("采集 DexScreener...");
  const dex = await fetchDexScreenerFull();
  console.log(`  ${dex ? `$${dex.price_usd} | 池子 $${(dex.total_liquidity/1e3).toFixed(0)}K | 换手 ${dex.turnover_24h.toFixed(0)}x | 5m买比 ${(dex.buy_ratio.m5*100).toFixed(0)}%` : "FAIL"}`);

  // Load previous snapshot for delta
  let prevSnapshot: any = null;
  try {
    const files = readdirSync(SNAP_DIR).filter(f => f.startsWith("enhanced_") && f.endsWith(".json")).sort();
    if (files.length > 0) prevSnapshot = JSON.parse(readFileSync(join(SNAP_DIR, files[files.length - 1]), "utf-8"));
  } catch { /* */ }

  // Build comprehensive snapshot
  const snapshot = {
    timestamp: ts,
    timestamp_beijing: tsBJ,
    coingecko: cg,
    coinglass_oi_matrix: oiMatrix,
    coinglass_oi_history: oiHist,
    coinglass_liquidation: liq,
    coinglass_funding: fund,
    dexscreener: dex,
    // ── Computed derivatives ──
    computed: {
      // Leverage density: OI / (DEX liquidity × circulating supply)
      leverage_density: (oiMatrix && dex && cg)
        ? oiMatrix.total_oi / (dex.total_liquidity * (cg.circulating_supply || 1))
        : null,
      // OI to circulating MCap
      oi_to_mcap: (oiMatrix && cg && cg.market_cap_usd > 0)
        ? oiMatrix.total_oi / cg.market_cap_usd
        : null,
      // Funding annualized cost: per-period rate × 3 periods/day × 365 days × 100%
      funding_annualized_pct: fund ? fund.funding_latest * 3 * 365 * 100 : null,
      // Liquidation intensity
      liq_to_oi: (liq && oiMatrix && oiMatrix.total_oi > 0)
        ? liq.liq_4h_total / oiMatrix.total_oi
        : null,
      // DEX flow divergence: are buys accelerating or decelerating?
      dex_flow_divergence: dex
        ? (dex.buy_ratio.m5 - dex.buy_ratio.h1)
        : null,
    },
    // ── Deltas from previous snapshot ──
    deltas: prevSnapshot ? {
      price_delta: cg && prevSnapshot.coingecko ? cg.price_usd - prevSnapshot.coingecko.price_usd : null,
      oi_delta: oiMatrix && prevSnapshot.coinglass_oi_matrix ? oiMatrix.total_oi - prevSnapshot.coinglass_oi_matrix.total_oi : null,
      funding_delta: fund && prevSnapshot.coinglass_funding ? fund.funding_pct - prevSnapshot.coinglass_funding.funding_pct : null,
      liq_delta: liq && prevSnapshot.coinglass_liquidation ? liq.liq_4h_total - prevSnapshot.coinglass_liquidation.liq_4h_total : null,
      oi_weighted_chg_delta: oiMatrix && prevSnapshot.coinglass_oi_matrix ? oiMatrix.weighted_oi_change_1h - prevSnapshot.coinglass_oi_matrix.weighted_oi_change_1h : null,
      dex_buy_ratio_delta: dex && prevSnapshot.dexscreener ? dex.buy_ratio.h1 - prevSnapshot.dexscreener.buy_ratio.h1 : null,
    } : null,
  };

  // Write snapshot
  const snapFile = `enhanced_${ts.replace(/[:.]/g, "-")}.json`;
  writeFileSync(join(SNAP_DIR, snapFile), JSON.stringify(snapshot, null, 2), "utf-8");

  // Update latest pointer
  writeFileSync(join(OUT_DIR, "enhanced_latest.json"), JSON.stringify(snapshot, null, 2), "utf-8");

  // Console summary
  console.log(`\n── 快照已保存: ${snapFile} ──`);
  console.log(`增强指标: 杠杆密度=${snapshot.computed.leverage_density?.toExponential(1)} | OI/MCap=${snapshot.computed.oi_to_mcap?.toFixed(2)} | 年化资金=${snapshot.computed.funding_annualized_pct?.toFixed(0)}%`);

  // Print deltas if available
  if (snapshot.deltas) {
    console.log(`\n── 较上次变化 ──`);
    if (snapshot.deltas.price_delta) console.log(`  价格: ${snapshot.deltas.price_delta > 0 ? "+" : ""}$${snapshot.deltas.price_delta.toFixed(4)}`);
    if (snapshot.deltas.oi_delta) console.log(`  OI: ${snapshot.deltas.oi_delta > 0 ? "+" : ""}$${(snapshot.deltas.oi_delta / 1e6).toFixed(1)}M`);
    if (snapshot.deltas.funding_delta) console.log(`  资金费率: ${snapshot.deltas.funding_delta > 0 ? "+" : ""}${snapshot.deltas.funding_delta.toFixed(2)}%`);
    if (snapshot.deltas.dex_buy_ratio_delta) console.log(`  DEX买比: ${snapshot.deltas.dex_buy_ratio_delta > 0 ? "+" : ""}${(snapshot.deltas.dex_buy_ratio_delta * 100).toFixed(1)}%`);
  }
}

main().catch(console.error);
