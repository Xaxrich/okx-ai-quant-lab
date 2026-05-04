import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const FEATURES_PATH = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "features", "scanner_feature_table.csv");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_mvp");

interface Row {
  symbol: string; date: string;
  price: number; volume: number; market_cap: number;
  price_return_3d: number; price_return_7d: number;
  volume_zscore_7d: number;
  volume_3d_avg: number; volume_30d_avg: number;
  distance_to_7d_high: number;
  compression_score: number;
  implied_supply_change_1d: number;
  data_quality_score: number;
  is_positive_sample: number;
}

interface ScanResult {
  symbol: string;
  date: string;
  price: number;
  market_cap: number;
  triggered_rules: string[];
  score: number;
  label: string;
  reason: string;
  data_quality: number;
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

// ── Calibrated Rules ──

// ENABLED: P1_EARLY_RELATIVE_STRENGTH_01_CAL
function checkEarlyStrength(r: Row): { triggered: boolean; score: number } {
  // Calibrated thresholds from sweep
  if (r.price_return_3d > 0.25 && r.volume_zscore_7d > 1.0 && r.volume_zscore_7d < 2.0) {
    return { triggered: true, score: 70 };
  }
  return { triggered: false, score: 0 };
}

// WATCHLIST: P1_QUIET_BREAKOUT_01_CAL
function checkQuietBreakout(r: Row): { triggered: boolean; score: number } {
  if (r.price_return_3d > 0.08 && r.distance_to_7d_high > -0.01 && r.volume_zscore_7d < 2.0) {
    return { triggered: true, score: 40 };
  }
  return { triggered: false, score: 0 };
}

// WATCHLIST: P0_CRASH_VOLUME_01_CAL
function checkCrashVolume(r: Row): { triggered: boolean; score: number } {
  if (r.price_return_7d < -0.10 && r.volume_zscore_7d > 1.0) {
    return { triggered: true, score: -50 };
  }
  return { triggered: false, score: 0 };
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║  Altcoin Scanner MVP v0.1            ║");
  console.log("║  RESEARCH ONLY — No Trading          ║");
  console.log("╚══════════════════════════════════════╝\n");

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const rows = loadFeatures();
  if (rows.length === 0) {
    console.log("No feature data. Run scanner:fetch-data and scanner:compute-features first.");
    return;
  }

  // Only scan the latest day per token
  const latestByToken = new Map<string, Row>();
  for (const r of rows) {
    const existing = latestByToken.get(r.symbol);
    if (!existing || r.date > existing.date) {
      latestByToken.set(r.symbol, r);
    }
  }

  console.log(`Scanning ${latestByToken.size} tokens (latest data point each)\n`);

  const results: ScanResult[] = [];

  for (const [symbol, row] of latestByToken) {
    const earlyStrength = checkEarlyStrength(row);
    const quietBreakout = checkQuietBreakout(row);
    const crashVolume = checkCrashVolume(row);

    const rules: string[] = [];
    let score = 0;

    if (earlyStrength.triggered) { rules.push("P1_EARLY_RELATIVE_STRENGTH_CAL"); score += earlyStrength.score; }
    if (quietBreakout.triggered) { rules.push("P1_QUIET_BREAKOUT_CAL"); score += quietBreakout.score; }
    if (crashVolume.triggered) { rules.push("P0_CRASH_VOLUME_CAL"); score += crashVolume.score; }

    let label = "RESEARCH_ONLY";
    let reason = "No signals triggered.";

    if (score >= 70) {
      label = "WATCH";
      reason = "Early relative strength detected — token outperforming with moderate volume.";
    } else if (score > 0 && score < 70) {
      label = "WATCH";
      reason = "Quiet breakout or moderate signal — needs confirmation.";
    } else if (score < 0) {
      label = "WATCH_RISK";
      reason = "Crash-level volume detected after price decline.";
    } else if (row.data_quality_score < 0.2) {
      label = "NEED_MORE_DATA";
      reason = "Insufficient data quality for assessment.";
    }

    results.push({
      symbol, date: row.date,
      price: row.price, market_cap: row.market_cap,
      triggered_rules: rules,
      score, label, reason,
      data_quality: row.data_quality_score,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Display
  const watchList = results.filter(r => r.label === "WATCH");
  const riskList = results.filter(r => r.label === "WATCH_RISK");
  const needData = results.filter(r => r.label === "NEED_MORE_DATA");

  console.log("=== WATCH Candidates ===\n");
  for (const r of watchList) {
    console.log(`  ${r.symbol}: score=${r.score}, rules=[${r.triggered_rules.join(", ")}]`);
    console.log(`    Price: $${r.price.toFixed(6)}, MCap: $${(r.market_cap / 1e6).toFixed(1)}M`);
    console.log(`    ${r.reason}\n`);
  }

  console.log("=== WATCH_RISK Candidates ===\n");
  for (const r of riskList) {
    console.log(`  ${r.symbol}: score=${r.score}, rules=[${r.triggered_rules.join(", ")}]`);
    console.log(`    ${r.reason}\n`);
  }

  console.log("=== NEED_MORE_DATA ===\n");
  for (const r of needData) {
    console.log(`  ${r.symbol}: dq=${r.data_quality.toFixed(2)}\n`);
  }

  // Generate MD report
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const reportLines: string[] = [
    "# Daily Altcoin Scanner MVP Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| Tokens scanned | ${latestByToken.size} |`,
    `| Enabled rules | 1 (P1_EARLY_RELATIVE_STRENGTH_CAL) |`,
    `| Watchlist rules | 2 (P1_QUIET_BREAKOUT_CAL, P0_CRASH_VOLUME_CAL) |`,
    `| Disabled rules | 5 (all P0 supply/volume/compression) |`,
    `| WATCH | ${watchList.length} |`,
    `| WATCH_RISK | ${riskList.length} |`,
    `| NEED_MORE_DATA | ${needData.length} |`,
    `| Orders executed | 0 |`,
    "",
    "## WATCH Candidates",
    "",
  ];

  if (watchList.length === 0) {
    reportLines.push("No tokens triggered WATCH signals today.");
  } else {
    reportLines.push("| Token | Score | Rules | Price | Market Cap | Data Quality |");
    reportLines.push("|-------|-------|-------|-------|------------|:---:|");
    for (const r of watchList) {
      reportLines.push(`| ${r.symbol} | ${r.score} | ${r.triggered_rules.join(", ")} | $${r.price.toFixed(6)} | $${(r.market_cap / 1e6).toFixed(1)}M | ${r.data_quality.toFixed(1)} |`);
    }
  }

  reportLines.push("");
  reportLines.push("## WATCH_RISK Candidates");
  reportLines.push("");
  if (riskList.length === 0) {
    reportLines.push("No tokens triggered WATCH_RISK signals today.");
  } else {
    for (const r of riskList) {
      reportLines.push(`- **${r.symbol}**: ${r.reason}`);
    }
  }

  reportLines.push("");
  reportLines.push("## NEED_MORE_DATA");
  reportLines.push("");
  if (needData.length === 0) {
    reportLines.push("All tokens have sufficient data.");
  } else {
    for (const r of needData) {
      reportLines.push(`- ${r.symbol}: data quality ${r.data_quality.toFixed(2)}`);
    }
  }

  reportLines.push("");
  reportLines.push("## Disabled Rules (Not in Scoring)");
  reportLines.push("");
  reportLines.push("| Rule | Reason |");
  reportLines.push("|------|--------|");
  reportLines.push("| P0_SUPPLY_ANOMALY_01 | CoinGecko API market cap too smooth — 0 triggers at all thresholds |");
  reportLines.push("| P0_PRICE_CAP_DIVERGENCE_01 | Same — API data doesn't capture supply anomalies |");
  reportLines.push("| P0_EXTREME_VOLUME_HIGH_01 | Too few triggers — needs 365d data or lower thresholds |");
  reportLines.push("| P0_EFFORT_RESULT_01 | Requires intraday data not available via CoinGecko |");
  reportLines.push("| P1_COMPRESSION_01 | Compression formula doesn't work with daily API data |");

  reportLines.push("");
  reportLines.push("## Disclaimer");
  reportLines.push("");
  reportLines.push("This is a RESEARCH-ONLY scanner. It does NOT provide trading advice. No BUY/SELL recommendations. All signals are experimental and require validation on larger samples. Scanner currently has N=13 tokens, 764 feature rows, 1 enabled rule. False positive and false negative rates are unknown without larger sample and control group.");

  const report = reportLines.join("\n");
  const reportPath = join(REPORTS_DIR, `daily_scanner_report_${dateStr}.md`);
  writeFileSync(reportPath, report);
  console.log(`Report: ${reportPath}`);

  // Summary
  console.log("\n═══════════════════════════════════════");
  console.log(`  MVP Scan Complete`);
  console.log(`  WATCH: ${watchList.length} | WATCH_RISK: ${riskList.length} | NEED_DATA: ${needData.length}`);
  console.log(`  Orders: 0`);
  console.log("═══════════════════════════════════════");
}

main().catch(console.error);
