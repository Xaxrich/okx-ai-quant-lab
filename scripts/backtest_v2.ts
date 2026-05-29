import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SNAP_DIR = join(import.meta.dirname, "..", "data", "altcoin", "intelligence", "lab", "live", "enhanced_snapshots");
const files = readdirSync(SNAP_DIR).filter(f => f.endsWith(".json")).sort();
const snaps = files.map(f => {
  const d = JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8"));
  return {
    ts: d.timestamp, price: d.coingecko?.price_usd || 0,
    oi: d.coinglass_oi_matrix?.total_oi || 0,
    funding: d.coinglass_funding?.funding_pct || 0,
    weighted: d.coinglass_oi_matrix?.weighted_oi_change_1h || 0,
  };
}).filter(s => s.price > 0);

console.log(`=== 回测v2: ${snaps.length}快照 ===\n`);

function fwdPrice(i: number, min: number): number | null {
  const target = snaps.find(s => (new Date(s.ts).getTime() - new Date(snaps[i].ts).getTime()) / 60000 >= min - 2);
  return target ? (target.price - snaps[i].price) / snaps[i].price : null;
}

// Test 1: OI magnitude
console.log("── OI绝对值变化 >$10M → 15分钟后方向? ──");
for (const [label, cond] of [["OI+>$10M", (i:number)=>snaps[i].oi-snaps[i-1].oi>10e6], ["OI->$10M", (i:number)=>snaps[i].oi-snaps[i-1].oi<-10e6]] as const) {
  let up=0, dn=0, tot=0;
  for (let i=1; i<snaps.length-3; i++) {
    if (cond(i)) { tot++; const c=fwdPrice(i,15); if(c){if(c>0.005)up++;else if(c<-0.005)dn++;} }
  }
  console.log(`  ${label}: ${tot}次 → 涨${up}(${(up/tot*100).toFixed(0)}%) 跌${dn}(${(dn/tot*100).toFixed(0)}%)`);
}

// Test 2: Price-OI divergence
console.log("\n── 价跌+OI涨>$5M(背离) → 15分钟后反弹? ──");
let divUp=0, divDn=0, divTot=0;
for (let i=1; i<snaps.length-3; i++) {
  if (snaps[i].price<snaps[i-1].price && snaps[i].oi-snaps[i-1].oi>5e6) {
    divTot++; const c=fwdPrice(i,15);
    if(c){if(c>0.005)divUp++;else if(c<-0.005)divDn++;}
  }
}
console.log(`  背离: ${divTot}次 → 反弹${divUp}(${(divUp/divTot*100).toFixed(0)}%) 续跌${divDn}(${(divDn/divTot*100).toFixed(0)}%)`);

// Test 3: Weighted 1h OI
console.log("\n── 加权1h OI 极端值 → 15分钟后方向? ──");
for (const [label, thresh] of [["强流入>5%", 5], ["强流出<-3%", -3]] as const) {
  let up=0, dn=0, tot=0;
  for (let i=0; i<snaps.length-3; i++) {
    if ((thresh>0 && snaps[i].weighted>thresh) || (thresh<0 && snaps[i].weighted<thresh)) {
      tot++; const c=fwdPrice(i,15);
      if(c){if(c>0.005)up++;else if(c<-0.005)dn++;}
    }
  }
  console.log(`  ${label}: ${tot}次 → 涨${up}(${(up/tot*100).toFixed(0)}%) 跌${dn}(${(dn/tot*100).toFixed(0)}%)`);
}

// Test 4: Funding + OI combo
console.log("\n── 资金降>0.5pp + OI涨(最强组合) → 15分钟后方向? ──");
let comboUp=0, comboDn=0, comboTot=0;
for (let i=1; i<snaps.length-3; i++) {
  if (snaps[i].funding-snaps[i-1].funding<-0.5 && snaps[i].oi>snaps[i-1].oi) {
    comboTot++; const c=fwdPrice(i,15);
    if(c){if(c>0.005)comboUp++;else if(c<-0.005)comboDn++;}
  }
}
console.log(`  资金降+OI涨: ${comboTot}次 → 涨${comboUp}(${(comboUp/comboTot*100).toFixed(0)}%) 跌${comboDn}(${(comboDn/comboTot*100).toFixed(0)}%)`);

console.log("\n── 回测v2完成 ──");
