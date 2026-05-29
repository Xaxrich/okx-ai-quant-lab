import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { readCsv } from "../src/utils/csv.js";

const ROOT = join(import.meta.dirname, "..");
const CYCLE_DATA_DIR = join(ROOT, "data", "altcoin", "intelligence", "cycles");
const CYCLE_REPORT_DIR = join(ROOT, "reports", "altcoin", "intelligence", "cycles");
const npmCmd = "npm";

type StepStatus = "PLANNED" | "OK" | "WARN" | "FAILED" | "SKIPPED";

interface CycleOptions {
  planOnly: boolean;
  chainScan: boolean;
  okxNewSwaps: boolean;
  okxDays: number;
  okxLimit: number;
  limit: number;
  asOf: string;
  horizons: string;
  topK: string;
  minReturn: string;
  rankMetrics: string[];
  minOpportunity: number;
  minTradability: number;
  maxFragility: number;
}

interface CycleStep {
  id: string;
  title: string;
  script: string;
  args: string[];
  external: boolean;
  required: boolean;
  allowExitCodes?: number[];
  skipReason?: string;
}

interface StepResult extends CycleStep {
  status: StepStatus;
  exitCode: number | null;
  durationMs: number;
  outputTail: string;
}

function parseArgs(): CycleOptions {
  const arg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  };
  const has = (name: string): boolean => process.argv.includes(`--${name}`);

  const rankMetrics = (arg("scores") || "scanner_score,opportunity_score,tradability_score")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    planOnly: has("plan-only"),
    chainScan: has("chain-scan"),
    okxNewSwaps: has("okx-new-swaps"),
    okxDays: positiveInt(arg("okx-days"), 180),
    okxLimit: positiveInt(arg("okx-limit"), 40),
    limit: positiveInt(arg("limit"), 5),
    asOf: arg("as-of") || new Date().toISOString(),
    horizons: arg("horizons") || "1,3,7",
    topK: arg("topK") || "5,10",
    minReturn: arg("min-return") || "0.2",
    rankMetrics: rankMetrics.length > 0 ? rankMetrics : ["scanner_score"],
    minOpportunity: finiteNumber(arg("min-opportunity"), 40),
    minTradability: finiteNumber(arg("min-tradability"), 40),
    maxFragility: finiteNumber(arg("max-fragility"), 60),
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value || "");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function finiteNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function npmStep(
  id: string,
  title: string,
  script: string,
  args: string[] = [],
  options: Pick<CycleStep, "external" | "required" | "allowExitCodes" | "skipReason">
): CycleStep {
  return { id, title, script, args, ...options };
}

function buildSteps(options: CycleOptions): CycleStep[] {
  const steps: CycleStep[] = [
    npmStep("score-universe", "Score scanner universe", "scanner:v02", [], {
      external: false,
      required: true,
    }),
    npmStep("score-split", "Split scanner score into opportunity, fragility, tradability", "validation:score-split", [], {
      external: false,
      required: true,
    }),
    npmStep("pit-labels", "Build point-in-time forward labels", "validation:pit-labels", [
      `--as-of=${options.asOf}`,
      `--horizons=${options.horizons}`,
    ], {
      external: false,
      required: false,
    }),
    npmStep("high-value-data-audit", "Audit high-value data gaps for accumulation recognition", "intelligence:data:audit-high-value", [], {
      external: false,
      required: false,
    }),
  ];

  for (const rankMetric of options.rankMetrics) {
    for (const horizon of options.horizons.split(",").map((value) => value.trim()).filter(Boolean)) {
      steps.push(npmStep(`topk-${rankMetric}-${horizon}d`, `TopK validation for ${rankMetric} ${horizon}d`, "validation:topk-backtest", [
        `--score=${rankMetric}`,
        `--horizon=${horizon}`,
        `--topK=${options.topK}`,
        `--min-return=${options.minReturn}`,
      ], {
        external: false,
        required: false,
        allowExitCodes: [0, 1],
      }));
    }
  }

  steps.push(npmStep("accumulation-validate", "Detect and validate multi-source accumulation patterns", "intelligence:accumulation:validate", [
    "--horizon=7",
    `--min-return=${options.minReturn}`,
  ], {
    external: false,
    required: false,
    allowExitCodes: [0, 1],
  }));

  if (options.okxNewSwaps) {
    steps.push(npmStep("okx-new-swaps", "Discover newly listed OKX crypto USDT swaps", "intelligence:okx:new-swaps", [
      `--days=${options.okxDays}`,
      `--limit=${options.okxLimit}`,
      "--write-chain-candidates",
    ], {
      external: true,
      required: true,
      allowExitCodes: [0, 1],
    }));
  } else {
    steps.push(npmStep("chain-gate", "Promote candidates into chain scan gate", "validation:chain-gate", [
      `--min-opportunity=${options.minOpportunity}`,
      `--min-tradability=${options.minTradability}`,
      `--max-fragility=${options.maxFragility}`,
    ], {
      external: false,
      required: true,
      allowExitCodes: [0, 2],
    }));
  }

  if (!options.chainScan) {
    steps.push(npmStep("chain-scan-skipped", "External chain/API scan phase", "noop", [], {
      external: true,
      required: false,
      skipReason: "not requested; pass --chain-scan to spend external API calls",
    }));
    return steps;
  }

  steps.push(
    npmStep("api-smoke", "Check external API readiness", "api:smoke", [], {
      external: true,
      required: false,
      allowExitCodes: [0, 1],
    }),
    npmStep("light-chain", "Run light chain scan", "intelligence:onchain:light-scan", [`--limit=${options.limit}`], {
      external: true,
      required: false,
      allowExitCodes: [0, 1],
    }),
    npmStep("entity-flow", "Review entity-level transfer flow", "intelligence:onchain:entity-flow", [`--limit=${options.limit}`], {
      external: true,
      required: false,
      allowExitCodes: [0, 1],
    }),
    npmStep("holder-identity", "Resolve high-concentration holder identity", "intelligence:onchain:holder-identity", [], {
      external: true,
      required: false,
      allowExitCodes: [0, 1],
    }),
    npmStep("holder-delta", "Review top-holder transfer delta", "intelligence:onchain:holder-delta", [], {
      external: false,
      required: false,
      allowExitCodes: [0, 1],
    }),
    npmStep("cex-flow", "Scan CEX proxy flow windows", "intelligence:onchain:cex-flow", [
      `--limit=${options.limit}`,
      "--pages=50",
      "--windows=1,4,24",
      "--target-window-hours=24",
    ], {
      external: true,
      required: false,
      allowExitCodes: [0, 1],
    }),
    npmStep("readiness", "Decide scan readiness", "intelligence:onchain:readiness", [], {
      external: false,
      required: false,
    }),
    npmStep("directional", "Bucket directional scan states", "intelligence:onchain:directional", [], {
      external: false,
      required: false,
    }),
    npmStep("short-exec", "Check short-side public execution readiness", "intelligence:onchain:short-exec", [], {
      external: true,
      required: false,
      allowExitCodes: [0, 1],
    }),
    npmStep("qualified-subset", "Write qualified opportunity subset", "intelligence:onchain:qualified-subset", [], {
      external: false,
      required: false,
    }),
    npmStep("evidence-depth", "Audit whether unclear candidates are conflicted or under-mined", "intelligence:onchain:evidence-depth", [], {
      external: false,
      required: false,
    }),
    npmStep("okx-contract-review", "Review contract opportunities from OKX market and chain evidence", "intelligence:okx:contract-review", [
      `--limit=${options.okxLimit}`,
    ], {
      external: true,
      required: false,
      allowExitCodes: [0, 1],
    }),
    npmStep("contract-research", "Convert contract review into PIT-aware trade plans and capacity gates", "validation:contract-research", [], {
      external: false,
      required: false,
      allowExitCodes: [0, 1],
    })
  );

  return steps;
}

function runStep(step: CycleStep, planOnly: boolean): StepResult {
  if (step.skipReason) {
    return { ...step, status: "SKIPPED", exitCode: null, durationMs: 0, outputTail: step.skipReason };
  }
  if (planOnly) {
    return { ...step, status: "PLANNED", exitCode: null, durationMs: 0, outputTail: commandLabel(step) };
  }

  const started = Date.now();
  const args = ["run", step.script];
  if (step.args.length > 0) args.push("--", ...step.args);
  const spawnCommand = process.platform === "win32" ? "cmd.exe" : npmCmd;
  const spawnArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", [npmCmd, ...args].map(quoteCmdArg).join(" ")]
    : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: ROOT,
    encoding: "utf-8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
  });
  const durationMs = Date.now() - started;
  const exitCode = result.status;
  const allowed = step.allowExitCodes || [0];
  const ok = exitCode !== null && allowed.includes(exitCode);
  const output = [result.stdout || "", result.stderr || "", result.error?.message || ""].join("\n").trim();
  const status: StepStatus = ok ? (exitCode === 0 ? "OK" : "WARN") : "FAILED";

  return {
    ...step,
    status,
    exitCode,
    durationMs,
    outputTail: tail(output, 14),
  };
}

function quoteCmdArg(arg: string): string {
  if (/^[A-Za-z0-9_/:=.,@+-]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["^&|<>%])/g, "^$1")}"`;
}

function commandLabel(step: CycleStep): string {
  if (step.script === "noop") return "noop";
  return `npm run ${step.script}${step.args.length > 0 ? ` -- ${step.args.join(" ")}` : ""}`;
}

function tail(output: string, maxLines: number): string {
  if (!output) return "";
  const lines = output.split(/\r?\n/).filter(Boolean);
  return lines.slice(-maxLines).join("\n");
}

function ensureDirs(): void {
  if (!existsSync(CYCLE_DATA_DIR)) mkdirSync(CYCLE_DATA_DIR, { recursive: true });
  if (!existsSync(CYCLE_REPORT_DIR)) mkdirSync(CYCLE_REPORT_DIR, { recursive: true });
}

function latestMtime(paths: string[]): string {
  const mtimes = paths
    .filter((path) => existsSync(path))
    .map((path) => statSync(path).mtimeMs);
  if (mtimes.length === 0) return "";
  return new Date(Math.max(...mtimes)).toISOString();
}

function rows(path: string): Record<string, string>[] {
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

function topRows(path: string, sortKey: string, limit: number): Record<string, string>[] {
  return rows(path)
    .sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0))
    .slice(0, limit);
}

function mdTable(headers: string[], data: string[][]): string {
  if (data.length === 0) return "No rows.";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...data.map((row) => `| ${row.map((cell) => sanitizeCell(cell)).join(" | ")} |`),
  ].join("\n");
}

function sanitizeCell(value: string): string {
  return String(value || "").replace(/\r?\n/g, " ").replace(/\|/g, "/").slice(0, 180);
}

function neutralizeSignalNotes(value: string): string {
  return String(value || "")
    .replace(/BUY_PRESSURE/g, "DEMAND_PRESSURE")
    .replace(/SELL_PRESSURE/g, "SUPPLY_PRESSURE");
}

function fileLink(path: string): string {
  return existsSync(path) ? basename(path) : `${basename(path)} (missing)`;
}

function buildReport(options: CycleOptions, results: StepResult[]): string {
  const scannerPath = join(ROOT, "data", "altcoin", "scanner_v02", "features", "scanner_v02_universe_scores.csv");
  const splitPath = join(ROOT, "data", "altcoin", "intelligence", "validation", "score_decomposition_latest.csv");
  const candidatesPath = join(ROOT, "data", "altcoin", "intelligence", "validation", "chain_scan_candidates_latest.csv");
  const repairPath = join(ROOT, "data", "altcoin", "intelligence", "validation", "data_repair_queue_latest.csv");
  const qualifiedPath = join(ROOT, "data", "altcoin", "intelligence", "onchain", "qualified_subset_scan_latest.csv");
  const evidenceDepthPath = join(ROOT, "data", "altcoin", "intelligence", "onchain", "evidence_depth_audit_latest.csv");
  const holderDeltaPath = join(ROOT, "data", "altcoin", "intelligence", "onchain", "holder_flow_delta_review_latest.csv");
  const okxNewSwapsPath = join(ROOT, "data", "altcoin", "intelligence", "okx", "okx_new_swap_candidates_latest.csv");
  const okxContractReviewPath = join(ROOT, "data", "altcoin", "intelligence", "okx", "okx_contract_opportunity_review_latest.csv");
  const contractResearchPath = join(ROOT, "data", "altcoin", "intelligence", "validation", "contract_signal_research_review_latest.csv");
  const accumulationPath = join(ROOT, "data", "altcoin", "intelligence", "accumulation", "accumulation_signals_latest.csv");
  const dataAuditPath = join(ROOT, "data", "altcoin", "intelligence", "data_supply", "high_value_data_audit_latest.csv");

  const topOpportunity = topRows(splitPath, "opportunity_score", 10);
  const topAccumulation = topRows(accumulationPath, "candidate_rank_score", 10);
  const highValueGaps = rows(dataAuditPath)
    .filter((row) => row.priority === "P0" && row.usage_status !== "USED_IN_PRIMARY_SIGNAL")
    .slice(0, 10);
  const candidates = rows(candidatesPath).slice(0, 20);
  const repairs = rows(repairPath).slice(0, 20);
  const qualified = rows(qualifiedPath).slice(0, 20);
  const evidenceDepth = rows(evidenceDepthPath).slice(0, 20);
  const failed = results.filter((result) => result.status === "FAILED");
  const externalSkipped = results.some((result) => result.id === "chain-scan-skipped");

  const generatedAt = new Date().toISOString();
  const lines = [
    "# Opportunity Cycle Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Goal",
    "",
    "Find pre-breakout altcoin opportunities with a repeatable research loop: score the universe, validate point-in-time outcomes, gate candidates for chain work, then deepen only the candidates with enough data quality.",
    "",
    "## Guardrails",
    "",
    "- Research output only. This report is not an order ticket and does not approve execution.",
    "- Chain and exchange flows are proxy evidence. They do not prove intent or future price movement.",
    "- External API spending is opt-in through `--chain-scan`.",
    "",
    "## Run Options",
    "",
    mdTable(["option", "value"], [
      ["planOnly", String(options.planOnly)],
      ["chainScan", String(options.chainScan)],
      ["okxNewSwaps", String(options.okxNewSwaps)],
      ["okxDays", String(options.okxDays)],
      ["okxLimit", String(options.okxLimit)],
      ["limit", String(options.limit)],
      ["asOf", options.asOf],
      ["horizons", options.horizons],
      ["topK", options.topK],
      ["minReturn", options.minReturn],
      ["rankMetrics", options.rankMetrics.join(",")],
      ["gate", `opp>=${options.minOpportunity}, trad>=${options.minTradability}, frag<=${options.maxFragility}`],
    ]),
    "",
    "## Step Status",
    "",
    mdTable(["id", "status", "exit", "external", "required", "seconds", "command"], results.map((result) => [
      result.id,
      result.status,
      result.exitCode === null ? "" : String(result.exitCode),
      String(result.external),
      String(result.required),
      (result.durationMs / 1000).toFixed(1),
      result.skipReason || commandLabel(result),
    ])),
    "",
    "## Top Opportunity Scores",
    "",
    mdTable(["token", "category", "opportunity", "fragility", "tradability", "matrix", "notes"], topOpportunity.map((row) => [
      row.token,
      row.category,
      row.opportunity_score,
      row.fragility_score,
      row.tradability_score,
      row.state_matrix,
      neutralizeSignalNotes(row.score_notes),
    ])),
    "",
    "## Accumulation Pattern Signals",
    "",
    mdTable(["token", "label", "score", "confidence", "data", "risk", "evidence", "limits"], topAccumulation.map((row) => [
      row.token,
      row.label,
      row.total_score,
      row.confidence,
      row.data_completeness,
      row.risk_penalty,
      row.positive_evidence,
      row.limitations,
    ])),
    "",
    "## High-Value Data Gaps",
    "",
    mdTable(["id", "source", "dataset", "status", "cache_rows", "next_action"], highValueGaps.map((row) => [
      row.id,
      row.source,
      row.dataset,
      row.usage_status,
      row.cache_rows,
      row.next_action,
    ])),
    "",
    "## Chain Gate Candidates",
    "",
    mdTable(["token", "decision", "priority", "chain", "opp", "frag", "trad", "reason"], candidates.map((row) => [
      row.token,
      row.decision,
      row.priority,
      row.scan_chain || row.primary_chain,
      row.opportunity_score,
      row.fragility_score,
      row.tradability_score,
      row.reason,
    ])),
    "",
    "## OKX New Swap Universe",
    "",
    options.okxNewSwaps
      ? mdTable(["token", "inst", "age_d", "status", "priority", "chain", "oi_usd", "funding"], rows(okxNewSwapsPath).slice(0, 20).map((row) => [
        row.token,
        row.inst_id,
        row.age_days,
        row.discovery_status,
        row.priority,
        row.scan_chain || row.primary_chain,
        row.open_interest_usd,
        row.funding_rate,
      ]))
      : "Not requested. Pass `--okx-new-swaps` to use OKX crypto USDT swap listings as the candidate universe.",
    "",
    "## Qualified Onchain Subset",
    "",
    externalSkipped
      ? "Skipped. Run with `--chain-scan` after confirming API budgets."
      : mdTable(["token", "included", "side", "bucket", "gate", "confidence", "reason"], qualified.map((row) => [
        row.token,
        row.included,
        row.side,
        row.scan_bucket,
        row.execution_gate,
        row.confidence,
        row.reason,
      ])),
    "",
    "## Evidence Depth Audit",
    "",
    externalSkipped
      ? "Skipped. Run with `--chain-scan` after confirming API budgets."
      : mdTable(["token", "state", "depth", "conflict", "insufficiency", "conclusion", "next_probe"], evidenceDepth.map((row) => [
        row.token,
        row.evidence_state,
        row.depth_score,
        row.conflict_score,
        row.insufficiency_score,
        row.conclusion,
        row.next_probe,
      ])),
    "",
    "## OKX Contract Opportunity Review",
    "",
    options.okxNewSwaps
      ? mdTable(["token", "state", "confidence", "setup", "risk", "squeeze", "24h", "oi_7d", "funding", "cex_24h", "next"], rows(okxContractReviewPath).slice(0, 20).map((row) => [
        row.token,
        row.contract_state,
        row.confidence,
        row.setup_score,
        row.risk_score,
        row.squeeze_score,
        row.return_24h,
        row.oi_change_7d,
        row.funding_latest,
        row.cex_24h_decision,
        row.next_action,
      ]))
      : "Not requested. Pass `--okx-new-swaps --chain-scan` to generate the contract review.",
    "",
    "## Contract Research Trade Plan",
    "",
    options.okxNewSwaps
      ? mdTable(["token", "decision", "state", "p_win", "EV", "target", "stop", "cap_usd", "exec", "identity_gap", "gate"], rows(contractResearchPath).slice(0, 20).map((row) => [
        row.token,
        row.trade_decision,
        row.contract_state,
        row.probability_win,
        row.expected_value,
        row.target_return,
        row.stop_loss,
        row.max_position_usd,
        row.execution_status,
        row.identity_gap,
        row.trade_gate,
      ]))
      : "Not requested. Pass `--okx-new-swaps --chain-scan` to generate contract research trade plans.",
    "",
    "## Data Repair Queue",
    "",
    mdTable(["token", "chain", "decision", "reason", "next_action"], repairs.map((row) => [
      row.token,
      row.primary_chain || row.scan_chain,
      row.decision,
      row.reason,
      row.next_action,
    ])),
    "",
    "## Artifacts",
    "",
    mdTable(["artifact", "file", "latest_mtime"], [
      ["scanner_scores", fileLink(scannerPath), latestMtime([scannerPath])],
      ["score_decomposition", fileLink(splitPath), latestMtime([splitPath])],
      ["chain_candidates", fileLink(candidatesPath), latestMtime([candidatesPath])],
      ["okx_new_swaps", fileLink(okxNewSwapsPath), latestMtime([okxNewSwapsPath])],
      ["okx_contract_review", fileLink(okxContractReviewPath), latestMtime([okxContractReviewPath])],
      ["contract_research", fileLink(contractResearchPath), latestMtime([contractResearchPath])],
      ["holder_delta", fileLink(holderDeltaPath), latestMtime([holderDeltaPath])],
      ["accumulation_signals", fileLink(accumulationPath), latestMtime([accumulationPath])],
      ["high_value_data_audit", fileLink(dataAuditPath), latestMtime([dataAuditPath])],
      ["repair_queue", fileLink(repairPath), latestMtime([repairPath])],
      ["qualified_subset", fileLink(qualifiedPath), latestMtime([qualifiedPath])],
      ["evidence_depth", fileLink(evidenceDepthPath), latestMtime([evidenceDepthPath])],
    ]),
  ];

  if (failed.length > 0) {
    lines.push("", "## Failures", "");
    for (const result of failed) {
      lines.push(`### ${result.id}`, "", "```text", result.outputTail || "(no output)", "```", "");
    }
  }

  return lines.join("\n");
}

async function main() {
  ensureDirs();
  const options = parseArgs();
  const steps = buildSteps(options);
  const results: StepResult[] = [];

  console.log("=== Opportunity Cycle Runner ===");
  console.log(`planOnly=${options.planOnly} chainScan=${options.chainScan} okxNewSwaps=${options.okxNewSwaps} limit=${options.limit}`);
  console.log("Research-only: no order placement or execution approval.\n");

  for (const step of steps) {
    console.log(`[${results.length + 1}/${steps.length}] ${step.title}`);
    const result = runStep(step, options.planOnly);
    results.push(result);
    console.log(`  ${result.status}${result.exitCode === null ? "" : ` exit=${result.exitCode}`} ${Math.round(result.durationMs / 1000)}s`);
    if (result.status === "FAILED" && result.required) {
      console.log("  Required step failed; continuing to write diagnostics.");
    }
  }

  const snapshotId = new Date().toISOString().replace(/[:.]/g, "-");
  const report = buildReport(options, results);
  const reportPath = join(CYCLE_REPORT_DIR, "opportunity_cycle_latest.md");
  const snapshotPath = join(CYCLE_DATA_DIR, `opportunity_cycle_${snapshotId}.json`);
  writeFileSync(reportPath, report, "utf-8");
  writeFileSync(snapshotPath, JSON.stringify({ generatedAt: new Date().toISOString(), options, results }, null, 2), "utf-8");

  console.log("\n=== Cycle Summary ===");
  console.log(`Report: ${reportPath}`);
  console.log(`Snapshot: ${snapshotPath}`);
  const failed = results.filter((result) => result.status === "FAILED");
  if (failed.some((result) => result.required)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
