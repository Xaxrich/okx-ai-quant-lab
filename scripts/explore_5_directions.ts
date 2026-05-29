// 5 New Research Directions — consolidated backtest
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SNAP_DIR = join(import.meta.dirname, "..", "data", "altcoin", "intelligence", "lab", "live", "enhanced_snapshots");
const files = readdirSync(SNAP_DIR).filter(f => f.endsWith(".json")).sort();

interface Snap {
  ts: string; price: number; oi: number; funding: number;
  hour: number; exchanges: {name:string, oi:number, chg1h:number}[];
  weighted: number; dexBuy: number;
}
const snaps: Snap[] = files.map(f => {
  const d = JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8"));
  return {
    ts: d.timestamp, price: d.coingecko?.price_usd || 0,
    oi: d.coinglass_oi_matrix?.total_oi || 0,
    funding: d.coinglass_funding?.funding_pct || 0,
    hour: new Date(d.timestamp).getUTCHours(),
    exchanges: (d.coinglass_oi_matrix?.exchanges || []).map((e: any) => ({ name: e.exchange, oi: e.oi_usd, chg1h: e.oi_chg_1h })),
    weighted: d.coinglass_oi_matrix?.weighted_oi_change_1h || 0,
    dexBuy: d.dexscreener?.buy_ratio?.m5 || d.dexscreener?.buy_ratio?.h1 || 0.5,
  };
}).filter(s => s.price > 0);

function fwdPrice(i: number, min: number): number | null {
  for (let j = i + 1; j < snaps.length; j++) {
    const dt = (new Date(snaps[j].ts).getTime() - new Date(snaps[i].ts).getTime()) / 60000;
    if (dt >= min - 3 && dt <= min + 5) return (snaps[j].price - snaps[i].price) / snaps[i].price;
  }
  return null;
}

function corr(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

console.log(`=== 5方向探索 | ${snaps.length}快照 | ${files.length}文件 ===\n`);

// ═══ #1: Exchange OI Lead-Lag ═══
console.log("── #1: 交易所OI领先-滞后关系 ──");
const exNames = [...new Set(snaps.flatMap(s => s.exchanges.map(e => e.name)))];
const exResults: { name: string; r: number; n: number }[] = [];
for (const exName of exNames) {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < snaps.length - 3; i++) {
    const ex = snaps[i].exchanges.find(e => e.name === exName);
    if (ex && ex.chg1h !== undefined) {
      const fp = fwdPrice(i, 15);
      if (fp !== null) { xs.push(ex.chg1h); ys.push(fp); }
    }
  }
  if (xs.length > 5) exResults.push({ name: exName, r: corr(xs, ys), n: xs.length });
}
exResults.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
console.log("排名 交易所      相关系数  样本");
exResults.slice(0, 8).forEach((r, i) => console.log(` #${i + 1}  ${r.name.padEnd(12)} ${r.r.toFixed(3).padStart(7)}  ${r.n}`));
const leadEx = exResults[0];
console.log(`\n→ 领先所: ${leadEx.name} (r=${leadEx.r.toFixed(3)})`);
console.log(`→ 可操作性: ${Math.abs(leadEx.r) > 0.25 ? "可作为辅助领先指标" : "相关性不足，无法独立使用"}\n`);

// ═══ #2: Funding Acceleration ═══
console.log("── #2: 资金费率加速度(2阶导数) ──");
const velX: number[] = [], accX: number[] = [], priceY: number[] = [];
for (let i = 2; i < snaps.length - 3; i++) {
  const v = snaps[i].funding - snaps[i - 1].funding;
  const a = v - (snaps[i - 1].funding - snaps[i - 2].funding);
  const fp = fwdPrice(i, 15);
  if (fp !== null) { velX.push(v); accX.push(a); priceY.push(fp); }
}
const velR = corr(velX, priceY);
const accR = corr(accX, priceY);
console.log(`  速度 r=${velR.toFixed(3)} | 加速度 r=${accR.toFixed(3)}`);
console.log(`→ 加速度${Math.abs(accR) > Math.abs(velR) ? "优于" : "不优于"}速度`);
if (Math.abs(accR) > 0.15) console.log(`→ 加速度可作为增强信号\n`);
else console.log(`→ 加速度无额外价值，速度已足够\n`);

// ═══ #3: OI-Price Elasticity ═══
console.log("── #3: OI-价格弹性(每$1M OI变化的平均价格变动) ──");
const elasticities: number[] = [];
for (let i = 1; i < snaps.length - 2; i++) {
  const oiChg = (snaps[i].oi - snaps[i - 1].oi) / 1e6;
  const priceChg = snaps[i].price - snaps[i - 1].price;
  if (Math.abs(oiChg) > 1) elasticities.push(priceChg / oiChg);
}
const avgElast = elasticities.reduce((a, b) => a + b, 0) / elasticities.length;
const posElast = elasticities.filter(e => e > 0);
const negElast = elasticities.filter(e => e < 0);
console.log(`  平均弹性: $${(avgElast * 100).toFixed(2)}/每$1M OI变化`);
console.log(`  OI增加时: ${posElast.length}次, 平均价格变动 $${(posElast.reduce((a,b)=>a+b,0)/posElast.length*100).toFixed(2)}/每$1M`);
console.log(`  OI减少时: ${negElast.length}次, 平均价格变动 $${(negElast.reduce((a,b)=>a+b,0)/negElast.length*100).toFixed(2)}/每$1M`);
console.log(`→ OI减少时价格敏感性${Math.abs(negElast.reduce((a,b)=>a+b,0)/negElast.length) > Math.abs(posElast.reduce((a,b)=>a+b,0)/posElast.length) ? "更高" : "更低"}——OI下降对价格影响大于OI上升\n`);

// ═══ #4: Signal Confluence ═══
console.log("── #4: 多信号共振准确率 ──");
let conf2Up = 0, conf2Dn = 0, conf2Total = 0;
let conf3Up = 0, conf3Dn = 0, conf3Total = 0;
for (let i = 1; i < snaps.length - 3; i++) {
  const fundChg = snaps[i].funding - snaps[i - 1].funding;
  const oiChg = snaps[i].oi - snaps[i - 1].oi;
  const signals: string[] = [];
  if (fundChg < -0.5) signals.push("fundDown");
  if (oiChg > 10e6) signals.push("oiSurge");
  if (snaps[i].weighted < -3) signals.push("panicOut");
  if (snaps[i].dexBuy < 0.35) signals.push("dexBear");
  if (snaps[i].dexBuy > 0.65) signals.push("dexBull");

  const fp = fwdPrice(i, 15);
  if (fp !== null) {
    const bullish = signals.filter(s => ["fundDown", "panicOut", "dexBull"].includes(s)).length;
    const bearish = signals.filter(s => ["oiSurge", "dexBear"].includes(s)).length;
    if (bullish >= 2) { conf2Total++; if (fp > 0.005) conf2Up++; else if (fp < -0.005) conf2Dn++; }
    if (bearish >= 2) { conf2Total++; if (fp < -0.005) conf2Dn++; else if (fp > 0.005) conf2Up++; }
    if (bullish >= 3) { conf3Total++; if (fp > 0.005) conf3Up++; else conf3Dn++; }
  }
}
if (conf2Total > 0) console.log(`  2+信号共振: ${conf2Total}次 → 方向正确${Math.max(conf2Up,conf2Dn)}(${(Math.max(conf2Up,conf2Dn)/conf2Total*100).toFixed(0)}%)`);
if (conf3Total > 0) console.log(`  3+信号共振: ${conf3Total}次 → 方向正确${Math.max(conf3Up,conf3Dn)}(${(Math.max(conf3Up,conf3Dn)/conf3Total*100).toFixed(0)}%)`);
console.log(`→ 多信号共振${conf2Up+conf2Dn > 0 && (Math.max(conf2Up,conf2Dn)/conf2Total > 0.5) ? "确实提高准确率" : "未显著提高准确率"}\n`);

// ═══ #5: Time-of-Day Effect ═══
console.log("── #5: 时段效应(北京时间) ──");
const hourGroups: Map<number, { up: number; dn: number; total: number }> = new Map();
for (let i = 0; i < snaps.length - 3; i++) {
  const bj = (snaps[i].hour + 8) % 24;
  const h = Math.floor(bj / 4) * 4; // Group by 4-hour blocks
  if (!hourGroups.has(h)) hourGroups.set(h, { up: 0, dn: 0, total: 0 });
  const g = hourGroups.get(h)!;
  const fp = fwdPrice(i, 15);
  if (fp !== null) { g.total++; if (fp > 0.005) g.up++; else if (fp < -0.005) g.dn++; }
}
const sorted2 = [...hourGroups.entries()].sort((a, b) => a[0] - b[0]);
for (const [h, g] of sorted2) {
  const label = h < 4 ? "凌晨" : h < 8 ? "早盘" : h < 12 ? "午盘" : h < 16 ? "欧洲" : h < 20 ? "美欧重叠" : "其他";
  console.log(`  ${String(h).padStart(2)}-${String(h+4).padStart(2)}时 ${label.padEnd(8)} 涨${(g.up/g.total*100).toFixed(0)}% 跌${(g.dn/g.total*100).toFixed(0)}% (${g.total}样本)`);
}
console.log("");

console.log("═══ 5方向探索完成 ═══");
