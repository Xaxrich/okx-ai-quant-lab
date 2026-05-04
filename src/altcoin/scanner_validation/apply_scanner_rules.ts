import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const FEATURES_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "features");

interface FeatureRow {
  symbol: string; date: string; timestamp: number;
  price: number; market_cap: number; volume: number; implied_supply: number;
  price_return_1d: number; price_return_3d: number; price_return_7d: number;
  market_cap_return_1d: number;
  implied_supply_change_1d: number; implied_supply_change_7d: number;
  volume_3d_avg: number; volume_7d_avg: number; volume_30d_avg: number;
  volume_zscore_7d: number; volume_zscore_30d: number;
  price_range_3d: number; price_range_7d: number;
  realized_volatility_3d: number; realized_volatility_7d: number;
  distance_to_7d_high: number; distance_to_30d_high: number;
  compression_score: number;
  price_market_cap_divergence: number;
  data_quality_score: number; data_days_available: number;
  is_positive_sample: number; event_date: string; relative_day_to_event: number;
}

interface RuleResult {
  symbol: string;
  date: string;
  rule_id: string;
  rule_category: string;
  triggered: boolean;
  trigger_value: number;
  is_positive_sample: number;
  relative_day_to_event: number;
}

// ── P0 Rules ──

function rule_P0_SUPPLY_ANOMALY(f: FeatureRow): boolean {
  return Math.abs(f.implied_supply_change_1d) > 0.30;
}

function rule_P0_PRICE_CAP_DIVERGENCE(f: FeatureRow): boolean {
  return (f.price_return_1d > 0.30 && f.market_cap_return_1d < 0.05) ||
         (f.price_return_1d < -0.20 && f.market_cap_return_1d > 0);
}

function rule_P0_EXTREME_VOLUME_HIGH(f: FeatureRow): boolean {
  return f.volume_zscore_7d > 3 && f.distance_to_7d_high > -0.10;
}

function rule_P0_EFFORT_RESULT(f: FeatureRow): boolean {
  return f.volume_zscore_7d > 2 && Math.abs(f.price_return_1d) < 0.05;
}

function rule_P0_CRASH_VOLUME(f: FeatureRow): boolean {
  return f.price_return_1d < -0.20 && f.volume_zscore_7d > 3;
}

// ── P1 Rules ──

function rule_P1_COMPRESSION(f: FeatureRow): boolean {
  return f.compression_score > 0.5 &&
         f.realized_volatility_3d < f.realized_volatility_7d &&
         f.volume_3d_avg < f.volume_30d_avg;
}

function rule_P1_QUIET_BREAKOUT(f: FeatureRow): boolean {
  return f.price_return_1d > 0.05 &&
         f.volume_zscore_7d < 1.5 &&
         f.distance_to_7d_high > -0.02;
}

function rule_P1_EARLY_RELATIVE_STRENGTH(f: FeatureRow): boolean {
  // Simplified: token return exceeds market average by 20%+ within a 3d window
  return f.price_return_3d > 0.20 && f.volume_zscore_7d > 0.5 && f.volume_zscore_7d < 2.5;
}

// ── Rule Application ──

const RULES = [
  { id: "P0_SUPPLY_ANOMALY_01", category: "Distribution/Supply Risk", fn: rule_P0_SUPPLY_ANOMALY },
  { id: "P0_PRICE_CAP_DIVERGENCE_01", category: "Distribution/Supply Risk", fn: rule_P0_PRICE_CAP_DIVERGENCE },
  { id: "P0_EXTREME_VOLUME_HIGH_01", category: "Distribution/Supply Risk", fn: rule_P0_EXTREME_VOLUME_HIGH },
  { id: "P0_EFFORT_RESULT_01", category: "Distribution/Supply Risk", fn: rule_P0_EFFORT_RESULT },
  { id: "P0_CRASH_VOLUME_01", category: "Lagging Confirmation", fn: rule_P0_CRASH_VOLUME },
  { id: "P1_COMPRESSION_01", category: "Early Setup", fn: rule_P1_COMPRESSION },
  { id: "P1_QUIET_BREAKOUT_01", category: "Early Setup", fn: rule_P1_QUIET_BREAKOUT },
  { id: "P1_EARLY_RELATIVE_STRENGTH_01", category: "Markup Confirmation", fn: rule_P1_EARLY_RELATIVE_STRENGTH },
];

async function main() {
  console.log("=== Scanner Rule Application ===\n");

  const featurePath = join(FEATURES_DIR, "scanner_feature_table.csv");
  if (!existsSync(featurePath)) {
    console.log("Feature table not found. Run compute_scanner_features first.");
    return;
  }

  const csv = readFileSync(featurePath, "utf-8");
  const lines = csv.split("\n");
  const headers = lines[0].split(",");
  const rows: FeatureRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const row: any = {};
    headers.forEach((h, j) => { row[h.trim()] = isNaN(+vals[j]) ? vals[j] : +vals[j]; });
    rows.push(row as FeatureRow);
  }

  console.log(`Loaded ${rows.length} feature rows.\n`);

  // Apply rules
  const allResults: RuleResult[] = [];
  for (const rule of RULES) {
    let triggers = 0;
    for (const row of rows) {
      const triggered = rule.fn(row);
      if (triggered) triggers++;
      allResults.push({
        symbol: row.symbol,
        date: row.date,
        rule_id: rule.id,
        rule_category: rule.category,
        triggered,
        trigger_value: 0,
        is_positive_sample: row.is_positive_sample,
        relative_day_to_event: row.relative_day_to_event,
      });
    }
    console.log(`  ${rule.id}: ${triggers}/${rows.length} triggers (${(triggers / rows.length * 100).toFixed(1)}%)`);
  }

  // Evaluation summary per rule
  console.log("\n=== Rule Evaluation Summary ===\n");
  console.log("rule_id,category,total_triggers,positive_triggers,control_triggers,positive_trigger_rate,control_trigger_rate");

  for (const rule of RULES) {
    const ruleResults = allResults.filter(r => r.rule_id === rule.id && r.triggered);
    const posTriggers = ruleResults.filter(r => r.is_positive_sample === 1).length;
    const ctrlTriggers = ruleResults.filter(r => r.is_positive_sample === 0).length;
    const posTotal = rows.filter(r => r.is_positive_sample === 1).length;
    const ctrlTotal = rows.filter(r => r.is_positive_sample === 0).length;
    console.log(`${rule.id},${rule.category},${ruleResults.length},${posTriggers},${ctrlTriggers},${(posTriggers / posTotal * 100).toFixed(1)}%,${(ctrlTriggers / ctrlTotal * 100).toFixed(1)}%`);
  }

  // Write results
  const resultsDir = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation");
  const resultsPath = join(resultsDir, "rule_trigger_results.csv");
  const resultHeaders = ["symbol", "date", "rule_id", "rule_category", "triggered", "is_positive_sample", "relative_day_to_event"];
  const resultCsv = [resultHeaders.join(","), ...allResults.map(r =>
    [r.symbol, r.date, r.rule_id, r.rule_category, r.triggered ? 1 : 0, r.is_positive_sample, r.relative_day_to_event].join(",")
  )].join("\n");
  writeFileSync(resultsPath, resultCsv);
  console.log(`\nResults: ${resultsPath}`);
}

main().catch(console.error);
