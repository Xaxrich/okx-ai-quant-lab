// Crash rebound analysis: when does derivatives liquidation typically exhaust?
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SNAP_DIR = join(import.meta.dirname, "..", "data", "altcoin", "intelligence", "lab", "live", "enhanced_snapshots");
const files = readdirSync(SNAP_DIR).filter(f => f.endsWith(".json")).sort();
const snaps = files.map(f => JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8")))
  .filter((d: any) => d.coingecko?.price_usd > 0 && d.coinglass_oi_matrix?.total_oi > 0);

// Find OI drawdowns and subsequent rebounds
interface Rebound { oiPeak: number; oiTrough: number; pricePeak: number; priceTrough: number; oiDropPct: number; priceDropPct: number; priceBouncePct: number; timeMin: number; }
const rebounds: Rebound[] = [];

// Scan for OI declining sequences that reverse
let inDecline = false; let declineStart = 0; let peakOI = 0; let peakPrice = 0;
for (let i = 1; i < snaps.length; i++) {
  const curOI = snaps[i].coinglass_oi_matrix?.total_oi || 0;
  const prevOI = snaps[i-1].coinglass_oi_matrix?.total_oi || 0;
  const curPrice = snaps[i].coingecko?.price_usd || 0;
  const oiChg = prevOI > 0 ? (curOI - prevOI) / prevOI : 0;

  if (!inDecline && oiChg < -0.03) {
    inDecline = true; declineStart = i - 1;
    peakOI = prevOI; peakPrice = snaps[i-1].coingecko?.price_usd || 0;
  }
  if (inDecline && oiChg > 0.02) {
    // Rebound detected
    const troughOI = prevOI; const troughPrice = snaps[i-1].coingecko?.price_usd || 0;
    const recoveryPrice = curPrice; const recoveryOI = curOI;
    const oiDrop = peakOI > 0 ? (troughOI - peakOI) / peakOI * 100 : 0;
    const priceDrop = peakPrice > 0 ? (troughPrice - peakPrice) / peakPrice * 100 : 0;
    const priceBounce = troughPrice > 0 ? (recoveryPrice - troughPrice) / troughPrice * 100 : 0;
    const timeMin = (new Date(snaps[i-1].ts).getTime() - new Date(snaps[declineStart].ts).getTime()) / 60000;

    if (Math.abs(oiDrop) > 3 && priceBounce > 0.5) {
      rebounds.push({ oiPeak: peakOI / 1e6, oiTrough: troughOI / 1e6, pricePeak: peakPrice, priceTrough: troughPrice, oiDropPct: oiDrop, priceDropPct: priceDrop, priceBouncePct: priceBounce, timeMin });
    }
    inDecline = false;
  }
}

console.log("=== 历史OI暴跌→反弹模式 ===\n");
console.log("序号  OI峰值   OI谷值   OI跌幅   价格峰值  价格谷值  价格跌幅  反弹%   用时(分)");
rebounds.slice(-10).forEach((r, i) => {
  console.log(`#${i+1}   \$${r.oiPeak.toFixed(0)}M  \$${r.oiTrough.toFixed(0)}M  ${r.oiDropPct.toFixed(1)}%   \$${r.pricePeak.toFixed(2)}   \$${r.priceTrough.toFixed(2)}   ${r.priceDropPct.toFixed(1)}%    +${r.priceBouncePct.toFixed(1)}%   ${r.timeMin.toFixed(0)}`);
});

if (rebounds.length > 0) {
  const avg = { oiDrop: 0, priceDrop: 0, bounce: 0, time: 0 };
  rebounds.forEach(r => { avg.oiDrop += Math.abs(r.oiDropPct); avg.priceDrop += Math.abs(r.priceDropPct); avg.bounce += r.priceBouncePct; avg.time += r.timeMin; });
  const n = rebounds.length;
  const maxDrop = Math.max(...rebounds.map(r => Math.abs(r.oiDropPct)));
  console.log(`\n平均: OI跌${(avg.oiDrop/n).toFixed(1)}% 价格跌${(avg.priceDrop/n).toFixed(1)}% → 反弹+${(avg.bounce/n).toFixed(1)}% 用时${(avg.time/n).toFixed(0)}分钟`);
  console.log(`历史最大OI跌幅: ${maxDrop.toFixed(1)}%`);
}

// Current situation
const latest = snaps[snaps.length - 1];
const latestOI = latest.coinglass_oi_matrix?.total_oi || 0;
const latestPrice = latest.coingecko?.price_usd || 0;
const sessionPeakOI = 743e6, sessionPeakPrice = 4.73;
const curOIDrop = (latestOI - sessionPeakOI) / sessionPeakOI * 100;
const curPriceDrop = (latestPrice - sessionPeakPrice) / sessionPeakPrice * 100;

console.log(`\n═══ 当前崩盘 ═══`);
console.log(`OI: \$743M → \$${(latestOI/1e6).toFixed(0)}M (${curOIDrop.toFixed(1)}%)`);
console.log(`价格: \$4.73 → \$${latestPrice.toFixed(2)} (${curPriceDrop.toFixed(1)}%)`);
console.log(`加权1h: -25.2% | 清算: \$1.73M`);

// Estimate exhaustion
const histAvgOIDrop = rebounds.length > 0 ? rebounds.reduce((s,r)=>s+Math.abs(r.oiDropPct),0)/rebounds.length : 10;
console.log(`\n── 止跌反弹条件分析 ──`);
console.log(`1. OI跌幅: 当前${Math.abs(curOIDrop).toFixed(1)}% vs 历史均值${histAvgOIDrop.toFixed(1)}% → ${Math.abs(curOIDrop) > histAvgOIDrop ? '远超均值，处于极端超卖' : '在正常范围'}`);
console.log(`2. OI绝对值: \$524M → 若降至\$450-480M，接近\"无杠杆可清\"的底部`);
console.log(`3. 清算: \$1.73M → 若开始下降(<$500K)，说明强制平仓压力解除`);
console.log(`4. 加权1h: -25.2% → 若回升至>-10%，说明资金流出减缓`);
console.log(`5. 资金费率: 6.5% → 若开始下降，说明空头在平仓获利`);

// Bottom signal checklist
const checks = [
  { label: "OI降速放缓(>-5%/读数)", pass: false }, // needs next reading
  { label: "清算< \$500K", pass: false },
  { label: "加权1h > -10%", pass: false },
  { label: "资金费率下降>0.3pp", pass: false },
  { label: "0↑/12↓变为有交易所OI上升", pass: false },
];
console.log(`\n── 底部确认清单 ──`);
checks.forEach(c => console.log(`  [${c.pass?'✓':' '}] ${c.label}`));
console.log(`\n当前: 0/5条件满足 → 底部尚未确认，但OI跌幅已远超历史均值`);
console.log(`预判: 若OI降至\$450-500M区间+清算开始下降+加权>-10% → 高概率触底`);
