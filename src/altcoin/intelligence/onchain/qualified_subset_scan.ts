import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const ONCHAIN_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");
const DIRECTIONAL_PATH = join(ONCHAIN_DIR, "directional_chain_scan_latest.csv");
const SHORT_EXEC_PATH = join(ONCHAIN_DIR, "short_executability_latest.csv");

interface DirectionalRow {
  token: string;
  priority: string;
  chain: string;
  contract_address: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
  readiness_decision: string;
  primary_direction: string;
  long_bucket: string;
  short_bucket: string;
  confidence: string;
  long_reason: string;
  short_reason: string;
  scan_stage: string;
  action: string;
  invalidation: string;
}

interface ShortExecRow {
  token: string;
  decision: string;
  execution_score: string;
  blockers: string;
}

export interface QualifiedSubsetInput {
  readinessDecision: string;
  primaryDirection: string;
  longBucket: string;
  shortBucket: string;
  confidence: string;
  shortExecutionDecision?: string;
}

export interface QualifiedSubsetDecision {
  included: boolean;
  side: "LONG" | "SHORT" | "NONE";
  scanBucket:
    | "LONG_AMBUSH_SCAN"
    | "LONG_WATCH_SCAN"
    | "SHORT_SETUP_SCAN"
    | "SHORT_WATCH_SCAN"
    | "EXCLUDED_DATA_REPAIR"
    | "EXCLUDED_LOW_CONFIDENCE"
    | "EXCLUDED_NO_DIRECTION";
  executionGate: "SCAN_ALLOWED" | "WATCH_ONLY" | "REPAIR_ONLY" | "NO_ACTION";
  reason: string;
  nextAction: string;
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

export function classifyQualifiedSubset(input: QualifiedSubsetInput): QualifiedSubsetDecision {
  if (input.readinessDecision !== "READY_FOR_DEEP_SCAN" || input.primaryDirection === "DATA_REPAIR") {
    return {
      included: false,
      side: "NONE",
      scanBucket: "EXCLUDED_DATA_REPAIR",
      executionGate: "REPAIR_ONLY",
      reason: "readiness gate is not clean",
      nextAction: "repair coverage, labels, or holder identity before directional scanning",
    };
  }

  if (input.confidence === "LOW") {
    return {
      included: false,
      side: "NONE",
      scanBucket: "EXCLUDED_LOW_CONFIDENCE",
      executionGate: "REPAIR_ONLY",
      reason: "directional confidence is too low for the qualified subset",
      nextAction: "wait for a fresh scan or stronger data coverage",
    };
  }

  if (input.primaryDirection === "LONG_AMBUSH" && input.longBucket === "LONG_AMBUSH") {
    return {
      included: true,
      side: "LONG",
      scanBucket: "LONG_AMBUSH_SCAN",
      executionGate: "SCAN_ALLOWED",
      reason: "ready gate passed and long ambush bucket is active",
      nextAction: "deepen entity-flow, liquidity, and invalidation checks before any execution decision",
    };
  }

  if (input.primaryDirection === "LONG_WATCH" && input.longBucket === "LONG_WATCH") {
    return {
      included: true,
      side: "LONG",
      scanBucket: "LONG_WATCH_SCAN",
      executionGate: "WATCH_ONLY",
      reason: "ready gate passed but long bucket is watch-only",
      nextAction: "keep in qualified watchlist until CEX flow and score structure improve",
    };
  }

  if (input.primaryDirection === "SHORT_SETUP" && input.shortBucket === "SHORT_SETUP") {
    const shortExecReady = input.shortExecutionDecision === "SHORT_EXEC_READY";
    return {
      included: true,
      side: "SHORT",
      scanBucket: "SHORT_SETUP_SCAN",
      executionGate: shortExecReady ? "SCAN_ALLOWED" : "WATCH_ONLY",
      reason: shortExecReady ? "short setup passed directional and execution gates" : "short setup passed directionally but execution gate is not ready",
      nextAction: shortExecReady ? "send to pre-trade risk review" : "keep on short watchlist; do not approve short execution",
    };
  }

  if (input.primaryDirection === "SHORT_WATCH" && input.shortBucket === "SHORT_WATCH") {
    return {
      included: true,
      side: "SHORT",
      scanBucket: "SHORT_WATCH_SCAN",
      executionGate: "WATCH_ONLY",
      reason: "ready gate passed but short evidence is watch-only",
      nextAction: "monitor for persistent CEX inflow and execution readiness",
    };
  }

  return {
    included: false,
    side: "NONE",
    scanBucket: "EXCLUDED_NO_DIRECTION",
    executionGate: "NO_ACTION",
    reason: "ready gate passed but no directional bucket is active",
    nextAction: "do not include in opportunity subset",
  };
}

function buildReport(rows: Array<DirectionalRow & QualifiedSubsetDecision & { short_exec_decision: string; execution_score: string; blockers: string }>): string {
  const included = rows.filter((row) => row.included);
  const excluded = rows.filter((row) => !row.included);
  const longRows = included.filter((row) => row.side === "LONG");
  const shortRows = included.filter((row) => row.side === "SHORT");

  const table = (items: typeof rows) => {
    const lines = [
      "| token | side | bucket | gate | confidence | opp | frag | trad | reason | next_action | invalidation |",
      "| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |",
    ];
    for (const row of items) {
      lines.push(`| ${row.token} | ${row.side} | ${row.scanBucket} | ${row.executionGate} | ${row.confidence} | ${row.opportunity_score} | ${row.fragility_score} | ${row.tradability_score} | ${row.reason} | ${row.nextAction} | ${row.invalidation} |`);
    }
    return lines.join("\n");
  };

  return [
    "# Qualified Subset Chain Scan",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Scope: only READY_FOR_DEEP_SCAN candidates with a non-repair directional bucket are allowed into this opportunity subset.",
    "",
    "## Long Qualified",
    "",
    longRows.length > 0 ? table(longRows) : "No qualified long candidates.",
    "",
    "## Short Qualified",
    "",
    shortRows.length > 0 ? table(shortRows) : "No qualified short candidates.",
    "",
    "## Excluded Repair / No Direction",
    "",
    excluded.length > 0 ? table(excluded) : "No excluded candidates.",
    "",
    "## Guardrails",
    "",
    "- This report is a scan scope, not an order ticket.",
    "- DATA_REPAIR rows are deliberately excluded from opportunity output.",
    "- SHORT_SETUP rows still require the short execution gate before pre-trade review.",
  ].join("\n");
}

async function main() {
  if (!existsSync(ONCHAIN_DIR)) mkdirSync(ONCHAIN_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const directionalRows = rowsToObjects<DirectionalRow>(DIRECTIONAL_PATH);
  const shortExecMap = new Map(rowsToObjects<ShortExecRow>(SHORT_EXEC_PATH).map((row) => [row.token, row]));
  const outputRows = directionalRows.map((row) => {
    const shortExec = shortExecMap.get(row.token);
    return {
      ...row,
      ...classifyQualifiedSubset({
        readinessDecision: row.readiness_decision,
        primaryDirection: row.primary_direction,
        longBucket: row.long_bucket,
        shortBucket: row.short_bucket,
        confidence: row.confidence,
        shortExecutionDecision: shortExec?.decision,
      }),
      short_exec_decision: shortExec?.decision || "",
      execution_score: shortExec?.execution_score || "",
      blockers: shortExec?.blockers || "",
    };
  });

  const outPath = join(ONCHAIN_DIR, "qualified_subset_scan_latest.csv");
  const reportPath = join(REPORTS_DIR, "qualified_subset_scan_latest.md");
  writeCsv(outPath, [
    ["checked_at", "token", "priority", "chain", "contract_address", "included", "side", "scan_bucket", "execution_gate", "readiness_decision", "scan_stage", "primary_direction", "long_bucket", "short_bucket", "confidence", "opportunity_score", "fragility_score", "tradability_score", "short_exec_decision", "execution_score", "blockers", "reason", "next_action", "invalidation"],
    ...outputRows.map((row) => [new Date().toISOString(), row.token, row.priority, row.chain, row.contract_address, String(row.included), row.side, row.scanBucket, row.executionGate, row.readiness_decision, row.scan_stage || "", row.primary_direction, row.long_bucket, row.short_bucket, row.confidence, row.opportunity_score, row.fragility_score, row.tradability_score, row.short_exec_decision, row.execution_score, row.blockers, row.reason, row.nextAction, row.invalidation]),
  ]);
  writeFileSync(reportPath, buildReport(outputRows), "utf-8");

  console.log("=== Qualified Subset Chain Scan ===");
  for (const row of outputRows) {
    console.log(`${row.token}: included=${row.included} side=${row.side} bucket=${row.scanBucket} gate=${row.executionGate}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("qualified_subset_scan");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
