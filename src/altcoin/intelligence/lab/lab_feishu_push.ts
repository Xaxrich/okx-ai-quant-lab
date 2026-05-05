import { mkdirSync, existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import { isFeishuEnabled, sendFeishuText, sanitizeMessage, isDryRun, getChatIdMasked } from "../../../integrations/feishu/feishu_client.js";
import { shouldSendFastAlert, shouldSendStandardBrief, shouldSendHourlyReport, messageHash } from "../../../integrations/feishu/feishu_push_guard.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const INTEL_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence");
const PUSH_LOG = join(OUT_DIR, "lab_feishu_push_log.jsonl");
const CHAT_ID = process.env.FEISHU_CHAT_ID || "";

// ── 读取历史数据 ──
function readCsv(p: string): { h: string[]; rows: string[][] } | null {
  if (!existsSync(p)) return null; const l = readFileSync(p, "utf-8").trim().split("\n"); if (l.length < 2) return null;
  return { h: l[0].split(","), rows: l.slice(1).map(x => x.split(",")) };
}
function col(r: string[], h: string[], name: string): string { const i = h.indexOf(name); return i >= 0 ? r[i] || "" : ""; }
function num(r: string[], h: string[], name: string): number { const v = parseFloat(col(r, h, name)); return isNaN(v) ? 0 : v; }

let _cgDaily: { h: string[]; rows: string[][] } | null = null;
function getCoinGlassHistory() {
  if (!_cgDaily) _cgDaily = readCsv(join(INTEL_DIR, "coinglass", "features", "coinglass_derivatives_features.csv"));
  return _cgDaily;
}

function percentile(vals: number[], v: number): number { const c = vals.filter(x => x <= v).length; return vals.length > 0 ? c / vals.length * 100 : 0; }

function fmt(n: number, d = 0): string { return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtChg(cur: number, prev: number, unit = ""): string {
  if (prev === 0 || isNaN(prev)) return "";
  const d = cur - prev; if (Math.abs(d) < 1e-9) return "持平";
  return `${d >= 0 ? "↑" : "↓"}${unit}${Math.abs(d).toFixed(unit === "%" ? 2 : 0)}`;
}

// ── 趋势计算 ──
function computeTrends() {
  const fw = readCsv(join(OUT_DIR, "lab_fast_watch_v2.csv"));
  const cg = getCoinGlassHistory();
  if (!fw || fw.rows.length < 2) return { oiStreak: 0, oiChangeReadings: [] as number[], fundStreak: 0 };

  const fwh = fw.h;
  const recent = fw.rows.slice(-6); // 最后 6 条（约 90 分钟）

  // OI 连续上升/下降
  const oiChanges: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const cur = num(recent[i], fwh, "coinglass_oi_usd");
    const prev = num(recent[i - 1], fwh, "coinglass_oi_usd");
    if (cur > 0 && prev > 0) oiChanges.push(cur - prev);
  }
  const oiRising = oiChanges.filter(c => c > 0).length;
  const oiFalling = oiChanges.filter(c => c < 0).length;

  return { oiStreak: oiRising >= oiFalling ? oiRising : -oiFalling, oiChangeReadings: oiChanges, fundStreak: 0 };
}

// ── 模板：5分钟快速预警 ──
function buildFastAlert(d: Record<string, string>, trends: any, fwRows: string[][], fwH: string[]): string {
  const price = d.price_usd || "?";
  const oi = Number(d.coinglass_oi_usd || "0");
  const oi4h = Number(d.oi_change_4h || "0");
  const fund = d.funding_rate_percent || "?";
  const streak = d.funding_streak || "?";
  const liq = Number(d.liq_4h || "0");
  const state = d.fast_watch_state || "?";
  const score = d.risk_score || "?";
  const label = d.review_label || "?";

  // 趋势摘要
  const trendLines: string[] = [];
  if (trends.oiStreak > 2) trendLines.push(`OI 连续 ${trends.oiStreak} 次上升，趋势未破`);
  else if (trends.oiStreak < -1) trendLines.push(`⚠️ OI 连续 ${Math.abs(trends.oiStreak)} 次下降——关注是否持续`);

  // 与前次对比
  if (fwRows.length >= 2) {
    const prev = fwRows[fwRows.length - 2];
    const prevOI = num(prev, fwH, "coinglass_oi_usd");
    const prevScore = num(prev, fwH, "risk_score");
    const prevState = col(prev, fwH, "fast_watch_state");
    if (prevOI > 0 && Math.abs(oi - prevOI) > 5e6) {
      trendLines.push(`OI 较上次 ${oi > prevOI ? "+" : ""}$${fmt(Math.abs(oi - prevOI) / 1e6, 1)}M`);
    }
    if (prevScore > 0 && Math.abs(Number(score) - prevScore) >= 5) {
      trendLines.push(`风险评分: ${prevScore}→${score}`);
    }
    if (prevState && prevState !== state) {
      trendLines.push(`状态迁移: ${prevState} → ${state}`);
    }
  }

  // 阈值距离
  const alerts: string[] = [];
  if (liq > 0 && liq < 1e6) alerts.push(`清算距 $1M 告警线差 $${fmt((1e6 - liq) / 1e3, 0)}K`);
  if (Number(fund) < 20) alerts.push(`资金费率距 20% 差 ${(20 - Number(fund)).toFixed(1)}%`);
  if (oi4h > 0) alerts.push(`OI 仍在上升，回落即告警`);

  const emoji = label.includes("高风险") ? "🔴" : label.includes("复核") ? "🟠" : label.includes("关注") ? "🟡" : "🟢";

  return `【LAB 预警｜${label}】${emoji}
${state} | 风险 ${score}/100

💰 $${price} | 24h ${d.return_24h ? (Number(d.return_24h) >= 0 ? "+" : "") + Number(d.return_24h).toFixed(1) + "%" : "?"}
📊 OI $${fmt(oi)} | 4h ${oi4h >= 0 ? "+" : ""}$${fmt(Math.abs(oi4h) / 1e6, 1)}M
💸 资金 ${fund}% | 连续 ${streak}期
💥 清算 $${fmt(liq)}

${trendLines.length > 0 ? "📌 " + trendLines.join("；") : ""}
${alerts.length > 0 ? "⚡ " + alerts.join(" | ") : ""}

不构成交易建议。`;
}

// ── 模板：15分钟情报简报 ──
function buildStandardBrief(d: Record<string, string>, trends: any, fwRows: string[][], fwH: string[]): string {
  const price = d.price_usd || "?";
  const oi = Number(d.coinglass_oi_usd || "0");
  const oi4h = Number(d.oi_change_4h || "0");
  const fund = Number(d.funding_rate_percent || "0");
  const liq = Number(d.liq_4h || "0");
  const state = d.fast_watch_state || "?";
  const score = d.risk_score || "?";

  // 历史位置
  const cg = getCoinGlassHistory();
  let histContext = "";
  if (cg) {
    const labRows = cg.rows.filter(r => r[0] === "LAB");
    const oiAll = labRows.map(r => num(r, cg.h, "oi_usd")).filter(v => v > 0);
    const fundAll = labRows.map(r => num(r, cg.h, "funding_oi_w")).filter(v => v !== 0);
    if (oiAll.length > 0 && fundAll.length > 0) {
      const oiPct = percentile(oiAll, oi).toFixed(0);
      const fundPct = percentile(fundAll, fund / 100).toFixed(0);
      const oiMax = Math.max(...oiAll);
      const fundMax = Math.max(...fundAll);
      histContext = `OI 历史${oiPct}%分位 (最高$${fmt(oiMax/1e6,0)}M) | 资金费率历史${fundPct}%分位 (最高${(fundMax*100).toFixed(1)}%)`;
    }
  }

  // 趋势
  const trend: string[] = [];
  if (trends.oiStreak >= 3) trend.push(`OI 连续${trends.oiStreak}次上升→趋势未破`);
  else if (trends.oiStreak <= -2) trend.push(`⚠️ OI 连续${Math.abs(trends.oiStreak)}次下降→关注持续`);
  else trend.push(`OI 趋势不明确`);

  // 前次对比
  if (fwRows.length >= 2) {
    const prev = fwRows[fwRows.length - 2];
    const prevOI = num(prev, fwH, "coinglass_oi_usd");
    const prevFund = Number(col(prev, fwH, "funding_rate_percent"));
    const prevLiq = num(prev, fwH, "liq_4h");
    if (prevOI > 0) trend.push(`OI ${oi >= prevOI ? "+" : ""}$${fmt(Math.abs(oi - prevOI) / 1e6, 1)}M vs上次`);
    if (prevFund > 0) trend.push(`资金 ${fmtChg(fund, prevFund, "%")} vs上次`);
    if (prevLiq > 0 && Math.abs(liq - prevLiq) > 1e5) trend.push(`清算 ${fmtChg(liq, prevLiq, "$")} vs上次`);
  }

  // 入场观察
  const watch: string[] = [];
  if (oi4h > 0) {
    watch.push(`OI 仍在加速——非入场时机，仓位已在堆积`);
    watch.push(`关注 OI 何时首次回落（4h 负值）——那是第一个风险信号`);
  } else {
    watch.push(`OI 已回落——如果持续，标志杠杆开始退出`);
  }
  if (fund > 15) {
    watch.push(`资金费率极端——多头持仓成本极高，一旦价格停滞将引发平仓`);
  }
  if (liq > 5e5) {
    watch.push(`清算已开始累积——如果加速，可能触发连锁`);
  }
  if (liq < 5e5) {
    watch.push(`清算尚温和——大规模去杠杆尚未开始`);
  }

  return `【LAB 15分钟情报】
${state} | 风险 ${score}/100

${histContext}

1. 市场
$${price} | 24h ${d.return_24h ? (Number(d.return_24h) >= 0 ? "+" : "") + Number(d.return_24h).toFixed(1) + "%" : "?"}

2. 衍生品
OI: $${fmt(oi)} | 4h ${oi4h >= 0 ? "+" : ""}$${fmt(Math.abs(oi4h) / 1e6, 1)}M
资金: ${fund.toFixed(2)}% | 连续 ${d.funding_streak || "?"}期
清算: $${fmt(liq)}

3. 趋势
${trend.join(" | ")}

4. 关注
${watch.map(w => "- " + w).join("\n")}

不构成交易建议。无法推断方向性意图。`;
}

// ── 模板：每小时深度情报 ──
function buildHourlySummary(d: Record<string, string>, trends: any, fwRows: string[][], fwH: string[]): string {
  const price = d.price_usd || "?";
  const oi = Number(d.coinglass_oi_usd || "0");
  const oi4h = Number(d.oi_change_4h || "0");
  const fund = Number(d.funding_rate_percent || "0");
  const liq = Number(d.liq_4h || "0");

  // 历史位置
  const cg = getCoinGlassHistory();
  let histNarrative = "";
  if (cg) {
    const labRows = cg.rows.filter(r => r[0] === "LAB");
    const oiAll = labRows.map(r => num(r, cg.h, "oi_usd")).filter(v => v > 0);
    const oiMax = Math.max(...oiAll), oiMean = oiAll.reduce((a, b) => a + b, 0) / oiAll.length
;
    const peakRow = labRows.find(r => col(r, cg.h, "date") >= "2026-05-02");
    const peakOI = peakRow ? num(peakRow, cg.h, "oi_usd") : 0;
    const peakFund = peakRow ? num(peakRow, cg.h, "funding_oi_w") : 0;

    histNarrative = `90天分布: OI 最高 $${fmt(oiMax/1e6,0)}M | 均值 $${fmt(oiMean/1e6,0)}M | 当前 $${fmt(oi/1e6,0)}M (${(oi/oiMean).toFixed(1)}x均值)
前次 Peak (5/2): OI $${fmt(peakOI/1e6,0)}M | 资金 ${(peakFund*100).toFixed(1)}% | 当前 OI 较那次 ${oi > peakOI ? "高出" : "低于"} ${Math.abs(oi - peakOI) / peakOI * 100 > 0 ? (Math.abs(oi - peakOI) / peakOI * 100).toFixed(0) + "%" : ""}`;
  }

  // 风险轨迹
  const trajectories: string[] = [];
  if (trends.oiStreak >= 4) {
    trajectories.push(`OI 连续 ${trends.oiStreak} 次读数上升——当前处于 OI 扩张期，未见拐点`);
  } else if (trends.oiStreak <= -2) {
    trajectories.push(`OI 连续 ${Math.abs(trends.oiStreak)} 次读数下降——这是可能的结构性拐点，需关注是否持续`);
  }

  if (oi4h > 0 && (oi4h / (oi - oi4h)) > 0.15) {
    trajectories.push(`OI 4h 增长率 ${(oi4h / (oi - oi4h) * 100).toFixed(0)}%——高速扩张中`);
  }

  if (fund > 15) {
    trajectories.push(`资金费率 ${fund.toFixed(1)}%——多头为维持仓位付出的年化成本极高。这不是做空信号，但意味着一旦买盘枯竭，持仓成本将迅速驱动平仓`);
  }

  // 关键观察
  const keyObs: string[] = [];
  if (oi4h > 0 && fund > 10) {
    keyObs.push(`🔴 OI 升 + 资金高 → 多头主导，拥挤度极高。`);
  }
  if (liq > 5e5 && liq / oi > 0.001) {
    keyObs.push(`🟠 清算/OI 比率在上升——杠杆开始出现压力。`);
  }
  if (liq / oi < 0.001) {
    keyObs.push(`🟢 清算压力低——去杠杆尚未开始。`);
  }
  keyObs.push(`📌 核心关注: OI 何时首次持续回落——那将是从"持仓堆积"转向"持仓退出"的结构信号。`);

  return `【LAB 每小时深度情报】
${d.fast_watch_state || "?"} | 风险 ${d.risk_score || "?"}/100

${histNarrative}

💰 $${price} (24h ${d.return_24h ? (Number(d.return_24h) >= 0 ? "+" : "") + Number(d.return_24h).toFixed(1) + "%" : "?"})
📊 OI $${fmt(oi/1e6, 1)}M | 4h ${oi4h >= 0 ? "+" : ""}$${fmt(Math.abs(oi4h)/1e6, 1)}M
💸 资金 ${fund.toFixed(2)}% | 💥 清算 $${fmt(liq)}

风险轨迹:
${trajectories.map(t => "- " + t).join("\n")}

${keyObs.join("\n")}

不构成交易建议。无法推断方向性意图。`;
}

function logPush(e: Record<string, string>) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(PUSH_LOG, JSON.stringify(e) + "\n");
}

async function main() {
  const pushType = process.argv.find(a => a.startsWith("--type="))?.split("=")[1] || "standard_brief";
  const dryRun = isDryRun();
  console.log(`=== LAB 飞书推送 [${pushType}] ${dryRun ? "(演习)" : "(实发)"} ===\n`);
  if (!CHAT_ID) { console.log("FEISHU_CHAT_ID 未设置"); return; }

  const fw = readCsv(join(OUT_DIR, "lab_fast_watch_v2.csv"));
  if (!fw || fw.rows.length < 1) { console.log("无 fast-watch 数据"); return; }
  const fwh = fw.h, fwr = fw.rows;
  const d: Record<string, string> = {}; fwh.forEach((k, i) => { d[k] = fwr[fwr.length - 1][i] || ""; });
  const trends = computeTrends();

  const ts = new Date().toISOString();
  let msg = "", shouldSend = false, reason = "";

  if (pushType === "fast_alert") {
    const st = d.fast_watch_state || "", lb = d.review_label || "", sc = parseInt(d.risk_score || "0"), fr = d.data_freshness || "", cgR = parseInt(d.coinglass_budget_remaining || "500");
    const a = shouldSendFastAlert(st, lb, sc, fr, cgR);
    shouldSend = a.send; reason = a.reasons.join("；");
    if (!shouldSend) { console.log(`跳过: ${reason}`); return; }
    msg = buildFastAlert(d, trends, fwr, fwh);
  } else if (pushType === "standard_brief") {
    msg = buildStandardBrief(d, trends, fwr, fwh);
    const h = messageHash(msg); const c = shouldSendStandardBrief(h); shouldSend = c.send; reason = c.reason;
    if (!shouldSend) { console.log(`跳过: ${reason}`); return; }
  } else if (pushType === "hourly_report") {
    msg = buildHourlySummary(d, trends, fwr, fwh);
    const h = messageHash(msg); const c = shouldSendHourlyReport(h); shouldSend = c.send; reason = c.reason;
    if (!shouldSend) { console.log(`跳过: ${reason}`); return; }
  }

  const s = sanitizeMessage(msg);
  if (!s.clean) { console.log(`拦截: ${s.violations.join(", ")}`); return; }

  if (dryRun) { console.log("── 演习预览 ──\n"); console.log(msg); console.log("\n── 结束 ──"); return; }

  console.log(`发送中...`);
  const r = await sendFeishuText(CHAT_ID, msg);
  console.log(r.ok ? `已发送! msgId=${r.msgId}` : `失败: ${r.error}`);
  logPush({ timestamp: ts, push_type: pushType, should_send: String(shouldSend), sent: r.ok ? "true" : "false", reason: r.ok ? "OK" : "失败", chat_id_masked: getChatIdMasked(), message_hash: messageHash(msg), message_length: String(msg.length), status: r.ok ? "已发送" : "失败", error_message: r.error || "" });
}

main().catch(console.error);
