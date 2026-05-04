import { fetchPaginated } from "../data/fetch_candles.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const TOKENS = ["PEPE-USDT", "WIF-USDT", "BONK-USDT"];
const DATA_DIR = join(import.meta.dirname, "..", "..", "data", "altcoin");

async function main() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  for (const token of TOKENS) {
    console.log(`\n=== ${token} ===`);

    for (const bar of ["1D", "4H"]) {
      try {
        const data = await fetchPaginated(token, bar, 300);
        if (data.length === 0) {
          console.log(`  ${bar}: NO DATA`);
          continue;
        }

        const prices = data.map((d) => d.close);
        const maxIdx = prices.indexOf(Math.max(...prices));
        const volumes = data.map((d) => d.volume);

        console.log(`  ${bar}: ${data.length} candles`);
        console.log(`    Range: ${new Date(data[0].ts).toISOString().slice(0, 10)} → ${new Date(data[data.length - 1].ts).toISOString().slice(0, 10)}`);
        console.log(`    Price: $${data[0].close.toFixed(8)} → $${data[data.length - 1].close.toFixed(8)}`);
        console.log(`    Peak:  $${prices[maxIdx].toFixed(8)} on ${new Date(data[maxIdx].ts).toISOString().slice(0, 10)}`);

        // Compute returns
        const ret7 = ((prices[prices.length - 1] - prices[Math.max(0, prices.length - 8)]) / prices[Math.max(0, prices.length - 8)]) * 100;
        const ret30 = ((prices[prices.length - 1] - prices[Math.max(0, prices.length - 31)]) / prices[Math.max(0, prices.length - 31)]) * 100;

        // Find max 7d return
        let max7d = -Infinity;
        let max7dDate = "";
        for (let i = 7; i < prices.length; i++) {
          const r = ((prices[i] - prices[i - 7]) / prices[i - 7]) * 100;
          if (r > max7d) { max7d = r; max7dDate = new Date(data[i].ts).toISOString().slice(0, 10); }
        }

        console.log(`    7d return (latest): ${ret7.toFixed(1)}%`);
        console.log(`    30d return (latest): ${ret30.toFixed(1)}%`);
        console.log(`    Max 7d return: ${max7d.toFixed(1)}% on ${max7dDate}`);

        // Save to CSV
        const csv = ["ts,open,high,low,close,volume"];
        for (const c of data) {
          csv.push(`${c.ts},${c.open},${c.high},${c.low},${c.close},${c.volume}`);
        }
        writeFileSync(join(DATA_DIR, `${token.replace("-", "_")}_${bar}.csv`), csv.join("\n"));

      } catch (err: any) {
        console.log(`  ${bar}: ERROR - ${err.message}`);
      }
    }
  }
}

main().catch(console.error);
