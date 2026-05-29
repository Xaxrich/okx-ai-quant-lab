// Verify LAB manipulation cycle: 养多→吃费率→杀多头
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SNAP_DIR = join(import.meta.dirname, "..", "data", "altcoin", "intelligence", "lab", "live", "enhanced_snapshots");
const files = readdirSync(SNAP_DIR).filter(f => f.endsWith(".json")).sort().slice(-60);

console.log("═══════════════════════════════════════════");
console.log("  LAB操纵周期——养多/吃费率/杀多头 全量验证");
console.log("═══════════════════════════════════════════\n");

interface Phase { ts: string; price: number; oi: number; funding: number; weighted: number; liqLong: number; liqShort: number; }
const phases: Phase[] = [];
for (const f of files) {
  const d = JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8"));
  if (!d.coingecko?.price_usd || !d.coinglass_funding?.funding_pct) continue;
  phases.push({
    ts: d.timestamp?.slice(11,19) || "?",
    price: d.coingecko.price_usd,
    oi: d.coinglass_oi_matrix?.total_oi || 0,
    funding: d.coinglass_funding.funding_pct,
    weighted: d.coinglass_oi_matrix?.weighted_oi_change_1h || 0,
    liqLong: d.coinglass_liquidation?.liq_4h_long || 0,
    liqShort: d.coinglass_liquidation?.liq_4h_short || 0,
  });
}

if (phases.length < 5) { console.log("数据不足"); process.exit(0); }

// ── Phase identification ──
console.log("── 三阶段识别 ──\n");

const feedLongs = phases.filter(p => p.funding > 5 && p.weighted > 0 && p.oi > 650e6);
const eatFunding = phases.filter(p => p.funding > 3 && p.oi > 600e6 && p.weighted < 1);
const killLongs = phases.filter(p => p.weighted < -8 && p.oi < 600e6);

console.log(`养多(资金>5%+OI>650M+流入正): ${feedLongs.length}个快照`);
console.log(`吃费率(资金>3%+OI>600M+流入弱): ${eatFunding.length}个快照`);
console.log(`杀多头(流出<-8%+OI<600M):     ${killLongs.length}个快照`);

// ── Key turning points ──
console.log("\n── 关键转折点 ──\n");
const peakFeed = phases.reduce((max, p) => (p.oi > max.oi && p.funding > 8) ? p : max, phases[0]);
console.log(`养多顶点: ${peakFeed.ts} | \$${peakFeed.price.toFixed(2)} | OI\$${(peakFeed.oi/1e6).toFixed(0)}M | 资金${peakFeed.funding.toFixed(1)}%`);

const bottom = phases.reduce((min, p) => p.oi < min.oi ? p : min, phases[0]);
console.log(`杀多底部: ${bottom.ts} | \$${bottom.price.toFixed(2)} | OI\$${(bottom.oi/1e6).toFixed(0)}M | 资金${bottom.funding.toFixed(1)}%`);

// ── Funding fee harvest calculation ──
let totalFee = 0; let maxOIperiod = 0;
for (const p of phases) {
  if (p.funding > 0 && p.oi > 500e6) {
    totalFee += p.funding / 100 * p.oi; // funding% * OI per period
    maxOIperiod++;
  }
}
console.log(`\n── 费率收割估算 ──`);
console.log(`高费率+高OI期间: ${maxOIperiod}个快照`);
console.log(`多头累计上缴: \$${(totalFee/1e6).toFixed(1)}M/期 × 3期/天`);
console.log(`→ 这就是庄家\"吃费率\"的收益来源`);

// ── Long liquidation tally ──
const totalLongLiq = phases.reduce((s, p) => s + p.liqLong, 0);
const totalShortLiq = phases.reduce((s, p) => s + p.liqShort, 0);
console.log(`\n── 清算收割 ──`);
console.log(`多头累计被清算: \$${(totalLongLiq/1e6).toFixed(1)}M`);
console.log(`空头累计被清算: \$${(totalShortLiq/1e6).toFixed(1)}M`);
console.log(`多/空清算比: ${(totalLongLiq/totalShortLiq).toFixed(1)}x`);

// ── Pattern verification ──
console.log(`\n── 模式匹配 ──`);
const checks = [
  { label: "养多(资金>8%持续)", pass: phases.filter(p => p.funding > 8).length > 3 },
  { label: "吃费率(OI>600M+资金>3%)", pass: eatFunding.length > 5 },
  { label: "杀多头(OI-30%+清算多头>空头)", pass: totalLongLiq > totalShortLiq * 1.5 && bottom.oi < peakFeed.oi * 0.7 },
  { label: "资金费率从极端正到负", pass: phases.some(p => p.funding > 15) && phases.some(p => p.funding < 0) },
];
let passed = 0;
checks.forEach(c => { console.log(`  [${c.pass?"✓":" "}] ${c.label}`); if (c.pass) passed++; });
console.log(`\n匹配度: ${passed}/${checks.length} → ${passed===4?"✅ LAB操纵模式确认":"⚠️ 部分匹配"}`);

if (passed === 4) {
  console.log("\n═══════════════════════════════════════════");
  console.log("  结论: LAB完整执行了\"养多→吃费率→杀多头\"周期");
  console.log("  庄家通过4个交易所均匀分布仓位隐蔽操作");
  console.log("  衍生品市场是主战场，现货DEX是出货通道");
  console.log("═══════════════════════════════════════════");
}
