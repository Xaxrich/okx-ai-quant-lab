import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { projectRoot } from "../../../config/env.js";
import { readCsv, writeCsv } from "../../../utils/csv.js";

export type LatestAuditScope = "accumulation" | "onchain" | "all";
export type LatestAuditStatus = "PASS" | "WARN" | "FAIL";

export interface LatestAuditOptions {
  root?: string;
  scope?: LatestAuditScope;
  maxReportLagMinutes?: number;
  writeOutputs?: boolean;
}

export interface LatestAuditCheck {
  name: string;
  status: LatestAuditStatus;
  detail: string;
}

export interface LatestAuditResult {
  status: LatestAuditStatus;
  checks: LatestAuditCheck[];
}

const DEFAULT_MAX_REPORT_LAG_MINUTES = 5;

function worstStatus(statuses: LatestAuditStatus[]): LatestAuditStatus {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("WARN")) return "WARN";
  return "PASS";
}

function check(name: string, status: LatestAuditStatus, detail: string): LatestAuditCheck {
  return { name, status, detail };
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

export function reportField(reportText: string, field: string): string {
  const prefix = `${field}:`;
  const line = reportText.split(/\r?\n/).find((item) => item.trim().startsWith(prefix));
  return line ? line.trim().slice(prefix.length).trim() : "";
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
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

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function mtime(path: string): Date | null {
  return existsSync(path) ? statSync(path).mtime : null;
}

function reportLagOk(csvPath: string, reportPath: string, maxLagMinutes: number): LatestAuditCheck {
  const csvTime = mtime(csvPath);
  const reportTime = mtime(reportPath);
  if (!csvTime) return check(`${csvPath} exists`, "FAIL", "CSV latest file is missing");
  if (!reportTime) return check(`${reportPath} exists`, "FAIL", "Markdown latest report is missing");
  const lagMs = csvTime.getTime() - reportTime.getTime();
  if (lagMs > maxLagMinutes * 60_000) {
    return check(`${reportPath} freshness`, "FAIL", `report is older than csv by ${(lagMs / 60_000).toFixed(1)} minutes`);
  }
  return check(`${reportPath} freshness`, "PASS", "report is not older than csv beyond tolerance");
}

function auditAccumulation(root: string, maxReportLagMinutes: number): LatestAuditCheck[] {
  const dataPath = join(root, "data", "altcoin", "intelligence", "accumulation", "okx_accumulation_features_latest.csv");
  const reportPath = join(root, "reports", "altcoin", "intelligence", "accumulation", "okx_accumulation_scan_latest.md");
  const cycleReportPath = join(root, "reports", "altcoin", "intelligence", "cycles", "accumulation_cycle_latest.md");
  const checks: LatestAuditCheck[] = [];

  checks.push(reportLagOk(dataPath, reportPath, maxReportLagMinutes));
  if (!existsSync(dataPath) || !existsSync(reportPath)) return checks;

  const rows = rowsToObjects(dataPath);
  const snapshots = uniqueNonEmpty(rows.map((row) => row.snapshot_id));
  const reportText = readText(reportPath);
  const reportSnapshot = reportField(reportText, "Snapshot");
  const reportGenerated = parseDate(reportField(reportText, "Generated"));
  const reportTargetCap = reportField(reportText, "Target cap");

  if (snapshots.length !== 1) checks.push(check("accumulation snapshot uniqueness", "FAIL", `expected one snapshot_id, got ${snapshots.length || 0}`));
  else if (reportSnapshot !== snapshots[0]) checks.push(check("accumulation snapshot match", "FAIL", `csv=${snapshots[0]} report=${reportSnapshot || "missing"}`));
  else checks.push(check("accumulation snapshot match", "PASS", `snapshot=${snapshots[0]}`));

  checks.push(reportGenerated
    ? check("accumulation report generated", "PASS", reportGenerated.toISOString())
    : check("accumulation report generated", "FAIL", "Generated field is missing or invalid"));

  if (!existsSync(cycleReportPath)) {
    checks.push(check("cycle report present", "WARN", "accumulation cycle report is missing"));
    return checks;
  }

  const cycleText = readText(cycleReportPath);
  const cycleGenerated = parseDate(reportField(cycleText, "Generated"));
  const cycleTargetCap = reportField(cycleText, "Target cap");
  if (!cycleGenerated) {
    checks.push(check("cycle report generated", "FAIL", "Generated field is missing or invalid"));
  } else if (reportGenerated && cycleGenerated.getTime() + maxReportLagMinutes * 60_000 < reportGenerated.getTime()) {
    checks.push(check("cycle covers final scan", "FAIL", `cycle=${cycleGenerated.toISOString()} final=${reportGenerated.toISOString()}`));
  } else {
    checks.push(check("cycle covers final scan", "PASS", cycleGenerated.toISOString()));
  }
  if (cycleTargetCap && reportTargetCap && cycleTargetCap !== reportTargetCap) {
    checks.push(check("cycle target-cap match", "FAIL", `cycle=${cycleTargetCap} report=${reportTargetCap}`));
  } else {
    checks.push(check("cycle target-cap match", "PASS", reportTargetCap || cycleTargetCap || "not recorded"));
  }

  return checks;
}

function auditOnchain(root: string, maxReportLagMinutes: number): LatestAuditCheck[] {
  const pairs = [
    {
      name: "chain gate",
      csv: join(root, "data", "altcoin", "intelligence", "validation", "chain_scan_candidates_latest.csv"),
      report: join(root, "reports", "altcoin", "intelligence", "validation", "chain_scan_gate_latest.md"),
    },
    {
      name: "scan readiness",
      csv: join(root, "data", "altcoin", "intelligence", "onchain", "scan_readiness_latest.csv"),
      report: join(root, "reports", "altcoin", "intelligence", "onchain", "scan_readiness_latest.md"),
    },
    {
      name: "directional chain scan",
      csv: join(root, "data", "altcoin", "intelligence", "onchain", "directional_chain_scan_latest.csv"),
      report: join(root, "reports", "altcoin", "intelligence", "onchain", "directional_chain_scan_latest.md"),
    },
    {
      name: "qualified subset",
      csv: join(root, "data", "altcoin", "intelligence", "onchain", "qualified_subset_scan_latest.csv"),
      report: join(root, "reports", "altcoin", "intelligence", "onchain", "qualified_subset_scan_latest.md"),
    },
  ];

  return pairs.flatMap((pair) => {
    const freshness = reportLagOk(pair.csv, pair.report, maxReportLagMinutes);
    if (!existsSync(pair.csv)) return [freshness];
    const rows = rowsToObjects(pair.csv);
    const stageValues = uniqueNonEmpty(rows.map((row) => row.scan_stage));
    const stageCheck = pair.name === "chain gate" || pair.name === "scan readiness" || pair.name === "directional chain scan" || pair.name === "qualified subset"
      ? check(`${pair.name} scan_stage`, stageValues.length > 0 ? "PASS" : "WARN", stageValues.length > 0 ? `stages=${stageValues.join("|")}` : "scan_stage not populated")
      : check(`${pair.name} scan_stage`, "PASS", "not required");
    return [freshness, stageCheck];
  });
}

function writeAuditOutputs(root: string, result: LatestAuditResult): void {
  const outDir = join(root, "data", "altcoin", "intelligence", "validation");
  const reportDir = join(root, "reports", "altcoin", "intelligence", "validation");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });

  writeCsv(join(outDir, "latest_output_consistency_audit_latest.csv"), [
    ["checked_at", "status", "name", "detail"],
    ...result.checks.map((row) => [new Date().toISOString(), row.status, row.name, row.detail]),
  ]);

  const report = [
    "# Latest Output Consistency Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Overall status: ${result.status}`,
    "",
    "| status | check | detail |",
    "| --- | --- | --- |",
    ...result.checks.map((row) => `| ${row.status} | ${row.name} | ${row.detail.replace(/\|/g, "/")} |`),
  ].join("\n");
  writeFileSync(join(reportDir, "latest_output_consistency_audit_latest.md"), report, "utf-8");
}

export function auditLatestOutputs(options: LatestAuditOptions = {}): LatestAuditResult {
  const root = options.root || projectRoot();
  const scope = options.scope || "all";
  const maxReportLagMinutes = options.maxReportLagMinutes ?? DEFAULT_MAX_REPORT_LAG_MINUTES;
  const checks = [
    ...(scope === "accumulation" || scope === "all" ? auditAccumulation(root, maxReportLagMinutes) : []),
    ...(scope === "onchain" || scope === "all" ? auditOnchain(root, maxReportLagMinutes) : []),
  ];
  const result = { status: worstStatus(checks.map((row) => row.status)), checks };
  if (options.writeOutputs !== false) writeAuditOutputs(root, result);
  return result;
}

function parseArgs(): LatestAuditOptions {
  const arg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  };
  const scope = arg("scope");
  const maxReportLagMinutes = Number(arg("max-report-lag-minutes") || "");
  return {
    scope: scope === "accumulation" || scope === "onchain" || scope === "all" ? scope : "all",
    maxReportLagMinutes: Number.isFinite(maxReportLagMinutes) ? maxReportLagMinutes : DEFAULT_MAX_REPORT_LAG_MINUTES,
  };
}

const isMain = process.argv[1]?.includes("latest_output_consistency_audit");
if (isMain) {
  const result = auditLatestOutputs(parseArgs());
  console.log("=== Latest Output Consistency Audit ===");
  console.log(`Status: ${result.status}`);
  for (const row of result.checks) console.log(`${row.status} ${row.name}: ${row.detail}`);
  if (result.status === "FAIL") process.exit(1);
}
