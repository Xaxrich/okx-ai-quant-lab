import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { SensitivityReport } from "./parameter_sensitivity.js";

interface AdmissionPolicy {
  admission_criteria: {
    min_test_windows: number;
    min_positive_windows_ratio: number;
    max_drawdown: number;
    min_profit_factor: number;
    min_trade_count: number;
    max_single_window_return_share: number;
    min_parameter_stability_score: number;
    live_trading: boolean;
  };
}

type AdmissionLevel = "ADMITTED_TO_DEMO" | "RESEARCH_ONLY" | "REJECTED";

export interface AdmissionResult {
  strategyName: string;
  instId: string;
  bar: string;
  level: AdmissionLevel;
  reasons: string[];
  metrics: Record<string, number>;
}

export function evaluateStrategy(
  sensitivityReport: SensitivityReport,
  walkForwardWindows: number,
  walkForwardPositiveWindowRatio: number,
  profitFactor: number,
  maxSingleWindowReturnShare: number,
  policyPath?: string
): AdmissionResult {
  const policyPathResolved = policyPath || "config/strategy_admission_policy.yaml";
  const raw = readFileSync(policyPathResolved, "utf-8");
  const policy = parseYaml(raw) as AdmissionPolicy;
  const criteria = policy.admission_criteria;

  const reasons: string[] = [];
  const metrics: Record<string, number> = {
    testWindows: walkForwardWindows,
    positiveWindowRatio: walkForwardPositiveWindowRatio,
    maxDrawdown: sensitivityReport.worstResult.maxDrawdown,
    profitFactor,
    tradeCount: sensitivityReport.bestResult.tradeCount,
    maxSingleWindowReturnShare,
    parameterStability: sensitivityReport.stabilityRanking,
  };

  let score = 0;
  const totalCriteria = 6;

  if (walkForwardWindows < criteria.min_test_windows) {
    reasons.push(`Test windows (${walkForwardWindows}) < min (${criteria.min_test_windows})`);
  } else {
    score++;
  }

  if (walkForwardPositiveWindowRatio < criteria.min_positive_windows_ratio) {
    reasons.push(`Positive window ratio (${(walkForwardPositiveWindowRatio * 100).toFixed(0)}%) < min (${(criteria.min_positive_windows_ratio * 100).toFixed(0)}%)`);
  } else {
    score++;
  }

  if (sensitivityReport.worstResult.maxDrawdown > criteria.max_drawdown) {
    reasons.push(`Max drawdown (${(sensitivityReport.worstResult.maxDrawdown * 100).toFixed(1)}%) > max (${(criteria.max_drawdown * 100).toFixed(0)}%)`);
  } else {
    score++;
  }

  if (profitFactor < criteria.min_profit_factor) {
    reasons.push(`Profit factor (${profitFactor.toFixed(2)}) < min (${criteria.min_profit_factor})`);
  } else {
    score++;
  }

  if (sensitivityReport.bestResult.tradeCount < criteria.min_trade_count) {
    reasons.push(`Trade count (${sensitivityReport.bestResult.tradeCount}) < min (${criteria.min_trade_count})`);
  } else {
    score++;
  }

  if (sensitivityReport.stabilityRanking < criteria.min_parameter_stability_score) {
    reasons.push(`Parameter stability (${sensitivityReport.stabilityRanking.toFixed(2)}) < min (${criteria.min_parameter_stability_score})`);
  } else {
    score++;
  }

  if (maxSingleWindowReturnShare > criteria.max_single_window_return_share) {
    reasons.push(`Single window return share (${(maxSingleWindowReturnShare * 100).toFixed(0)}%) > max (${(criteria.max_single_window_return_share * 100).toFixed(0)}%)`);
  }

  let level: AdmissionLevel;
  if (score === totalCriteria && reasons.length === 0) {
    level = "ADMITTED_TO_DEMO";
    reasons.push("All criteria met");
  } else if (score >= 3) {
    level = "RESEARCH_ONLY";
  } else {
    level = "REJECTED";
  }

  return {
    strategyName: sensitivityReport.strategyName,
    instId: sensitivityReport.instId,
    bar: sensitivityReport.bar,
    level,
    reasons,
    metrics,
  };
}

export function generateAdmissionReport(results: AdmissionResult[]): string {
  const lines: string[] = [
    "# Strategy Admission Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Results",
    "",
    "| Strategy | Inst | Bar | Level | Reason |",
    "|----------|------|-----|-------|--------|",
  ];

  for (const r of results) {
    lines.push(`| ${r.strategyName} | ${r.instId} | ${r.bar} | ${r.level} | ${r.reasons[0] ?? "-"} |`);
  }

  lines.push("");
  lines.push("## Detailed Metrics");
  lines.push("");

  for (const r of results) {
    lines.push(`### ${r.strategyName} — ${r.instId} / ${r.bar}`);
    lines.push(`- **Level:** ${r.level}`);
    lines.push(`- **Reasons:** ${r.reasons.join("; ")}`);
    for (const [k, v] of Object.entries(r.metrics)) {
      const formatted = typeof v === "number" ? v.toFixed(3) : v;
      lines.push(`- **${k}:** ${formatted}`);
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const reportsDir = join(import.meta.dirname, "..", "..", "reports");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "strategy_admission_report.md"), md);

  return md;
}
