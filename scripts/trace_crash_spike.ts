import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SNAP_DIR = join(import.meta.dirname, "..", "data", "altcoin", "intelligence", "lab", "live", "enhanced_snapshots");
const files = readdirSync(SNAP_DIR).filter(f => f.endsWith(".json")).sort();

// Look at the crash bottom period: files around 11:32 to 12:02
const targetFiles = files.filter(f => {
  const d = JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8"));
  const ts = d.timestamp || "";
  return ts >= "2026-05-07T11:30" && ts <= "2026-05-07T12:05";
});

console.log("=== 崩盘底部→V型反弹: OI+资金费率变化 ===\n");
console.log("快照时间    价格     OI      资金    加权1h   OI分布   DEX买比");

let prev: any = null;
for (const f of targetFiles) {
  const d = JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8"));
  const ts = d.timestamp?.slice(11, 19) || "?";
  const price = d.coingecko?.price_usd?.toFixed(2) || "??";
  const oi = ((d.coinglass_oi_matrix?.total_oi || 0) / 1e6).toFixed(0);
  const fund = (d.coinglass_funding?.funding_pct || 0).toFixed(1);
  const w = (d.coinglass_oi_matrix?.weighted_oi_change_1h || 0).toFixed(1);
  const r = d.coinglass_oi_matrix?.rising_exchanges || 0;
  const f2 = d.coinglass_oi_matrix?.falling_exchanges || 0;
  const dex = ((d.dexscreener?.buy_ratio?.m5 || 0.5) * 100).toFixed(0);

  const priceChg = prev ? ((d.coingecko?.price_usd||0) - (prev.coingecko?.price_usd||0)).toFixed(2) : "";
  const oiChg = prev ? (((d.coinglass_oi_matrix?.total_oi||0) - (prev.coinglass_oi_matrix?.total_oi||0))/1e6).toFixed(1) : "";

  console.log(`${ts}  \$${price}  \$${oi}M  ${fund}%  ${w}%  ${r}↑/${f2}↓  ${dex}%  (Δ\$${priceChg}/OI${oiChg>=0?'+':''}\$${oiChg}M)`);
  prev = d;
}

// Now the key question: between the bottom (lowest OI) and the first bounce, who added positions?
console.log("\n=== V型反弹(最低OI→首次回升): 谁在底部抄底？ ===\n");

const sorted = targetFiles.map(f => JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8")))
  .filter(d => (d.coinglass_oi_matrix?.total_oi||0) > 0);

if (sorted.length >= 2) {
  // Find OI minimum
  let minIdx = 0, minOI = sorted[0].coinglass_oi_matrix?.total_oi || 0;
  for (let i = 1; i < sorted.length; i++) {
    const oi = sorted[i].coinglass_oi_matrix?.total_oi || 0;
    if (oi < minOI) { minOI = oi; minIdx = i; }
  }

  // Compare OI minimum to next snapshot
  if (minIdx < sorted.length - 1) {
    const trough = sorted[minIdx];
    const bounce = sorted[minIdx + 1];

    const troughExs = trough.coinglass_oi_matrix?.exchanges || [];
    const bounceExs = bounce.coinglass_oi_matrix?.exchanges || [];

    console.log(`底部: ${trough.timestamp?.slice(11,19)} | OI\$${(trough.coinglass_oi_matrix?.total_oi/1e6).toFixed(0)}M`);
    console.log(`反弹: ${bounce.timestamp?.slice(11,19)} | OI\$${(bounce.coinglass_oi_matrix?.total_oi/1e6).toFixed(0)}M`);
    console.log(`\n各交易所OI变化（底部→反弹）:`);

    const chgs: {name:string, troughOI:number, bounceOI:number, chg:number}[] = [];
    for (const be of bounceExs) {
      const te = troughExs.find((e:any) => e.exchange === be.exchange);
      const tOI = te?.oi_usd || 0;
      const bOI = be.oi_usd || 0;
      chgs.push({name: be.exchange, troughOI: tOI/1e6, bounceOI: bOI/1e6, chg: (bOI-tOI)/1e6});
    }

    const totalChg = chgs.reduce((s,c) => s + c.chg, 0);
    chgs.sort((a,b) => b.chg - a.chg);

    chgs.forEach(c => {
      const pct = totalChg > 0 ? (c.chg/totalChg*100).toFixed(0) : '0';
      console.log(`  ${c.name.padEnd(12)} \$${c.troughOI.toFixed(1)}M→\$${c.bounceOI.toFixed(1)}M  ${c.chg>=0?'+':''}\$${c.chg.toFixed(1)}M (${pct}%)`);
    });

    console.log(`\n总OI反弹: +\$${totalChg.toFixed(1)}M`);

    // Concentration analysis
    const top1 = chgs[0];
    const top3 = chgs.slice(0,3).reduce((s,c) => s + c.chg, 0);
    console.log(`\n── 底部抄底集中度 ──`);
    console.log(`最大: ${top1.name} +\$${top1.chg.toFixed(1)}M (${(top1.chg/totalChg*100).toFixed(0)}%)`);
    console.log(`前3: ${(top3/totalChg*100).toFixed(0)}%`);

    if (top1.chg / totalChg > 0.5) {
      console.log(`\n⚠️ 抄底高度集中——${top1.name}贡献超过50%→庄家行为`);
    } else {
      console.log(`\n→ 抄底相对分散——多个交易所同步反弹→市场整体行为`);
    }

    // Also check: which exchange had the MOST OI decline during the crash itself?
    // Find peak OI before crash
    console.log(`\n── 崩盘过程中各所OI损失 ──`);
    const first = sorted[0];
    const firstExs = first.coinglass_oi_matrix?.exchanges || [];
    const lossChgs: {name:string, firstOI:number, bottomOI:number, loss:number}[] = [];
    for (const fe of firstExs) {
      const te = troughExs.find((e:any) => e.exchange === fe.exchange);
      const fOI = fe.oi_usd || 0;
      const tOI = te?.oi_usd || 0;
      lossChgs.push({name: fe.exchange, firstOI: fOI/1e6, bottomOI: tOI/1e6, loss: (tOI-fOI)/1e6});
    }
    lossChgs.sort((a,b) => a.loss - b.loss);
    const totalLoss = Math.abs(lossChgs.reduce((s,c) => s + c.loss, 0));
    lossChgs.forEach(c => {
      const pct = totalLoss > 0 ? (Math.abs(c.loss)/totalLoss*100).toFixed(0) : '0';
      console.log(`  ${c.name.padEnd(12)} \$${c.firstOI.toFixed(1)}M→\$${c.bottomOI.toFixed(1)}M  -\$${Math.abs(c.loss).toFixed(1)}M (${pct}%)`);
    });
  }
}
