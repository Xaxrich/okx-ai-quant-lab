import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { sendFeishuText, isFeishuEnabled, isDryRun, getChatIdMasked, sanitizeMessage } from "../../../integrations/feishu/feishu_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const INTEL_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence");
const CHAT_ID = process.env.FEISHU_CHAT_ID || "";

function readCsv(p: string) { if(!existsSync(p)) return null; const l=readFileSync(p,"utf8").trim().split("\n"); if(l.length<2) return null; return {h:l[0].split(","),rows:l.slice(1).map(x=>x.split(","))}; }
function col(r:string[],h:string[],n:string):string{const i=h.indexOf(n);return i>=0?r[i]||"":"";}
function num(r:string[],h:string[],n:string):number{const v=parseFloat(col(r,h,n));return isNaN(v)?0:v;}
function fmt(n:number,d=0):string{return n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});}
function pct(n:number):string{return (n>=0?"+":"")+n.toFixed(1)+"%";}

function analyze(readings: any[], cgHistory: any, fwData: any): string {
  const r = readings; // array of {ts,price,oi,oi4h,fund,liq,score,state}
  if (r.length < 2) return "数据不足，无法分析。";

  const cur = r[r.length - 1], prev = r[r.length - 2], prev2 = r.length >= 3 ? r[r.length - 3] : null;
  // UTC → 北京时间 (UTC+8)
  const utcTime = cur.ts || "?";
  let bjTime = utcTime;
  if (utcTime.includes(":")) {
    const [h, m, s] = utcTime.split(":");
    const bjH = (parseInt(h) + 8) % 24;
    bjTime = `${String(bjH).padStart(2, "0")}:${m}:${s}`;
  }
  const lines: string[] = [];
  lines.push(`数据时间: ${bjTime} (北京时间)`);
  let urgency = 0;

  // ── 1. 资金费率分析 ──
  const fundLines: string[] = [];
  const fundFlat = prev2 && Math.abs(cur.fund - prev.fund) < 0.05 && Math.abs(prev.fund - prev2.fund) < 0.05;
  const fundBreaking = !fundFlat && prev2 && Math.abs(prev.fund - prev2.fund) < 0.1 && Math.abs(cur.fund - prev.fund) > 0.3;

  if (fundBreaking) {
    const direction=cur.fund>prev2.fund?"上行":"下行";
    fundLines.push(`资金费率破了平台：${prev2.fund.toFixed(2)}% → ${prev.fund.toFixed(2)}% → ${cur.fund.toFixed(2)}%。连续3次卡在同一水平后突然${direction}——市场均衡被打破。`);
    urgency += 2;
  } else if (cur.fund > prev.fund + 0.5) {
    fundLines.push(`资金费率继续上升：${prev.fund.toFixed(2)}% → ${cur.fund.toFixed(2)}%（+${(cur.fund-prev.fund).toFixed(2)}%）。多头仍在加价争夺对手方。`);
    urgency += 1;
  } else if (Math.abs(cur.fund - prev.fund) < 0.1) {
    fundLines.push(`资金费率持平在 ${cur.fund.toFixed(2)}%。市场在当前位置暂时均衡。`);
  } else {
    fundLines.push(`资金费率回落：${prev.fund.toFixed(2)}% → ${cur.fund.toFixed(2)}%。`);
    urgency -= 1;
  }

  if (cur.fund > 15) { fundLines.push(`当前 ${cur.fund.toFixed(2)}% 处于极端区域——多头为维持仓位付出的年化成本极高。这不是做空信号，但一旦买盘枯竭，持仓成本将迅速驱动平仓。`); urgency += 1; }

  lines.push(...fundLines);

  // ── 2. 清算分析 ──
  const liqCrossing1M = prev.liq < 1e6 && cur.liq >= 1e6;
  const liqSpiking = prev.liq > 0 && cur.liq > prev.liq * 1.5;

  if (liqCrossing1M) {
    lines.push(`\n清算首次突破 $1M 告警线：$${fmt(prev.liq/1e3,0)}K → $${fmt(cur.liq/1e3,0)}K。这不是偶然——它与资金费率破平台同时发生。杠杆开始出现裂缝。`);
    urgency += 3;
  } else if (liqSpiking) {
    lines.push(`\n清算急剧放大：$${fmt(prev.liq/1e3,0)}K → $${fmt(cur.liq/1e3,0)}K（${pct((cur.liq-prev.liq)/prev.liq*100)}%）。加速值得警惕。`);
    urgency += 2;
  } else if (cur.liq > 5e5) {
    lines.push(`\n清算 $${fmt(cur.liq/1e3,0)}K——仍在积累中，尚未触发系统性压力。`);
  }

  if (cur.liq > 0 && cur.oi > 0) {
    const liqRatio = cur.liq / cur.oi * 100;
    if (liqRatio > 0.005) {
      lines.push(`清算/OI 比率 ${liqRatio.toFixed(4)}%——清算压力相对于 OI 规模在上升。`);
      urgency += 1;
    }
  }

  // ── 3. OI 趋势 ──
  const oiChg = cur.oi - prev.oi;
  const oiStreak = (() => { let s = 0; for (let i = r.length - 1; i >= 1 && r[i].oi > r[i-1].oi; i--) s++; return s; })();

  if (oiStreak >= 3) {
    lines.push(`\nOI 连续 ${oiStreak} 次上升——趋势未破，资金仍在涌入。当前 $${fmt(cur.oi/1e6,1)}M。`);
  } else if (oiChg < 0) {
    lines.push(`\n⚠️ OI 回落：$${fmt(Math.abs(oiChg)/1e6,1)}M。这是否是拐点——取决于下次读数是否继续下降。`);
    urgency += 3;
  }

  // 历史位置
  if (cgHistory) {
    const labOI = cgHistory.rows.filter((r: string[]) => r[0] === "LAB").map((r: string[]) => num(r, cgHistory.h, "oi_usd")).filter((v: number) => v > 0);
    if (labOI.length > 0) {
      const oiMean = labOI.reduce((a: number, b: number) => a + b, 0) / labOI.length;
      const oiStd = Math.sqrt(labOI.reduce((s: number, v: number) => s + (v - oiMean) ** 2, 0) / labOI.length);
      const z = (cur.oi - oiMean) / oiStd;
      const peakRow = cgHistory.rows.find((r: string[]) => r[0] === "LAB" && col(r, cgHistory.h, "date") >= "2026-05-02");
      const peakOI = peakRow ? num(peakRow, cgHistory.h, "oi_usd") : 0;
      lines.push(`\n背景：OI 处于 90天均值 ${z.toFixed(1)}σ 之外${peakOI > 0 ? "，比5月2日前次崩盘前Peak ($" + fmt(peakOI/1e6,0) + "M)高出 " + pct((cur.oi-peakOI)/peakOI*100) : ""}。`);
    }
  }

  // ── 4. 综合判断 ──
  lines.push(`\n── 综合判断 ──`);

  if (urgency >= 5) {
    lines.push(`风险升级中。资金费率破平台 + 清算突破告警线 + OI 高位运行——三重信号同时恶化。这不是逆势时机。关注接下来15分钟内OI是否转为下降、清算是否继续放大。`);
    lines.push(`风险等级: 🔴 高风险`);
  } else if (urgency >= 3) {
    lines.push(`风险偏高但尚未质变。关注资金费率是否继续上行、清算是否突破下一级阈值。`);
    lines.push(`风险等级: 🟠 警惕`);
  } else if (urgency >= 1) {
    lines.push(`结构稳定。市场在当前位置运行，无显著恶化信号。`);
    lines.push(`风险等级: 🟡 观察`);
  } else {
    lines.push(`风险消退中。`);
    lines.push(`风险等级: 🟢 正常`);
  }

  lines.push(`\n接下来15分钟重点：`);
  lines.push(`1. OI ${oiStreak >= 2 ? "仍在上升——关注何时首次持续回落" : "已回落——关注是否持续"}`);
  lines.push(`2. 清算${cur.liq >= 1e6 ? "已破 $1M——关注是否加速" : "尚未破 $1M——关注何时突破"}`);
  lines.push(`3. 资金费率${cur.fund > prev.fund ? "仍在上升——关注是否突破20%" : "已回落或持平"}`);
  lines.push(`\n不构成交易建议。无法推断方向性意图。`);

  return lines.join("\n");
}

async function main() {
  console.log("=== LAB AI 分析 ===\n");

  // 读取数据（假设 fast-watch 已由 cron 先执行）
  console.log("读取数据...");
  const fwData = readCsv(join(OUT_DIR, "lab_fast_watch_v2.csv"));
  const cgData = readCsv(join(INTEL_DIR, "coinglass", "features", "coinglass_derivatives_features.csv"));

  if (!fwData || fwData.rows.length < 2) { console.log("历史数据不足（需要至少2条记录）"); return; }

  // 提取最近4条读数
  const readings: any[] = [];
  const recent = fwData.rows.slice(-4);
  for (const r of recent) {
    readings.push({
      ts: col(r, fwData.h, "timestamp")?.slice(11, 19) || "?",
      price: num(r, fwData.h, "price_usd"),
      oi: num(r, fwData.h, "coinglass_oi_usd"),
      oi4h: num(r, fwData.h, "oi_change_4h"),
      fund: num(r, fwData.h, "funding_rate_percent"),
      liq: num(r, fwData.h, "liq_4h"),
      score: num(r, fwData.h, "risk_score"),
      state: col(r, fwData.h, "fast_watch_state"),
    });
  }

  // AI 分析
  console.log("分析中...");
  const analysis = analyze(readings, cgData, fwData);
  console.log(analysis);

  // 保存分析
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "analysis_msg.txt"), analysis);

  // ── 检查是否需要推送 ──
  const cur = readings[readings.length - 1], prev = readings[readings.length - 2];
  const oiDelta = Math.abs(cur.oi - prev.oi) / 1e6;
  const fundDelta = Math.abs(cur.fund - prev.fund);
  const liqDelta = Math.abs(cur.liq - prev.liq) / 1e3;
  const scoreDelta = Math.abs(cur.score - prev.score);
  const stateChanged = cur.state !== prev.state;

  // 检查上次推送时间
  const pushLogPath = join(OUT_DIR, "lab_feishu_push_log.jsonl");
  let lastPushMin = 999;
  if (existsSync(pushLogPath)) {
    const lines = readFileSync(pushLogPath, "utf-8").trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(lines[i]);
        if (e.status === "已发送" || e.status === "SENT") {
          lastPushMin = (Date.now() - new Date(e.timestamp).getTime()) / 60000;
          break;
        }
      } catch { /* skip */ }
    }
  }

  const materialChange = stateChanged || scoreDelta >= 5 || oiDelta > 5 || fundDelta > 0.3 || liqDelta > 300;
  const heartbeatDue = lastPushMin > 30;

  if (!materialChange && !heartbeatDue) {
    console.log(`跳过: 数据无显著变化 (OIΔ=$${oiDelta.toFixed(1)}M fundΔ=${fundDelta.toFixed(2)}% liqΔ=$${liqDelta.toFixed(0)}K scoreΔ=${scoreDelta}) 上次推送${lastPushMin.toFixed(0)}分钟前`);
    return;
  }

  console.log(materialChange ? `推送理由: 显著变化` : `推送理由: 心跳 (${lastPushMin.toFixed(0)}分钟无推送)`);

  // 发送飞书
  console.log("发送飞书...");
  if (!CHAT_ID) { console.log("FEISHU_CHAT_ID 未设置"); return; }
  if (!isFeishuEnabled()) { console.log("飞书未启用"); return; }

  const s = sanitizeMessage(analysis);
  if (!s.clean) { console.log("拦截: " + s.violations.join(", ")); return; }

  if (isDryRun()) { console.log("演习模式——不发送"); return; }

  const r = await sendFeishuText(CHAT_ID, analysis);
  console.log(r.ok ? `已发送! msgId=${r.msgId}` : `失败: ${r.error}`);
}

main().catch(console.error);
