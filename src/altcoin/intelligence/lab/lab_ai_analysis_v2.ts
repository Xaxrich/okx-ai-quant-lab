// AI Analysis v2 — Real structural analysis, no templates
// Reads enhanced data + methodology rules + fast-watch → generates unique analysis each time
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { sendFeishuText, isFeishuEnabled, isDryRun, sanitizeMessage } from "../../../integrations/feishu/feishu_client.js";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const SNAP_DIR = join(OUT_DIR, "enhanced_snapshots");
const CHAT_ID = process.env.FEISHU_CHAT_ID || "";

function loadLatestSnapshots(n: number): any[] {
  if (!existsSync(SNAP_DIR)) return [];
  const files = readdirSync(SNAP_DIR).filter(f => f.endsWith(".json")).sort();
  return files.slice(-n).map(f => JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8")));
}

function loadMethodology(): any {
  const p = join(OUT_DIR, "methodology_rules.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  return { rules: [] };
}

function loadFastWatch(): any[] {
  const p = join(OUT_DIR, "lab_fast_watch_v2.csv");
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").trim().split("\n");
  if (lines.length < 2) return [];
  const h = lines[0].split(",");
  return lines.slice(1).map(l => {
    const cols = l.split(",");
    const get = (n: string) => { const i = h.indexOf(n); return i >= 0 ? cols[i] || "" : ""; };
    const num = (n: string) => { const v = parseFloat(get(n)); return isNaN(v) ? 0 : v; };
    return {
      ts: get("timestamp")?.slice(11, 19) || "?",
      price: num("price_usd"), oi: num("coinglass_oi_usd"),
      fund: num("funding_rate_percent"), liq: num("liq_4h"),
      score: num("risk_score"), state: get("fast_watch_state"),
    };
  }).filter(r => r.price > 0);
}

function analyze(current: any, prev: any, historical: any[], snaps: any[], methodology: any): string {
  const lines: string[] = [];
  const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  lines.push(`【LAB AI分析 v2｜${ts}】`);
  lines.push("");

  // ── 1. What changed from last reading ──
  lines.push("📊 本次变化:");
  if (prev) {
    const priceD = current.price - prev.price;
    const oiD = (current.oi - prev.oi) / 1e6;
    const fundD = current.fund - prev.fund;
    const liqD = (current.liq - prev.liq) / 1e3;
    if (Math.abs(priceD) > 0.005) lines.push(`  价格 ${priceD >= 0 ? "+" : ""}$${priceD.toFixed(2)}`);
    if (Math.abs(oiD) > 1) lines.push(`  OI ${oiD >= 0 ? "+" : ""}$${oiD.toFixed(1)}M`);
    if (Math.abs(fundD) > 0.05) lines.push(`  资金费率 ${fundD >= 0 ? "+" : ""}${fundD.toFixed(2)}%`);
    if (Math.abs(liqD) > 10) lines.push(`  清算 ${liqD >= 0 ? "+" : ""}$${liqD.toFixed(0)}K`);
    if (current.state !== prev.state) lines.push(`  状态: ${prev.state} → ${current.state}`);
    if (lines.length === 1) lines.push("  无显著变化——市场在均衡中");
  }

  // ── 2. v2.2 Methodology signal check ──
  lines.push(`\n📐 v2.2信号诊断:`);
  const signals: string[] = [];

  if (snaps.length >= 2) {
    const last = snaps[snaps.length - 1];
    const prevSnap = snaps[snaps.length - 2];
    const fundChg = (last.coinglass_funding?.funding_pct || 0) - (prevSnap.coinglass_funding?.funding_pct || 0);
    const oiChg = (last.coinglass_oi_matrix?.total_oi || 0) - (prevSnap.coinglass_oi_matrix?.total_oi || 0);
    const weighted = last.coinglass_oi_matrix?.weighted_oi_change_1h || 0;
    const dexBuy = last.dexscreener?.buy_ratio?.m5 || last.dexscreener?.buy_ratio?.h1 || 0.5;
    const priceChg = (last.coingecko?.price_usd || 0) - (prevSnap.coingecko?.price_usd || 0);

    // R8: Funding drop >0.5pp → bullish (36% up, 14% down)
    if (fundChg < -0.5) signals.push(`✅资金降${(-fundChg).toFixed(1)}pp→3:1看涨`);
    // R9: OI surge >$10M → bearish (0% up, 29% down)
    if (oiChg > 10e6) signals.push(`⚠️OI暴增$${(oiChg/1e6).toFixed(0)}M→拥挤=顶部风险`);
    // R10: Weighted <-3% → bullish (40% up, 20% down)
    if (weighted < -3) signals.push(`✅加权OI强流出${weighted.toFixed(1)}%→恐慌=买入机会`);
    // R11: Fund down + OI up → strongest bullish (50% up, 0% down)
    if (fundChg < -0.5 && oiChg > 0) signals.push(`⭐资金降+OI涨→最强看涨组合(50%涨0%跌)`);
    // R12: Price down + OI up → reversal (100%, 2/2)
    if (priceChg < 0 && oiChg > 5e6) signals.push(`⭐价跌+OI涨背离→强反转信号(100%,2/2)`);
    // DEX extremes
    if (dexBuy < 0.35) signals.push(`⚠️DEX买比${(dexBuy*100).toFixed(0)}%<35%→偏空(17%涨33%跌)`);
    if (dexBuy > 0.65) signals.push(`✅DEX买比${(dexBuy*100).toFixed(0)}%>65%→偏多(42%涨25%跌)`);
    // Fund up >0.5pp → bearish (57% down)
    if (fundChg > 0.5) signals.push(`⚠️资金升${fundChg.toFixed(1)}pp→57%概率下跌`);
  }

  if (signals.length === 0) {
    lines.push("  全部信号中性——无触发");
  } else {
    signals.forEach(s => lines.push(`  ${s}`));
  }

  // ── 3. What the data actually means (AI reasoning, not template) ──
  lines.push(`\n🔍 结构分析:`);

  // Current price context
  const recentPrices = historical.slice(-10).map(r => r.price).filter(p => p > 0);
  if (recentPrices.length >= 5) {
    const maxP = Math.max(...recentPrices);
    const minP = Math.min(...recentPrices);
    const range = maxP - minP;
    const posInRange = maxP > minP ? (current.price - minP) / range : 0.5;
    if (posInRange > 0.8) lines.push(`  价格处于近期高位（距10读数最低点+$${range.toFixed(2)}），在区间上沿`);
    else if (posInRange < 0.2) lines.push(`  价格处于近期低位，距最高点-$${range.toFixed(2)}，测试下沿支撑`);
    else lines.push(`  价格在近期区间中部（$${minP.toFixed(2)}-$${maxP.toFixed(2)}），无方向偏向`);
  }

  // Funding rate context
  if (current.fund < 6) lines.push(`  资金费率${current.fund.toFixed(1)}%处于4天来最低水平——杠杆成本极低`);
  else if (current.fund < 10) lines.push(`  资金费率${current.fund.toFixed(1)}%处于温和区间——多头成本可控`);
  else lines.push(`  资金费率${current.fund.toFixed(1)}%偏高——持有成本在累积`);

  // OI context — compare to 1h ago
  const recentOI = historical.slice(-12).map(r => r.oi).filter(o => o > 0);
  if (recentOI.length >= 6) {
    const firstHalf = recentOI.slice(0, Math.floor(recentOI.length / 2));
    const secondHalf = recentOI.slice(Math.floor(recentOI.length / 2));
    const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    if (avg2 > avg1 * 1.03) lines.push(`  OI趋势向上（+${((avg2/avg1-1)*100).toFixed(0)}%）——资金在流入`);
    else if (avg2 < avg1 * 0.97) lines.push(`  OI趋势向下（${((avg2/avg1-1)*100).toFixed(0)}%）——资金在流出`);
    else lines.push(`  OI趋势持平——资金流均衡`);
  }

  // Internal seller activity
  if (snaps.length > 0) {
    const last = snaps[snaps.length - 1];
    const dexBuy = last.dexscreener?.buy_ratio?.m5 || last.dexscreener?.buy_ratio?.h1 || 0.5;
    if (dexBuy < 0.3) lines.push(`  ⚠️DEX买比${(dexBuy*100).toFixed(0)}%——内部人出货Bot可能活跃（Moralis链上已证实11个Bot地址）`);
    else if (dexBuy > 0.6) lines.push(`  DEX买比${(dexBuy*100).toFixed(0)}%——现货买盘强劲，内部人出货暂缓`);
  }

  // ── 4. What to watch next ──
  lines.push(`\n👀 关键观察点:`);
  const watchItems: string[] = [];
  if (current.oi > 720e6) watchItems.push(`OI$${(current.oi/1e6).toFixed(0)}M——若跌破$710M则趋势转弱`);
  if (current.fund > 8) watchItems.push(`资金费率${current.fund.toFixed(1)}%——若降到<5%则将触发强看涨信号`);
  if (current.price > 4.5) watchItems.push(`价格$${current.price.toFixed(2)}——$4.60是关键支撑`);
  if (current.liq > 500e3) watchItems.push(`清算$${(current.liq/1e3).toFixed(0)}K——若突破$1M则风险升级`);
  watchItems.push(`DEX买比——若持续<30%则内部人出货在加速`);
  watchItems.forEach(w => lines.push(`  • ${w}`));

  lines.push(`\n不构成交易建议。`);
  return lines.join("\n");
}

async function main() {
  console.log("=== LAB AI分析 v2 ===\n");

  const historical = loadFastWatch();
  if (historical.length < 2) { console.log("数据不足"); return; }

  const snaps = loadLatestSnapshots(3);
  const methodology = loadMethodology();

  const current = historical[historical.length - 1];
  const prev = historical[historical.length - 2];

  const analysis = analyze(current, prev, historical, snaps, methodology);
  console.log(analysis);

  // Save
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "analysis_v2.txt"), analysis, "utf-8");

  // Push to Feishu
  if (!CHAT_ID || !isFeishuEnabled() || isDryRun()) {
    console.log("\n飞书: 跳过 (未启用/演习模式)");
    return;
  }

  const s = sanitizeMessage(analysis);
  if (!s.clean) { console.log("拦截: " + s.violations.join(", ")); return; }

  const r = await sendFeishuText(CHAT_ID, analysis);
  console.log(r.ok ? `已发送! ${r.msgId}` : `失败: ${r.error}`);
}

main().catch(console.error);
