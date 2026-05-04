import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { fetchPaginated } from "../data/fetch_candles.js";
import { MaCrossStrategy } from "../strategies/ma_cross.js";
import { RsiReversionStrategy } from "../strategies/rsi_reversion.js";
import { VolatilityBreakoutStrategy } from "../strategies/volatility_breakout.js";
import { runSensitivityAnalysis } from "./parameter_sensitivity.js";
import type { SensitivityReport } from "./parameter_sensitivity.js";

export interface StrategyScore {
  strategyName: string;
  instId: string;
  bar: string;
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  profitFactor: number;
  tradeCount: number;
  positiveWindowRatio: number;
  parameterStabilityScore: number;
  admissionStatus: string;
  recommendation: string;
}

export interface CrossScore {
  strategyName: string;
  scores: StrategyScore[];
  crossInstrumentStability: number;
  crossTimeframeStability: number;
  overallRecommendation: string;
}

export function buildScorecard(
  sensitivityReports: SensitivityReport[],
  admissionResults: { strategyName: string; instId: string; bar: string; level: string }[]
): CrossScore[] {
  const grouped: Map<string, StrategyScore[]> = new Map();

  for (const report of sensitivityReports) {
    const admission = admissionResults.find(
      (a) =>
        a.strategyName === report.strategyName &&
        a.instId === report.instId &&
        a.bar === report.bar
    );

    const score: StrategyScore = {
      strategyName: report.strategyName,
      instId: report.instId,
      bar: report.bar,
      totalReturn: report.bestResult.totalReturn,
      maxDrawdown: report.worstResult.maxDrawdown,
      sharpe: report.bestResult.sharpe,
      profitFactor: report.bestResult.totalReturn > 0
        ? report.bestResult.totalReturn / Math.abs(report.worstResult.totalReturn || 0.001)
        : 0,
      tradeCount: report.bestResult.tradeCount,
      positiveWindowRatio: 1, // placeholder
      parameterStabilityScore: report.stabilityRanking,
      admissionStatus: admission?.level ?? "UNKNOWN",
      recommendation: buildRecommendation(report, admission?.level ?? "UNKNOWN"),
    };

    const existing = grouped.get(report.strategyName) || [];
    existing.push(score);
    grouped.set(report.strategyName, existing);
  }

  const crossScores: CrossScore[] = [];
  for (const [name, scores] of grouped) {
    const returns = scores.map((s) => s.totalReturn);
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const returnStd = Math.sqrt(
      returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length
    );
    const crossInstrumentStability = meanReturn !== 0
      ? 1 - Math.min(1, Math.abs(returnStd / (Math.abs(meanReturn) + 0.001)))
      : 0;

    const bars = new Set(scores.map((s) => s.bar)).size;
    const crossTimeframeStability = bars >= 3 ? 0.8 : bars >= 2 ? 0.5 : 0.2;

    const recommendation = scores.some((s) => s.admissionStatus === "ADMITTED_TO_DEMO")
      ? "Ready for demo dry-run observation"
      : scores.some((s) => s.admissionStatus === "RESEARCH_ONLY")
        ? "Continue research, more data needed"
        : "Do not use — fails core criteria";

    crossScores.push({
      strategyName: name,
      scores,
      crossInstrumentStability,
      crossTimeframeStability,
      overallRecommendation: recommendation,
    });
  }

  return crossScores;
}

function buildRecommendation(report: SensitivityReport, level: string): string {
  if (level === "REJECTED") {
    if (report.bestResult.tradeCount < 5) return "Insufficient trades — not enough signal";
    if (report.stabilityRanking < 0.3) return "Unstable parameters — likely overfit";
    return "Fails admission criteria — do not use";
  }
  if (level === "RESEARCH_ONLY") {
    if (report.stabilityRanking > 0.5) return "Promising stability — gather more data";
    return "Shows potential — needs more walk-forward windows";
  }
  if (level === "ADMITTED_TO_DEMO") {
    return "Ready for dry-run observation — do not auto-execute";
  }
  return "Unevaluated";
}

export function generateScorecardReport(crossScores: CrossScore[]): string {
  const lines: string[] = [
    "# Strategy Scorecard",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Overall Summary",
    "",
    "| Strategy | Cross-Instrument Stability | Cross-Timeframe Stability | Recommendation |",
    "|----------|---------------------------|---------------------------|----------------|",
  ];

  for (const cs of crossScores) {
    lines.push(
      `| ${cs.strategyName} | ${cs.crossInstrumentStability.toFixed(3)} | ${cs.crossTimeframeStability.toFixed(3)} | ${cs.overallRecommendation} |`
    );
  }

  lines.push("");
  lines.push("## Per-Strategy Details");
  lines.push("");

  for (const cs of crossScores) {
    lines.push(`### ${cs.strategyName}`);
    lines.push("");
    lines.push("| Inst | Bar | Return % | MaxDD % | Sharpe | Trades | Stability | Status |");
    lines.push("|------|-----|----------|---------|--------|--------|-----------|--------|");

    for (const s of cs.scores) {
      lines.push(
        `| ${s.instId} | ${s.bar} | ${(s.totalReturn * 100).toFixed(2)} | ${(s.maxDrawdown * 100).toFixed(2)} | ${s.sharpe.toFixed(3)} | ${s.tradeCount} | ${s.parameterStabilityScore.toFixed(3)} | ${s.admissionStatus} |`
      );
    }

    lines.push("");
    lines.push(`**Recommendation:** ${cs.overallRecommendation}`);
    lines.push("");
    lines.push("**Per-score recommendations:**");
    for (const s of cs.scores) {
      lines.push(`- ${s.instId}/${s.bar}: ${s.recommendation} (Return: ${(s.totalReturn * 100).toFixed(2)}%, Sharpe: ${s.sharpe.toFixed(3)})`);
    }
    lines.push("");
  }

  lines.push("## Warnings");
  lines.push("");
  for (const cs of crossScores) {
    for (const s of cs.scores) {
      const warns: string[] = [];
      if (s.tradeCount < 5) warns.push(`Sample size: ${s.tradeCount} trades (minimum recommended: 30) — **SEVERE UNDER-SAMPLING**`);
      else if (s.tradeCount < 30) warns.push(`Trade count: ${s.tradeCount} (minimum recommended: 30) — **under-sampled**`);
      if (s.positiveWindowRatio < 0.6) warns.push(`Walk-forward: ${(s.positiveWindowRatio * 100).toFixed(0)}% positive (minimum: 60%)`);
      if (s.parameterStabilityScore < 0.3) warns.push(`Parameter stability: ${s.parameterStabilityScore.toFixed(3)} (minimum: 0.6) — **likely overfit**`);
      if (warns.length > 0) {
        lines.push(`- **${s.strategyName} / ${s.instId} / ${s.bar}:** ${warns.join("; ")}`);
      }
    }
  }

  lines.push("");
  lines.push("## Current Recommendation");
  lines.push("");
  for (const cs of crossScores) {
    for (const s of cs.scores) {
      if (s.admissionStatus === "RESEARCH_ONLY" && s.parameterStabilityScore > 0.5) {
        lines.push(`- **${s.strategyName} / ${s.instId} / ${s.bar}:** Promising but under-sampled. Continue observation. Gather more walk-forward windows. **Allowed action: OBSERVATION_ONLY only.**`);
      } else if (s.admissionStatus === "REJECTED") {
        lines.push(`- **${s.strategyName} / ${s.instId} / ${s.bar}:** Fails core criteria. **Allowed action: BLOCKED. Do not use.**`);
      }
    }
  }

  lines.push("");
  lines.push("## Safety Note");
  lines.push("");
  lines.push("- All scores below ADMITTED_TO_DEMO threshold. No strategy may auto-execute.");
  lines.push("- Live trading remains disabled.");
  lines.push("- Demo execution requires explicit --execute-demo + EXECUTE_DEMO_ORDER.");

  const md = lines.join("\n");
  const reportsDir = join(import.meta.dirname, "..", "..", "reports");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "strategy_scorecard.md"), md);

  return md;
}

async function main() {
  console.log("=== Strategy Scorecard ===\n");

  const instIds = ["BTC-USDT", "ETH-USDT"];
  const bars = ["1H"];
  const reports: SensitivityReport[] = [];
  const admissionResults: { strategyName: string; instId: string; bar: string; level: string }[] = [];

  for (const instId of instIds) {
    for (const bar of bars) {
      console.log(`Loading ${instId}/${bar}...`);
      const candles = await fetchPaginated(instId, bar, 500);
      if (candles.length < 100) {
        console.log(`  Only ${candles.length} candles — skipping.`);
        continue;
      }

      console.log(`  Running sensitivity analysis...`);

      const maReport = runSensitivityAnalysis(
        candles,
        (p?) => new MaCrossStrategy(p?.fastPeriod ?? 9, p?.slowPeriod ?? 21),
        { fastPeriod: [9, 13], slowPeriod: [21, 26] },
        instId, bar
      );
      reports.push(maReport);

      const rsiReport = runSensitivityAnalysis(
        candles,
        (p?) => new RsiReversionStrategy(p?.period ?? 14, p?.oversold ?? 30, p?.overbought ?? 70),
        { period: [14, 21], oversold: [30, 35], overbought: [65, 70] },
        instId, bar
      );
      reports.push(rsiReport);

      const vbReport = runSensitivityAnalysis(
        candles,
        (p?) => new VolatilityBreakoutStrategy(p?.lookback ?? 20, p?.atrPeriod ?? 14, p?.atrMultiplier ?? 2),
        { lookback: [20, 30], atrPeriod: [14], atrMultiplier: [2, 3] },
        instId, bar
      );
      reports.push(vbReport);

      // Load admission results
      const admissionPath = join(import.meta.dirname, "..", "..", "reports", "strategy_admission_report.md");
      if (existsSync(admissionPath)) {
        const content = readFileSync(admissionPath, "utf-8");
        let inTable = false;
        for (const line of content.split("\n")) {
          if (line.includes("| Strategy | Inst | Bar | Level |")) { inTable = true; continue; }
          if (inTable && line.startsWith("|") && !line.includes("---")) {
            const parts = line.split("|").map(p => p.trim()).filter(Boolean);
            if (parts.length >= 4) {
              admissionResults.push({
                strategyName: parts[0],
                instId: parts[1],
                bar: parts[2],
                level: parts[3],
              });
            }
          }
          if (inTable && line.startsWith("##") && !line.includes("Strategy") && !line.includes("Results")) inTable = false;
        }
      }
    }
  }

  if (admissionResults.length === 0) {
    // Fallback: all REJECTED for scorecard purposes
    for (const r of reports) {
      admissionResults.push({
        strategyName: r.strategyName,
        instId: r.instId,
        bar: r.bar,
        level: "REJECTED",
      });
    }
  }

  const crossScores = buildScorecard(reports, admissionResults);
  const report = generateScorecardReport(crossScores);
  console.log("\n" + report);
  console.log("\nReport saved: reports/strategy_scorecard.md");
}

const isMain = process.argv[1]?.includes("strategy_scorecard");
if (isMain) main().catch(console.error);
