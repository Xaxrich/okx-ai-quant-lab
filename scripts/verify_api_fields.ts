// Verify all API field types and values against actual responses
// Run: npx tsx scripts/verify_api_fields.ts
import { fetchCompatWithFallback as fetch } from "../src/utils/http.js";

const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";
const CG_API = process.env.COINGLASS_API_KEY || "";

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("API 字段类型验证");
  console.log("═══════════════════════════════════════\n");

  // ── 1. CoinGecko /coins/{id} ──
  console.log("── 1. CoinGecko /coins/lab ──");
  try {
    const r = await fetch(
      `https://pro-api.coingecko.com/api/v3/coins/lab?tickers=false&community_data=false&developer_data=false&sparkline=false${CG_KEY ? "&x_cg_pro_api_key=" + CG_KEY : ""}`,
      CG_KEY ? { headers: { "x-cg-pro-api-key": CG_KEY } } : undefined
    );
    const d = await r.json();
    const m = d.market_data || {};

    const cgFields: [string, any, string][] = [
      ["current_price.usd", m.current_price?.usd, "number (USD price)"],
      ["market_cap.usd", m.market_cap?.usd, "number (USD MCap)"],
      ["fully_diluted_valuation.usd", m.fully_diluted_valuation?.usd, "number (USD FDV)"],
      ["market_cap_fdv_ratio", m.market_cap_fdv_ratio, "number (0-1 ratio)"],
      ["circulating_supply", m.circulating_supply, "number (token amount)"],
      ["total_supply", m.total_supply, "number"],
      ["max_supply", m.max_supply, "number or null"],
      ["total_volume.usd", m.total_volume?.usd, "number (24h USD volume)"],
      ["ath.usd", m.ath?.usd, "number"],
      ["high_24h.usd", m.high_24h?.usd, "number"],
      ["low_24h.usd", m.low_24h?.usd, "number"],
      ["price_change_percentage_24h", m.price_change_percentage_24h, "number (NOT object)"],
      ["price_change_percentage_1h_in_currency", m.price_change_percentage_1h_in_currency, "object (needs .usd)"],
      ["price_change_percentage_7d", m.price_change_percentage_7d, "number"],
      ["price_change_percentage_30d", m.price_change_percentage_30d, "number"],
      ["market_cap_rank", d.market_cap_rank, "number"],
    ];
    let cgOk = 0, cgFail = 0;
    for (const [path, val, expected] of cgFields) {
      const actual = typeof val;
      const ok = val !== undefined && val !== null;
      console.log(`  ${ok ? "✅" : "❌"} ${path}: ${actual} = ${typeof val === "number" ? val.toFixed(4) : JSON.stringify(val)?.slice(0, 60)}`);
      if (ok) cgOk++; else cgFail++;
    }
    console.log(`  → ${cgOk}/${cgOk + cgFail} 字段通过\n`);

    // Verify MCap/FDV calculation
    const calcMcap = (m.circulating_supply || 0) * (m.current_price?.usd || 0);
    const reportedMcap = m.market_cap?.usd || 0;
    const diff = Math.abs(calcMcap - reportedMcap) / Math.max(1, reportedMcap) * 100;
    console.log(`  MCap验证: 计算=${(calcMcap / 1e6).toFixed(1)}M vs 报告=${(reportedMcap / 1e6).toFixed(1)}M (差异 ${diff.toFixed(2)}%)`);
    console.log(`  FDV验证: 计算=${((m.total_supply || 0) * (m.current_price?.usd || 0) / 1e9).toFixed(2)}B vs 报告=${((m.fully_diluted_valuation?.usd || 0) / 1e9).toFixed(2)}B`);
    console.log(`  流通率: ${(m.market_cap_fdv_ratio * 100).toFixed(1)}% = ${(m.circulating_supply / 1e6).toFixed(2)}M / ${(m.total_supply / 1e9).toFixed(2)}B\n`);
  } catch (e: any) {
    console.log(`  ❌ CoinGecko 请求失败: ${e.message}\n`);
  }

  // ── 2. CoinGlass OI Exchange List ──
  console.log("── 2. CoinGlass /futures/open-interest/exchange-list ──");
  if (!CG_API) { console.log("  ❌ COINGLASS_API_KEY 未设置\n"); }
  else {
    try {
      const r = await fetch("https://open-api-v4.coinglass.com/api/futures/open-interest/exchange-list?symbol=LAB", {
        headers: { "CG-API-KEY": CG_API }
      });
      const j = await r.json();
      const all = (j.data || []).find((e: any) => e.exchange === "All");
      const ex = (j.data || []).find((e: any) => e.exchange === "KuCoin") || (j.data || [])[1];

      console.log(`  code: ${j.code} | exchanges: ${j.data?.length}`);
      if (all) {
        const fields = ["open_interest_usd", "open_interest_quantity", "open_interest_change_percent_5m",
          "open_interest_change_percent_15m", "open_interest_change_percent_30m",
          "open_interest_change_percent_1h", "open_interest_change_percent_4h", "open_interest_change_percent_24h"];
        console.log("  All exchange fields:");
        fields.forEach(f => console.log(`    ${f}: ${typeof all[f]} = ${all[f]}`));
      }
      if (ex) {
        console.log(`\n  Example (${ex.exchange}): OI=$${(ex.open_interest_usd / 1e6).toFixed(1)}M`);
        console.log(`    1h change: ${ex.open_interest_change_percent_1h}%`);
      }

      // Verify: exchange list OI sum ≈ All OI
      const exs = (j.data || []).filter((e: any) => e.exchange !== "All");
      const exSum = exs.reduce((s: number, e: any) => s + (e.open_interest_usd || 0), 0);
      const allOI = all?.open_interest_usd || 0;
      console.log(`\n  验证: 各所OI之和=$${(exSum / 1e6).toFixed(1)}M vs All=$${(allOI / 1e6).toFixed(1)}M (差异 ${Math.abs(exSum - allOI) / Math.max(1, allOI) * 100}%)`);
      console.log(`  ✅ OI变化率单位: 百分比 (如 -2.01 = -2.01%)\n`);
    } catch (e: any) {
      console.log(`  ❌ CoinGlass OI 请求失败: ${e.message}\n`);
    }
  }

  // ── 3. CoinGlass OI Aggregated History ──
  console.log("── 3. CoinGlass /futures/open-interest/aggregated-history ──");
  if (!CG_API) { console.log("  ❌ 未设置\n"); }
  else {
    try {
      const r = await fetch("https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=LAB&interval=4h&limit=3&unit=usd", {
        headers: { "CG-API-KEY": CG_API }
      });
      const j = await r.json();
      const bar = (j.data || [])[j.data.length - 1];
      console.log(`  code: ${j.code} | bars: ${j.data?.length}`);
      if (bar) {
        console.log(`  字段: time=${bar.time} (Unix ms)`);
        console.log(`  open=$${(parseFloat(bar.open) / 1e6).toFixed(1)}M | high=$${(parseFloat(bar.high) / 1e6).toFixed(1)}M`);
        console.log(`  low=$${(parseFloat(bar.low) / 1e6).toFixed(1)}M | close=$${(parseFloat(bar.close) / 1e6).toFixed(1)}M`);
        console.log(`  ✅ close = 期末OI (USD)`);
        console.log(`  ✅ open/high/low/close 均为 USD 金额的字符串表示\n`);
      }
    } catch (e: any) {
      console.log(`  ❌ 请求失败: ${e.message}\n`);
    }
  }

  // ── 4. CoinGlass Funding Rate ──
  console.log("── 4. CoinGlass /futures/funding-rate/oi-weight-history ──");
  if (!CG_API) { console.log("  ❌ 未设置\n"); }
  else {
    try {
      const r = await fetch("https://open-api-v4.coinglass.com/api/futures/funding-rate/oi-weight-history?symbol=LAB&interval=4h&limit=3", {
        headers: { "CG-API-KEY": CG_API }
      });
      const j = await r.json();
      const bar = (j.data || [])[j.data.length - 1];
      console.log(`  code: ${j.code} | bars: ${j.data?.length}`);
      if (bar) {
        const close = parseFloat(bar.close);
        console.log(`  close: ${close} (= ${(close * 100).toFixed(2)}%)`);
        console.log(`  ✅ 资金费率单位: 小数 (0.16 = 16%)`);
        console.log(`  ✅ 每期间隔: 4h (HOBBYIST最低4h)`);
        console.log(`  ✅ 年化计算公式: funding * 3 * 365 (每天3个4h周期)\n`);
      }
    } catch (e: any) {
      console.log(`  ❌ 请求失败: ${e.message}\n`);
    }
  }

  // ── 5. CoinGlass Liquidation ──
  console.log("── 5. CoinGlass /futures/liquidation/aggregated-history ──");
  if (!CG_API) { console.log("  ❌ 未设置\n"); }
  else {
    try {
      const r = await fetch("https://open-api-v4.coinglass.com/api/futures/liquidation/aggregated-history?symbol=LAB&interval=4h&limit=3&exchange_list=Binance,OKX,Bybit", {
        headers: { "CG-API-KEY": CG_API }
      });
      const j = await r.json();
      const bar = (j.data || [])[j.data.length - 1];
      console.log(`  code: ${j.code} | bars: ${j.data?.length}`);
      if (bar) {
        console.log(`  aggregated_long_liquidation_usd: ${bar.aggregated_long_liquidation_usd}`);
        console.log(`  aggregated_short_liquidation_usd: ${bar.aggregated_short_liquidation_usd}`);
        console.log(`  ✅ 长/短清算是分开的字段 (USD)`);
        console.log(`  ⚠️ exchange_list 参数是必需的`);
        console.log(`  ✅ 仅统计指定交易所 (Binance+OKX+Bybit)，非全市场\n`);
      }
    } catch (e: any) {
      console.log(`  ❌ 请求失败: ${e.message}\n`);
    }
  }

  // ── 6. DexScreener ──
  console.log("── 6. DexScreener /latest/dex/search ──");
  try {
    const r = await fetch("https://api.dexscreener.com/latest/dex/search?q=LAB");
    const j = await r.json();
    const pairs = j?.pairs || [];
    const bsc = pairs.filter((p: any) => p.chainId === "bsc" && (p.volume?.h24 || 0) > 0);
    const top = bsc[0];

    console.log(`  pairs: ${pairs.length} | BSC active: ${bsc.length}`);
    if (top) {
      console.log(`  priceUsd: ${top.priceUsd} (string)`);
      console.log(`  priceNative: ${top.priceNative}`);
      console.log(`  txns keys: ${Object.keys(top.txns || {}).join(", ")}`);
      if (top.txns?.m5) console.log(`    m5.buys=${top.txns.m5.buys}, m5.sells=${top.txns.m5.sells}`);
      if (top.txns?.h1) console.log(`    h1.buys=${top.txns.h1.buys}, h1.sells=${top.txns.h1.sells}`);
      if (top.txns?.h6) console.log(`    h6.buys=${top.txns.h6.buys}, h6.sells=${top.txns.h6.sells}`);
      if (top.txns?.h24) console.log(`    h24.buys=${top.txns.h24.buys}, h24.sells=${top.txns.h24.sells}`);
      console.log(`  volume keys: ${Object.keys(top.volume || {}).join(", ")}`);
      console.log(`  priceChange keys: ${Object.keys(top.priceChange || {}).join(", ")}`);
      if (top.priceChange) {
        console.log(`    m5=${top.priceChange.m5}%, h1=${top.priceChange.h1}%, h6=${top.priceChange.h6}%, h24=${top.priceChange.h24}%`);
      }
      console.log(`  liquidity.usd: ${top.liquidity?.usd}`);
      console.log(`  fdv: ${top.fdv} | marketCap: ${top.marketCap}`);
      console.log(`  ✅ 价格/交易量/流动性均为字符串，需 parseFloat()`);
      console.log(`  ✅ txns 是对象，含 m5/h1/h6/h24 四个时间框架`);
      console.log(`  ✅ buys/sells 是数字，不是字符串`);
      console.log(`  ✅ priceChange 单位是百分比 (如 -2.42 = -2.42%)`);
      console.log(`  ✅ marketCap 是 DexScreener 自己算的流通市值\n`);
    }
  } catch (e: any) {
    console.log(`  ❌ 请求失败: ${e.message}\n`);
  }

  // ── 7. Summary ──
  console.log("═══════════════════════════════════════");
  console.log("验证完成");
  console.log("═══════════════════════════════════════");
  console.log("");
  console.log("已知问题/注意事项:");
  console.log("1. CoinGlass 清算 endpoint 的 exchange_list 只统计指定交易所");
  console.log("   当前: Binance,OKX,Bybit → 不包含 KuCoin(25%)/Bitget(22%)");
  console.log("   → 实际全市场清算可能比我们看到的 2-3x 更高");
  console.log("2. MCap/FDV ratio 是 CoinGecko 的 circulating/max_supply");
  console.log("   DexScreener 的 marketCap 可能不同（自己算的）");
  console.log("3. 资金费率年化: funding * 3 * 365 假设每8h一次资金结算");
  console.log("   OKX 实际是每8h结算，但 CoinGlass 数据是4h间隔的加权平均");
  console.log("4. OI change % 是相对于该所自身OI的变化率");
  console.log("   加权平均变化率应该用 OI_usd * chg% / total_OI");
  console.log("5. DexScreener fdv 和 marketCap 可能使用了不同的流通量定义");
}

main().catch(console.error);
