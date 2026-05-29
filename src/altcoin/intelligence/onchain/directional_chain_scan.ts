import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { readCsv, writeCsv } from "../../../utils/csv.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const ONCHAIN_DIR = join(ROOT, "data", "altcoin", "intelligence", "onchain");
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "onchain");
const READINESS_PATH = join(ONCHAIN_DIR, "scan_readiness_latest.csv");

export type LongBucket = "LONG_AMBUSH" | "LONG_WATCH" | "NO_LONG";
export type ShortBucket = "SHORT_SETUP" | "SHORT_WATCH" | "NO_SHORT";
export type PrimaryDirection = "LONG_AMBUSH" | "LONG_WATCH" | "SHORT_SETUP" | "SHORT_WATCH" | "NO_TRADE" | "DATA_REPAIR";
export type DirectionConfidence = "HIGH" | "MEDIUM" | "LOW";

interface ReadinessRow {
  token: string;
  priority: string;
  chain: string;
  contract_address: string;
  opportunity_score: string;
  fragility_score: string;
  tradability_score: string;
  entity_decision: string;
  entity_label_coverage: string;
  holder_decision: string;
  holder_identity_class: string;
  cex_1h_decision: string;
  cex_4h_decision: string;
  cex_24h_decision: string;
  net_cex_1h_value: string;
  net_cex_4h_value: string;
  net_cex_24h_value: string;
  decision: string;
  scan_stage: string;
  scan_depth: string;
  reason: string;
}

export interface DirectionalInput {
  opportunityScore: number;
  fragilityScore: number;
  tradabilityScore: number;
  entityCoverage: number;
  holderDecision: string;
  holderIdentityClass: string;
  readinessDecision: string;
  cex1hDecision: string;
  cex4hDecision: string;
  cex24hDecision: string;
  netCex1hValue: number;
  netCex4hValue: number;
  netCex24hValue: number;
}

export interface DirectionalDecision {
  primaryDirection: PrimaryDirection;
  longBucket: LongBucket;
  shortBucket: ShortBucket;
  confidence: DirectionConfidence;
  longReason: string;
  shortReason: string;
  action: string;
  invalidation: string;
}

function loadDotenv(): void {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [name, valueRaw] = line.split(/=(.*)/s);
    if (!name || process.env[name]) continue;
    process.env[name] = (valueRaw || "").trim().replace(/^["']|["']$/g, "");
  }
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

function num(value: string | undefined): number {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCexInflow(decision: string): boolean {
  return decision === "CEX_INFLOW_RISK";
}

function isLowCoverage(decision: string): boolean {
  return decision === "LOW_COVERAGE";
}

export function decideDirectionalScan(input: DirectionalInput): DirectionalDecision {
  const holderBlocked = input.holderDecision === "HIGH_CONCENTRATION_UNRESOLVED" || input.readinessDecision === "BLOCKED_HOLDER_IDENTITY";
  const coverageBlocked = input.readinessDecision === "LOW_CONFIDENCE_SCAN" || input.entityCoverage < 0.25 || isLowCoverage(input.cex1hDecision);
  const persistentCexInflow = isCexInflow(input.cex4hDecision) || isCexInflow(input.cex24hDecision);
  const shortWindowCexInflow = isCexInflow(input.cex1hDecision) && !persistentCexInflow;
  const anyCexInflow = persistentCexInflow || shortWindowCexInflow;
  const cexHolder = input.holderIdentityClass.includes("ARKHAM_CEX");
  const scorePass = input.opportunityScore >= 40 && input.tradabilityScore >= 40 && input.fragilityScore <= 60;
  const cleanLongScores = input.opportunityScore >= 40 && input.tradabilityScore >= 60 && input.fragilityScore <= 35;
  const tradableForShort = input.tradabilityScore >= 40;
  const coverageBlockReason = input.readinessDecision === "LOW_CONFIDENCE_SCAN" && input.entityCoverage >= 0.25 && !isLowCoverage(input.cex1hDecision)
    ? "CEX flow window coverage is incomplete for directional interpretation"
    : "entity/CEX label coverage is too low for directional interpretation";

  let longBucket: LongBucket = "NO_LONG";
  let shortBucket: ShortBucket = "NO_SHORT";
  let longReason = "long setup unavailable";
  let shortReason = "short setup unavailable";

  if (holderBlocked) {
    longReason = "top holder identity is unresolved";
    shortReason = "top holder identity is unresolved, so short signal is not clean enough";
  } else if (coverageBlocked) {
    longReason = coverageBlockReason;
    shortReason = coverageBlockReason;
  } else {
    if (input.readinessDecision === "READY_FOR_DEEP_SCAN" && cleanLongScores && !anyCexInflow) {
      longBucket = "LONG_AMBUSH";
      longReason = "scores pass, tradability is strong, holder identity is resolved, and CEX proxy flow is neutral/outflow";
    } else if (scorePass && cleanLongScores && !persistentCexInflow) {
      longBucket = "LONG_WATCH";
      longReason = shortWindowCexInflow
        ? "long structure is usable, but short-window CEX proxy inflow must clear first"
        : "long structure is usable, but readiness is not clean enough for ambush";
    } else {
      longReason = persistentCexInflow ? "persistent CEX proxy inflow blocks long ambush" : "scores do not meet long ambush thresholds";
    }

    if (persistentCexInflow && tradableForShort && (input.fragilityScore >= 20 || cexHolder || input.netCex24hValue > 0)) {
      shortBucket = "SHORT_SETUP";
      shortReason = cexHolder
        ? "persistent CEX proxy inflow plus CEX/custody top-holder identity"
        : "persistent CEX proxy inflow plus non-trivial fragility or positive net inflow value";
    } else if ((persistentCexInflow || shortWindowCexInflow) && tradableForShort) {
      shortBucket = "SHORT_WATCH";
      shortReason = persistentCexInflow
        ? "CEX proxy inflow is persistent, but fragility/holder evidence is not strong enough for setup"
        : "short-window CEX proxy inflow spike; wait for persistence before treating as a short setup";
    }
  }

  let primaryDirection: PrimaryDirection = "NO_TRADE";
  if (holderBlocked || coverageBlocked) primaryDirection = "DATA_REPAIR";
  else if (shortBucket === "SHORT_SETUP") primaryDirection = "SHORT_SETUP";
  else if (longBucket === "LONG_AMBUSH") primaryDirection = "LONG_AMBUSH";
  else if (shortBucket === "SHORT_WATCH") primaryDirection = "SHORT_WATCH";
  else if (longBucket === "LONG_WATCH") primaryDirection = "LONG_WATCH";

  const confidence: DirectionConfidence =
    primaryDirection === "LONG_AMBUSH" && input.entityCoverage >= 0.5 ? "HIGH"
      : primaryDirection === "SHORT_SETUP" && input.entityCoverage >= 0.25 && persistentCexInflow ? "MEDIUM"
        : primaryDirection === "NO_TRADE" || primaryDirection === "DATA_REPAIR" ? "LOW"
          : "MEDIUM";

  const action = (() => {
    if (primaryDirection === "LONG_AMBUSH") return "add to long ambush list; deepen entity-flow and liquidity/slippage checks before execution";
    if (primaryDirection === "LONG_WATCH") return "keep on long watchlist; require CEX inflow to clear and readiness to return clean";
    if (primaryDirection === "SHORT_SETUP") return "add to short watchlist; confirm borrow/perp availability, funding, and invalidation before execution";
    if (primaryDirection === "SHORT_WATCH") return "monitor for persistence; do not short from one window alone";
    if (primaryDirection === "DATA_REPAIR") return "repair labels/identity/coverage before directional interpretation";
    return "no directional action";
  })();

  const invalidation = (() => {
    if (primaryDirection === "LONG_AMBUSH" || primaryDirection === "LONG_WATCH") return "invalidate long if 4h/24h CEX proxy inflow turns positive or holder identity becomes unresolved";
    if (primaryDirection === "SHORT_SETUP" || primaryDirection === "SHORT_WATCH") return "invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong";
    return "re-run scan-cycle after data repair or fresh onchain sample";
  })();

  return { primaryDirection, longBucket, shortBucket, confidence, longReason, shortReason, action, invalidation };
}

function buildReport(rows: Array<ReadinessRow & DirectionalDecision>): string {
  const longRows = rows.filter((row) => row.longBucket !== "NO_LONG");
  const shortRows = rows.filter((row) => row.shortBucket !== "NO_SHORT");
  const neutralRows = rows.filter((row) => row.longBucket === "NO_LONG" && row.shortBucket === "NO_SHORT");

  const table = (items: Array<ReadinessRow & DirectionalDecision>, reasonKey: "longReason" | "shortReason") => {
    const lines = [
      "| token | bucket | confidence | opp | frag | trad | cex_1h | cex_4h | cex_24h | reason | action |",
      "| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |",
    ];
    for (const row of items) {
      const bucket = reasonKey === "longReason" ? row.longBucket : row.shortBucket;
      lines.push(`| ${row.token} | ${bucket} | ${row.confidence} | ${row.opportunity_score} | ${row.fragility_score} | ${row.tradability_score} | ${row.cex_1h_decision} | ${row.cex_4h_decision} | ${row.cex_24h_decision} | ${row[reasonKey]} | ${row.action} |`);
    }
    return lines.join("\n");
  };

  const lines = [
    "# Directional Onchain Scan",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Long Ambush / Watch",
    "",
    longRows.length > 0 ? table(longRows, "longReason") : "No long-side candidates.",
    "",
    "## Short Setup / Watch",
    "",
    shortRows.length > 0 ? table(shortRows, "shortReason") : "No short-side candidates.",
    "",
    "## No Direction",
    "",
    neutralRows.length > 0 ? table(neutralRows, "longReason") : "All candidates have a directional bucket.",
    "",
    "## Guardrails",
    "",
    "- Directional buckets are scan outputs, not execution instructions.",
    "- CEX proxy flow is transfer direction only; it does not prove exchange selling or buying.",
    "- Short candidates still require borrow/perp availability, funding, liquidation, and slippage checks.",
  ];
  return lines.join("\n");
}

async function main() {
  loadDotenv();
  if (!existsSync(ONCHAIN_DIR)) mkdirSync(ONCHAIN_DIR, { recursive: true });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  const readinessRows = rowsToObjects<ReadinessRow>(READINESS_PATH);
  const outputRows = readinessRows.map((row) => {
    const directional = decideDirectionalScan({
      opportunityScore: num(row.opportunity_score),
      fragilityScore: num(row.fragility_score),
      tradabilityScore: num(row.tradability_score),
      entityCoverage: num(row.entity_label_coverage),
      holderDecision: row.holder_decision,
      holderIdentityClass: row.holder_identity_class,
      readinessDecision: row.decision,
      cex1hDecision: row.cex_1h_decision,
      cex4hDecision: row.cex_4h_decision,
      cex24hDecision: row.cex_24h_decision,
      netCex1hValue: num(row.net_cex_1h_value),
      netCex4hValue: num(row.net_cex_4h_value),
      netCex24hValue: num(row.net_cex_24h_value),
    });
    return { ...row, ...directional };
  });

  const outPath = join(ONCHAIN_DIR, "directional_chain_scan_latest.csv");
  const reportPath = join(REPORTS_DIR, "directional_chain_scan_latest.md");
  writeCsv(outPath, [
    ["checked_at", "token", "priority", "chain", "contract_address", "opportunity_score", "fragility_score", "tradability_score", "entity_label_coverage", "holder_decision", "holder_identity_class", "cex_1h_decision", "cex_4h_decision", "cex_24h_decision", "net_cex_1h_value", "net_cex_4h_value", "net_cex_24h_value", "readiness_decision", "scan_stage", "primary_direction", "long_bucket", "short_bucket", "confidence", "long_reason", "short_reason", "action", "invalidation"],
    ...outputRows.map((row) => [new Date().toISOString(), row.token, row.priority, row.chain, row.contract_address, row.opportunity_score, row.fragility_score, row.tradability_score, row.entity_label_coverage, row.holder_decision, row.holder_identity_class, row.cex_1h_decision, row.cex_4h_decision, row.cex_24h_decision, row.net_cex_1h_value, row.net_cex_4h_value, row.net_cex_24h_value, row.decision, row.scan_stage || "", row.primaryDirection, row.longBucket, row.shortBucket, row.confidence, row.longReason, row.shortReason, row.action, row.invalidation]),
  ]);
  writeFileSync(reportPath, buildReport(outputRows), "utf-8");

  console.log("=== Directional Onchain Scan ===");
  for (const row of outputRows) {
    console.log(`${row.token}: primary=${row.primaryDirection} long=${row.longBucket} short=${row.shortBucket} confidence=${row.confidence}`);
  }
  console.log(`Output: ${outPath}`);
  console.log(`Report: ${reportPath}`);
}

const isMain = process.argv[1]?.includes("directional_chain_scan");
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
