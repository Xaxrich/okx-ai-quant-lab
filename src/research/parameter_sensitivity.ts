import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { NormalizedCandle } from "../data/fetch_candles.js";
import type { Strategy } from "../strategies/strategy.js";
import { runBacktest, type BacktestResult } from "../backtest/engine.js";

export interface SensitivityResult {
  params: Record<string, number>;
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  tradeCount: number;
}

export interface SensitivityReport {
  strategyName: string;
  instId: string;
  bar: string;
  paramNames: string[];
  results: SensitivityResult[];
  bestResult: SensitivityResult;
  worstResult: SensitivityResult;
  stabilityRanking: number;
  overfitWarning: boolean;
}

export function runSensitivityAnalysis(
  candles: NormalizedCandle[],
  strategyFactory: (params?: Record<string, number>) => Strategy,
  paramGrid: Record<string, number[]>,
  instId: string,
  bar: string
): SensitivityReport {
  const results: SensitivityResult[] = [];
  const gridCombinations = cartesianProduct(paramGrid);

  for (const combo of gridCombinations) {
    const strat = strategyFactory(combo);
    const result = runBacktest(candles, strat, instId);
    results.push({
      params: { ...combo },
      totalReturn: result.metrics.totalReturn,
      maxDrawdown: result.metrics.maxDrawdown,
      sharpe: result.metrics.sharpe,
      tradeCount: result.metrics.tradeCount,
    });
  }

  results.sort((a, b) => b.totalReturn - a.totalReturn);

  const bestResult = results[0];
  const worstResult = results[results.length - 1];

  // Stability ranking: ratio of best sharpe to mean sharpe (higher = less stable)
  const meanReturn = results.reduce((s, r) => s + r.totalReturn, 0) / results.length;
  const returnStd = Math.sqrt(
    results.reduce((s, r) => s + (r.totalReturn - meanReturn) ** 2, 0) / results.length
  );
  const stabilityRanking = meanReturn !== 0
    ? 1 - Math.min(1, Math.abs(returnStd / meanReturn))
    : 0;

  // Overfit warning: if best return is > 3x the mean, likely overfit
  const overfitWarning = bestResult.totalReturn > meanReturn * 3 && results.length > 3;

  const strat = strategyFactory();
  return {
    strategyName: strat.name,
    instId,
    bar,
    paramNames: Object.keys(paramGrid),
    results,
    bestResult,
    worstResult,
    stabilityRanking,
    overfitWarning,
  };
}

function cartesianProduct(grid: Record<string, number[]>): Record<string, number>[] {
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

export function generateSensitivityReport(reports: SensitivityReport[]): string {
  const lines: string[] = [
    "# Parameter Sensitivity Analysis Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
  ];

  for (const r of reports) {
    lines.push(`### ${r.strategyName} — ${r.instId} / ${r.bar}`);
    lines.push("");
    lines.push(`| Rank | Params | Return % | MaxDD % | Sharpe | Trades |`);
    lines.push(`|------|--------|----------|---------|--------|--------|`);

    const top5 = r.results.slice(0, 5);
    for (let i = 0; i < top5.length; i++) {
      const res = top5[i];
      const paramStr = Object.entries(res.params)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      lines.push(
        `| ${i + 1} | ${paramStr} | ${(res.totalReturn * 100).toFixed(2)} | ${(res.maxDrawdown * 100).toFixed(2)} | ${res.sharpe.toFixed(3)} | ${res.tradeCount} |`
      );
    }

    lines.push("");
    lines.push(`- **Best Return:** ${(r.bestResult.totalReturn * 100).toFixed(2)}%`);
    lines.push(`- **Stability Ranking:** ${r.stabilityRanking.toFixed(3)}`);
    lines.push(`- **Overfit Warning:** ${r.overfitWarning ? "YES" : "no"}`);
    lines.push(`- **Total Parameter Combos Tested:** ${r.results.length}`);
    lines.push("");
  }

  const md = lines.join("\n");
  const reportsDir = join(import.meta.dirname, "..", "..", "reports");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "parameter_sensitivity_report.md"), md);

  return md;
}
