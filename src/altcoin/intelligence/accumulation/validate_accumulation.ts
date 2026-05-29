import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";
import { detectAccumulationPattern, type AccumulationDecision, type AccumulationEvidenceInput } from "./accumulation_pattern.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "accumulation");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "accumulation");
const SCANNER_PATH = join(ROOT, "data", "altcoin", "scanner_v02", "features", "scanner_v02_universe_scores.csv");
const SCORE_SPLIT_PATH = join(ROOT, "data", "altcoin", "intelligence", "validation", "score_decomposition_latest.csv");
const DEX_HISTORY_PATH = join(ROOT, "data", "altcoin", "intelligence", "dex_history", "features", "dex_history_feature_table.csv");
const COINGLASS_PATH = join(ROOT, "data", "altcoin", "intelligence", "coinglass", "features", "coinglass_derivatives_features.csv");
const OKX_DERIVATIVES_PATH = join(ROOT, "data", "altcoin", "intelligence", "derivatives", "features", "derivatives_feature_table.csv");
const HOLDER_PATH = join(ROOT, "data", "altcoin", "intelligence", "arkham", "features", "arkham_holder_entity_features.csv");
const DIRECTIONAL_PATH = join(ROOT, "data", "altcoin", "intelligence", "onchain", "directional_chain_scan_latest.csv");
const LABEL_DIR = join(ROOT, "data", "altcoin", "intelligence", "validation");

type Obj = Record<string, string>;

interface ValidationSummary {
  mode: "STRICT_POINT_IN_TIME" | "CURRENT_FEATURES_VS_HISTORICAL_LABELS_DIAGNOSTIC" | "NO_RESOLVED_LABELS";
  labelFile: string;
  horizonDays: number;
  minHitReturn: number;
  universeCount: number;
  selectedCount: number;
  hitCount: number;
  precision: number | null;
  avgSelectedReturn: number | null;
  avgUniverseReturn: number | null;
  excessReturn: number | null;
  falsePositiveCount: number;
  bestToken: string;
  worstToken: string;
}

function rowsToObjects(path: string): Obj[] {
  const csv = readCsv(path);
  if (!csv) return [];
  return csv.rows.map((row) => {
    const out: Obj = {};
    csv.h.forEach((header, index) => {
      out[header] = row[index] || "";
    });
    return out;
  });
}

function num(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: string | undefined): boolean | null {
  if (!value) return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

function pct(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.trim().replace("%", "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return value.includes("%") ? parsed / 100 : parsed;
}

function latestByToken(rows: Obj[], tokenField: string, timeFields: string[]): Map<string, Obj> {
  const out = new Map<string, Obj>();
  for (const row of rows) {
    const token = row[tokenField] || row.token || "";
    if (!token) continue;
    const current = out.get(token);
    if (!current || timestamp(row, timeFields) >= timestamp(current, timeFields)) {
      out.set(token, row);
    }
  }
  return out;
}

function timestamp(row: Obj, fields: string[]): number {
  for (const field of fields) {
    const value = row[field];
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function mapByToken(rows: Obj[]): Map<string, Obj> {
  return new Map(rows.filter((row) => row.token).map((row) => [row.token, row]));
}

function parseCgOiChange(value: string | undefined): number | null {
  const parsed = num(value);
  if (parsed === null) return null;
  if (Math.abs(parsed) > 10_000) return null;
  return parsed;
}

function buildInput(
  scanner: Obj,
  split: Obj | undefined,
  dex: Obj | undefined,
  coinglass: Obj | undefined,
  okx: Obj | undefined,
  holder: Obj | undefined,
  directional: Obj | undefined,
): AccumulationEvidenceInput {
  return {
    token: scanner.token || "",
    observedAt: new Date().toISOString(),
    price: {
      return3d: num(dex?.return_3),
      range3d: num(dex?.range_3),
      volatility7d: num(dex?.volatility_7),
      compression: bool(dex?.compression),
      expansion: bool(dex?.expansion),
      volumeZ7d: num(dex?.vol_zscore_7),
    },
    dex: {
      liquidityUsd: num(scanner.total_dex_liquidity_usd),
      turnoverRatio: num(scanner.token_level_dex_turnover),
      demandSupplyRatio: num(scanner.buy_sell_ratio),
      poolVolumeZ: num(dex?.vol_zscore_7),
    },
    holders: {
      holderCoverage: num(holder?.holder_entity_coverage) ?? num(holder?.labeled_holder_ratio),
      top1Share: num(holder?.top1_holder_share),
      top10Share: num(holder?.top10_holder_share),
      topEntityShare: num(holder?.top_entity_holder_share),
      cexHolderRatio: num(holder?.cex_holder_ratio),
      unknownHolderRatio: num(holder?.unknown_holder_ratio),
      holderCountGrowth7d: null,
    },
    flows: {
      cex1hDecision: directional?.cex_1h_decision || "",
      cex4hDecision: directional?.cex_4h_decision || "",
      cex24hDecision: directional?.cex_24h_decision || "",
      netCex1hValue: num(directional?.net_cex_1h_value),
      netCex4hValue: num(directional?.net_cex_4h_value),
      netCex24hValue: num(directional?.net_cex_24h_value),
      entityCoverage: num(directional?.entity_label_coverage),
    },
    derivatives: {
      oiChange1d: parseCgOiChange(coinglass?.oi_chg_1d) ?? num(okx?.oi_change_1d),
      oiChange7d: parseCgOiChange(coinglass?.oi_chg_7d) ?? num(okx?.oi_change_7d),
      oiZ7d: num(coinglass?.oi_z_7d),
      fundingRate: num(okx?.funding_rate),
      fundingZ7d: num(coinglass?.funding_z_7d) ?? num(okx?.funding_zscore),
      fundingOverheated: bool(coinglass?.funding_overheated) ?? bool(okx?.funding_extreme),
      liquidationZ7d: num(coinglass?.liq_z_7d),
      longShortRatio: null,
    },
    scanner: {
      opportunityScore: num(split?.opportunity_score),
      fragilityScore: num(split?.fragility_score),
      tradabilityScore: num(split?.tradability_score),
      dataQualityScore: num(scanner.data_quality_score),
    },
  };
}

function fmt(value: number | null): string {
  return value === null ? "" : value.toFixed(6);
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function candidateLabel(label: string): boolean {
  return label === "STRONG_ACCUMULATION" || label === "EARLY_ACCUMULATION" || label === "WATCH_ACCUMULATION";
}

function latestResolvedLabelFile(horizonDays: number): string | null {
  if (!existsSync(LABEL_DIR)) return null;
  const files = readdirSync(LABEL_DIR)
    .filter((file) => file.startsWith("point_in_time_labels_") && file.endsWith(".csv"))
    .map((file) => join(LABEL_DIR, file))
    .filter((path) => rowsToObjects(path).some((row) => row[`label_status_${horizonDays}d`] === "OK"))
    .sort((a, b) => timestampFromFile(b) - timestampFromFile(a));
  return files[0] || null;
}

function timestampFromFile(path: string): number {
  const match = basename(path).match(/point_in_time_labels_(.+)\.csv$/);
  if (!match) return 0;
  const iso = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validateSignals(signals: { input: AccumulationEvidenceInput; decision: AccumulationDecision }[], horizonDays: number, minHitReturn: number): { summary: ValidationSummary; rows: (string | number | null)[][] } {
  const labelFile = latestResolvedLabelFile(horizonDays);
  if (!labelFile) {
    return {
      summary: {
        mode: "NO_RESOLVED_LABELS",
        labelFile: "",
        horizonDays,
        minHitReturn,
        universeCount: 0,
        selectedCount: 0,
        hitCount: 0,
        precision: null,
        avgSelectedReturn: null,
        avgUniverseReturn: null,
        excessReturn: null,
        falsePositiveCount: 0,
        bestToken: "",
        worstToken: "",
      },
      rows: [],
    };
  }

  const labelRows = rowsToObjects(labelFile).filter((row) => row[`label_status_${horizonDays}d`] === "OK");
  const labelMap = mapByToken(labelRows);
  const joined = signals
    .map((signal) => {
      const label = labelMap.get(signal.input.token);
      const fwd = num(label?.[`fwd_return_${horizonDays}d`]);
      if (!label || fwd === null) return null;
      return { signal, label, fwd };
    })
    .filter((row): row is { signal: { input: AccumulationEvidenceInput; decision: AccumulationDecision }; label: Obj; fwd: number } => row !== null);

  const selected = joined.filter((row) => candidateLabel(row.signal.decision.label));
  const hits = selected.filter((row) => row.fwd >= minHitReturn);
  const falsePositives = selected.filter((row) => row.fwd < minHitReturn);
  const best = selected.reduce<typeof selected[number] | null>((current, row) => !current || row.fwd > current.fwd ? row : current, null);
  const worst = selected.reduce<typeof selected[number] | null>((current, row) => !current || row.fwd < current.fwd ? row : current, null);
  const selectedAvg = avg(selected.map((row) => row.fwd));
  const universeAvg = avg(joined.map((row) => row.fwd));

  const rows: (string | number | null)[][] = joined.map((row) => [
    row.signal.input.token,
    row.signal.decision.label,
    row.signal.decision.totalScore,
    row.signal.decision.confidence,
    row.fwd,
    row.label[`label_${horizonDays}d`] || "",
    candidateLabel(row.signal.decision.label) ? "SELECTED" : "NOT_SELECTED",
    row.fwd >= minHitReturn ? "HIT" : "MISS",
    row.signal.decision.riskEvidence.join(";"),
    row.signal.decision.limitations.join(";"),
  ]);

  return {
    summary: {
      mode: "CURRENT_FEATURES_VS_HISTORICAL_LABELS_DIAGNOSTIC",
      labelFile,
      horizonDays,
      minHitReturn,
      universeCount: joined.length,
      selectedCount: selected.length,
      hitCount: hits.length,
      precision: selected.length > 0 ? hits.length / selected.length : null,
      avgSelectedReturn: selectedAvg,
      avgUniverseReturn: universeAvg,
      excessReturn: selectedAvg !== null && universeAvg !== null ? selectedAvg - universeAvg : null,
      falsePositiveCount: falsePositives.length,
      bestToken: best?.signal.input.token || "",
      worstToken: worst?.signal.input.token || "",
    },
    rows,
  };
}

function buildReport(decisions: { input: AccumulationEvidenceInput; decision: AccumulationDecision }[], summary: ValidationSummary): string {
  const ranked = [...decisions].sort((a, b) => {
    const aCandidate = candidateLabel(a.decision.label) ? 1 : 0;
    const bCandidate = candidateLabel(b.decision.label) ? 1 : 0;
    if (aCandidate !== bCandidate) return bCandidate - aCandidate;
    return b.decision.totalScore - a.decision.totalScore;
  });
  const lines = [
    "# Accumulation Pattern Validation",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Method",
    "",
    "The detector combines price compression, DEX absorption context, holder quality, CEX/entity flow, derivatives crowding, and scanner context. A signal is rejected or downgraded when CEX inflow risk, poor tradability, holder concentration, overheated funding, liquidation spikes, or missing cross-source coverage dominate.",
    "",
    "## Validation",
    "",
    `Mode: ${summary.mode}`,
    `Label file: ${summary.labelFile ? basename(summary.labelFile) : ""}`,
    `Horizon: ${summary.horizonDays}d | hit threshold: ${summary.minHitReturn}`,
    "",
    "| universe | selected | hits | precision | avg_selected_return | avg_universe_return | excess | false_positives | best | worst |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    `| ${summary.universeCount} | ${summary.selectedCount} | ${summary.hitCount} | ${fmt(summary.precision)} | ${fmt(summary.avgSelectedReturn)} | ${fmt(summary.avgUniverseReturn)} | ${fmt(summary.excessReturn)} | ${summary.falsePositiveCount} | ${summary.bestToken} | ${summary.worstToken} |`,
    "",
    "## Top Signals",
    "",
    "| rank | token | label | score | confidence | data | risk | evidence | limits |",
    "| ---: | --- | --- | ---: | --- | ---: | ---: | --- | --- |",
  ];

  for (const [index, row] of ranked.slice(0, 20).entries()) {
    lines.push(`| ${index + 1} | ${row.input.token} | ${row.decision.label} | ${row.decision.totalScore} | ${row.decision.confidence} | ${row.decision.dataCompleteness.toFixed(2)} | ${row.decision.riskPenalty} | ${row.decision.positiveEvidence.join(";")} | ${row.decision.limitations.join(";")} |`);
  }

  lines.push(
    "",
    "## Limitations",
    "",
    "- Current run uses cached real data. Strict point-in-time validation requires future signal snapshots to be matched to later-resolved labels.",
    "- Entity labels and CEX flow are proxy evidence; they reduce false positives but do not prove intent.",
    "- Missing holder time-series means concentration deltas are not yet available for most tokens.",
  );

  return lines.join("\n");
}

function parseArgs(): { horizonDays: number; minHitReturn: number } {
  const arg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  };
  const horizonDays = Number(arg("horizon") || "7");
  const minHitReturn = Number(arg("min-return") || "0.2");
  if (!Number.isFinite(horizonDays) || horizonDays <= 0) throw new Error("Invalid --horizon");
  if (!Number.isFinite(minHitReturn)) throw new Error("Invalid --min-return");
  return { horizonDays, minHitReturn };
}

async function main() {
  const args = parseArgs();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const scannerRows = rowsToObjects(SCANNER_PATH);
  const splitMap = mapByToken(rowsToObjects(SCORE_SPLIT_PATH));
  const dexMap = latestByToken(rowsToObjects(DEX_HISTORY_PATH), "token", ["timestamp"]);
  const coinglassMap = latestByToken(rowsToObjects(COINGLASS_PATH), "token", ["date"]);
  const okxMap = latestByToken(rowsToObjects(OKX_DERIVATIVES_PATH), "token", ["date"]);
  const holderMap = mapByToken(rowsToObjects(HOLDER_PATH));
  const directionalMap = mapByToken(rowsToObjects(DIRECTIONAL_PATH));

  const signals = scannerRows.map((scanner) => {
    const input = buildInput(
      scanner,
      splitMap.get(scanner.token),
      dexMap.get(scanner.token),
      coinglassMap.get(scanner.token),
      okxMap.get(scanner.token),
      holderMap.get(scanner.token),
      directionalMap.get(scanner.token),
    );
    return { input, decision: detectAccumulationPattern(input) };
  });

  const snapshotId = new Date().toISOString().replace(/[:.]/g, "-");
  const signalPath = join(OUT_DIR, "accumulation_signals_latest.csv");
  const signalSnapshotPath = join(OUT_DIR, `accumulation_signals_${snapshotId}.csv`);
  const validationPath = join(OUT_DIR, "accumulation_validation_latest.csv");
  const reportPath = join(REPORTS_DIR, "accumulation_validation_latest.md");
  const validation = validateSignals(signals, args.horizonDays, args.minHitReturn);

  const signalRows: (string | number | null)[][] = [
    ["snapshot_id", "observed_at", "token", "label", "candidate_rank_score", "total_score", "confidence", "compression_score", "absorption_score", "holder_quality_score", "flow_quality_score", "derivatives_quality_score", "scanner_context_score", "risk_penalty", "data_completeness", "evidence_groups", "missing_groups", "positive_evidence", "risk_evidence", "limitations"],
    ...signals.map(({ input, decision }) => [
      snapshotId,
      input.observedAt || "",
      input.token,
      decision.label,
      candidateLabel(decision.label) ? 1000 + decision.totalScore : decision.totalScore,
      decision.totalScore,
      decision.confidence,
      decision.subscores.compression,
      decision.subscores.absorption,
      decision.subscores.holderQuality,
      decision.subscores.flowQuality,
      decision.subscores.derivativesQuality,
      decision.subscores.scannerContext,
      decision.riskPenalty,
      decision.dataCompleteness.toFixed(4),
      decision.evidenceGroups.join(";"),
      decision.missingGroups.join(";"),
      decision.positiveEvidence.join(";"),
      decision.riskEvidence.join(";"),
      decision.limitations.join(";"),
    ]),
  ];

  writeCsv(signalPath, signalRows);
  writeCsv(signalSnapshotPath, signalRows);
  writeCsv(validationPath, [
    ["token", "accumulation_label", "accumulation_score", "confidence", `fwd_return_${args.horizonDays}d`, `label_${args.horizonDays}d`, "selection", "hit_status", "risk_evidence", "limitations"],
    ...validation.rows,
  ]);
  writeFileSync(reportPath, buildReport(signals, validation.summary), "utf-8");

  console.log("=== Accumulation Pattern Validation ===");
  console.log(`Signals: ${signals.length}`);
  console.log(`Validation mode: ${validation.summary.mode}`);
  console.log(`Selected: ${validation.summary.selectedCount}/${validation.summary.universeCount}`);
  console.log(`Precision: ${fmt(validation.summary.precision) || "n/a"}`);
  console.log(`Signals: ${signalPath}`);
  console.log(`Validation: ${validationPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("validate_accumulation");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
