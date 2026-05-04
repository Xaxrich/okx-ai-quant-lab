import type { BacktestResult } from "../backtest/engine.js";
import type { WalkForwardReport } from "../backtest/walk_forward.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const REPORTS_DIR = join(import.meta.dirname, "..", "..", "reports");

export function generateBacktestReport(results: BacktestResult[]): string {
  const lines: string[] = [
    "# OKX AI Quant Lab - Backtest Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    "| Instrument | Bar | Strategy | Trades | Return % | Sharpe | MaxDD % | WinRate % | Profit Factor |",
    "|------------|-----|----------|--------|----------|--------|---------|-----------|---------------|",
  ];

  for (const r of results) {
    const m = r.metrics;
    lines.push(
      `| ${r.instId} | - | ${r.strategyName} | ${m.tradeCount} | ${(m.totalReturn * 100).toFixed(2)} | ${m.sharpe.toFixed(3)} | ${(m.maxDrawdown * 100).toFixed(2)} | ${(m.winRate * 100).toFixed(1)} | ${m.profitFactor.toFixed(2)} |`
    );
  }

  lines.push("");
  lines.push("## Detailed Results");
  lines.push("");

  for (const r of results) {
    const m = r.metrics;
    lines.push(`### ${r.strategyName} - ${r.instId}`);
    lines.push("");
    lines.push(`- **Total Return:** ${(m.totalReturn * 100).toFixed(2)}%`);
    lines.push(`- **Annualized Return:** ${(m.annualizedReturn * 100).toFixed(2)}%`);
    lines.push(`- **Max Drawdown:** ${(m.maxDrawdown * 100).toFixed(2)}%`);
    lines.push(`- **Sharpe Ratio:** ${m.sharpe.toFixed(3)}`);
    lines.push(`- **Win Rate:** ${(m.winRate * 100).toFixed(1)}%`);
    lines.push(`- **Profit Factor:** ${m.profitFactor.toFixed(2)}`);
    lines.push(`- **Avg Trade Return:** ${(m.avgTradeReturn * 100).toFixed(4)}%`);
    lines.push(`- **Max Consecutive Losses:** ${m.maxConsecutiveLosses}`);
    lines.push(`- **Total Trades:** ${m.tradeCount}`);
    lines.push("");
    lines.push(`Config: initialCapital=$${r.config.initialCapital}, feeBps=${r.config.feeBps}, slippageBps=${r.config.slippageBps}`);
    lines.push("");
  }

  lines.push("## Risk Notes");
  lines.push("");
  lines.push("- All backtests use simulated fills with configurable slippage and fees.");
  lines.push("- Past performance does not guarantee future results.");
  lines.push("- These are baseline strategies for research purposes only.");
  lines.push("");

  const report = lines.join("\n");

  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
  writeFileSync(join(REPORTS_DIR, "backtest_report.md"), report);

  return report;
}

export function generateWalkForwardReport(wfReport: WalkForwardReport): string {
  const lines: string[] = [
    "# OKX AI Quant Lab - Walk-Forward Validation Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Configuration",
    "",
    `- Train Window: ${wfReport.config.trainWindow} candles`,
    `- Test Window: ${wfReport.config.testWindow} candles`,
    `- Windows Analyzed: ${wfReport.windows.length}`,
    "",
    "## Per-Window Results",
    "",
    "| Window | Train Return % | Test Return % | Test Sharpe | Test MaxDD % |",
    "|--------|---------------|---------------|-------------|--------------|",
  ];

  for (let i = 0; i < wfReport.windows.length; i++) {
    const w = wfReport.windows[i];
    lines.push(
      `| ${i + 1} | ${(w.trainResult.metrics.totalReturn * 100).toFixed(2)} | ${(w.testResult.metrics.totalReturn * 100).toFixed(2)} | ${w.testResult.metrics.sharpe.toFixed(3)} | ${(w.testResult.metrics.maxDrawdown * 100).toFixed(2)} |`
    );
  }

  lines.push("");
  lines.push("## Aggregate Out-of-Sample Performance");
  lines.push("");
  const m = wfReport.aggregateMetrics;
  lines.push(`- **Total Return:** ${(m.totalReturn * 100).toFixed(2)}%`);
  lines.push(`- **Sharpe Ratio:** ${m.sharpe.toFixed(3)}`);
  lines.push(`- **Max Drawdown:** ${(m.maxDrawdown * 100).toFixed(2)}%`);
  lines.push(`- **Win Rate:** ${(m.winRate * 100).toFixed(1)}%`);
  lines.push(`- **Total Trades (OOS):** ${wfReport.aggregateTrades}`);
  lines.push("");

  const report = lines.join("\n");

  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
  writeFileSync(join(REPORTS_DIR, "walk_forward_report.md"), report);

  return report;
}
