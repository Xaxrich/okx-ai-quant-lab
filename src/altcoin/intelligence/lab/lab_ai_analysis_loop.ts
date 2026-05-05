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
  const r = readings;
  if (r.length < 2) return "数据不足。";

  const cur = r[r.length - 1], first = r[0];
  const utcTime = cur.ts || "?";
  let bjTime = utcTime;
  if (utcTime.includes(":")) { const [h, m, s] = utcTime.split(":"); bjTime = `${String((parseInt(h) + 8) % 24).padStart(2, "0")}:${m}:${s}`; }

  // ── 计算全序列趋势（不是只看前1-2条）──
  const allOI = r.map((x: any) => x.oi).filter((v: number) => v > 0);
  const allFund = r.map((x: any) => x.fund).filter((v: number) => v > 0);
  const allLiq = r.map((x: any) => x.liq);
  const allPrice = r.map((x: any) => x.price).filter((v: number) => v > 0);
  const allScore = r.map((x: any) => x.score);

  // 极值
  const maxOI = Math.max(...allOI), minOI = Math.min(...allOI);
  const maxFund = Math.max(...allFund), minFund = Math.min(...allFund);
  const maxLiq = Math.max(...allLiq), maxPrice = Math.max(...allPrice);
  const maxScore = Math.max(...allScore);

  // 趋势：比较前半段 vs 后半段
  const half = Math.floor(r.length / 2);
  const firstHalfOI = allOI.slice(0, half), secondHalfOI = allOI.slice(half);
  const firstHalfFund = allFund.slice(0, half), secondHalfFund = allFund.slice(half);
  const avgFirstOI = firstHalfOI.reduce((a: number, b: number) => a + b, 0) / firstHalfOI.length;
  const avgSecondOI = secondHalfOI.reduce((a: number, b: number) => a + b, 0) / secondHalfOI.length;
  const avgFirstFund = firstHalfFund.reduce((a: number, b: number) => a + b, 0) / firstHalfFund.length;
  const avgSecondFund = secondHalfFund.reduce((a: number, b: number) => a + b, 0) / secondHalfFund.length;

  const oiTrendDir = avgSecondOI > avgFirstOI * 1.02 ? "上升" : avgSecondOI < avgFirstOI * 0.98 ? "下降" : "持平";
  const fundTrendDir = avgSecondFund > avgFirstFund * 1.1 ? "上升" : avgSecondFund < avgFirstFund * 0.9 ? "下降" : "持平";

  // 近3次方向
  const recent3 = r.slice(-3);
  const oiDirs = recent3.slice(1).map((x: any, i: number) => x.oi - recent3[i].oi);
  const oiStreakUp = oiDirs.filter((d: number) => d > 0).length;
  const oiStreakDown = oiDirs.filter((d: number) => d < 0).length;
  const fundDirs = recent3.slice(1).map((x: any, i: number) => x.fund - recent3[i].fund);
  const fundStreakUp = fundDirs.filter((d: number) => d > 0).length;
  const fundStreakDown = fundDirs.filter((d: number) => d < 0).length;

  // ── 构建分析 ──
  const lines: string[] = [];
  lines.push(`数据时间: ${bjTime} (北京时间) | 共${r.length}次读数`);

  // 1. 数据说了什么（事实，非模板）
  const facts: string[] = [];

  // OI 事实
  const oiFromPeak = maxOI > 0 ? (cur.oi - maxOI) / maxOI * 100 : 0;
  const oiRange = maxOI - minOI;
  if (cur.oi === maxOI) facts.push(`OI 处于监控周期最高点 $${(cur.oi/1e6).toFixed(0)}M`);
  else if (oiFromPeak < -10) facts.push(`OI 已从峰值 $${(maxOI/1e6).toFixed(0)}M 累计回落 ${Math.abs(oiFromPeak).toFixed(0)}%，当前 $${(cur.oi/1e6).toFixed(0)}M`);
  else if (oiFromPeak < -3) facts.push(`OI 较峰值 $${(maxOI/1e6).toFixed(0)}M 回落 ${Math.abs(oiFromPeak).toFixed(0)}%`);
  else facts.push(`OI 接近峰值 $${(cur.oi/1e6).toFixed(0)}M`);

  if (oiStreakDown === 2) facts.push(`OI 连续 ${oiStreakDown + 1} 次下降`);
  else if (oiStreakUp === 2) facts.push(`OI 连续 ${oiStreakUp + 1} 次上升`);

  // 资金费率事实
  if (cur.fund === maxFund) facts.push(`资金费率处于监控周期最高 ${cur.fund.toFixed(2)}%`);
  else if (maxFund > 15 && cur.fund < maxFund * 0.6) facts.push(`资金费率已从峰值 ${maxFund.toFixed(1)}% 大幅回落至 ${cur.fund.toFixed(2)}%`);
  else if (cur.fund > 10) facts.push(`资金费率 ${cur.fund.toFixed(2)}% 仍偏高`);
  else facts.push(`资金费率 ${cur.fund.toFixed(2)}% 处于中等水平`);

  if (fundStreakDown === 2) facts.push(`资金费率连续 ${fundStreakDown + 1} 次下降`);
  else if (fundStreakUp === 2) facts.push(`资金费率连续 ${fundStreakUp + 1} 次上升`);

  // 清算事实
  if (cur.liq >= 1e6) facts.push(`清算 $${(cur.liq/1e6).toFixed(1)}M 处于高位`);
  else if (maxLiq > 1e6 && cur.liq < maxLiq * 0.3) facts.push(`清算已从峰值 $${(maxLiq/1e6).toFixed(1)}M 大幅回落至 $${(cur.liq/1e3).toFixed(0)}K`);
  else if (cur.liq > 5e5) facts.push(`清算 $${(cur.liq/1e3).toFixed(0)}K 处于中等水平`);
  else facts.push(`清算 $${(cur.liq/1e3).toFixed(0)}K 处于低位`);

  // 价格事实
  const priceFromPeak = maxPrice > 0 ? (cur.price - maxPrice) / maxPrice * 100 : 0;
  if (cur.price === maxPrice) facts.push(`价格处于监控周期最高 $${cur.price.toFixed(2)}`);
  else if (priceFromPeak < -10) facts.push(`价格已从峰值 $${maxPrice.toFixed(2)} 回落 ${Math.abs(priceFromPeak).toFixed(0)}%`);
  else if (priceFromPeak < -3) facts.push(`价格较峰值回落 ${Math.abs(priceFromPeak).toFixed(0)}%`);

  lines.push(`\n${facts.join("。")}。`);

  // 2. 趋势判断（基于全序列，不是单点）
  lines.push(`\n── 趋势 ──`);
  lines.push(`OI 整体趋势: ${oiTrendDir}（前半段均值 $${(avgFirstOI/1e6).toFixed(0)}M → 后半段 $${(avgSecondOI/1e6).toFixed(0)}M）`);
  lines.push(`资金费率整体: ${fundTrendDir}（${avgFirstFund.toFixed(2)}% → ${avgSecondFund.toFixed(2)}%）`);

  // 3. 与历史周期的关系（用真实数据，不用模板）
  if (cgHistory) {
    const labOI = cgHistory.rows.filter((r2: string[]) => r2[0] === "LAB").map((r2: string[]) => num(r2, cgHistory.h, "oi_usd")).filter((v: number) => v > 0);
    if (labOI.length > 0) {
      const oiMean = labOI.reduce((a: number, b: number) => a + b, 0) / labOI.length;
      const oiStd = Math.sqrt(labOI.reduce((s: number, v: number) => s + (v - oiMean) ** 2, 0) / labOI.length);
      const z = (cur.oi - oiMean) / oiStd;
      const peakRow = cgHistory.rows.find((r2: string[]) => r2[0] === "LAB" && col(r2, cgHistory.h, "date") >= "2026-05-02");
      const peakOI = peakRow ? num(peakRow, cgHistory.h, "oi_usd") : 0;
      const peakFund = peakRow ? num(peakRow, cgHistory.h, "funding_oi_w") : 0;
      if (peakOI > 0) {
        const oiVsPeak = (cur.oi - peakOI) / peakOI * 100;
        const fundVsPeak = peakFund > 0 ? cur.fund - peakFund * 100 : 0;
        lines.push(`\n── 与前次崩盘(5/2)对比 ──`);
        lines.push(`前次 Peak: OI $${(peakOI/1e6).toFixed(0)}M, 资金 ${(peakFund*100).toFixed(1)}% → 随后2天跌82%`);
        lines.push(`当前: OI $${(cur.oi/1e6).toFixed(0)}M (${oiVsPeak > 0 ? "高" : "低"}${Math.abs(oiVsPeak).toFixed(0)}%), 资金 ${cur.fund.toFixed(2)}% (${fundVsPeak > 0 ? "高" : "低"}${Math.abs(fundVsPeak).toFixed(1)}个百分点)`);
        if (cur.oi > peakOI && cur.fund < peakFund * 100) {
          lines.push(`→ 当前 OI 比前次更大，但资金费率更低——说明这次杠杆分布更均衡，或市场结构已变。`);
        } else if (cur.oi < peakOI && cur.fund < peakFund * 100) {
          lines.push(`→ OI 和资金费率均低于前次 Peak——去杠杆压力已明显缓解。`);
        }
      }
    }
  }

  // 4. 最值得关注的一件事（不是三件事）
  lines.push(`\n── 核心观察 ──`);
  if (maxLiq > 2e6 && cur.liq < 5e5) {
    lines.push(`清算已从 $${(maxLiq/1e6).toFixed(1)}M 的高位完全回落至 $${(cur.liq/1e3).toFixed(0)}K。强制平仓压力已解除。当前最大风险不是清算，是资金费率能否继续回落。`);
  } else if (oiStreakDown >= 2 && cur.fund > 8) {
    lines.push(`OI 在下降但资金费率仍偏高——这是"资金在撤但多头还没死心"的矛盾阶段。如果 OI 继续降，资金费率通常会跟随。如果 OI 反弹，说明新的资金在进场。`);
  } else if (oiStreakUp >= 2 && cur.fund < 10) {
    lines.push(`OI 和价格都在恢复，资金费率温和——这是去杠杆后最健康的恢复结构。前次崩盘(5/2)没有出现这种结构就直接跌了。`);
  } else if (cur.fund > 15) {
    lines.push(`资金费率 ${cur.fund.toFixed(1)}% 极度危险。历史上前次 LAB Peak 资金费率最高到 ${(maxFund).toFixed(1)}%。这不是做空信号，但每一次读数在这个水平都是不可持续的。`);
  } else {
    lines.push(`市场处于相对均衡状态。OI ${oiTrendDir}，资金费率 ${fundTrendDir}，清算低位。没有单一指标出现极端值。`);
  }

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
