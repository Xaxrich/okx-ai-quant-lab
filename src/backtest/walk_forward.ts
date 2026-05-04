import type { NormalizedCandle } from "../data/fetch_candles.js";
import type { Strategy, Signal } from "../strategies/strategy.js";
import { runBacktest, type BacktestResult } from "./engine.js";
import { computeMetrics, type BacktestMetrics } from "./metrics.js";

export interface WalkForwardWindow {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  trainResult: BacktestResult;
  testResult: BacktestResult;
}

export interface WalkForwardConfig {
  trainWindow: number;
  testWindow: number;
  minTrainSize: number;
}

export interface WalkForwardReport {
  config: WalkForwardConfig;
  windows: WalkForwardWindow[];
  aggregateMetrics: BacktestMetrics;
  aggregateEquityCurve: number[];
  aggregateTrades: number;
}

export function runWalkForward(
  candles: NormalizedCandle[],
  strategyFactory: (params?: Record<string, number>) => Strategy,
  instId: string,
  paramGrid: Record<string, number[]>,
  config: WalkForwardConfig
): WalkForwardReport {
  const windows: WalkForwardWindow[] = [];
  let allTrades: number[] = [];

  for (
    let start = 0;
    start + config.trainWindow + config.testWindow <= candles.length;
    start += config.testWindow
  ) {
    const trainStart = start;
    const trainEnd = start + config.trainWindow;
    const testStart = trainEnd;
    const testEnd = Math.min(testStart + config.testWindow, candles.length);

    const trainCandles = candles.slice(trainStart, trainEnd);
    const testCandles = candles.slice(testStart, testEnd);

    if (trainCandles.length < config.minTrainSize || testCandles.length === 0) {
      break;
    }

    const bestParams = optimizeParams(trainCandles, strategyFactory, instId, paramGrid);
    const bestStrategy = strategyFactory(bestParams);

    const trainResult = runBacktest(trainCandles, bestStrategy, instId);
    const testResult = runBacktest(testCandles, bestStrategy, instId);

    windows.push({
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      trainResult,
      testResult,
    });

    allTrades = allTrades.concat(testResult.trades.map(() => 1));
  }

  const aggregateEquityCurve: number[] = [];
  let equity = 1000;
  aggregateEquityCurve.push(equity);
  for (const w of windows) {
    for (let i = 1; i < w.testResult.equityCurve.length; i++) {
      const ret =
        (w.testResult.equityCurve[i] - w.testResult.equityCurve[i - 1]) /
        w.testResult.equityCurve[i - 1];
      equity *= 1 + ret;
      aggregateEquityCurve.push(equity);
    }
  }

  const allTradesArr = windows.flatMap((w) => w.testResult.trades);
  const aggregateMetrics = computeMetrics(
    allTradesArr,
    aggregateEquityCurve,
    1000
  );

  return {
    config,
    windows,
    aggregateMetrics,
    aggregateEquityCurve,
    aggregateTrades: allTradesArr.length,
  };
}

function optimizeParams(
  candles: NormalizedCandle[],
  strategyFactory: (params?: Record<string, number>) => Strategy,
  instId: string,
  paramGrid: Record<string, number[]>
): Record<string, number> {
  const paramNames = Object.keys(paramGrid);
  if (paramNames.length === 0) return {};

  let bestParams: Record<string, number> = {};
  for (const name of paramNames) {
    bestParams[name] = paramGrid[name][0];
  }

  let bestSharpe = -Infinity;

  const gridCombinations = cartesianProduct(paramGrid);
  for (const combo of gridCombinations) {
    const strat = strategyFactory(combo);
    const result = runBacktest(candles, strat, instId);
    if (result.metrics.sharpe > bestSharpe) {
      bestSharpe = result.metrics.sharpe;
      bestParams = { ...combo };
    }
  }

  return bestParams;
}

function cartesianProduct(
  grid: Record<string, number[]>
): Record<string, number>[] {
  const keys = Object.keys(grid);
  if (keys.length === 0) return [{}];

  const results: Record<string, number>[] = [];
  const firstKey = keys[0];
  const rest = cartesianProduct(
    Object.fromEntries(Object.entries(grid).filter(([k]) => k !== firstKey))
  );

  for (const val of grid[firstKey]) {
    for (const r of rest) {
      results.push({ [firstKey]: val, ...r });
    }
  }

  return results;
}

import { fetchCandles, normalizeCandles } from "../data/fetch_candles.js";
import { MaCrossStrategy } from "../strategies/ma_cross.js";
import { generateWalkForwardReport } from "../reports/generate_report.js";

async function main() {
  const instId = "BTC-USDT";
  const bar = "1H";

  console.log("=== Walk-Forward Validation ===\n");
  console.log(`Instrument: ${instId} / ${bar}`);

  try {
    const raw = await fetchCandles(instId, bar, 300);
    const candles = normalizeCandles(raw);
    console.log(`Candles loaded: ${candles.length}`);

    if (candles.length < 60) {
      console.log("Insufficient data for walk-forward (need >= 60 candles)");
      console.log("TODO: Fetch more data or use longer time horizon.");
      return;
    }

    const config = {
      trainWindow: Math.floor(candles.length * 0.6),
      testWindow: Math.floor(candles.length * 0.2),
      minTrainSize: 30,
    };

    console.log(`Train window: ${config.trainWindow}, Test window: ${config.testWindow}`);

    const strategyFactory = (params?: Record<string, number>): Strategy => {
      return new MaCrossStrategy(
        params?.fastPeriod ?? 9,
        params?.slowPeriod ?? 21
      );
    };

    const paramGrid: Record<string, number[]> = {
      fastPeriod: [5, 9, 13],
      slowPeriod: [18, 21, 26],
    };

    const report = runWalkForward(
      candles,
      strategyFactory,
      instId,
      paramGrid,
      config
    );

    console.log(`Windows analyzed: ${report.windows.length}`);
    console.log(`Aggregate OOS trades: ${report.aggregateTrades}`);
    console.log(`Aggregate Sharpe: ${report.aggregateMetrics.sharpe.toFixed(3)}`);

    const mdReport = generateWalkForwardReport(report);
    console.log("\n" + mdReport);
  } catch (err: any) {
    console.error(`Walk-forward failed: ${err.message}`);
    console.log("TODO: Walk-forward requires sufficient market data. Ensure OKX CLI is configured.");
  }
}

main().catch(console.error);
