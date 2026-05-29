import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { nearestAtOrBefore, parseCoingeckoPriceCache, type PricePoint } from "./point_in_time_labels.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const VALIDATION_DIR = join(ROOT, "data", "altcoin", "intelligence", "validation");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "validation");
const PRICE_CACHE_DIR = join(ROOT, "data", "altcoin", "scanner_v02", "cache", "price_features");
const BTC_PRICE_CACHE = join(PRICE_CACHE_DIR, "bitcoin_90d.json");

export type MarketRegime = "BTC_UPTREND" | "BTC_RANGE" | "BTC_DOWNTREND" | "REGIME_DATA_MISSING";

export interface MarketRegimeSnapshot {
  marketRegime: MarketRegime;
  btcReturn7d: number | null;
  btcReturn30d: number | null;
  source: string;
}

export interface LabeledCandidate {
  snapshotId: string;
  observedAt: string;
  token: string;
  category: string;
  scannerLabel: string;
  score: number;
  dataQualityScore: number | null;
  forwardReturn: number;
  maxDrawdown: number | null;
  maxRunup: number | null;
  label: string;
  labelStatus: string;
  triggeredRules: string;
  missingRequiredData: string;
  opportunityScore: number | null;
  fragilityScore: number | null;
  tradabilityScore: number | null;
  stateMatrix: string;
}

export interface TopKSummary {
  snapshotId: string;
  observedAt: string;
  marketRegime: MarketRegime;
  btcReturn7d: number | null;
  btcReturn30d: number | null;
  horizonDays: number;
  rankMetric: string;
  topK: number;
  minHitReturn: number;
  universeCount: number;
  selectedCount: number;
  hitCount: number;
  precision: number | null;
  avgForwardReturn: number | null;
  medianForwardReturn: number | null;
  avgMaxDrawdown: number | null;
  avgMaxRunup: number | null;
  universeAvgForwardReturn: number | null;
  excessAvgForwardReturn: number | null;
  falsePositiveCount: number;
  falsePositiveRate: number | null;
  bestToken: string;
  worstToken: string;
}

export interface RegimeBacktestSummary {
  marketRegime: MarketRegime;
  horizonDays: number;
  rankMetric: string;
  topK: number;
  snapshotCount: number;
  universeCount: number;
  selectedCount: number;
  hitCount: number;
  precision: number | null;
  avgForwardReturn: number | null;
  universeAvgForwardReturn: number | null;
  excessAvgForwardReturn: number | null;
  falsePositiveCount: number;
  falsePositiveRate: number | null;
}

export interface FalsePositiveRow {
  snapshotId: string;
  observedAt: string;
  horizonDays: number;
  rankMetric: string;
  topK: number;
  rank: number;
  token: string;
  category: string;
  scannerLabel: string;
  score: number;
  forwardReturn: number;
  maxDrawdown: number | null;
  maxRunup: number | null;
  reason: string;
  triggeredRules: string;
  missingRequiredData: string;
}

export interface BacktestOptions {
  horizonDays: number;
  topKs: number[];
  minHitReturn: number;
  rankMetric: string;
  excludeLabels: string[];
  minTradability: number | null;
  maxFragility: number | null;
  minOpportunity: number | null;
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowsToObjects(path: string): Record<string, string>[] {
  const csv = readCsv(path);
  if (!csv) return [];
  return csv.rows.map((row) => {
    const out: Record<string, string> = {};
    csv.h.forEach((header, index) => {
      out[header] = row[index] || "";
    });
    return out;
  });
}

function loadBtcPricePoints(): PricePoint[] {
  if (!existsSync(BTC_PRICE_CACHE)) return [];
  try {
    return parseCoingeckoPriceCache(readFileSync(BTC_PRICE_CACHE, "utf-8"));
  } catch {
    return [];
  }
}

export function classifyMarketRegime(input: { btcReturn7d: number | null; btcReturn30d: number | null }): MarketRegime {
  if (input.btcReturn7d === null || input.btcReturn30d === null) return "REGIME_DATA_MISSING";
  if (input.btcReturn7d <= -0.05 || input.btcReturn30d <= -0.12) return "BTC_DOWNTREND";
  if (input.btcReturn7d >= 0.04 && input.btcReturn30d >= 0.02) return "BTC_UPTREND";
  return "BTC_RANGE";
}

function pctReturn(points: PricePoint[], observedTs: number, daysBack: number): number | null {
  const observed = nearestAtOrBefore(points, observedTs);
  const previous = nearestAtOrBefore(points, observedTs - daysBack * 24 * 60 * 60 * 1000);
  if (!observed || !previous || previous.price <= 0) return null;
  return observed.price / previous.price - 1;
}

function marketRegimeForObservedAt(observedAt: string, btcPoints: PricePoint[]): MarketRegimeSnapshot {
  const ts = new Date(observedAt).getTime();
  if (!Number.isFinite(ts) || btcPoints.length === 0) {
    return { marketRegime: "REGIME_DATA_MISSING", btcReturn7d: null, btcReturn30d: null, source: "bitcoin_cache_missing" };
  }
  const btcReturn7d = pctReturn(btcPoints, ts, 7);
  const btcReturn30d = pctReturn(btcPoints, ts, 30);
  return {
    marketRegime: classifyMarketRegime({ btcReturn7d, btcReturn30d }),
    btcReturn7d,
    btcReturn30d,
    source: basename(BTC_PRICE_CACHE),
  };
}

export function parseLabeledCandidate(row: Record<string, string>, opts: { horizonDays: number; rankMetric: string }): LabeledCandidate | null {
  const status = row[`label_status_${opts.horizonDays}d`] || "";
  if (status !== "OK") return null;

  const score = parseNumber(row[opts.rankMetric]);
  const forwardReturn = parseNumber(row[`fwd_return_${opts.horizonDays}d`]);
  if (score === null || forwardReturn === null) return null;

  return {
    snapshotId: row.snapshot_id || "",
    observedAt: row.observed_at || "",
    token: row.token || "",
    category: row.category || "",
    scannerLabel: row.scanner_label || "",
    score,
    dataQualityScore: parseNumber(row.data_quality_score),
    forwardReturn,
    maxDrawdown: parseNumber(row[`max_drawdown_${opts.horizonDays}d`]),
    maxRunup: parseNumber(row[`max_runup_${opts.horizonDays}d`]),
    label: row[`label_${opts.horizonDays}d`] || "",
    labelStatus: status,
    triggeredRules: row.triggered_rules || "",
    missingRequiredData: row.missing_required_data || "",
    opportunityScore: parseNumber(row.opportunity_score),
    fragilityScore: parseNumber(row.fragility_score),
    tradabilityScore: parseNumber(row.tradability_score),
    stateMatrix: row.state_matrix || "",
  };
}

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function fmt(value: number | null): string {
  return value === null ? "" : value.toFixed(6);
}

function falsePositiveReason(candidate: LabeledCandidate, minHitReturn: number): string {
  if (candidate.forwardReturn < 0) return "NEGATIVE_RETURN";
  if (candidate.forwardReturn < minHitReturn) return "MISS_MIN_RETURN";
  return "";
}

export function evaluateSnapshot(
  candidates: LabeledCandidate[],
  opts: BacktestOptions,
  regime: MarketRegimeSnapshot = { marketRegime: "REGIME_DATA_MISSING", btcReturn7d: null, btcReturn30d: null, source: "" },
): { summaries: TopKSummary[]; falsePositives: FalsePositiveRow[] } {
  const filtered = candidates.filter((candidate) => {
    if (opts.excludeLabels.includes(candidate.scannerLabel)) return false;
    if (opts.minTradability !== null && (candidate.tradabilityScore === null || candidate.tradabilityScore < opts.minTradability)) return false;
    if (opts.maxFragility !== null && (candidate.fragilityScore === null || candidate.fragilityScore > opts.maxFragility)) return false;
    if (opts.minOpportunity !== null && (candidate.opportunityScore === null || candidate.opportunityScore < opts.minOpportunity)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.token.localeCompare(b.token);
  });

  const universeAvg = avg(sorted.map((candidate) => candidate.forwardReturn));
  const summaries: TopKSummary[] = [];
  const falsePositives: FalsePositiveRow[] = [];

  for (const topK of opts.topKs) {
    const selected = sorted.slice(0, topK);
    const hits = selected.filter((candidate) => candidate.forwardReturn >= opts.minHitReturn);
    const fp = selected
      .map((candidate, index) => ({ candidate, rank: index + 1, reason: falsePositiveReason(candidate, opts.minHitReturn) }))
      .filter((entry) => entry.reason !== "");

    const topAvg = avg(selected.map((candidate) => candidate.forwardReturn));
    const best = selected.reduce<LabeledCandidate | null>((current, candidate) => {
      if (!current || candidate.forwardReturn > current.forwardReturn) return candidate;
      return current;
    }, null);
    const worst = selected.reduce<LabeledCandidate | null>((current, candidate) => {
      if (!current || candidate.forwardReturn < current.forwardReturn) return candidate;
      return current;
    }, null);

    summaries.push({
      snapshotId: sorted[0]?.snapshotId || "",
      observedAt: sorted[0]?.observedAt || "",
      marketRegime: regime.marketRegime,
      btcReturn7d: regime.btcReturn7d,
      btcReturn30d: regime.btcReturn30d,
      horizonDays: opts.horizonDays,
      rankMetric: opts.rankMetric,
      topK,
      minHitReturn: opts.minHitReturn,
      universeCount: sorted.length,
      selectedCount: selected.length,
      hitCount: hits.length,
      precision: selected.length > 0 ? hits.length / selected.length : null,
      avgForwardReturn: topAvg,
      medianForwardReturn: median(selected.map((candidate) => candidate.forwardReturn)),
      avgMaxDrawdown: avg(selected.map((candidate) => candidate.maxDrawdown)),
      avgMaxRunup: avg(selected.map((candidate) => candidate.maxRunup)),
      universeAvgForwardReturn: universeAvg,
      excessAvgForwardReturn: topAvg !== null && universeAvg !== null ? topAvg - universeAvg : null,
      falsePositiveCount: fp.length,
      falsePositiveRate: selected.length > 0 ? fp.length / selected.length : null,
      bestToken: best?.token || "",
      worstToken: worst?.token || "",
    });

    falsePositives.push(...fp.map((entry) => ({
      snapshotId: entry.candidate.snapshotId,
      observedAt: entry.candidate.observedAt,
      horizonDays: opts.horizonDays,
      rankMetric: opts.rankMetric,
      topK,
      rank: entry.rank,
      token: entry.candidate.token,
      category: entry.candidate.category,
      scannerLabel: entry.candidate.scannerLabel,
      score: entry.candidate.score,
      forwardReturn: entry.candidate.forwardReturn,
      maxDrawdown: entry.candidate.maxDrawdown,
      maxRunup: entry.candidate.maxRunup,
      reason: entry.reason,
      triggeredRules: entry.candidate.triggeredRules,
      missingRequiredData: entry.candidate.missingRequiredData,
    })));
  }

  return { summaries, falsePositives };
}

function weightedAvg(rows: TopKSummary[], value: (row: TopKSummary) => number | null, weight: (row: TopKSummary) => number): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    const v = value(row);
    const w = weight(row);
    if (v === null || !Number.isFinite(v) || !Number.isFinite(w) || w <= 0) continue;
    numerator += v * w;
    denominator += w;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function aggregateByMarketRegime(summaries: TopKSummary[]): RegimeBacktestSummary[] {
  const grouped = new Map<string, TopKSummary[]>();
  for (const row of summaries) {
    const key = [row.marketRegime, row.horizonDays, row.rankMetric, row.topK].join("::");
    const rows = grouped.get(key) || [];
    rows.push(row);
    grouped.set(key, rows);
  }

  return [...grouped.values()]
    .map((rows) => {
      const selectedCount = rows.reduce((sum, row) => sum + row.selectedCount, 0);
      const universeCount = rows.reduce((sum, row) => sum + row.universeCount, 0);
      const hitCount = rows.reduce((sum, row) => sum + row.hitCount, 0);
      const falsePositiveCount = rows.reduce((sum, row) => sum + row.falsePositiveCount, 0);
      const avgForwardReturn = weightedAvg(rows, (row) => row.avgForwardReturn, (row) => row.selectedCount);
      const universeAvgForwardReturn = weightedAvg(rows, (row) => row.universeAvgForwardReturn, (row) => row.universeCount);
      return {
        marketRegime: rows[0].marketRegime,
        horizonDays: rows[0].horizonDays,
        rankMetric: rows[0].rankMetric,
        topK: rows[0].topK,
        snapshotCount: new Set(rows.map((row) => row.snapshotId || row.observedAt)).size,
        universeCount,
        selectedCount,
        hitCount,
        precision: selectedCount > 0 ? hitCount / selectedCount : null,
        avgForwardReturn,
        universeAvgForwardReturn,
        excessAvgForwardReturn: avgForwardReturn !== null && universeAvgForwardReturn !== null ? avgForwardReturn - universeAvgForwardReturn : null,
        falsePositiveCount,
        falsePositiveRate: selectedCount > 0 ? falsePositiveCount / selectedCount : null,
      };
    })
    .sort((a, b) => {
      const regime = a.marketRegime.localeCompare(b.marketRegime);
      if (regime !== 0) return regime;
      if (a.horizonDays !== b.horizonDays) return a.horizonDays - b.horizonDays;
      if (a.topK !== b.topK) return a.topK - b.topK;
      return a.rankMetric.localeCompare(b.rankMetric);
    });
}

function parseArgs(): { input: string; horizonDays: number; topKs: number[]; minHitReturn: number; rankMetric: string; excludeLabels: string[]; minTradability: number | null; maxFragility: number | null; minOpportunity: number | null } {
  const arg = (name: string): string | undefined => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
  const horizonDays = Number(arg("horizon") || "7");
  const topKs = (arg("topK") || "5,10")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  const minHitReturn = Number(arg("min-return") || "0.2");
  const rankMetric = arg("score") || "scanner_score";
  const input = arg("input") || VALIDATION_DIR;
  const excludeLabels = (arg("exclude-labels") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const minTradability = arg("min-tradability") === undefined ? null : Number(arg("min-tradability"));
  const maxFragility = arg("max-fragility") === undefined ? null : Number(arg("max-fragility"));
  const minOpportunity = arg("min-opportunity") === undefined ? null : Number(arg("min-opportunity"));

  if (!Number.isFinite(horizonDays) || horizonDays <= 0) throw new Error("Invalid --horizon");
  if (topKs.length === 0) throw new Error("Invalid --topK");
  if (!Number.isFinite(minHitReturn)) throw new Error("Invalid --min-return");
  if (minTradability !== null && !Number.isFinite(minTradability)) throw new Error("Invalid --min-tradability");
  if (maxFragility !== null && !Number.isFinite(maxFragility)) throw new Error("Invalid --max-fragility");
  if (minOpportunity !== null && !Number.isFinite(minOpportunity)) throw new Error("Invalid --min-opportunity");

  return { input, horizonDays, topKs, minHitReturn, rankMetric, excludeLabels, minTradability, maxFragility, minOpportunity };
}

function inputFiles(input: string): string[] {
  if (!existsSync(input)) return [];
  if (input.endsWith(".csv")) return [input];
  return readdirSync(input)
    .filter((file) => file.startsWith("point_in_time_labels_") && file.endsWith(".csv"))
    .map((file) => join(input, file));
}

function groupBySnapshot(candidates: LabeledCandidate[]): Map<string, LabeledCandidate[]> {
  const grouped = new Map<string, LabeledCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.snapshotId || candidate.observedAt;
    const rows = grouped.get(key) || [];
    rows.push(candidate);
    grouped.set(key, rows);
  }
  return grouped;
}

function buildMarkdownReport(summaries: TopKSummary[], falsePositives: FalsePositiveRow[], regimeSummaries: RegimeBacktestSummary[]): string {
  const lines = [
    "# Cross-Section TopK Backtest",
    "",
    "This report ranks point-in-time snapshots by the configured score and evaluates forward returns only where labels are resolved. Market regime is assigned from BTC returns available at the observation timestamp.",
    "",
    "## Summary",
    "",
    "| snapshot | regime | btc_7d | btc_30d | horizon | topK | selected | precision | avg_return | universe_avg | excess | false_positive_rate | best | worst |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  ];

  for (const row of summaries) {
    lines.push([
      row.snapshotId,
      row.marketRegime,
      fmt(row.btcReturn7d),
      fmt(row.btcReturn30d),
      `${row.horizonDays}d`,
      String(row.topK),
      String(row.selectedCount),
      fmt(row.precision),
      fmt(row.avgForwardReturn),
      fmt(row.universeAvgForwardReturn),
      fmt(row.excessAvgForwardReturn),
      fmt(row.falsePositiveRate),
      row.bestToken,
      row.worstToken,
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("", "## Regime Stratification", "");
  if (regimeSummaries.length === 0) {
    lines.push("No regime-level rows were produced.");
  } else {
    lines.push("| regime | horizon | topK | snapshots | selected | precision | avg_return | universe_avg | excess | false_positive_rate |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const row of regimeSummaries) {
      lines.push([
        row.marketRegime,
        `${row.horizonDays}d`,
        String(row.topK),
        String(row.snapshotCount),
        String(row.selectedCount),
        fmt(row.precision),
        fmt(row.avgForwardReturn),
        fmt(row.universeAvgForwardReturn),
        fmt(row.excessAvgForwardReturn),
        fmt(row.falsePositiveRate),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }

  lines.push("", "## False Positives", "");
  if (falsePositives.length === 0) {
    lines.push("No false positives under the configured hit threshold.");
  } else {
    lines.push("| snapshot | topK | rank | token | score | fwd_return | max_drawdown | reason |");
    lines.push("| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |");
    for (const row of falsePositives.slice(0, 50)) {
      lines.push([
        row.snapshotId,
        String(row.topK),
        String(row.rank),
        row.token,
        row.score.toFixed(2),
        row.forwardReturn.toFixed(6),
        fmt(row.maxDrawdown),
        row.reason,
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs();
  const files = inputFiles(args.input);
  if (!existsSync(VALIDATION_DIR)) mkdirSync(VALIDATION_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const candidates = files.flatMap((file) => rowsToObjects(file).map((row) => parseLabeledCandidate(row, args)).filter((row): row is LabeledCandidate => row !== null));
  const grouped = groupBySnapshot(candidates);
  const allSummaries: TopKSummary[] = [];
  const allFalsePositives: FalsePositiveRow[] = [];
  const btcPoints = loadBtcPricePoints();

  for (const snapshotRows of grouped.values()) {
    const regime = marketRegimeForObservedAt(snapshotRows[0]?.observedAt || "", btcPoints);
    const result = evaluateSnapshot(snapshotRows, args, regime);
    allSummaries.push(...result.summaries);
    allFalsePositives.push(...result.falsePositives);
  }
  const regimeSummaries = aggregateByMarketRegime(allSummaries);

  const suffix = `${args.rankMetric}_${args.horizonDays}d`;
  const filterSuffix = [
    args.excludeLabels.length ? `exclude_${args.excludeLabels.join("_")}` : "",
    args.minTradability !== null ? `mintrad_${args.minTradability}` : "",
    args.maxFragility !== null ? `maxfrag_${args.maxFragility}` : "",
    args.minOpportunity !== null ? `minopp_${args.minOpportunity}` : "",
  ].filter(Boolean).join("_");
  const outputSuffix = filterSuffix ? `${suffix}_${filterSuffix}` : suffix;
  const summaryPath = join(VALIDATION_DIR, `topk_backtest_${outputSuffix}.csv`);
  const regimePath = join(VALIDATION_DIR, `topk_backtest_regime_${outputSuffix}.csv`);
  const falsePositivePath = join(VALIDATION_DIR, `topk_false_positives_${outputSuffix}.csv`);
  const reportPath = join(REPORTS_DIR, `topk_backtest_${outputSuffix}.md`);

  writeCsv(summaryPath, [
    ["snapshot_id", "observed_at", "market_regime", "btc_return_7d", "btc_return_30d", "horizon_days", "rank_metric", "top_k", "min_hit_return", "universe_count", "selected_count", "hit_count", "precision", "avg_fwd_return", "median_fwd_return", "avg_max_drawdown", "avg_max_runup", "universe_avg_fwd_return", "excess_avg_fwd_return", "false_positive_count", "false_positive_rate", "best_token", "worst_token"],
    ...allSummaries.map((row) => [row.snapshotId, row.observedAt, row.marketRegime, fmt(row.btcReturn7d), fmt(row.btcReturn30d), row.horizonDays, row.rankMetric, row.topK, row.minHitReturn, row.universeCount, row.selectedCount, row.hitCount, fmt(row.precision), fmt(row.avgForwardReturn), fmt(row.medianForwardReturn), fmt(row.avgMaxDrawdown), fmt(row.avgMaxRunup), fmt(row.universeAvgForwardReturn), fmt(row.excessAvgForwardReturn), row.falsePositiveCount, fmt(row.falsePositiveRate), row.bestToken, row.worstToken]),
  ]);

  writeCsv(regimePath, [
    ["market_regime", "horizon_days", "rank_metric", "top_k", "snapshot_count", "universe_count", "selected_count", "hit_count", "precision", "avg_fwd_return", "universe_avg_fwd_return", "excess_avg_fwd_return", "false_positive_count", "false_positive_rate"],
    ...regimeSummaries.map((row) => [row.marketRegime, row.horizonDays, row.rankMetric, row.topK, row.snapshotCount, row.universeCount, row.selectedCount, row.hitCount, fmt(row.precision), fmt(row.avgForwardReturn), fmt(row.universeAvgForwardReturn), fmt(row.excessAvgForwardReturn), row.falsePositiveCount, fmt(row.falsePositiveRate)]),
  ]);

  writeCsv(falsePositivePath, [
    ["snapshot_id", "observed_at", "horizon_days", "rank_metric", "top_k", "rank", "token", "category", "scanner_label", "score", "fwd_return", "max_drawdown", "max_runup", "reason", "triggered_rules", "missing_required_data"],
    ...allFalsePositives.map((row) => [row.snapshotId, row.observedAt, row.horizonDays, row.rankMetric, row.topK, row.rank, row.token, row.category, row.scannerLabel, row.score, row.forwardReturn, fmt(row.maxDrawdown), fmt(row.maxRunup), row.reason, row.triggeredRules, row.missingRequiredData]),
  ]);

  writeFileSync(reportPath, buildMarkdownReport(allSummaries, allFalsePositives, regimeSummaries), "utf-8");

  console.log("=== Cross-Section TopK Backtest ===");
  console.log(`Input files: ${files.map((file) => basename(file)).join(", ") || "(none)"}`);
  console.log(`Resolved candidates: ${candidates.length}`);
  console.log(`Snapshots: ${grouped.size}`);
  console.log(`Horizon: ${args.horizonDays}d | topK=${args.topKs.join(",")} | hit>=${args.minHitReturn}`);
  console.log(`Filters: exclude=${args.excludeLabels.join(",") || "(none)"} minTrad=${args.minTradability ?? "(none)"} maxFrag=${args.maxFragility ?? "(none)"} minOpp=${args.minOpportunity ?? "(none)"}`);
  console.log(`Summary: ${summaryPath}`);
  console.log(`Regime summary: ${regimePath}`);
  console.log(`False positives: ${falsePositivePath}`);
  console.log(`Report: ${reportPath}`);

  if (allSummaries.length === 0) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]?.includes("topk_cross_section_backtest");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
