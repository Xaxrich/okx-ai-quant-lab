import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const FEATURES_DIR = join(ROOT, "data", "altcoin", "scanner_v02", "features");
const REGISTRY_PATH = join(ROOT, "data", "altcoin", "scanner_v02", "registry", "token_metadata_registry.csv");
const PRICE_CACHE_DIR = join(ROOT, "data", "altcoin", "scanner_v02", "cache", "price_features");
const OUT_DIR = join(ROOT, "data", "altcoin", "intelligence", "validation");
const SCORE_DECOMPOSITION_PATH = join(OUT_DIR, "score_decomposition_latest.csv");
const LEDGER_PATH = join(OUT_DIR, "point_in_time_label_ledger.csv");

export interface PricePoint {
  ts: number;
  price: number;
}

export interface HorizonLabel {
  horizonDays: number;
  forwardReturn: number | null;
  maxDrawdown: number | null;
  maxRunup: number | null;
  label: "PENDING" | "UP_50" | "UP_20" | "DOWN_20" | "FLAT";
  status: "OK" | "PENDING" | "NO_PRICE_AT_OBSERVATION" | "NO_FUTURE_PRICE";
}

interface ScoreRow {
  token: string;
  category: string;
  label: string;
  score: string;
  confidence: string;
  data_quality_score: string;
  triggered_rules: string;
  missing_required_data: string;
}

interface RegistryRow {
  symbol: string;
  coingecko_id: string;
}

interface ScoreDecompositionRow {
  token: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
  opportunity_tier: string;
  fragility_tier: string;
  tradability_tier: string;
  state_matrix: string;
}

export function parseCoingeckoPriceCache(raw: string): PricePoint[] {
  const parsed = JSON.parse(raw) as { prices?: unknown };
  if (!Array.isArray(parsed.prices)) return [];

  return parsed.prices
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return null;
      const ts = Number(entry[0]);
      const price = Number(entry[1]);
      if (!Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) return null;
      return { ts, price };
    })
    .filter((entry): entry is PricePoint => entry !== null)
    .sort((a, b) => a.ts - b.ts);
}

export function nearestAtOrBefore(points: PricePoint[], targetTs: number, maxLagMs = 36 * 60 * 60 * 1000): PricePoint | null {
  let best: PricePoint | null = null;
  for (const point of points) {
    if (point.ts <= targetTs) best = point;
    else break;
  }
  if (!best) return null;
  return targetTs - best.ts <= maxLagMs ? best : null;
}

export function nearestAtOrAfter(points: PricePoint[], targetTs: number, maxLeadMs = 36 * 60 * 60 * 1000): PricePoint | null {
  for (const point of points) {
    if (point.ts >= targetTs) {
      return point.ts - targetTs <= maxLeadMs ? point : null;
    }
  }
  return null;
}

export function computeForwardLabel(points: PricePoint[], observedTs: number, horizonDays: number): HorizonLabel {
  const observed = nearestAtOrBefore(points, observedTs);
  if (!observed) {
    return {
      horizonDays,
      forwardReturn: null,
      maxDrawdown: null,
      maxRunup: null,
      label: "PENDING",
      status: "NO_PRICE_AT_OBSERVATION",
    };
  }

  const horizonTs = observedTs + horizonDays * 24 * 60 * 60 * 1000;
  const future = nearestAtOrAfter(points, horizonTs);
  if (!future) {
    return {
      horizonDays,
      forwardReturn: null,
      maxDrawdown: null,
      maxRunup: null,
      label: "PENDING",
      status: "NO_FUTURE_PRICE",
    };
  }

  const window = points.filter((point) => point.ts >= observed.ts && point.ts <= future.ts);
  const returns = window.map((point) => point.price / observed.price - 1);
  const forwardReturn = future.price / observed.price - 1;
  const maxDrawdown = Math.min(...returns);
  const maxRunup = Math.max(...returns);

  let label: HorizonLabel["label"] = "FLAT";
  if (forwardReturn >= 0.5) label = "UP_50";
  else if (forwardReturn >= 0.2) label = "UP_20";
  else if (forwardReturn <= -0.2) label = "DOWN_20";

  return {
    horizonDays,
    forwardReturn,
    maxDrawdown,
    maxRunup,
    label,
    status: "OK",
  };
}

function parseArgs(): { asOf: Date; horizons: number[] } {
  const asOfArg = process.argv.find((arg) => arg.startsWith("--as-of="))?.split("=")[1];
  const horizonsArg = process.argv.find((arg) => arg.startsWith("--horizons="))?.split("=")[1];
  const asOf = asOfArg ? new Date(asOfArg) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new Error(`Invalid --as-of date: ${asOfArg}`);

  const horizons = (horizonsArg || "1,3,7")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  return { asOf, horizons };
}

function rowsToObjects<T extends object>(path: string): T[] {
  const csv = readCsv(path);
  if (!csv) return [];
  return csv.rows.map((row) => {
    const out: Record<string, string> = {};
    csv.h.forEach((header, index) => {
      out[header] = row[index] || "";
    });
    return out as T;
  });
}

function loadRegistry(): Map<string, RegistryRow> {
  const rows = rowsToObjects<RegistryRow>(REGISTRY_PATH);
  return new Map(rows.map((row) => [row.symbol, row]));
}

function loadScoreDecomposition(): Map<string, ScoreDecompositionRow> {
  const rows = rowsToObjects<ScoreDecompositionRow>(SCORE_DECOMPOSITION_PATH);
  return new Map(rows.map((row) => [row.token, row]));
}

function cachePathForCgId(cgId: string): string | null {
  const exact = join(PRICE_CACHE_DIR, `${cgId}_90d.json`);
  if (existsSync(exact)) return exact;
  if (!existsSync(PRICE_CACHE_DIR)) return null;
  const match = readdirSync(PRICE_CACHE_DIR).find((file) => file.startsWith(`${cgId}_`) && file.endsWith(".json"));
  return match ? join(PRICE_CACHE_DIR, match) : null;
}

function fileTimestamp(path: string): string {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return "";
  }
}

function fmt(value: number | null): string {
  return value === null ? "" : value.toFixed(6);
}

function appendLedger(rows: (string | number | null)[][]): number {
  const header = rows[0];
  const dataRows = rows.slice(1);
  const existingKeys = new Set<string>();
  if (existsSync(LEDGER_PATH)) {
    const existing = readCsv(LEDGER_PATH);
    if (existing) {
      const snapshotIndex = existing.h.indexOf("snapshot_id");
      const tokenIndex = existing.h.indexOf("token");
      for (const row of existing.rows) {
        existingKeys.add(`${row[snapshotIndex] || ""}::${row[tokenIndex] || ""}`);
      }
    }
  }

  const newRows = dataRows.filter((row) => !existingKeys.has(`${row[0] || ""}::${row[2] || ""}`));
  if (newRows.length === 0) return 0;

  const encoded = newRows.map((row) => row.map((value) => {
    const s = value === null ? "" : String(value);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(",")).join("\n");

  if (!existsSync(LEDGER_PATH)) {
    appendFileSync(LEDGER_PATH, header.join(",") + "\n", "utf-8");
  }
  appendFileSync(LEDGER_PATH, encoded + "\n", "utf-8");
  return newRows.length;
}

async function main() {
  const { asOf, horizons } = parseArgs();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const scorePath = join(FEATURES_DIR, "scanner_v02_universe_scores.csv");
  const scoreRows = rowsToObjects<ScoreRow>(scorePath);
  const registry = loadRegistry();
  const decomposition = loadScoreDecomposition();
  const observedTs = asOf.getTime();
  const snapshotId = asOf.toISOString().replace(/[:.]/g, "-");

  const header = [
    "snapshot_id", "observed_at", "token", "coingecko_id", "category",
    "scanner_label", "scanner_score", "scanner_confidence", "data_quality_score",
    "opportunity_score", "fragility_score", "tradability_score",
    "opportunity_tier", "fragility_tier", "tradability_tier", "state_matrix",
    "price_at_observed", "price_observed_at", "price_source_mtime",
    "triggered_rules", "missing_required_data",
    ...horizons.flatMap((horizon) => [
      `fwd_return_${horizon}d`,
      `max_drawdown_${horizon}d`,
      `max_runup_${horizon}d`,
      `label_${horizon}d`,
      `label_status_${horizon}d`,
    ]),
  ];

  const outputRows: (string | number | null)[][] = [header];

  for (const score of scoreRows) {
    const reg = registry.get(score.token);
    const split = decomposition.get(score.token);
    const cgId = reg?.coingecko_id || "";
    const cachePath = cgId ? cachePathForCgId(cgId) : null;
    const points = cachePath ? parseCoingeckoPriceCache(readFileSync(cachePath, "utf-8")) : [];
    const observed = nearestAtOrBefore(points, observedTs);
    const labels = horizons.map((horizon) => computeForwardLabel(points, observedTs, horizon));

    outputRows.push([
      snapshotId,
      asOf.toISOString(),
      score.token,
      cgId,
      score.category,
      score.label,
      score.score,
      score.confidence,
      score.data_quality_score,
      split?.opportunity_score || "",
      split?.fragility_score || "",
      split?.tradability_score || "",
      split?.opportunity_tier || "",
      split?.fragility_tier || "",
      split?.tradability_tier || "",
      split?.state_matrix || "",
      observed?.price ?? "",
      observed ? new Date(observed.ts).toISOString() : "",
      cachePath ? fileTimestamp(cachePath) : "",
      score.triggered_rules,
      score.missing_required_data,
      ...labels.flatMap((label) => [
        fmt(label.forwardReturn),
        fmt(label.maxDrawdown),
        fmt(label.maxRunup),
        label.label,
        label.status,
      ]),
    ]);
  }

  const outPath = join(OUT_DIR, `point_in_time_labels_${snapshotId}.csv`);
  writeCsv(outPath, outputRows);
  const appended = appendLedger(outputRows);

  const okLabels = outputRows.slice(1).filter((row) => row.some((cell) => cell === "OK")).length;
  console.log("=== Point-in-Time Label Builder ===");
  console.log(`Observed at: ${asOf.toISOString()}`);
  console.log(`Tokens: ${scoreRows.length}`);
  console.log(`Rows with at least one resolved label: ${okLabels}`);
  console.log(`Output: ${outPath}`);
  console.log(`Ledger appended rows: ${appended}`);
}

const isMain = process.argv[1]?.includes("point_in_time_labels");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
