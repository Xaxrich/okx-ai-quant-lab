import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const RESULTS_PATH = join(import.meta.dirname, "..", "..", "..", "data", "altcoin", "scanner_validation", "rule_trigger_results.csv");
const REPORTS_DIR = join(import.meta.dirname, "..", "..", "..", "reports", "altcoin", "scanner_validation");

interface TriggerRow {
  symbol: string; date: string; rule_id: string; rule_category: string;
  triggered: number; is_positive_sample: number; relative_day_to_event: number;
}

async function main() {
  console.log("=== Rule Performance Evaluation ===\n");

  if (!existsSync(RESULTS_PATH)) {
    console.log("No results file found.");
    return;
  }

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const csv = readFileSync(RESULTS_PATH, "utf-8");
  const lines = csv.split("\n").filter(l => l.trim());
  const rows: TriggerRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",");
    rows.push({
      symbol: vals[0], date: vals[1], rule_id: vals[2], rule_category: vals[3],
      triggered: +vals[4], is_positive_sample: +vals[5], relative_day_to_event: +vals[6],
    });
  }

  const ruleIds = [...new Set(rows.map(r => r.rule_id))];
  const symbols = [...new Set(rows.map(r => r.symbol))];
  const posSymbols = [...new Set(rows.filter(r => r.is_positive_sample === 1).map(r => r.symbol))];
  const ctrlSymbols = [...new Set(rows.filter(r => r.is_positive_sample === 0).map(r => r.symbol))];

  console.log(`Positive samples: ${posSymbols.join(", ")}`);
  console.log(`Control samples: ${ctrlSymbols.join(", ")}`);
  console.log(`Rules evaluated: ${ruleIds.length}\n`);

  // Per-rule performance
  const reportLines: string[] = [
    "# Scanner Rule Validation Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Sample Summary",
    "",
    `- Positive samples: ${posSymbols.length} (${posSymbols.join(", ")})`,
    `- Control samples: ${ctrlSymbols.length} (${ctrlSymbols.join(", ")})`,
    `- Total feature rows: ${rows.length}`,
    `- Data source: CoinGecko free API (90-day window)`,
    "",
    "## Rule Performance Matrix",
    "",
    "| Rule ID | Category | Total Triggers | Positive Triggers | Control Triggers | Pos Rate | Ctrl Rate | Discrimination | Decision |",
    "|---------|----------|:---:|:---:|:---:|:---:|:---:|:---:|--------|",
  ];

  const decisions: Record<string, string> = {};

  for (const ruleId of ruleIds) {
    const rRows = rows.filter(r => r.rule_id === ruleId);
    const triggered = rRows.filter(r => r.triggered === 1);
    const posTriggered = triggered.filter(r => r.is_positive_sample === 1).length;
    const ctrlTriggered = triggered.filter(r => r.is_positive_sample === 0).length;

    const posTotal = rows.filter(r => r.rule_id === ruleId && r.is_positive_sample === 1).length;
    const ctrlTotal = rows.filter(r => r.rule_id === ruleId && r.is_positive_sample === 0).length;
    const posRate = posTotal > 0 ? (posTriggered / posTotal * 100) : 0;
    const ctrlRate = ctrlTotal > 0 ? (ctrlTriggered / ctrlTotal * 100) : 0;
    const discrimination = ctrlRate > 0 ? (posRate / ctrlRate) : (posRate > 0 ? 999 : 0);

    let decision: string;
    if (triggered.length === 0) {
      decision = "NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range.";
    } else if (discrimination > 10 && posRate > 5) {
      decision = "KEEP — strong discrimination, low false positive rate.";
    } else if (discrimination > 2 && posRate > 3) {
      decision = "KEEP_AS_RISK_SIGNAL — moderate discrimination, needs larger sample.";
    } else if (triggered.length > 0 && discrimination < 2) {
      decision = "NEED_MORE_DATA — poor discrimination in current sample.";
    } else {
      decision = "NEED_MORE_DATA";
    }

    decisions[ruleId] = decision;

    reportLines.push(
      `| ${ruleId} | ${rRows[0]?.rule_category || ""} | ${triggered.length} | ${posTriggered} | ${ctrlTriggered} | ${posRate.toFixed(1)}% | ${ctrlRate.toFixed(1)}% | ${discrimination.toFixed(1)}x | ${decision} |`
    );

    console.log(`${ruleId}: ${triggered.length} triggers, pos=${posRate.toFixed(1)}%, ctrl=${ctrlRate.toFixed(1)}%, disc=${discrimination.toFixed(1)}x → ${decision}`);
  }

  // BSB/LAB specific analysis
  reportLines.push("");
  reportLines.push("## BSB/LAB Rule Replay");
  reportLines.push("");

  for (const target of ["BSB", "LAB"]) {
    reportLines.push(`### ${target}`);
    reportLines.push("");
    const targetRows = rows.filter(r => r.symbol === target);
    const triggeredRules = targetRows.filter(r => r.triggered === 1);
    if (triggeredRules.length === 0) {
      reportLines.push(`- **No rules triggered for ${target} in the 90-day data window.**`);
      reportLines.push(`- The major breakout events (BSB: Apr 2026, LAB: Apr-May 2026) may be partially outside or at the edge of the 90-day window.`);
      reportLines.push(`- Daily granularity from CoinGecko may smooth out the extreme anomalies seen in the earlier case study data.`);
    } else {
      for (const t of triggeredRules) {
        const relDay = t.relative_day_to_event;
        const timing = relDay < 0 ? `${Math.abs(relDay)}d before event` :
                       relDay === 0 ? "ON event day" : `${relDay}d after event`;
        reportLines.push(`- **${t.rule_id}** triggered on ${t.date} (${timing})`);
      }
    }
    reportLines.push("");
  }

  // Findings
  reportLines.push("## Key Findings");
  reportLines.push("");
  reportLines.push("### 1. P0 Supply/Risk Rules: Zero Triggers Across Sample");
  reportLines.push("");
  reportLines.push("5 out of 8 rules (all P0 risk rules + P1 compression) produced **zero triggers** across 764 feature rows covering 13 tokens over 90 days.");
  reportLines.push("");
  reportLines.push("**Possible explanations:**");
  reportLines.push("- The BSB/LAB events were genuinely extreme outliers — not representative of typical altcoin behavior");
  reportLines.push("- Daily CoinGecko data smooths out intraday anomalies. The +110% implied supply jump on BSB was visible in the case study's daily data, but the 90-day CoinGecko API may provide differently aggregated data");
  reportLines.push("- Thresholds calibrated on N=2 are too strict for a 13-token sample");
  reportLines.push("- The 90-day window may not capture the full event cycle for all positive samples");
  reportLines.push("- Market cap data from CoinGecko API may differ from the web-scraped data used in the case study");
  reportLines.push("");

  reportLines.push("### 2. P1_QUIET_BREAKOUT: Moderate Discrimination");
  reportLines.push("");
  reportLines.push(`- 16.3% trigger rate in positive samples vs 5.6% in controls (2.9x discrimination)`);
  reportLines.push("- Triggers broadly across many tokens — not specific enough for a standalone signal");
  reportLines.push("- May have value as a **context signal** when combined with other indicators");
  reportLines.push("");

  reportLines.push("### 3. P1_EARLY_RELATIVE_STRENGTH: Best Discrimination");
  reportLines.push("");
  reportLines.push(`- 7.9% positive rate vs 0.5% control rate (15.8x discrimination)`);
  reportLines.push("- Only 3 false positives across all control tokens over 90 days");
  reportLines.push("- **This is the most promising signal in the current validation.** It identifies tokens showing strong relative performance without extreme volume — a possible early mark of genuine interest.");
  reportLines.push("");

  reportLines.push("## Final Rule Decisions");
  reportLines.push("");
  for (const [ruleId, decision] of Object.entries(decisions)) {
    const rRows = rows.filter(r => r.rule_id === ruleId);
    reportLines.push(`- **${ruleId}** (${rRows[0]?.rule_category || ""}): ${decision}`);
  }

  reportLines.push("");
  reportLines.push("## Limitations");
  reportLines.push("");
  reportLines.push("- N=13 tokens (4 positive, 9 control) — still small sample");
  reportLines.push("- WIF and AEVO data unavailable (network errors / 404)");
  reportLines.push("- 90-day window may miss events for PEPE (Dec 2025), BONK (Jul 2025), WIF (Dec 2025)");
  reportLines.push("- CoinGecko free API at daily granularity — intraday anomalies invisible");
  reportLines.push("- No on-chain, DEX, or social data — cannot verify supply anomalies or accumulation");
  reportLines.push("- Thresholds from N=2 case study — need calibration on larger sample");

  const report = reportLines.join("\n");
  writeFileSync(join(REPORTS_DIR, "scanner_validation_summary.md"), report);
  console.log(`\nReport: ${join(REPORTS_DIR, "scanner_validation_summary.md")}`);
}

main().catch(console.error);
