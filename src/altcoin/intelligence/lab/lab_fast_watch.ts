import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync, statSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "lab", "live");
const CACHE_DIR = join(OUT_DIR, "cache");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "..", "reports", "altcoin", "intelligence", "lab");
const USAGE_LEDGER = join(OUT_DIR, "lab_api_usage_ledger.jsonl");
const LAB = { sym: "LAB", cgId: "lab", okxInstId: "LAB-USDT-SWAP" };
const CG_COINGLASS_LIMIT = 500;
const CG_API = process.env.COINGLASS_API_KEY || "";
const CG_KEY = process.env.COINGECKO_PRO_API_KEY || "";

type Mode = "micro" | "standard" | "full";
function getMode(): Mode { const a = process.argv.find(x => x.startsWith("--mode=")); return (a?.split("=")[1] as Mode) || "micro"; }

// ── 缓存 ──
function cacheGet(key: string, maxAgeMin: number): { hit: boolean; data?: string } {
  const p = join(CACHE_DIR, `${key}.json`); if (!existsSync(p)) return { hit: false };
  try { const s = statSync(p); if ((Date.now() - s.mtimeMs) / 60000 > maxAgeMin) return { hit: false }; return { hit: true, data: readFileSync(p, "utf-8") }; } catch { return { hit: false }; }
}
function cachePut(key: string, data: string) { if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(join(CACHE_DIR, `${key}.json`), data); }
function getCacheAge(key: string): number | null {
  const p = join(CACHE_DIR, `${key}.json`); if (!existsSync(p)) return null;
  try { return (Date.now() - statSync(p).mtimeMs) / 60000; } catch { return null; }
}

// ── API 用量 ──
function getTodayCGUsage(): number {
  if (!existsSync(USAGE_LEDGER)) return 0; const today = new Date().toISOString().slice(0, 10);
  return readFileSync(USAGE_LEDGER, "utf-8").trim().split("\n").filter(Boolean).filter(l => {
    try { const e = JSON.parse(l); return e.timestamp.slice(0, 10) === today && e.source === "coinglass" && e.counted_call; } catch { return false; }
  }).length;
}
function logUsage(e: Record<string, any>) { if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true }); appendFileSync(USAGE_LEDGER, JSON.stringify(e) + "\n"); }

async function fetchWithCache(url: string, headers: Record<string, string>, key: string, ttl: number, src: string, grp: string, mode: string) {
  const c = cacheGet(key, ttl); if (c.hit && c.data) { logUsage({ timestamp: new Date().toISOString(), source: src, endpoint_group: grp, mode, cache_hit: true, counted_call: false, status: "CACHE_HIT" }); return { data: c.data, cached: true }; }
  const r = await fetch(url, { headers }); const t = await r.text(); cachePut(key, t);
  logUsage({ timestamp: new Date().toISOString(), source: src, endpoint_group: grp, mode, cache_hit: false, counted_call: true, status: r.ok ? "OK" : "FAILED" });
  return { data: t, cached: false };
}

// ── 数据获取 ──
async function getPrice(mode: Mode) {
  const c = cacheGet("price", 5); if (c.hit && c.data) { try { const j = JSON.parse(c.data); return { price: j.price, ret24: j.return24h, src: "缓存", calls: 0 }; } catch { /* */ } }
  try {
    const r = await fetch(`https://pro-api.coingecko.com/api/v3/simple/price?ids=${LAB.cgId}&vs_currencies=usd&include_24hr_change=true${CG_KEY ? "&x_cg_pro_api_key=" + CG_KEY : ""}`);
    if (r.ok) { const j = await r.json(); const p = j[LAB.cgId]?.usd, ch = j[LAB.cgId]?.usd_24h_change; if (p) { cachePut("price", JSON.stringify({ price: p, return24h: ch, ts: new Date().toISOString() })); return { price: p, ret24: ch, src: "CoinGecko", calls: 1 }; } }
  } catch { /* */ }
  const sp = join(OUT_DIR, "lab_fast_watch_v2.csv"); if (existsSync(sp)) { const ls = readFileSync(sp, "utf-8").trim().split("\n"); if (ls.length > 1) { const r = ls[ls.length - 1].split(","); return { price: parseFloat(r[4]) || null, ret24: parseFloat(r[6]) || null, src: "快照回退", calls: 0 }; } }
  return { price: null, ret24: null, src: "不可用", calls: 0 };
}

async function getOI(mode: Mode, budget: { ok: boolean }) {
  if (!CG_API) return { oi: null, oiPrev: null, oi4h: null, calls: 0, age: null };
  if (!budget.ok) { const c = cacheGet("oi", 30); if (c.hit && c.data) { try { const j = JSON.parse(c.data); if (j.code === "0" && j.data?.length >= 2) { const l = parseFloat(j.data[j.data.length - 1].close || "0"), p = parseFloat(j.data[j.data.length - 2].close || "0"); return { oi: l, oiPrev: p, oi4h: l - p, calls: 0, age: getCacheAge("oi") }; } } catch { /* */ } } return { oi: null, oiPrev: null, oi4h: null, calls: 0, age: null }; }
  const ttl = mode === "micro" ? 6 : 5;
  const { data, cached } = await fetchWithCache(`https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=${LAB.sym}&interval=4h&limit=2&unit=usd`, { "CG-API-KEY": CG_API }, "oi", ttl, "coinglass", "oi", mode);
  try { const j = JSON.parse(data); if (j.code === "0" && j.data?.length >= 2) { const l = parseFloat(j.data[j.data.length - 1].close || "0"), p = parseFloat(j.data[j.data.length - 2].close || "0"); return { oi: l, oiPrev: p, oi4h: l - p, calls: cached ? 0 : 1, age: cached ? getCacheAge("oi") : 0 }; } } catch { /* */ }
  return { oi: null, oiPrev: null, oi4h: null, calls: 0, age: null };
}

async function getLiq(mode: Mode, budget: { ok: boolean }) {
  if (!CG_API) return { liq4h: null, liqLong: null, liqShort: null, calls: 0, age: null };
  if (!budget.ok) { const c = cacheGet("liq", 30); if (c.hit && c.data) { try { const j = JSON.parse(c.data); if (j.code === "0" && j.data?.length > 0) { const l = parseFloat(j.data[0].aggregated_long_liquidation_usd || "0"), s = parseFloat(j.data[0].aggregated_short_liquidation_usd || "0"); return { liq4h: l + s, liqLong: l, liqShort: s, calls: 0, age: getCacheAge("liq") }; } } catch { /* */ } } return { liq4h: null, liqLong: null, liqShort: null, calls: 0, age: null }; }
  const ttl = 15;
  const { data, cached } = await fetchWithCache(`https://open-api-v4.coinglass.com/api/futures/liquidation/aggregated-history?symbol=${LAB.sym}&interval=4h&limit=1&exchange_list=Binance,OKX,Bybit`, { "CG-API-KEY": CG_API }, "liq", ttl, "coinglass", "liq", mode);
  try { const j = JSON.parse(data); if (j.code === "0" && j.data?.length > 0) { const l = parseFloat(j.data[0].aggregated_long_liquidation_usd || "0"), s = parseFloat(j.data[0].aggregated_short_liquidation_usd || "0"); return { liq4h: l + s, liqLong: l, liqShort: s, calls: cached ? 0 : 1, age: cached ? getCacheAge("liq") : 0 }; } } catch { /* */ }
  return { liq4h: null, liqLong: null, liqShort: null, calls: 0, age: null };
}

async function getFunding(mode: Mode, budget: { ok: boolean }) {
  if (!CG_API) return { rate: null, streak: null, calls: 0, age: null };
  if (!budget.ok) { const c = cacheGet("funding", 30); if (c.hit && c.data) { try { const j = JSON.parse(c.data); if (j.code === "0" && j.data?.length > 0) { const vs = j.data.map((d: any) => parseFloat(d.close || "0")).filter((v: number) => !isNaN(v)); const r = vs[vs.length - 1] || 0; let st = 0; for (let i = vs.length - 1; i >= 0 && vs[i] > 0; i--) st++; return { rate: r, streak: st, calls: 0, age: getCacheAge("funding") }; } } catch { /* */ } } return { rate: null, streak: null, calls: 0, age: null }; }
  const ttl = 15;
  const { data, cached } = await fetchWithCache(`https://open-api-v4.coinglass.com/api/futures/funding-rate/oi-weight-history?symbol=${LAB.sym}&interval=4h&limit=12`, { "CG-API-KEY": CG_API }, "funding", ttl, "coinglass", "funding", mode);
  try { const j = JSON.parse(data); if (j.code === "0" && j.data?.length > 0) { const vs = j.data.map((d: any) => parseFloat(d.close || "0")).filter((v: number) => !isNaN(v)); const r = vs[vs.length - 1] || 0; let st = 0; for (let i = vs.length - 1; i >= 0 && vs[i] > 0; i--) st++; return { rate: r, streak: st, calls: cached ? 0 : 1, age: cached ? getCacheAge("funding") : 0 }; } } catch { /* */ }
  return { rate: null, streak: null, calls: 0, age: null };
}

// ── 读取前一条记录做趋势对比 ──
function getPrevRow(): Record<string, string> | null {
  const sp = join(OUT_DIR, "lab_fast_watch_v2.csv"); if (!existsSync(sp)) return null;
  const ls = readFileSync(sp, "utf-8").trim().split("\n"); if (ls.length < 2) return null;
  const h = ls[0].split(","), r = ls[ls.length - 1].split(",");
  const o: Record<string, string> = {}; h.forEach((k, i) => { o[k] = r[i] || ""; }); return o;
}

// ── 状态机 + 风险评分 ──
function classify(price: number | null, oi: number | null, oi4h: number | null, fundRate: number | null, fundStreak: number | null, liq4h: number | null, liqAge: number | null, freshness: string): { state: string; score: number; risks: string[]; nextWatch: string[] } {
  if (!price || !oi) return { state: "数据不足", score: 0, risks: ["无价格/OI数据"], nextWatch: [] };
  if (freshness === "过期" || freshness === "预算阻断") return { state: "数据过期", score: 0, risks: [`数据${freshness}`], nextWatch: ["等待数据恢复"] };

  const fpct = (fundRate || 0) * 100, oiDown = (oi4h || 0) < 0, oiRatio = oi4h && oi > 0 ? oi4h / (oi - oi4h) : 0;
  const risks: string[] = []; let score = 0;

  // 资金费率 (max 25)
  if (fpct >= 15) { score += 25; risks.push(`资金费率 ${fpct.toFixed(1)}% 极度危险`); }
  else if (fpct >= 10) { score += 20; risks.push(`资金费率 ${fpct.toFixed(1)}% 严重偏高`); }
  else if (fpct >= 5) { score += 15; risks.push(`资金费率 ${fpct.toFixed(1)}% 偏高`); }
  if ((fundStreak || 0) >= 6) { score += 5; risks.push(`连续 ${fundStreak} 期为正`); }

  // OI (max 25)
  if (oiDown) { score += 15; risks.push("OI 开始回落"); }
  else if (oiRatio > 0.10) { score += 15; risks.push(`OI 加速 (+${(oiRatio * 100).toFixed(0)}%)`); }
  else if (oiRatio > 0.05) { score += 10; risks.push("OI 持续上升"); }

  // 清算 (max 25) — 仅数据新鲜时评分
  if (liqAge !== null && liqAge <= 15 && liq4h && oi) {
    const lr = liq4h / oi;
    if (lr > 0.01) { score += 20; risks.push(`清算/OI >1% (${(lr*100).toFixed(2)}%)`); }
    else if (lr > 0.005) { score += 15; risks.push("清算/OI 偏高"); }
    if (liq4h > 2e6) { score += 10; risks.push(`清算 >$2M (${(liq4h/1e6).toFixed(1)}M)`); }
    else if (liq4h > 1e6) { score += 5; risks.push(`清算 >$1M`); }
  }

  // 状态判定
  let state = "正常观察";
  if (oiDown && liq4h && liq4h > 1e6 && liqAge !== null && liqAge <= 15) state = "去杠杆候选";
  else if (oiDown && fpct >= 5) state = "OI 回落候选";
  else if (liq4h && oi && (liq4h / oi) > 0.005 && liqAge !== null && liqAge <= 15) state = "清算飙升";
  else if (fpct >= 5 && (fundStreak || 0) >= 6) state = "资金费率过热";
  else if (oiRatio > 0.05) state = "OI 加速中";

  // 下一个关注点
  const next: string[] = [];
  if (!oiDown) next.push(`OI 何时转负 (当前 4h ${oi4h! >= 0 ? "+" : ""}$${(oi4h! / 1e6).toFixed(1)}M)`);
  if (fpct < 20) next.push(`资金费率何时突破 20% (当前 ${fpct.toFixed(1)}%)`);
  if (!liq4h || liq4h < 1e6) next.push(`清算何时突破 $1M (当前 $${((liq4h || 0) / 1e3).toFixed(0)}K)`);
  next.push(`CoinGlass 预算剩余 ${CG_COINGLASS_LIMIT - getTodayCGUsage()}`);

  return { state, score: Math.min(100, score), risks, nextWatch: next.slice(0, 4) };
}

// ── 主流程 ──
async function main() {
  const mode = getMode();
  console.log(`=== LAB 快速监控 [${mode === "micro" ? "微型" : mode === "standard" ? "标准" : "完整"}] ===\n`);
  if (process.env.NO_ARKHAM_MODE !== "true") { console.log("需要 NO_ARKHAM_MODE=true"); return; }
  for (const d of [OUT_DIR, CACHE_DIR, REPORTS_DIR]) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

  const ts = new Date().toISOString();
  const cgBudget = { ok: getTodayCGUsage() < CG_COINGLASS_LIMIT - 3 };
  let extCalls = 0, cgCalls = 0;

  // 获取数据
  const price = await getPrice(mode); extCalls += price.calls;
  const oi = await getOI(mode, cgBudget); if (oi.calls > 0) { extCalls += oi.calls; cgCalls += oi.calls; }

  // micro 模式：清算和资金费率仅读缓存
  let liq: any, fund: any;
  if (mode === "micro") {
    const lc = cacheGet("liq", 30); liq = (lc.hit && lc.data) ? (() => { try { const j = JSON.parse(lc.data); if (j.code === "0" && j.data?.length > 0) { const lo = parseFloat(j.data[0].aggregated_long_liquidation_usd || "0"), sh = parseFloat(j.data[0].aggregated_short_liquidation_usd || "0"); return { liq4h: lo + sh, liqLong: lo, liqShort: sh, calls: 0, age: getCacheAge("liq") }; } } catch { /* */ } return { liq4h: null, liqLong: null, liqShort: null, calls: 0, age: null }; })() : { liq4h: null, liqLong: null, liqShort: null, calls: 0, age: null };
    const fc = cacheGet("funding", 30); fund = (fc.hit && fc.data) ? (() => { try { const j = JSON.parse(fc.data); if (j.code === "0" && j.data?.length > 0) { const vs = j.data.map((d: any) => parseFloat(d.close || "0")).filter((v: number) => !isNaN(v)); const r = vs[vs.length - 1] || 0; let st = 0; for (let i = vs.length - 1; i >= 0 && vs[i] > 0; i--) st++; return { rate: r, streak: st, calls: 0, age: getCacheAge("funding") }; } } catch { /* */ } return { rate: null, streak: null, calls: 0, age: null }; })() : { rate: null, streak: null, calls: 0, age: null };
  } else {
    liq = await getLiq(mode, cgBudget); if (liq.calls > 0) { extCalls += liq.calls; cgCalls += liq.calls; }
    fund = await getFunding(mode, cgBudget); if (fund.calls > 0) { extCalls += fund.calls; cgCalls += fund.calls; }
  }

  // 与前一条对比
  const prev = getPrevRow();
  const prevOi = prev ? parseFloat(prev.coinglass_oi_usd || "0") : null;
  const prevLiq = prev ? parseFloat(prev.liq_4h || "0") : null;
  const prevFund = prev ? parseFloat(prev.funding_rate_percent || "0") : null;
  const prevScore = prev ? parseInt(prev.risk_score || "0") : null;
  const prevState = prev ? prev.fast_watch_state : null;

  const oiChgFromPrev = (oi.oi && prevOi) ? oi.oi - prevOi : null;
  const liqChgFromPrev = (liq.liq4h && prevLiq) ? liq.liq4h - prevLiq : null;
  const fundChgFromPrev = (fund.rate && prevFund) ? (fund.rate * 100) - prevFund : null;

  // 状态判定
  const freshness = !cgBudget.ok ? "预算阻断" : "新鲜";
  const { state, score, risks, nextWatch } = classify(price.price, oi.oi, oi.oi4h, fund.rate, fund.streak, liq.liq4h, liq.age, freshness);

  const reviewLabel = score >= 71 ? "高风险复核" : score >= 51 ? "需要复核" : score >= 31 ? "密切关注" : "常规观察";
  const cgUsed = getTodayCGUsage(), cgRem = CG_COINGLASS_LIMIT - cgUsed;

  // 趋势变化摘要
  const changes: string[] = [];
  if (prevState && prevState !== state) changes.push(`状态: ${prevState} → ${state}`);
  if (prevScore !== null && Math.abs(score - prevScore) >= 5) changes.push(`风险评分: ${prevScore} → ${score} (${score > prevScore ? "↑" : "↓"}${Math.abs(score - prevScore)})`);
  if (oiChgFromPrev !== null && Math.abs(oiChgFromPrev) > 1e6) changes.push(`OI: ${oiChgFromPrev >= 0 ? "+" : ""}$${(oiChgFromPrev / 1e6).toFixed(1)}M`);
  if (fundChgFromPrev !== null && Math.abs(fundChgFromPrev) > 0.5) changes.push(`资金费率: ${fundChgFromPrev >= 0 ? "+" : ""}${fundChgFromPrev.toFixed(1)}%`);
  if (liqChgFromPrev !== null && Math.abs(liqChgFromPrev) > 1e5) changes.push(`清算: ${liqChgFromPrev >= 0 ? "+" : ""}$${(liqChgFromPrev / 1e3).toFixed(0)}K`);

  // 距下一级阈值
  const thresholds: string[] = [];
  if (score < 31) thresholds.push(`距 WATCH 还差 ${31 - score} 分`);
  else if (score < 51) thresholds.push(`距 REVIEW_REQUIRED 还差 ${51 - score} 分`);
  else if (score < 71) thresholds.push(`距 HIGH_RISK 还差 ${71 - score} 分`);
  if ((fund.rate || 0) * 100 < 20 && (fund.rate || 0) * 100 > 10) thresholds.push(`资金费率距 20% 极端线还差 ${(20 - (fund.rate || 0) * 100).toFixed(1)}%`);
  if (oi.oi4h && oi.oi4h > 0) thresholds.push(`OI 仍在上升，回落触发线为 4h 负值`);
  if (liq.liq4h && liq.liq4h < 1e6) thresholds.push(`清算距 $1M 告警线还差 $${((1e6 - liq.liq4h) / 1e3).toFixed(0)}K`);

  // ── 控制台输出 ──
  console.log(`💰 $${price.price?.toFixed(4) || "?"} | 24h ${price.ret24 ? (price.ret24 >= 0 ? "+" : "") + price.ret24.toFixed(1) + "%" : "?"} | 来源: ${price.src}`);
  console.log(`📊 OI: $${(oi.oi || 0).toFixed(0)} | 4h ${(oi.oi4h ?? 0) >= 0 ? "+" : ""}$${(Math.abs(oi.oi4h || 0) / 1e6).toFixed(1)}M | 较上次: ${oiChgFromPrev ? (oiChgFromPrev >= 0 ? "+" : "") + "$" + (oiChgFromPrev / 1e6).toFixed(1) + "M" : "首次"}`);
  console.log(`💸 资金费率: ${fund.rate ? (fund.rate * 100).toFixed(2) + "%" : "?"} | 连续: ${fund.streak ?? "?"}期 | 较上次: ${fundChgFromPrev ? (fundChgFromPrev >= 0 ? "+" : "") + fundChgFromPrev.toFixed(2) + "%" : "首次"}`);
  console.log(`💥 清算 4h: $${(liq.liq4h || 0).toFixed(0)} | 较上次: ${liqChgFromPrev ? (liqChgFromPrev >= 0 ? "+" : "") + "$" + (liqChgFromPrev / 1e3).toFixed(0) + "K" : "首次"}`);
  console.log(`📞 API: 外部${extCalls} CG${cgCalls} | CG预算: ${cgUsed}/${CG_COINGLASS_LIMIT} (剩${cgRem})`);
  console.log(`\n⚡ ${state} | 风险 ${score}/100 [${reviewLabel}] | 数据: ${freshness}`);
  if (risks.length > 0) console.log(`   风险: ${risks.join("；")}`);
  if (changes.length > 0) console.log(`   变化: ${changes.join("；")}`);
  if (thresholds.length > 0) console.log(`   ${thresholds.join(" | ")}`);

  // ── CSV 写入 ──
  const hdr = "timestamp,token,mode,price_usd,price_source,return_24h,coinglass_oi_usd,oi_change_4h,oi_change_from_prev,funding_rate_percent,funding_change_from_prev,funding_streak,liq_4h,liq_change_from_prev,liq_upward,liq_downward,fast_watch_state,risk_score,review_label,prev_state,prev_score,total_ext_calls,cg_calls,cg_budget_used,cg_budget_remaining,oi_age_min,funding_age_min,liq_age_min,data_freshness,changes_summary,next_watch";
  const row = [ts, LAB.sym, mode, price.price || "", price.src, price.ret24 || "", oi.oi || "", oi.oi4h || "", oiChgFromPrev || "", fund.rate ? (fund.rate * 100).toFixed(2) : "", fundChgFromPrev?.toFixed(2) || "", fund.streak || "", liq.liq4h || "", liqChgFromPrev || "", liq.liqLong || "", liq.liqShort || "", state, score, reviewLabel, prevState || "", prevScore || "", extCalls, cgCalls, cgUsed, cgRem, oi.age?.toFixed(1) || "", fund.age?.toFixed(1) || "", liq.age?.toFixed(1) || "", freshness, changes.join("; "), nextWatch.join("; ")];
  const esc = (v: any) => String(v ?? "").includes(",") ? `"${v}"` : String(v ?? "");
  const sp = join(OUT_DIR, "lab_fast_watch_v2.csv");
  if (!existsSync(sp)) writeFileSync(sp, hdr + "\n");
  appendFileSync(sp, row.map(esc).join(",") + "\n");

  // ── 轻量报告 ──
  const rpt = [
    `# LAB 快速监控 [${mode === "micro" ? "微型" : mode === "standard" ? "标准" : "完整"}]`, "",
    `**${state}** | 风险 ${score}/100 [${reviewLabel}] | 数据: ${freshness} | ${ts.slice(0, 19).replace("T", " ")}`,
    "",
    `## 快照`,
    `- 价格: $${price.price?.toFixed(4) || "?"} | 24h: ${price.ret24 ? (price.ret24 >= 0 ? "+" : "") + price.ret24?.toFixed(1) + "%" : "?"} | 来源: ${price.src}`,
    `- OI: $${(oi.oi || 0).toFixed(0)} | 4h: ${(oi.oi4h ?? 0) >= 0 ? "+" : ""}$${(Math.abs(oi.oi4h || 0) / 1e6).toFixed(1)}M${oiChgFromPrev ? " | 较上次: " + (oiChgFromPrev >= 0 ? "+" : "") + "$" + (oiChgFromPrev / 1e6).toFixed(1) + "M" : ""}`,
    `- 资金费率: ${fund.rate ? (fund.rate * 100).toFixed(2) + "%" : "?"} | 连续 ${fund.streak ?? "?"} 期${fundChgFromPrev ? " | 较上次: " + (fundChgFromPrev >= 0 ? "+" : "") + fundChgFromPrev.toFixed(2) + "%" : ""}`,
    `- 清算 4h: $${(liq.liq4h || 0).toFixed(0)} (上行 $${(liq.liqLong || 0).toFixed(0)} / 下行 $${(liq.liqShort || 0).toFixed(0)})${liqChgFromPrev ? " | 较上次: " + (liqChgFromPrev >= 0 ? "+" : "") + "$" + (liqChgFromPrev / 1e3).toFixed(0) + "K" : ""}`,
    `- API: 外部${extCalls} CG${cgCalls} | CG预算: ${cgUsed}/${CG_COINGLASS_LIMIT} (剩${cgRem})`,
    "",
    `## 风险信号`,
    risks.length > 0 ? risks.map(r => `- ${r}`).join("\n") : "- 无明显风险信号",
    "",
    `## 变化`,
    changes.length > 0 ? changes.map(c => `- ${c}`).join("\n") : "- 较上次无显著变化",
    "",
    `## 阈值临近`,
    thresholds.length > 0 ? thresholds.map(t => `- ${t}`).join("\n") : "- 无",
    "",
    `## 下次关注`,
    nextWatch.map(w => `- ${w}`).join("\n"),
    "",
    `**不构成交易建议。无法推断方向性意图。**`,
  ];
  writeFileSync(join(REPORTS_DIR, "lab_fast_watch_latest.md"), rpt.join("\n"));
  console.log(`\n报告: ${REPORTS_DIR}/lab_fast_watch_latest.md`);
}

main().catch(console.error);
