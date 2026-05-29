// Comprehensive backtest: apply all v2.1 rules to ALL 56 snapshots
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SNAP_DIR = join(import.meta.dirname, "..", "data", "altcoin", "intelligence", "lab", "live", "enhanced_snapshots");
const files = readdirSync(SNAP_DIR).filter(f => f.endsWith(".json")).sort();

interface Snapshot {
  ts: string; price: number; oi: number; funding: number;
  rising: number; falling: number; weighted: number;
  dexBuy: number; liqBias: string; liqTotal: number;
  oiChg: number; fundChg: number; priceChg: number;
}
const snaps: Snapshot[] = [];

for (let i = 0; i < files.length; i++) {
  const d = JSON.parse(readFileSync(join(SNAP_DIR, files[i]), "utf8"));
  const s: Snapshot = {
    ts: d.timestamp || "", price: d.coingecko?.price_usd || d.dexscreener?.price_usd || 0,
    oi: d.coinglass_oi_matrix?.total_oi || 0,
    funding: d.coinglass_funding?.funding_pct || 0,
    rising: d.coinglass_oi_matrix?.rising_exchanges || 0,
    falling: d.coinglass_oi_matrix?.falling_exchanges || 0,
    weighted: d.coinglass_oi_matrix?.weighted_oi_change_1h || 0,
    dexBuy: d.dexscreener?.buy_ratio?.m5 || d.dexscreener?.buy_ratio?.h1 || 0.5,
    liqBias: (d.coinglass_liquidation?.liq_bias || 0) > 0 ? "空头被挤" : "多头被挤",
    liqTotal: d.coinglass_liquidation?.liq_4h_total || 0,
    oiChg: i > 0 ? (d.coinglass_oi_matrix?.total_oi || 0) - snaps[i-1].oi : 0,
    fundChg: i > 0 ? (d.coinglass_funding?.funding_pct || 0) - snaps[i-1].funding : 0,
    priceChg: i > 0 ? ((d.coingecko?.price_usd || 0) - snaps[i-1].price) : 0,
  };
  if (s.price > 0) snaps.push(s);
}

function outcome(i: number, min: number): number | null {
  for (let j = i + 1; j < snaps.length; j++) {
    const dt = (new Date(snaps[j].ts).getTime() - new Date(snaps[i].ts).getTime()) / 60000;
    if (dt >= min - 3 && dt <= min + 5) {
      return (snaps[j].price - snaps[i].price) / snaps[i].price;
    }
  }
  return null;
}

console.log(`=== 全面回测: ${snaps.length}快照, ${(new Date(snaps[snaps.length-1].ts).getTime()-new Date(snaps[0].ts).getTime())/3600000}小时跨度 ===\n`);

// ── 所有v2.1规则逐一回测 ──

interface RuleResult { rule: string; signal: string; total: number; up: number; dn: number; flat: number; accuracy: string; }
const results: RuleResult[] = [];

function testRule(rule: string, signal: string, cond: (i: number) => boolean, min: number = 15): RuleResult {
  let up = 0, dn = 0, flat = 0, total = 0;
  for (let i = 0; i < snaps.length - 2; i++) {
    if (cond(i)) {
      total++;
      const c = outcome(i, min);
      if (c !== null) {
        if (c > 0.005) up++; else if (c < -0.005) dn++; else flat++;
      }
    }
  }
  const r: RuleResult = { rule, signal, total, up, dn, flat, accuracy: total > 0 ? `涨${(up/total*100).toFixed(0)}% 跌${(dn/total*100).toFixed(0)}%` : "N/A" };
  results.push(r);
  return r;
}

console.log("── v2.1规则回测 ──\n");
testRule("R8", "资金降>0.5pp", i => snaps[i].fundChg < -0.5);
testRule("R9", "OI暴增>$10M", i => snaps[i].oiChg > 10e6);
testRule("R10", "加权1h<-3%(强流出)", i => snaps[i].weighted < -3);
testRule("R11", "资金降+OI涨", i => snaps[i].fundChg < -0.5 && snaps[i].oiChg > 0);
testRule("R12", "价跌+OI涨背离", i => snaps[i].priceChg < 0 && snaps[i].oiChg > 5e6);
testRule("NEW1", "资金升>0.5pp", i => snaps[i].fundChg > 0.5);
testRule("NEW2", "加权1h>5%(强流入)", i => snaps[i].weighted > 5);
testRule("NEW3", "价涨+OI跌背离", i => snaps[i].priceChg > 0 && snaps[i].oiChg < -5e6);
testRule("NEW4", "DEX买比<35%", i => snaps[i].dexBuy < 0.35);
testRule("NEW5", "DEX买比>65%", i => snaps[i].dexBuy > 0.65);

results.sort((a, b) => {
  const aUp = parseInt(a.accuracy.match(/涨(\d+)%/)?.at(1) || "0");
  const bUp = parseInt(b.accuracy.match(/涨(\d+)%/)?.at(1) || "0");
  return bUp - aUp;
});

console.log("排名  信号                          次数  涨%    跌%");
console.log("─".repeat(70));
results.forEach((r, idx) => {
  const upPct = r.accuracy.match(/涨(\d+)%/)?.at(1) || "?";
  const dnPct = r.accuracy.match(/跌(\d+)%/)?.at(1) || "?";
  console.log(`#${idx+1}   ${r.signal.padEnd(30)} ${String(r.total).padStart(3)}次  ${(upPct+'%').padStart(4)}  ${(dnPct+'%').padStart(4)}`);
});

// ── 关键事件回溯 ──
console.log("\n\n── 关键事件回溯 ──\n");

const events = [
  { label: "$4.59三重顶#1(08:02)", time: "2026-05-07T00:02:00Z", window: 30 },
  { label: "$4.59三重顶#3(11:32)", time: "2026-05-07T03:32:00Z", window: 30 },
  { label: "$4.25破位(13:32)", time: "2026-05-07T05:32:00Z", window: 30 },
  { label: "$4.22→$4.73爆发(14:02)", time: "2026-05-07T06:02:00Z", window: 45 },
];

for (const evt of events) {
  console.log(`── ${evt.label} ──`);
  const before = snaps.filter(s => {
    const dt = (new Date(evt.time).getTime() - new Date(s.ts).getTime()) / 60000;
    return dt > 0 && dt < evt.window;
  });
  if (before.length > 0) {
    const last = before[before.length - 1];
    console.log(`  事件前最后快照: ${last.ts?.slice(11,19)} | \$${last.price?.toFixed(2)} | OI\$${(last.oi/1e6).toFixed(0)}M | 资金${last.funding?.toFixed(1)}% | ${last.rising}↑/${last.falling}↓ | 加权${last.weighted?.toFixed(1)}% | DEX${(last.dexBuy*100).toFixed(0)}%`);
    console.log(`  信号检查: 资金降>0.5pp=${last.fundChg<-0.5} OI暴增=${last.oiChg>10e6} 强流出=${last.weighted<-3} 背离=${last.priceChg<0&&last.oiChg>5e6}`);
  }
  const after = snaps.filter(s => {
    const dt = (new Date(s.ts).getTime() - new Date(evt.time).getTime()) / 60000;
    return dt > 0 && dt < evt.window;
  });
  if (after.length > 0) {
    const peak = after.reduce((max, s) => s.price > max.price ? s : max, after[0]);
    const trough = after.reduce((min, s) => s.price < min.price ? s : min, after[0]);
    console.log(`  事件后: 高\$${peak.price?.toFixed(2)} 低\$${trough.price?.toFixed(2)} 波动\$${(peak.price-trough.price).toFixed(2)}`);
  }
  console.log();
}

// ── 价格驱动因素相关性 ──
console.log("── 量价相关性分析 ──\n");

function corr(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  const mx = xs.slice(0,n).reduce((a,b)=>a+b,0)/n;
  const my = ys.slice(0,n).reduce((a,b)=>a+b,0)/n;
  let num=0,dx=0,dy=0;
  for(let i=0;i<n;i++){num+=(xs[i]-mx)*(ys[i]-my);dx+=(xs[i]-mx)**2;dy+=(ys[i]-my)**2;}
  return dx>0&&dy>0?num/Math.sqrt(dx*dy):0;
}

// Price change vs signal correlations (5-min forward)
const fwd5m: number[] = [], fwd15m: number[] = [], oiChgs: number[] = [], fundChgs: number[] = [], weighteds: number[] = [], dexBuys: number[] = [];
for (let i = 0; i < snaps.length - 5; i++) {
  const c5 = outcome(i, 5), c15 = outcome(i, 15);
  if (c5 !== null && c15 !== null) {
    fwd5m.push(c5); fwd15m.push(c15);
    oiChgs.push(snaps[i].oiChg / 1e6);
    fundChgs.push(snaps[i].fundChg);
    weighteds.push(snaps[i].weighted);
    dexBuys.push(snaps[i].dexBuy);
  }
}

console.log(`  因子 vs 5分钟价格变化 (皮尔逊r):`);
console.log(`  OI变化:     ${corr(oiChgs, fwd5m).toFixed(3)}`);
console.log(`  资金变化:   ${corr(fundChgs, fwd5m).toFixed(3)}`);
console.log(`  加权OI:     ${corr(weighteds, fwd5m).toFixed(3)}`);
console.log(`  DEX买比:    ${corr(dexBuys, fwd5m).toFixed(3)}`);

console.log(`\n  因子 vs 15分钟价格变化 (皮尔逊r):`);
console.log(`  OI变化:     ${corr(oiChgs, fwd15m).toFixed(3)}`);
console.log(`  资金变化:   ${corr(fundChgs, fwd15m).toFixed(3)}`);
console.log(`  加权OI:     ${corr(weighteds, fwd15m).toFixed(3)}`);
console.log(`  DEX买比:    ${corr(dexBuys, fwd15m).toFixed(3)}`);

console.log("\n── 全面回测完成 ──");
