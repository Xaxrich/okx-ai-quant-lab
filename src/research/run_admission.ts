import { fetchPaginated } from "../data/fetch_candles.js";
import { MaCrossStrategy } from "../strategies/ma_cross.js";
import { RsiReversionStrategy } from "../strategies/rsi_reversion.js";
import { VolatilityBreakoutStrategy } from "../strategies/volatility_breakout.js";
import { runSensitivityAnalysis } from "./parameter_sensitivity.js";
import { evaluateStrategy, generateAdmissionReport, type AdmissionResult } from "./strategy_admission.js";

async function main() {
  console.log("=== Strategy Admission Evaluation ===\n");

  const instIds = ["BTC-USDT", "ETH-USDT"];
  const bar = "1H";

  const results: AdmissionResult[] = [];

  for (const instId of instIds) {
    console.log(`Evaluating ${instId} / ${bar}...`);
    const candles = await fetchPaginated(instId, bar, 500);

    if (candles.length < 100) {
      console.log(`  Only ${candles.length} candles — skipping.`);
      continue;
    }

    const strategies = [
      { name: "MA Crossover", factory: (p?: Record<string, number>) => new MaCrossStrategy(p?.fastPeriod ?? 9, p?.slowPeriod ?? 21), grid: { fastPeriod: [9, 13], slowPeriod: [21, 26] } },
      { name: "RSI Mean Reversion", factory: (p?: Record<string, number>) => new RsiReversionStrategy(p?.period ?? 14, p?.oversold ?? 30, p?.overbought ?? 70), grid: { period: [14, 21], oversold: [30, 35], overbought: [65, 70] } },
      { name: "Volatility Breakout", factory: (p?: Record<string, number>) => new VolatilityBreakoutStrategy(p?.lookback ?? 20, p?.atrPeriod ?? 14, p?.atrMultiplier ?? 2), grid: { lookback: [20, 30], atrPeriod: [14], atrMultiplier: [2, 3] } },
    ];

    for (const s of strategies) {
      const sensitivity = runSensitivityAnalysis(candles, s.factory, s.grid as unknown as Record<string, number[]>, instId, bar);

      const result = evaluateStrategy(
        sensitivity,
        1, // walkForwardWindows (placeholder for now)
        0.5, // walkForwardPositiveWindowRatio
        sensitivity.bestResult.totalReturn > 0 ? sensitivity.bestResult.totalReturn / Math.abs(sensitivity.worstResult.totalReturn || 0.001) : 0,
        1.0, // maxSingleWindowReturnShare (single window since limited data)
      );

      console.log(`  ${s.name}: ${result.level}`);
      results.push(result);
    }
  }

  const report = generateAdmissionReport(results);
  console.log("\n" + report);
}

main().catch(console.error);
