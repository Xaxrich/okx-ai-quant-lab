import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const CG_API = process.env.COINGLASS_API_KEY || "";

// ── 1. Exchange OI Distribution ──
async function fetchExchangeOI(): Promise<any[]> {
  if (!CG_API) return [];
  const r = await fetch("https://open-api-v4.coinglass.com/api/futures/open-interest/exchange-list?symbol=LAB", { headers: { "CG-API-KEY": CG_API } });
  const j = await r.json();
  return j.data || [];
}

// ── 2. Read fast-watch history ──
function getHistory() {
  return readCsv(join(OUT_DIR, "lab_fast_watch_v2.csv"));
}

// ── 3. Compute indicator correlations ──
function computeCorrelations(data: { h: string[]; rows: string[][] }) {
  const h = data.h, rows = data.rows;
  const idx = (name: string) => h.indexOf(name);
  const priceIdx = idx("price_usd"), oiIdx = idx("coinglass_oi_usd");
  const fundIdx = idx("funding_rate_percent"), liqIdx = idx("liq_4h"), scoreIdx = idx("risk_score");

  const prices: number[] = [], ois: number[] = [], funds: number[] = [], liqs: number[] = [], scores: number[] = [];
  for (const r of rows) {
    const p = parseFloat(r[priceIdx] || "0"), o = parseFloat(r[oiIdx] || "0");
    const f = parseFloat(r[fundIdx] || "0"), l = parseFloat(r[liqIdx] || "0"), s = parseFloat(r[scoreIdx] || "0");
    if (p > 0 && o > 0) { prices.push(p); ois.push(o); funds.push(f); liqs.push(l); scores.push(s); }
  }

  // Pearson correlation
  const pearson = (a: number[], b: number[]) => {
    const n = Math.min(a.length, b.length);
    if (n < 3) return 0;
    const ma = a.slice(-n).reduce((s, v) => s + v, 0) / n;
    const mb = b.slice(-n).reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const da2 = a[i] - ma, db2 = b[i] - mb; num += da2 * db2; da += da2 * da2; db += db2 * db2; }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
  };

  return {
    samples: prices.length,
    oi_price: pearson(ois, prices),
    fund_price: pearson(funds, prices),
    liq_price: pearson(liqs, prices),
    score_price: pearson(scores, prices),
    fund_oi: pearson(funds, ois),
    liq_oi: pearson(liqs, ois),
  };
}

async function main() {
  console.log("=== LAB 指标体系研究 ===\n");
  for (const d of [OUT_DIR, REPORTS_DIR]) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

  // ── Exchange OI ──
  console.log("── 1. 交易所 OI 分布 ──\n");
  const exchanges = await fetchExchangeOI();
  if (exchanges.length === 0) { console.log("CoinGlass 不可用"); return; }

  const total = exchanges.find((e: any) => e.exchange === "All");
  const sorted = exchanges.filter((e: any) => e.exchange !== "All").sort((a: any, b: any) => b.open_interest_usd - a.open_interest_usd);
  const top3 = sorted.slice(0, 3);
  const top3Share = total ? top3.reduce((s: number, e: any) => s + e.open_interest_usd, 0) / total.open_interest_usd * 100 : 0;

  console.log(`总 OI: $${(total?.open_interest_usd / 1e6).toFixed(1)}M (${exchanges.length - 1} 交易所)`);
  console.log(`前3集中度: ${top3Share.toFixed(0)}% (${top3.map((e: any) => e.exchange).join(", ")})`);
  console.log(`OKX 占比: ${(sorted.find((e: any) => e.exchange === "OKX")?.open_interest_usd / total?.open_interest_usd * 100).toFixed(1)}%`);

  // 1h OI change by exchange
  console.log("\n── 1h OI 变化 ──");
  const growing = sorted.filter((e: any) => e.open_interest_change_percent_1h > 0);
  const shrinking = sorted.filter((e: any) => e.open_interest_change_percent_1h < 0);
  console.log(`增长: ${growing.length} 交易所 (${growing.map((e: any) => e.exchange + "+" + e.open_interest_change_percent_1h + "%").join(", ")})`);
  console.log(`缩减: ${shrinking.length} 交易所`);
  if (shrinking.length > 0) console.log(`  最大缩减: ${shrinking[shrinking.length - 1]?.exchange} ${shrinking[shrinking.length - 1]?.open_interest_change_percent_1h}%`);

  // ── Correlation Analysis ──
  console.log("\n── 2. 指标相关性（基于快照数据）──\n");
  const hist = getHistory();
  if (hist && hist.rows.length >= 5) {
    const corr = computeCorrelations(hist);
    console.log(`样本: ${corr.samples} 条快照`);
    console.log(`OI-价格相关性: ${corr.oi_price.toFixed(2)}`);
    console.log(`资金费率-价格: ${corr.fund_price.toFixed(2)}`);
    console.log(`清算-价格: ${corr.liq_price.toFixed(2)}`);
    console.log(`风险评分-价格: ${corr.score_price.toFixed(2)}`);
    console.log(`资金费率-OI: ${corr.fund_oi.toFixed(2)}`);
    console.log(`清算-OI: ${corr.liq_oi.toFixed(2)}`);

    const strongest = [
      { name: "OI-价格", val: Math.abs(corr.oi_price) },
      { name: "资金-价格", val: Math.abs(corr.fund_price) },
      { name: "清算-价格", val: Math.abs(corr.liq_price) },
      { name: "资金-OI", val: Math.abs(corr.fund_oi) },
    ].sort((a, b) => b.val - a.val);

    console.log(`\n最强关联: ${strongest[0].name} (r=${strongest[0].val.toFixed(2)})`);
    console.log(`最弱关联: ${strongest[strongest.length - 1].name} (r=${strongest[strongest.length - 1].val.toFixed(2)})`);
  }

  // ── Report ──
  const report = [
    "# LAB 指标体系研究报告", "",
    `生成: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    "",
    "## 1. API 能力盘点",
    "",
    "| API | 已用指标 | 未用但可用的指标 | 潜在价值 |",
    "|-----|---------|----------------|---------|",
    "| CoinGecko | price, volume, mcap, 24h return | DEX pool OHLCV, pool volume, pool liquidity | 高——DEX活动常领先CEX |",
    "| CoinGlass | OI, funding, liquidation | **交易所OI分布**, OI变化%分时, OI集中度 | **极高**——知道OI在哪个交易所最关键 |",
    "| OKX | OI, funding | trading statistics, 多空持仓比 | 中——LAB不在OKX主战场 |",
    "| Moralis | transfer count, entity labels | **transfer velocity**, holder变化, whale movement | 高——链上活动领先价格 |",
    "| CMC | supply, FDV | 持仓分布, 交易所流量 | 中 |",
    "| DexScreener | liquidity | **buy/sell count**, **txn count**, pair age | 高——实时DEX情绪 |",
    "",
    "## 2. 交易所OI分布（首次获取）",
    "",
    `总OI: $${(total?.open_interest_usd / 1e6).toFixed(1)}M | 交易所数: ${exchanges.length - 1}`,
    `前3集中度: ${top3Share.toFixed(0)}%`,
    "",
    "| 排名 | 交易所 | OI | 占比 | 1h变化 | 24h变化 |",
    "|------|--------|-----|------|--------|--------|",
    ...sorted.map((e: any, i: number) => `| ${i + 1} | ${e.exchange} | $${(e.open_interest_usd / 1e6).toFixed(1)}M | ${total ? (e.open_interest_usd / total.open_interest_usd * 100).toFixed(1) : "?"}% | ${e.open_interest_change_percent_1h}% | ${e.open_interest_change_percent_24h}% |`),
    "",
    `**关键发现: LAB主战场不在OKX(仅${(sorted.find((e: any) => e.exchange === "OKX")?.open_interest_usd / total?.open_interest_usd * 100).toFixed(1)}%)，而在KuCoin+Bitget+Binance(${top3Share.toFixed(0)}%)**`,
    "",
    "## 3. 可新增的高价值指标",
    "",
    "### 立即可用（已有数据，只需计算）",
    "1. **交易所OI集中度** (Herfindahl指数)——OI越集中，越容易单边踩踏",
    "2. **OI变化加速度** (二阶导数)——OI增速本身在加速还是减速",
    "3. **资金费率-OI背离度**——OI上升但资金下降=健康；OI上升+资金上升=拥挤",
    "4. **清算方向比** (上行清算/下行清算)——哪一方在被强制平仓",
    "5. **价格-OI效率比**——每$1M OI变化推动多少价格变化",
    "",
    "### 需接入新端点",
    "6. **多空持仓比** (L/S ratio)——如CoinGlass端点可用",
    "7. **DEX实时买卖比** (DexScreener buy/sell count)",
    "8. **链上转账速度** (Moralis transfer velocity)",
    "",
    "## 4. 与价格的相关性（基于快照数据）",
    "",
    ...(hist && hist.rows.length >= 5 ? [
      `样本: ${computeCorrelations(hist).samples} 条快照`,
      `OI-价格: r=${computeCorrelations(hist).oi_price.toFixed(2)}`,
      `资金费率-价格: r=${computeCorrelations(hist).fund_price.toFixed(2)}`,
      `清算-价格: r=${computeCorrelations(hist).liq_price.toFixed(2)}`,
      "",
      "注意: 快照数据非等间隔，相关性仅供参考。需要更长时间序列做统计验证。",
    ] : ["快照数据不足，无法计算相关性。"]),
    "",
    "## 5. 建议优先级",
    "",
    "1. **立即接入交易所OI分布**——每15分钟获取，追踪OI在哪个交易所流动",
    "2. **计算OI集中度**——作为新的风险维度加入commander评分",
    "3. **计算资金-OI背离度**——当前最有区分力的复合指标",
    "4. **测试CoinGlass L/S ratio端点**——确认HOBBYIST plan是否支持",
    "5. **接入DexScreener实时数据**——补充DEX侧情绪",
    "",
    "本报告仅为研究参考，不构成交易建议。",
  ];
  writeFileSync(join(REPORTS_DIR, "lab_indicator_research_report.md"), report.join("\n"));
  console.log(`\n报告: ${REPORTS_DIR}/lab_indicator_research_report.md`);
}

main().catch(console.error);
