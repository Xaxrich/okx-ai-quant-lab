import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const FEATURES_PATH = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "features", "scanner_feature_table.csv");
const RECON_DIR = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_reconciliation_v1");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_reconciliation_v1");

interface Row {
  symbol: string; date: string;
  price_return_3d: number; price_return_7d: number;
  market_cap_return_1d: number;
  implied_supply_change_1d: number;
  volume_zscore_7d: number; volume_zscore_30d: number;
  volume_3d_avg: number; volume_30d_avg: number;
  price_range_3d: number; realized_volatility_3d: number; realized_volatility_7d: number;
  distance_to_7d_high: number; compression_score: number;
  is_positive_sample: number; relative_day_to_event: number;
}

interface SweepResult {
  rule: string;
  params: Record<string, number>;
  total_triggers: number;
  pos_triggers: number;
  ctrl_triggers: number;
  pos_rate: number;
  ctrl_rate: number;
  discrimination: number;
  avg_forward_ret_3d: number;
  avg_forward_ret_7d: number;
}

function loadFeatures(): Row[] {
  if (!existsSync(FEATURES_PATH)) return [];
  const csv = readFileSync(FEATURES_PATH, "utf-8");
  const lines = csv.split("\n");
  const headers = lines[0].split(",");
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",");
    const row: any = {};
    headers.forEach((h, j) => { row[h.trim()] = isNaN(+vals[j]) ? vals[j] : +vals[j]; });
    rows.push(row);
  }
  return rows as Row[];
}

function sweep(params: number[][], names: string[], rows: Row[], fn: (r: Row, p: number[]) => boolean): SweepResult[] {
  const results: SweepResult[] = [];
  const posTotal = rows.filter(r => r.is_positive_sample === 1).length;
  const ctrlTotal = rows.filter(r => r.is_positive_sample === 0).length;

  // Cartesian product
  function cartesian(arrays: number[][]): number[][] {
    if (arrays.length === 0) return [[]];
    const rest = cartesian(arrays.slice(1));
    return arrays[0].flatMap(x => rest.map(r => [x, ...r]));
  }

  const combos = cartesian(params);

  for (const combo of combos) {
    const triggered = rows.filter(r => fn(r, combo));
    const posTrig = triggered.filter(r => r.is_positive_sample === 1).length;
    const ctrlTrig = triggered.filter(r => r.is_positive_sample === 0).length;
    const posRate = posTotal > 0 ? posTrig / posTotal * 100 : 0;
    const ctrlRate = ctrlTotal > 0 ? ctrlTrig / ctrlTotal * 100 : 0;
    const disc = ctrlRate > 0 ? posRate / ctrlRate : (posRate > 0 ? 999 : 0);

    const paramObj: Record<string, number> = {};
    names.forEach((n, i) => paramObj[n] = combo[i]);

    results.push({
      rule: "SWEEP", params: paramObj,
      total_triggers: triggered.length,
      pos_triggers: posTrig, ctrl_triggers: ctrlTrig,
      pos_rate: posRate, ctrl_rate: ctrlRate,
      discrimination: disc,
      avg_forward_ret_3d: 0, avg_forward_ret_7d: 0,
    });
  }

  return results;
}

async function main() {
  console.log("=== Threshold Sweep ===\n");

  if (!existsSync(RECON_DIR)) mkdirSync(RECON_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const rows = loadFeatures();
  console.log(`Loaded ${rows.length} feature rows\n`);

  const allResults: SweepResult[] = [];

  // ── P1_EARLY_RELATIVE_STRENGTH sweep ──
  console.log("Sweeping P1_EARLY_RELATIVE_STRENGTH...");
  const ersResults = sweep(
    [[0.05, 0.10, 0.15, 0.20, 0.25], [0.0, 0.5, 1.0], [2.0, 2.5, 3.0]],
    ["rel_strength_threshold", "vol_z_min", "vol_z_max"],
    rows,
    (r, p) => r.price_return_3d > p[0] && r.volume_zscore_7d > p[1] && r.volume_zscore_7d < p[2]
  );
  allResults.push(...ersResults.map(r => ({ ...r, rule: "P1_EARLY_RELATIVE_STRENGTH" })));

  // ── P1_QUIET_BREAKOUT sweep ──
  console.log("Sweeping P1_QUIET_BREAKOUT...");
  const qbResults = sweep(
    [[0.03, 0.05, 0.08], [0.005, 0.01, 0.02], [1.0, 1.5, 2.0]],
    ["price_ret_1d_min", "dist_to_high_min", "vol_z_max"],
    rows,
    (r, p) => r.price_return_3d > p[0] && r.distance_to_7d_high > -p[1] && r.volume_zscore_7d < p[2]
  );
  allResults.push(...qbResults.map(r => ({ ...r, rule: "P1_QUIET_BREAKOUT" })));

  // ── P1_COMPRESSION sweep ──
  console.log("Sweeping P1_COMPRESSION...");
  const compResults = sweep(
    [[0.3, 0.4, 0.5, 0.6], [0.5, 0.7, 0.9]],
    ["compression_score_min", "vol_ratio_max"],
    rows,
    (r, p) => r.compression_score > p[0] && (r.volume_3d_avg / Math.max(r.volume_30d_avg, 1)) < p[1]
  );
  allResults.push(...compResults.map(r => ({ ...r, rule: "P1_COMPRESSION" })));

  // ── P0_SUPPLY_ANOMALY sweep ──
  console.log("Sweeping P0_SUPPLY_ANOMALY...");
  const supplyResults = sweep(
    [[0.05, 0.10, 0.15, 0.20, 0.30]],
    ["supply_change_abs_min"],
    rows,
    (r, p) => Math.abs(r.implied_supply_change_1d) > p[0]
  );
  allResults.push(...supplyResults.map(r => ({ ...r, rule: "P0_SUPPLY_ANOMALY" })));

  // ── P0_EXTREME_VOLUME_HIGH sweep ──
  console.log("Sweeping P0_EXTREME_VOLUME_HIGH...");
  const volHighResults = sweep(
    [[1.0, 1.5, 2.0, 2.5, 3.0], [0.05, 0.10, 0.20]],
    ["vol_z_min", "dist_to_high_max"],
    rows,
    (r, p) => r.volume_zscore_7d > p[0] && r.distance_to_7d_high > -p[1]
  );
  allResults.push(...volHighResults.map(r => ({ ...r, rule: "P0_EXTREME_VOLUME_HIGH" })));

  // ── P0_CRASH_VOLUME sweep ──
  console.log("Sweeping P0_CRASH_VOLUME...");
  const crashResults = sweep(
    [[0.10, 0.15, 0.20, 0.25], [1.0, 1.5, 2.0, 2.5, 3.0]],
    ["price_drop_min", "vol_z_min"],
    rows,
    (r, p) => r.price_return_3d < -p[0] && r.volume_zscore_7d > p[1]
  );
  allResults.push(...crashResults.map(r => ({ ...r, rule: "P0_CRASH_VOLUME" })));

  // ── Write CSV ──
  const header = "rule,params,total_triggers,pos_triggers,ctrl_triggers,pos_rate,ctrl_rate,discrimination";
  const csvLines = [header];
  for (const r of allResults) {
    const paramStr = Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(";");
    csvLines.push(`${r.rule},"${paramStr}",${r.total_triggers},${r.pos_triggers},${r.ctrl_triggers},${r.pos_rate.toFixed(2)},${r.ctrl_rate.toFixed(2)},${r.discrimination.toFixed(1)}`);
  }
  writeFileSync(join(RECON_DIR, "threshold_sweep_results.csv"), csvLines.join("\n"));
  console.log(`\nWrote ${allResults.length} sweep results`);

  // ── Best per rule ──
  console.log("\n=== Best Threshold per Rule ===\n");
  const rules = [...new Set(allResults.map(r => r.rule))];

  for (const rule of rules) {
    const ruleResults = allResults.filter(r => r.rule === rule);
    // Score: high discrimination, low ctrl rate, enough triggers
    const scored = ruleResults.map(r => ({
      ...r,
      score: r.discrimination * (1 - r.ctrl_rate / 100) * Math.min(r.total_triggers / 5, 1),
    }));
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) continue;
    const best = scored[0];

    console.log(`${rule}:`);
    console.log(`  Best params: ${JSON.stringify(best.params)}`);
    console.log(`  Triggers: ${best.total_triggers} (pos=${best.pos_rate.toFixed(1)}%, ctrl=${best.ctrl_rate.toFixed(1)}%)`);
    console.log(`  Discrimination: ${best.discrimination.toFixed(1)}x`);

    if (best.total_triggers === 0) {
      console.log(`  VERDICT: DISABLED — zero triggers at all thresholds`);
    } else if (best.discrimination > 5 && best.pos_rate > 3 && best.ctrl_rate < 2) {
      console.log(`  VERDICT: ENABLED — strong signal`);
    } else if (best.discrimination > 2 && best.pos_rate > 5) {
      console.log(`  VERDICT: WATCHLIST — moderate signal`);
    } else if (best.total_triggers < 10) {
      console.log(`  VERDICT: DISABLED — too few triggers`);
    } else {
      console.log(`  VERDICT: DISABLED — poor discrimination`);
    }
    console.log("");
  }
}

main().catch(console.error);
