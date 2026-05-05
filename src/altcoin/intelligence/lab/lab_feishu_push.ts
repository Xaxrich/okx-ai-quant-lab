import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import { isFeishuEnabled, sendFeishuText, sanitizeMessage, isDryRun, getChatIdMasked } from "../../../integrations/feishu/feishu_client.js";
import { shouldSendFastAlert, shouldSendStandardBrief, shouldSendHourlyReport, messageHash } from "../../../integrations/feishu/feishu_push_guard.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const PUSH_LOG = join(OUT_DIR, "lab_feishu_push_log.jsonl");
const CHAT_ID = process.env.FEISHU_CHAT_ID || "";

interface FastWatchRow { [key: string]: string; }

function readLatestFastWatch(): FastWatchRow | null {
  const path = join(OUT_DIR, "lab_fast_watch_v2.csv");
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf-8").trim().split("\n");
  if (lines.length < 2) return null;
  const h = lines[0].split(",");
  const last = lines[lines.length - 1].split(",");
  const obj: FastWatchRow = {};
  h.forEach((k, i) => { obj[k] = last[i] || ""; });
  return obj;
}

function readLatestReport(): string | null {
  const path = join(REPORTS_DIR, "lab_live_monitor_report.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

function buildFastAlert(d: FastWatchRow): string {
  const state = d.fast_watch_state || "?";
  const risk = d.risk_score || "?";
  const label = d.review_label || "?";
  const price = d.price_usd || "?";
  const funding = d.funding_rate_percent || "?";
  const oi = d.coinglass_oi_usd || "?";
  const oi4h = d.oi_change_4h || "?";
  const liq = d.liq_4h || "?";
  const fresh = d.data_freshness_status || "?";

  return `【LAB Fast Watch｜${label}】
State: ${state}
Risk: ${risk}/100
Price: $${price}
Funding: ${funding}%
OI: $${Number(oi).toFixed(0)}
OI Δ4h: ${Number(oi4h) >= 0 ? "+" : ""}$${Number(oi4h).toFixed(0)}
Liq 4h: $${Number(liq).toFixed(0)}
Freshness: ${fresh}

Manual review:
- OI rollover?
- Liquidation spike?
- Price efficiency decay?
- Funding reversing?

No trading recommendation. Cannot infer directional intent.`;
}

function buildStandardBrief(d: FastWatchRow): string {
  const state = d.fast_watch_state || "?";
  const risk = d.risk_score || "?";
  const label = d.review_label || "?";
  const price = d.price_usd || "?";
  const ret24h = d.return_24h || "?";

  return `【LAB 15m Intelligence Brief】
主状态：${state}
风险评分：${risk}/100（${label}）
数据新鲜度：${d.data_freshness_status || "?"}

1. Market
- Price: $${price}
- Return 24h: ${ret24h}%
- Price source: ${d.price_source || "?"}

2. Derivatives
- OI: $${Number(d.coinglass_oi_usd || "0").toFixed(0)}
- OI Δ4h: ${Number(d.oi_change_4h || "0") >= 0 ? "+" : ""}$${Number(d.oi_change_4h || "0").toFixed(0)}
- Funding: ${d.funding_rate_percent || "?"}% (src: ${d.funding_source || d.funding_cache_age_min ? "cache" : "?"})
- Liq 4h: $${Number(d.liq_4h || "0").toFixed(0)}

3. Next Watch
- Funding持续高位?
- OI由正转负?
- 清算突然放大?
- 价格失去推进效率?
- CG budget充足? (剩余: ${d.coinglass_budget_remaining || "?"})

No trading recommendation. Cannot infer directional intent.`;
}

function buildHourlySummary(report: string): string {
  const lines = report.split("\n");
  const execLine = lines.find(l => l.includes("Main State:")) || "";
  const dqLine = lines.find(l => l.includes("Core DQ:")) || "";
  const priceLine = lines.find(l => l.includes("- Price:")) || "";
  const oiLine = lines.find(l => l.includes("Aggregated OI:")) || "";
  const fundLine = lines.find(l => l.includes("Funding percent:")) || "";
  const liqLine = lines.find(l => l.includes("Liq 4h:")) || "";

  return `【LAB Hourly Intelligence Report】
${execLine.trim()}
${dqLine.trim()}

Market: ${priceLine.replace("- Price:", "").trim()}
Derivatives: ${oiLine.replace("- Aggregated OI:", "").trim()}
Funding: ${fundLine.replace("- Funding percent:", "").trim()}
Liquidation: ${liqLine.replace("- Liq 4h:", "").trim()}

Full report: lab_live_monitor_report.md
No trading recommendation. Cannot infer directional intent.`;
}

function logPush(entry: Record<string, string>) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(PUSH_LOG, JSON.stringify(entry) + "\n");
}

async function main() {
  const pushType = process.argv.find(a => a.startsWith("--type="))?.split("=")[1] || "standard_brief";
  const dryRun = isDryRun();
  console.log(`=== LAB Feishu Push [${pushType}] ${dryRun ? "(DRY-RUN)" : "(LIVE)"} ===\n`);

  if (!CHAT_ID) { console.log("FEISHU_CHAT_ID not set — cannot send"); return; }

  let message = "";
  let shouldSend = false;
  let reason = "";
  const ts = new Date().toISOString();
  const hash = messageHash(ts); // temporary, will be replaced with actual content hash

  if (pushType === "fast_alert") {
    const d = readLatestFastWatch();
    if (!d) { console.log("No fast watch data"); return; }
    const state = d.fast_watch_state || "";
    const label = d.review_label || "";
    const risk = parseInt(d.risk_score || "0");
    const fresh = d.data_freshness_status || "";
    const cgRem = parseInt(d.coinglass_budget_remaining || "500");

    const alert = shouldSendFastAlert(state, label, risk, fresh, cgRem);
    shouldSend = alert.send;
    reason = alert.reasons.join("; ");
    if (shouldSend) {
      message = buildFastAlert(d);
    } else {
      console.log(`Fast alert skipped: ${reason}`);
      logPush({ timestamp: ts, push_type: pushType, should_send: "false", sent: "false", reason, chat_id_masked: getChatIdMasked(), message_hash: "", message_length: "0", status: "SKIPPED", error_message: reason });
      return;
    }
  } else if (pushType === "standard_brief") {
    const d = readLatestFastWatch();
    if (!d) { console.log("No fast watch data"); return; }
    message = buildStandardBrief(d);
    const h = messageHash(message);
    const check = shouldSendStandardBrief(h);
    shouldSend = check.send;
    reason = check.reason;
    if (!shouldSend) {
      console.log(`Standard brief skipped: ${reason}`);
      logPush({ timestamp: ts, push_type: pushType, should_send: "false", sent: "false", reason, chat_id_masked: getChatIdMasked(), message_hash: h, message_length: String(message.length), status: "SKIPPED", error_message: reason });
      return;
    }
  } else if (pushType === "hourly_report") {
    const report = readLatestReport();
    if (!report) { console.log("No live monitor report"); return; }
    message = buildHourlySummary(report);
    const h = messageHash(message);
    const check = shouldSendHourlyReport(h);
    shouldSend = check.send;
    reason = check.reason;
    if (!shouldSend) {
      console.log(`Hourly skipped: ${reason}`);
      logPush({ timestamp: ts, push_type: pushType, should_send: "false", sent: "false", reason, chat_id_masked: getChatIdMasked(), message_hash: h, message_length: String(message.length), status: "SKIPPED", error_message: reason });
      return;
    }
  }

  // Safety check
  const sanitized = sanitizeMessage(message);
  if (!sanitized.clean) {
    console.log(`PUSH_BLOCKED_FORBIDDEN_TERMS: ${sanitized.violations.join(", ")}`);
    logPush({ timestamp: ts, push_type: pushType, should_send: String(shouldSend), sent: "false", reason: "FORBIDDEN_TERMS", chat_id_masked: getChatIdMasked(), message_hash: messageHash(message), message_length: String(message.length), status: "BLOCKED", error_message: sanitized.violations.join(", ") });
    return;
  }

  if (dryRun) {
    console.log("── DRY-RUN PREVIEW ──\n");
    console.log(message);
    console.log("\n── END PREVIEW ──");
    console.log("Set FEISHU_ENABLED=true to send live.");
    logPush({ timestamp: ts, push_type: pushType, should_send: String(shouldSend), sent: "false", reason: "DRY_RUN", chat_id_masked: getChatIdMasked(), message_hash: messageHash(message), message_length: String(message.length), status: "DRY_RUN", error_message: "" });
    return;
  }

  // Live send
  console.log(`Sending ${pushType} to ${getChatIdMasked()}...`);
  const result = await sendFeishuText(CHAT_ID, message);
  const sent = result.ok ? "true" : "false";
  console.log(result.ok ? `Sent! msgId=${result.msgId}` : `Failed: ${result.error}`);

  logPush({ timestamp: ts, push_type: pushType, should_send: String(shouldSend), sent, reason: result.ok ? "OK" : "FAILED", chat_id_masked: getChatIdMasked(), message_hash: messageHash(message), message_length: String(message.length), status: result.ok ? "SENT" : "FAILED", error_message: result.error || "" });
}

main().catch(console.error);
