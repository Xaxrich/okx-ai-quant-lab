import { fetchCandles, normalizeCandles } from "../data/fetch_candles.js";
import { runBacktest } from "./engine.js";
import { MaCrossStrategy } from "../strategies/ma_cross.js";
import { RsiReversionStrategy } from "../strategies/rsi_reversion.js";
import { VolatilityBreakoutStrategy } from "../strategies/volatility_breakout.js";
import { generateBacktestReport } from "../reports/generate_report.js";
import type { BacktestResult } from "./engine.js";

async function main() {
  const instIds = ["BTC-USDT", "ETH-USDT"];
  const bars = ["1H", "4H", "1D"];
  const strategies = [
    new MaCrossStrategy(),
    new RsiReversionStrategy(),
    new VolatilityBreakoutStrategy(),
  ];

  const allResults: BacktestResult[] = [];

  for (const instId of instIds) {
    for (const bar of bars) {
      try {
        const raw = await fetchCandles(instId, bar, 300);
        const candles = normalizeCandles(raw);

        console.log(`\n=== ${instId} / ${bar} (${candles.length} candles) ===`);

        for (const strategy of strategies) {
          const result = runBacktest(candles, strategy, instId);
          allResults.push(result);

          const m = result.metrics;
          console.log(`  ${strategy.name}:`);
          console.log(`    Trades: ${m.tradeCount} | Return: ${(m.totalReturn * 100).toFixed(2)}% | Sharpe: ${m.sharpe.toFixed(3)} | MaxDD: ${(m.maxDrawdown * 100).toFixed(2)}% | WinRate: ${(m.winRate * 100).toFixed(1)}%`);
        }
      } catch (err: any) {
        console.error(`Failed ${instId}/${bar}: ${err.message}`);
      }
    }
  }

  const report = generateBacktestReport(allResults);
  console.log("\n" + report);
}

main().catch(console.error);
