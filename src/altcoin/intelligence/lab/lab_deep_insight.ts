import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const INTEL_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");

function readCsv(p: string): { h: string[]; rows: string[][] } | null {
  if (!existsSync(p)) return null; const l = readFileSync(p, "utf-8").trim().split("\n"); if (l.length < 2) return null;
  return { h: l[0].split(","), rows: l.slice(1).map(x => x.split(",")) };
}

function col(r: string[], h: string[], name: string): string { const i = h.indexOf(name); return i >= 0 ? r[i] || "" : ""; }
function num(r: string[], h: string[], name: string): number { const v = parseFloat(col(r, h, name)); return isNaN(v) ? 0 : v; }

function fmt(n: number, d = 0, unit = ""): string { return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) + unit; }
function pct(n: number): string { return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; }
function percentile(vals: number[], v: number): number { const c = vals.filter(x => x <= v).length; return vals.length > 0 ? c / vals.length * 100 : 0; }

async function main() {
  console.log("=== LAB 深度结构洞察 ===\n");
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");

  // ── 1. 加载所有历史数据 ──
  const cgDaily = readCsv(join(INTEL_DIR, "coinglass", "features", "coinglass_derivatives_features.csv"));
  const pvData = readCsv(join(INTEL_DIR, "metric_loop", "features", "price_volume_feature_table.csv"));
  const fwData = readCsv(join(OUT_DIR, "lab_fast_watch_v2.csv"));
  const lvData = readCsv(join(OUT_DIR, "lab_live_feature_snapshot_v2.csv"));

  if (!cgDaily || !pvData) { console.log("历史数据不足"); return; }

  // 提取 LAB 历史
  const labOI = cgDaily.rows.filter(r => r[0] === "LAB" && num(r, cgDaily.h, "oi_usd") > 0);
  const labPV = pvData.rows.filter(r => r[0] === "LAB");

  if (labOI.length < 10) { console.log("LAB 历史数据不足"); return; }

  // 当前值
  const latestOI = labOI[labOI.length - 1];
  const curOI = num(latestOI, cgDaily.h, "oi_usd");
  const curFund = num(latestOI, cgDaily.h, "funding_oi_w");
  const curLiq = num(latestOI, cgDaily.h, "liq_vol");
  const curDate = col(latestOI, cgDaily.h, "date");

  // 实时值（从 fast-watch 或 live snapshot 获取最新）
  let livePrice = 0, liveOI = curOI, liveFund = curFund, liveLiq = curLiq;
  if (lvData && lvData.rows.length > 0) {
    const lastLv = lvData.rows[lvData.rows.length - 1];
    livePrice = num(lastLv, lvData.h, "price_usd");
    liveOI = num(lastLv, lvData.h, "coinglass_oi_usd") || curOI;
    liveFund = num(lastLv, lvData.h, "oi_weighted_funding") || curFund;
    liveLiq = num(lastLv, lvData.h, "liquidation_volume_4h") || curLiq;
    // Try to get 4h liq from the correct field
    const liq24 = num(lastLv, lvData.h, "liquidation_volume_24h");
    if (liq24 > 0 && liveLiq === 0) liveLiq = liq24;
  }
  if (fwData && fwData.rows.length > 0) {
    const lastFw = fwData.rows[fwData.rows.length - 1];
    const fwPrice = num(lastFw, fwData.h, "price_usd");
    if (fwPrice > 0) livePrice = fwPrice;
    const fwOI = num(lastFw, fwData.h, "coinglass_oi_usd");
    if (fwOI > 0) liveOI = fwOI;
    const fwFund = num(lastFw, fwData.h, "funding_rate_percent");
    if (fwFund > 0) liveFund = fwFund / 100;
  }

  // ── 2. 历史分布分析 ──
  const oiVals = labOI.map(r => num(r, cgDaily.h, "oi_usd"));
  const fundVals = labOI.map(r => num(r, cgDaily.h, "funding_oi_w")).filter(v => v !== 0);
  const liqVals = labOI.map(r => num(r, cgDaily.h, "liq_vol")).filter(v => v > 0);

  const oiPctl = percentile(oiVals, liveOI);
  const fundPctl = percentile(fundVals, liveFund);
  const liqPctl = percentile(liqVals, liveLiq);

  const oiMax = Math.max(...oiVals), oiMin = Math.min(...oiVals), oiMean = oiVals.reduce((a, b) => a + b, 0) / oiVals.length;
  const fundMax = Math.max(...fundVals), fundMean = fundVals.reduce((a, b) => a + b, 0) / fundVals.length;
  const liqMax = Math.max(...liqVals), liqMean = liqVals.length > 0 ? liqVals.reduce((a, b) => a + b, 0) / liqVals.length : 0;

  // ── 3. OI 趋势（最近 20 天）──
  const recentOI = labOI.slice(-20);
  const oiTrend: { date: string; oi: number; chg: number; fund: number }[] = [];
  for (let i = 0; i < recentOI.length; i++) {
    const oi = num(recentOI[i], cgDaily.h, "oi_usd");
    const prev = i > 0 ? num(recentOI[i - 1], cgDaily.h, "oi_usd") : oi;
    oiTrend.push({ date: col(recentOI[i], cgDaily.h, "date"), oi, chg: oi - prev, fund: num(recentOI[i], cgDaily.h, "funding_oi_w") });
  }

  // OI 增长率趋势
  const oiGrowthRates = oiTrend.slice(1).map(t => t.oi > 0 ? t.chg / (t.oi - t.chg) * 100 : 0);
  const oiGrowthNow = oiGrowthRates.length > 0 ? oiGrowthRates[oiGrowthRates.length - 1] : 0;
  const oiGrowthMax = Math.max(...oiGrowthRates, 0);

  // ── 4. 与 LAB 前次 peak 对比（May 2, 2026）──
  const peakDate = "2026-05-02";
  const peakRow = labOI.find(r => col(r, cgDaily.h, "date") >= peakDate);
  const prePeak = labOI.filter(r => col(r, cgDaily.h, "date") < peakDate).slice(-5);
  const postPeak = labOI.filter(r => col(r, cgDaily.h, "date") > peakDate).slice(0, 5);

  const peakOI = peakRow ? num(peakRow, cgDaily.h, "oi_usd") : 0;
  const peakFund = peakRow ? num(peakRow, cgDaily.h, "funding_oi_w") : 0;
  const oiFromPeak = peakOI > 0 ? (liveOI - peakOI) / peakOI * 100 : 0;
  const fundFromPeak = peakFund > 0 ? (liveFund - peakFund) / Math.abs(peakFund) * 100 : 0;

  // ── 5. 清算-OI 关系 ──
  const recentLiq = labOI.slice(-10).map(r => ({ date: col(r, cgDaily.h, "date"), liq: num(r, cgDaily.h, "liq_vol"), oi: num(r, cgDaily.h, "oi_usd") }));
  const liqOIRatios = recentLiq.filter(l => l.oi > 0 && l.liq > 0).map(l => ({ date: l.date, ratio: l.liq / l.oi * 100 }));
  const curLiqOIRatio = liveOI > 0 ? liveLiq / liveOI * 100 : 0;

  // ── 6. 价格-成交量-资金费率三角 ──
  const pvRecent = labPV.filter(r => r[5] === "PV_001" || r[5] === "PV_002").slice(-10);
  const returns = pvRecent.filter(r => r[5] === "PV_001").map(r => parseFloat(r[6] || "0")).filter(v => !isNaN(v));
  const volumes = pvRecent.filter(r => r[5] === "PV_002").map(r => parseFloat(r[6] || "0")).filter(v => !isNaN(v));

  // ── 7. 生成深度报告 ──
  const lines = [
    `# LAB 深度结构洞察 | ${ts}`,
    "",
    "---",
    "",
    "## 一、历史位置：当前值在 90 天分布中的位置",
    "",
    "| 指标 | 当前值 | 历史均值 | 历史最高 | 当前分位数 | 偏离倍数 |",
    "|------|--------|----------|----------|-----------|----------|",
    `| OI | $${fmt(liveOI)} | $${fmt(oiMean)} | $${fmt(oiMax)} | **${oiPctl.toFixed(0)}%** | ${(liveOI/oiMean).toFixed(1)}x |`,
    `| 资金费率 | ${(liveFund*100).toFixed(2)}% | ${(fundMean*100).toFixed(2)}% | ${(fundMax*100).toFixed(2)}% | **${fundPctl.toFixed(0)}%** | ${(liveFund/fundMean).toFixed(1)}x |`,
    `| 清算量 | $${fmt(liveLiq)} | $${fmt(liqMean)} | $${fmt(liqMax)} | **${liqPctl.toFixed(0)}%** | ${(liveLiq/liqMean).toFixed(1)}x |`,
    "",
    oiPctl > 90 ? `> **OI 处于历史 ${oiPctl.toFixed(0)}% 分位**——在过去 90 天中，只有 ${(100-oiPctl).toFixed(0)}% 的交易日 OI 比现在更高。` : "",
    fundPctl > 90 ? `> **资金费率处于历史 ${fundPctl.toFixed(0)}% 分位**——极度罕见的正向偏离。` : "",
    liqPctl > 90 ? `> **清算量处于历史 ${liqPctl.toFixed(0)}% 分位**——当前清算压力异常。` : "",
    "",
    "---",
    "",
    "## 二、OI 趋势：最近 20 天轨迹",
    "",
    "| 日期 | OI | 日变化 | 资金费率 | 趋势 |",
    "|------|-----|--------|----------|------|",
    ...oiTrend.map((t, i) => {
      const arrow = i > 0 ? (t.chg > 0 ? "↑" : t.chg < 0 ? "↓" : "→") : "·";
      const chgStr = i > 0 ? (t.chg >= 0 ? "+" : "") + fmt(t.chg / 1e6, 1, "M") : "起始";
      const bar = t.chg > 0 ? "█".repeat(Math.min(10, Math.round(Math.abs(t.chg) / oiMean * 50))) : "";
      return `| ${t.date} | $${fmt(t.oi / 1e6, 1, "M")} | ${chgStr} | ${(t.fund * 100).toFixed(2)}% | ${arrow} ${bar} |`;
    }),
    "",
    oiGrowthNow > 0 ? `**当前 OI 日增长率: ${oiGrowthNow.toFixed(1)}%（历史最高单日增长: ${oiGrowthMax.toFixed(1)}%）**` : "",
    "",
    "---",
    "",
    "## 三、与前次 Peak（May 2）对比",
    "",
    peakRow ? `| 维度 | 前次 Peak (${peakDate}) | 当前 (${curDate || "实时"}) | 变化 |` : "",
    peakRow ? `|------|-------------------------|------|------|` : "",
    peakRow ? `| OI | $${fmt(peakOI)} | $${fmt(liveOI)} | ${pct(oiFromPeak)} |` : "",
    peakRow ? `| 资金费率 | ${(peakFund*100).toFixed(2)}% | ${(liveFund*100).toFixed(2)}% | ${pct(fundFromPeak)} |` : "",
    peakRow ? `| OI/MCap | — | — | — |` : "",
    "",
    oiFromPeak > 10 ? `> ⚠️ OI 较前次 Peak 增加了 ${oiFromPeak.toFixed(0)}%——前次 Peak 后 LAB 在 2 天内从 $3.36 跌至 $0.60（-82%）。当前 OI 水平已远超前次 Peak。` : "",
    fundFromPeak > 50 ? `> ⚠️ 资金费率较前次 Peak 高出 ${fundFromPeak.toFixed(0)}%。` : "",
    "",
    "---",
    "",
    "## 四、清算-OI 动态关系",
    "",
    "| 日期 | 清算量 | OI | 清算/OI 比率 |",
    "|------|--------|-----|-------------|",
    ...liqOIRatios.map(l => `| ${l.date} | $${fmt(l.ratio > 0 ? l.ratio * (liveOI / 100) : 0)} | — | ${l.ratio.toFixed(4)}% |`).slice(-6),
    "",
    curLiqOIRatio > 0 ? `**当前清算/OI 比率: ${curLiqOIRatio.toFixed(4)}%**` : "",
    curLiqOIRatio > 0.005 ? `> ⚠️ 清算/OI 比率偏高——清算压力相对于 OI 规模在上升。` : `> 清算/OI 比率正常——当前清算规模相对于 OI 总量仍可控。`,
    "",
    "---",
    "",
    "## 五、结构特征总结",
    "",
    "### 当前 LAB 处于什么位置？",
    "",
    oiPctl > 90 && fundPctl > 90
      ? `> 🔴 **极端区域**：OI 和资金费率同时处于 90%+ 历史分位。这是在 90 天观察窗口中最极端的组合状态之一。前次 LAB Peak（May 2）也处于类似区域，随后 OI 在 2 天内从峰值回落，价格暴跌 82%。`
      : oiPctl > 80
      ? `> 🟠 **偏高区域**：OI 显著高于历史平均水平，但尚未达到前次 Peak 的极端程度。`
      : `> 正常区域`,
    "",
    "### 与前次 Peak 的差异",
    "",
    oiFromPeak > 0
      ? `> 当前 OI **超过**前次 Peak 水平 ${oiFromPeak.toFixed(0)}%。这意味着当前市场在 LAB 上配置的衍生品资金比前次崩盘前更多。这既是流动性的体现，也是潜在踩踏风险的来源。`
      : `> 当前 OI 低于前次 Peak，杠杆水平尚未回到前次极端位置。`,
    "",
    fundFromPeak > 0
      ? `> 资金费率比前次 Peak 高 ${fundFromPeak.toFixed(0)}%。多头支付给空头的成本更为极端——这通常意味着多头拥挤度更高，但也意味着反转时多头的踩踏风险更大。`
      : "",
    "",
    "### 关键观察",
    "",
    oiGrowthNow > 5
      ? `1. **OI 仍在加速增长**（日增 ${oiGrowthNow.toFixed(1)}%）。在已经极端的位置继续加速，表明新资金仍在涌入。这不是见顶信号，但意味着一旦转向，体量更大、影响更深。`
      : oiGrowthNow > 0
      ? `1. **OI 仍在增长但速度放缓**（日增 ${oiGrowthNow.toFixed(1)}%）。如果增速继续下降并转负，将是资金撤离的先行信号。`
      : `1. **OI 已开始下降**。这是关键的结构变化——如果持续，配合清算放大，可能标志去杠杆开始。`,
    "",
    curLiqOIRatio > 0.01
      ? `2. **清算/OI 比率偏高**（${curLiqOIRatio.toFixed(4)}%）。清算压力相对于 OI 规模在上升。如果这个趋势持续，可能触发连锁清算。`
      : `2. **清算/OI 比率仍在正常范围**（${curLiqOIRatio.toFixed(4)}%）。清算尚未成为主要压力源。`,
    "",
    liveFund > 0.15
      ? `3. **资金费率极端**（${(liveFund*100).toFixed(2)}%）。多头为维持头寸付出的成本极高。这不是反转的充分条件，但一旦价格停止上涨，持仓成本将迅速成为负担，引发多头平仓。`
      : `3. 资金费率偏高但仍可控。`,
    "",
    "---",
    "",
    "## 六、无法确认",
    "",
    "- 以上所有分析基于历史统计和结构对比，不构成对未来走势的预测",
    "- 无法确认当前是否见顶、何时见顶",
    "- 无法确认多头何时开始平仓",
    "- 极端状态可以持续更久——前次 LAB Peak 也曾在极端区域维持数日",
    "- 不构成交易建议，不构成方向性判断",
    "",
    "---",
    "",
    `*报告基于 90 天 CoinGlass 日级数据 + 实时快照。数据来源: CoinGlass, CoinGecko, OKX*`,
  ];

  writeFileSync(join(REPORTS_DIR, "lab_deep_insight.md"), lines.join("\n"));
  console.log(lines.join("\n"));
  console.log(`\n深度报告已保存: ${REPORTS_DIR}/lab_deep_insight.md`);
}

main().catch(console.error);
