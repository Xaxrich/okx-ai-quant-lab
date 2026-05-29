// Backtest methodology rules against historical enhanced snapshots
// For each snapshot, check: did the signal predict the next 15-min price direction?

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const SNAP_DIR = join(import.meta.dirname, "..", "data", "altcoin", "intelligence", "lab", "live", "enhanced_snapshots");

interface SnapData {
  timestamp: string;
  price: number;
  oi: number;
  funding: number;
  rising: number;
  falling: number;
  weighted1h: number;
  dexBuyRatio: number;
  liqBias: string; // "空头被挤" or "多头被挤"
  liqTotal: number;
}

function loadSnapshots(): SnapData[] {
  if (!existsSync(SNAP_DIR)) return [];
  const files = readdirSync(SNAP_DIR).filter(f => f.endsWith(".json")).sort();
  return files.map(f => {
    const d = JSON.parse(readFileSync(join(SNAP_DIR, f), "utf8"));
    return {
      timestamp: d.timestamp,
      price: d.coingecko?.price_usd || d.dexscreener?.price_usd || 0,
      oi: d.coinglass_oi_matrix?.total_oi || 0,
      funding: d.coinglass_funding?.funding_pct || 0,
      rising: d.coinglass_oi_matrix?.rising_exchanges || 0,
      falling: d.coinglass_oi_matrix?.falling_exchanges || 0,
      weighted1h: d.coinglass_oi_matrix?.weighted_oi_change_1h || 0,
      dexBuyRatio: d.dexscreener?.buy_ratio?.h1 || d.dexscreener?.buy_ratio?.m5 || 0.5,
      liqBias: d.computed?.liq_direction || (d.coinglass_liquidation?.liq_bias > 0 ? "空头被挤" : "多头被挤"),
      liqTotal: d.coinglass_liquidation?.liq_4h_total || 0,
    };
  }).filter(s => s.price > 0 && s.oi > 0);
}

function priceChange(snaps: SnapData[], i: number, minutes: number): number | null {
  const target = snaps.find(s => {
    const dt = (new Date(s.timestamp).getTime() - new Date(snaps[i].timestamp).getTime()) / 60000;
    return dt >= minutes - 2 && dt <= minutes + 3;
  });
  if (!target || snaps[i].price === 0) return null;
  return (target.price - snaps[i].price) / snaps[i].price;
}

async function main() {
  console.log("=== 信号回测: 52个增强快照 ===\n");
  const snaps = loadSnapshots();
  console.log(`快照数: ${snaps.length}`);
  console.log(`时间跨度: ${snaps[0]?.timestamp?.slice(0,19)} → ${snaps[snaps.length-1]?.timestamp?.slice(0,19)}\n`);

  // ── Test 1: 12↑/0↓ predicts bullish 15-min? ──
  console.log("── 测试1: 12↑/0↓ → 15分钟后价格方向? ──");
  let bullishCount = 0, bearishCount = 0, total12up = 0;
  for (let i = 0; i < snaps.length - 3; i++) {
    if (snaps[i].rising === 12 && snaps[i].falling === 0) {
      total12up++;
      const chg = priceChange(snaps, i, 15);
      if (chg !== null) {
        if (chg > 0.005) bullishCount++;
        else if (chg < -0.005) bearishCount++;
      }
    }
  }
  console.log(`  12↑/0↓出现: ${total12up}次`);
  console.log(`  15分钟后上涨(>0.5%): ${bullishCount}次 (${(bullishCount/total12up*100).toFixed(0)}%)`);
  console.log(`  15分钟后下跌(>0.5%): ${bearishCount}次 (${(bearishCount/total12up*100).toFixed(0)}%)`);
  console.log(`  准确率(上涨): ${(bullishCount/total12up*100).toFixed(0)}%`);

  // ── Test 2: 1-2↑/10-11↓ predicts bearish? ──
  console.log("\n── 测试2: 1-2↑/10-11↓ → 15分钟后价格方向? ──");
  let bearCount2 = 0, bullCount2 = 0, totalBearOI = 0;
  for (let i = 0; i < snaps.length - 3; i++) {
    if (snaps[i].falling >= 10) {
      totalBearOI++;
      const chg = priceChange(snaps, i, 15);
      if (chg !== null) {
        if (chg < -0.005) bearCount2++;
        else if (chg > 0.005) bullCount2++;
      }
    }
  }
  console.log(`  10+↓出现: ${totalBearOI}次`);
  console.log(`  15分钟后下跌: ${bearCount2}次 (${(bearCount2/totalBearOI*100).toFixed(0)}%)`);
  console.log(`  15分钟后上涨: ${bullCount2}次 (${(bullCount2/totalBearOI*100).toFixed(0)}%)`);

  // ── Test 3: DEX buy ratio extremes ──
  console.log("\n── 测试3: DEX买比极端值(<30%或>70%) → 价格方向? ──");
  for (const [label, threshold, dir] of [["DEX买比<30%(恐慌)", 0.30, "bearish"], ["DEX买比>70%(贪婪)", 0.70, "bullish"]] as const) {
    let correct = 0, wrong = 0, total = 0;
    for (let i = 0; i < snaps.length - 3; i++) {
      const cond = dir === "bearish" ? snaps[i].dexBuyRatio < threshold : snaps[i].dexBuyRatio > threshold;
      if (cond) {
        total++;
        const chg = priceChange(snaps, i, 15);
        if (chg !== null) {
          if ((dir === "bearish" && chg < 0) || (dir === "bullish" && chg > 0)) correct++;
          else wrong++;
        }
      }
    }
    console.log(`  ${label}: ${total}次, 方向正确${correct}次(${(correct/Math.max(1,total)*100).toFixed(0)}%), 错误${wrong}次`);
  }

  // ── Test 4: Funding change vs price ──
  console.log("\n── 测试4: 资金费率下降>0.5pp → 价格方向? ──");
  let fundDownBull = 0, fundDownBear = 0, fundDownTotal = 0;
  for (let i = 1; i < snaps.length - 3; i++) {
    const fundChg = snaps[i].funding - snaps[i-1].funding;
    if (fundChg < -0.5) {
      fundDownTotal++;
      const chg = priceChange(snaps, i, 15);
      if (chg !== null) {
        if (chg > 0.003) fundDownBull++;
        else if (chg < -0.003) fundDownBear++;
      }
    }
  }
  console.log(`  资金降>0.5pp: ${fundDownTotal}次`);
  console.log(`  15分钟后上涨: ${fundDownBull}次 (${(fundDownBull/fundDownTotal*100).toFixed(0)}%)`);
  console.log(`  15分钟后下跌: ${fundDownBear}次 (${(fundDownBear/fundDownTotal*100).toFixed(0)}%)`);

  // ── Test 5: Liquidation bias accuracy ──
  console.log("\n── 测试5: 清算偏向 → 价格方向? ──");
  for (const bias of ["空头被挤", "多头被挤"]) {
    let correct = 0, wrong = 0, total = 0;
    for (let i = 0; i < snaps.length - 3; i++) {
      if (snaps[i].liqBias === bias) {
        total++;
        const chg = priceChange(snaps, i, 15);
        if (chg !== null) {
          if ((bias === "空头被挤" && chg > 0) || (bias === "多头被挤" && chg < 0)) correct++;
          else wrong++;
        }
      }
    }
    console.log(`  ${bias}: ${total}次, 方向正确${correct}(${(correct/Math.max(1,total)*100).toFixed(0)}%), 错误${wrong}(${(wrong/Math.max(1,total)*100).toFixed(0)}%)`);
  }

  console.log("\n── 回测完成 ──");
}

main().catch(console.error);
