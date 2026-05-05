import { mkdirSync, existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import { isFeishuEnabled, sendFeishuText, sanitizeMessage, isDryRun, getChatIdMasked } from "../../../integrations/feishu/feishu_client.js";
import { shouldSendFastAlert, shouldSendStandardBrief, shouldSendHourlyReport, messageHash } from "../../../integrations/feishu/feishu_push_guard.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const PUSH_LOG = join(OUT_DIR, "lab_feishu_push_log.jsonl");
const CHAT_ID = process.env.FEISHU_CHAT_ID || "";

function readLatestRow(): Record<string, string> | null {
  const sp = join(OUT_DIR, "lab_fast_watch_v2.csv"); if (!existsSync(sp)) return null;
  const ls = readFileSync(sp, "utf-8").trim().split("\n"); if (ls.length < 2) return null;
  const h = ls[0].split(","), r = ls[ls.length - 1].split(",");
  const o: Record<string, string> = {}; h.forEach((k, i) => { o[k] = r[i] || ""; }); return o;
}

function readPrevRow(): Record<string, string> | null {
  const sp = join(OUT_DIR, "lab_fast_watch_v2.csv"); if (!existsSync(sp)) return null;
  const ls = readFileSync(sp, "utf-8").trim().split("\n"); if (ls.length < 3) return null;
  const h = ls[0].split(","), r = ls[ls.length - 2].split(",");
  const o: Record<string, string> = {}; h.forEach((k, i) => { o[k] = r[i] || ""; }); return o;
}

function readLatestReport(): string | null {
  const p = join(REPORTS_DIR, "lab_live_monitor_report.md"); if (!existsSync(p)) return null;
  return readFileSync(p, "utf-8");
}

function fmt(n: string | undefined, decimals: number = 0): string {
  const v = parseFloat(n || "0"); if (isNaN(v)) return "?";
  return decimals > 0 ? v.toFixed(decimals) : v.toLocaleString();
}

function fmtChg(cur: string | undefined, prev: string | undefined, unit: string = ""): string {
  const c = parseFloat(cur || "0"), p = parseFloat(prev || "0");
  if (isNaN(c) || isNaN(p) || p === 0) return "";
  const d = c - p;
  if (Math.abs(d) < 1e-6) return "持平";
  return `${d >= 0 ? "↑" : "↓"}${unit}${Math.abs(d).toFixed(unit.includes("%") ? 2 : 0)}`;
}

function buildFastAlert(d: Record<string, string>, prev: Record<string, string> | null): string {
  const label = d.review_label || "?", score = d.risk_score || "?";
  return `【LAB 快速预警｜${label === "高风险复核" ? "🔴 高风险复核" : label === "需要复核" ? "🟡 需要复核" : label === "密切关注" ? "🟠 密切关注" : "🟢 常规观察"}】
${d.fast_watch_state || "?"} | 风险 ${score}/100

💰 $${d.price_usd || "?"} | 24h ${d.return_24h ? (parseFloat(d.return_24h) >= 0 ? "+" : "") + parseFloat(d.return_24h).toFixed(1) + "%" : "?"}
📊 OI: $${fmt(d.coinglass_oi_usd)} | 4h ${parseFloat(d.oi_change_4h || "0") >= 0 ? "+" : ""}$${(Math.abs(parseFloat(d.oi_change_4h || "0")) / 1e6).toFixed(1)}M${prev ? " | " + fmtChg(d.coinglass_oi_usd, prev.coinglass_oi_usd, "$") : ""}
💸 资金费率: ${d.funding_rate_percent || "?"}% | 连续 ${d.funding_streak || "?"} 期${prev ? " | " + fmtChg(d.funding_rate_percent, prev.funding_rate_percent, "%") : ""}
💥 清算 4h: $${fmt(d.liq_4h)}${prev ? " | " + fmtChg(d.liq_4h, prev.liq_4h, "$") : ""}

${d.changes_summary ? "📌 变化: " + d.changes_summary : ""}
${d.next_watch ? "👀 关注: " + d.next_watch.split("; ").slice(0, 2).join(" | ") : ""}

不构成交易建议。无法推断方向性意图。`;
}

function buildStandardBrief(d: Record<string, string>, prev: Record<string, string> | null): string {
  const score = d.risk_score || "?";
  return `【LAB 15分钟情报简报】
${d.fast_watch_state || "?"} | 风险 ${score}/100 [${d.review_label || "?"}]
数据: ${d.data_freshness || "?"}${d.changes_summary ? " | " + d.changes_summary : ""}

1. 市场
- 价格: $${d.price_usd || "?"} (24h ${d.return_24h ? (parseFloat(d.return_24h) >= 0 ? "+" : "") + parseFloat(d.return_24h).toFixed(1) + "%" : "?"})
- 来源: ${d.price_source || "?"}

2. 衍生品
- OI: $${fmt(d.coinglass_oi_usd)} | 4h ${parseFloat(d.oi_change_4h || "0") >= 0 ? "+" : ""}$${(Math.abs(parseFloat(d.oi_change_4h || "0")) / 1e6).toFixed(1)}M
- 资金费率: ${d.funding_rate_percent || "?"}% | 连续 ${d.funding_streak || "?"} 期
- 清算 4h: $${fmt(d.liq_4h)} (上行 $${fmt(d.liq_upward)} / 下行 $${fmt(d.liq_downward)})

3. 阈值临近
${d.next_watch ? d.next_watch.split("; ").map(w => "- " + w).join("\n") : "- 无特别关注项"}

4. 下次关注
- 资金费率是否继续高位
- OI 是否由正转负
- 清算是否突然放大
- 价格是否失去推进效率
- CG 预算是否充足 (剩 ${d.coinglass_budget_remaining || "?"})

不构成交易建议。无法推断方向性意图。`;
}

function buildHourlySummary(report: string): string {
  const ls = report.split("\n");
  const findLine = (keyword: string) => ls.find(l => l.includes(keyword))?.replace(/^[-\s]+/, "").trim() || "?";

  // 提取关键行
  const mainLine = ls.find(l => l.includes("Main State:"))?.replace("**Main State:", "").replace("**", "").trim() || "?";
  const dqLine = ls.find(l => l.includes("Core DQ:")) || "";
  const priceLine = findLine("Price:");
  const oiLine = findLine("Aggregated OI:");
  const oiMcLine = findLine("OI/MCap:");
  const fundLine = findLine("Funding percent:");
  const liq4hLine = findLine("Liq 4h:");
  const liq24hLine = findLine("Liq 24h:");
  const checklistLines = ls.slice(ls.findIndex(l => l.includes("Manual Review Checklist")));
  const deleverLine = checklistLines.find(l => l.includes("去杠杆"));
  const oiDeclineLine = checklistLines.find(l => l.includes("OI开始下降"));
  const fundLine2 = checklistLines.find(l => l.includes("Funding极端"));
  const dataLine = checklistLines.find(l => l.includes("数据完整"));

  return `【LAB 每小时情报报告】
主状态: ${mainLine}
${dqLine.replace("#", "").trim()}

市场: ${priceLine}
衍生品: ${oiLine} | ${oiMcLine}
资金: ${fundLine}
清算: ${liq4hLine} | ${liq24hLine}

人工复核:
- ${fundLine2 || "资金费率检查"}
- ${deleverLine || "去杠杆检查"}
- ${oiDeclineLine || "OI回落检查"}
- ${dataLine || "数据完整性检查"}

完整报告: lab_live_monitor_report.md
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

  const ts = new Date().toISOString();
  let msg = "", shouldSend = false, reason = "";

  if (pushType === "fast_alert") {
    const d = readLatestRow(); if (!d) { console.log("无数据"); return; }
    const prev = readPrevRow();
    const st = d.fast_watch_state || "", lb = d.review_label || "", sc = parseInt(d.risk_score || "0"), fr = d.data_freshness || "", cgR = parseInt(d.coinglass_budget_remaining || "500");
    const a = shouldSendFastAlert(st, lb, sc, fr, cgR);
    shouldSend = a.send; reason = a.reasons.join("；");
    if (!shouldSend) { console.log(`跳过: ${reason}`); logPush({ timestamp: ts, push_type: pushType, should_send: "false", sent: "false", reason, chat_id_masked: getChatIdMasked(), message_hash: "", message_length: "0", status: "跳过", error_message: reason }); return; }
    msg = buildFastAlert(d, prev);
  } else if (pushType === "standard_brief") {
    const d = readLatestRow(); if (!d) { console.log("无数据"); return; }
    const prev = readPrevRow();
    msg = buildStandardBrief(d, prev);
    const h = messageHash(msg); const c = shouldSendStandardBrief(h); shouldSend = c.send; reason = c.reason;
    if (!shouldSend) { console.log(`跳过: ${reason}`); logPush({ timestamp: ts, push_type: pushType, should_send: "false", sent: "false", reason, chat_id_masked: getChatIdMasked(), message_hash: h, message_length: String(msg.length), status: "跳过", error_message: reason }); return; }
  } else if (pushType === "hourly_report") {
    const rpt = readLatestReport(); if (!rpt) { console.log("无报告"); return; }
    msg = buildHourlySummary(rpt);
    const h = messageHash(msg); const c = shouldSendHourlyReport(h); shouldSend = c.send; reason = c.reason;
    if (!shouldSend) { console.log(`跳过: ${reason}`); logPush({ timestamp: ts, push_type: pushType, should_send: "false", sent: "false", reason, chat_id_masked: getChatIdMasked(), message_hash: h, message_length: String(msg.length), status: "跳过", error_message: reason }); return; }
  }

  // 安全检查
  const s = sanitizeMessage(msg);
  if (!s.clean) { console.log(`拦截: ${s.violations.join(", ")}`); logPush({ timestamp: ts, push_type: pushType, should_send: String(shouldSend), sent: "false", reason: "禁止词", chat_id_masked: getChatIdMasked(), message_hash: messageHash(msg), message_length: String(msg.length), status: "拦截", error_message: s.violations.join(", ") }); return; }

  if (dryRun) {
    console.log("── 演习预览 ──\n"); console.log(msg); console.log("\n── 结束 ──");
    logPush({ timestamp: ts, push_type: pushType, should_send: String(shouldSend), sent: "false", reason: "演习", chat_id_masked: getChatIdMasked(), message_hash: messageHash(msg), message_length: String(msg.length), status: "演习", error_message: "" });
    return;
  }

  console.log(`发送中...`);
  const r = await sendFeishuText(CHAT_ID, msg);
  console.log(r.ok ? `已发送! msgId=${r.msgId}` : `失败: ${r.error}`);
  logPush({ timestamp: ts, push_type: pushType, should_send: String(shouldSend), sent: r.ok ? "true" : "false", reason: r.ok ? "OK" : "失败", chat_id_masked: getChatIdMasked(), message_hash: messageHash(msg), message_length: String(msg.length), status: r.ok ? "已发送" : "失败", error_message: r.error || "" });
}

main().catch(console.error);
