import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SNAP_DIR = join(import.meta.dirname, "..", "data", "altcoin", "intelligence", "lab", "live", "enhanced_snapshots");
const files = readdirSync(SNAP_DIR).filter(f => f.endsWith(".json")).sort();
const last8 = files.slice(-8);

console.log("=== 最后8个快照的资金费率+OI ===\n");
for (const f of last8) {
  const d = JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8"));
  console.log(d.timestamp?.slice(11,19), "资金", (d.coinglass_funding?.funding_pct||0).toFixed(1)+"%", "OI$" + ((d.coinglass_oi_matrix?.total_oi||0)/1e6).toFixed(0)+"M");
}

// Find the snapshot with the biggest funding jump
console.log("\n=== 资金费率暴升追踪 ===\n");
let maxJump = 0, maxIdx = 0;
for (let i = 1; i < files.length; i++) {
  const prev = JSON.parse(readFileSync(join(SNAP_DIR, files[i-1]), "utf8"));
  const cur = JSON.parse(readFileSync(join(SNAP_DIR, files[i]), "utf8"));
  const prevFund = prev.coinglass_funding?.funding_pct || 0;
  const curFund = cur.coinglass_funding?.funding_pct || 0;
  const jump = curFund - prevFund;
  if (jump > maxJump) { maxJump = jump; maxIdx = i; }
}

if (maxJump > 0) {
  const before = JSON.parse(readFileSync(join(SNAP_DIR, files[maxIdx-1]), "utf8"));
  const after = JSON.parse(readFileSync(join(SNAP_DIR, files[maxIdx]), "utf8"));
  console.log("最大资金费率跳升: +" + maxJump.toFixed(2) + "pp");
  console.log("时间: " + before.timestamp?.slice(11,19) + " → " + after.timestamp?.slice(11,19));
  console.log("资金: " + (before.coinglass_funding?.funding_pct||0).toFixed(1) + "% → " + (after.coinglass_funding?.funding_pct||0).toFixed(1) + "%");

  // Per-exchange OI change
  const beforeExs = before.coinglass_oi_matrix?.exchanges || [];
  const afterExs = after.coinglass_oi_matrix?.exchanges || [];

  console.log("\n各交易所OI变化:");
  const changes: {name:string, before:number, after:number, chg:number}[] = [];
  for (const ae of afterExs) {
    const be = beforeExs.find((e:any) => e.exchange === ae.exchange);
    const beforeOI = be?.oi_usd || 0;
    const afterOI = ae.oi_usd || 0;
    changes.push({name: ae.exchange, before: beforeOI/1e6, after: afterOI/1e6, chg: (afterOI-beforeOI)/1e6});
  }

  const totalChg = changes.reduce((s,c) => s + c.chg, 0);
  changes.sort((a,b) => b.chg - a.chg);

  changes.forEach(c => {
    const pct = totalChg > 0 ? (c.chg/totalChg*100).toFixed(0) : '0';
    console.log(`  ${c.name.padEnd(12)} \$${c.before.toFixed(1)}M→\$${c.after.toFixed(1)}M  ${c.chg>=0?'+':''}\$${c.chg.toFixed(1)}M (${pct}%)`);
  });

  console.log(`\n总OI变化: +\$${totalChg.toFixed(1)}M`);

  // Concentration check
  const top1 = changes[0];
  const top2Share = changes.slice(0,2).reduce((s,c) => s + c.chg, 0) / totalChg * 100;
  const top1Share = top1.chg / totalChg * 100;

  console.log(`\n── 集中度分析 ──`);
  console.log(`最大单一所: ${top1.name} +\$${top1.chg.toFixed(1)}M (${top1Share.toFixed(0)}%)`);
  console.log(`前2所合计: ${top2Share.toFixed(0)}%`);

  if (top1Share > 50) {
    console.log(`\n⚠️ OI增长高度集中在${top1.name}`);
    console.log(`→ 该所贡献了超过50%的OI增量——强烈暗示单一鲸鱼/机构行为`);
    console.log(`→ 资金费率暴升很可能是这个鲸鱼开仓直接导致的`);
  } else if (top1Share > 35) {
    console.log(`\n⚠️ ${top1.name}是最大贡献者但非绝对主导——可能是几家机构同步行动`);
  } else {
    console.log(`\n→ OI增长相对分散——更可能是市场整体性反转`);
  }
}
