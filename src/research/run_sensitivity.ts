import { fetchPaginated } from "../data/fetch_candles.js";
import { MaCrossStrategy } from "../strategies/ma_cross.js";
import { RsiReversionStrategy } from "../strategies/rsi_reversion.js";
import { VolatilityBreakoutStrategy } from "../strategies/volatility_breakout.js";
import { runSensitivityAnalysis, generateSensitivityReport, type SensitivityReport } from "./parameter_sensitivity.js";
import type { Strategy } from "../strategies/strategy.js";

async function main() {
  console.log("=== Parameter Sensitivity Analysis ===\n");

  const instId = "BTC-USDT";
  const bar = "1H";

  console.log(`Loading ${instId} / ${bar} data...`);
  const candles = await fetchPaginated(instId, bar, 1000);

  if (candles.length < 100) {
    console.log(`Only ${candles.length} candles available. Need >= 100.`);
    return;
  }

  console.log(`Loaded ${candles.length} candles.\n`);

  const reports: SensitivityReport[] = [];

  // MA Crossover grid
  console.log("--- MA Crossover ---");
  const maReport = runSensitivityAnalysis(
    candles,
    (params?) => new MaCrossStrategy(params?.fastPeriod ?? 9, params?.slowPeriod ?? 21),
    { fastPeriod: [5, 9, 13, 17], slowPeriod: [18, 21, 26, 34] },
    instId, bar
  );
  console.log(`  Best: Return ${(maReport.bestResult.totalReturn * 100).toFixed(2)}%, Sharpe ${maReport.bestResult.sharpe.toFixed(3)}`);
  console.log(`  Stability: ${maReport.stabilityRanking.toFixed(3)}, Overfit: ${maReport.overfitWarning}`);
  reports.push(maReport);

  // RSI grid
  console.log("--- RSI Mean Reversion ---");
  const rsiReport = runSensitivityAnalysis(
    candles,
    (params?) => new RsiReversionStrategy(
      params?.period ?? 14, params?.oversold ?? 30, params?.overbought ?? 70
    ),
    { period: [7, 14, 21], oversold: [25, 30, 35], overbought: [65, 70, 75] },
    instId, bar
  );
  console.log(`  Best: Return ${(rsiReport.bestResult.totalReturn * 100).toFixed(2)}%, Sharpe ${rsiReport.bestResult.sharpe.toFixed(3)}`);
  console.log(`  Stability: ${rsiReport.stabilityRanking.toFixed(3)}, Overfit: ${rsiReport.overfitWarning}`);
  reports.push(rsiReport);

  // Volatility Breakout grid
  console.log("--- Volatility Breakout ---");
  const vbReport = runSensitivityAnalysis(
    candles,
    (params?) => new VolatilityBreakoutStrategy(
      params?.lookback ?? 20, params?.atrPeriod ?? 14, params?.atrMultiplier ?? 2
    ),
    { lookback: [10, 20, 30], atrPeriod: [7, 14, 21], atrMultiplier: [1.5, 2, 3] },
    instId, bar
  );
  console.log(`  Best: Return ${(vbReport.bestResult.totalReturn * 100).toFixed(2)}%, Sharpe ${vbReport.bestResult.sharpe.toFixed(3)}`);
  console.log(`  Stability: ${vbReport.stabilityRanking.toFixed(3)}, Overfit: ${vbReport.overfitWarning}`);
  reports.push(vbReport);

  const report = generateSensitivityReport(reports);
  console.log("\nReport saved: reports/parameter_sensitivity_report.md");
}

main().catch(console.error);
