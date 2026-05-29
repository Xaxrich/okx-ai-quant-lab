import { spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { projectRoot } from "../src/config/env.js";
import { auditLatestOutputs } from "../src/altcoin/intelligence/validation/latest_output_consistency_audit.js";

const ROOT = projectRoot();
const REPORTS_DIR = join(ROOT, "reports", "altcoin", "intelligence", "cycles");

export interface Options {
  limit: string;
  bootstrapLimit: string;
  coinglassLimit: string;
  chainLimit: string;
  cexFlowPages: string;
  cexFlowTargetWindow: string;
  targetCap: string;
  minVolumeUsd: string;
  minOiUsd: string;
  includeMajors: boolean;
  skipOnchain: boolean;
  skipCoinglass: boolean;
}

interface StepResult {
  name: string;
  script: string;
  args: string[];
  status: number;
  skipped: boolean;
}

export interface StepSpec {
  name: string;
  script: string;
  args: string[];
  skipped?: boolean;
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function parseOptions(): Options {
  const limit = arg("limit") || "40";
  const parsedLimit = Number(limit);
  const bootstrapDefault = Number.isFinite(parsedLimit) && parsedLimit > 0 ? String(Math.max(60, parsedLimit * 2)) : "80";
  return {
    limit,
    bootstrapLimit: arg("bootstrap-limit") || bootstrapDefault,
    coinglassLimit: arg("coinglass-limit") || String(Math.min(20, Number(arg("bootstrap-limit") || bootstrapDefault) || 20)),
    chainLimit: arg("chain-limit") || "8",
    cexFlowPages: arg("cex-flow-pages") || "60",
    cexFlowTargetWindow: arg("cex-flow-target-window") || "24",
    targetCap: arg("target-cap") || "small-mid",
    minVolumeUsd: arg("min-volume-usd") || "2000000",
    minOiUsd: arg("min-oi-usd") || "1000000",
    includeMajors: process.argv.includes("--include-majors"),
    skipOnchain: process.argv.includes("--skip-onchain"),
    skipCoinglass: process.argv.includes("--skip-coinglass"),
  };
}

function commonMarketArgs(options: Options, limit: string): string[] {
  return [
    `--limit=${limit}`,
    `--min-volume-usd=${options.minVolumeUsd}`,
    `--min-oi-usd=${options.minOiUsd}`,
    ...(options.includeMajors ? ["--include-majors"] : []),
  ];
}

export function buildStepPlan(options: Options): StepSpec[] {
  const bootstrapArgs = [...commonMarketArgs(options, options.bootstrapLimit), "--target-cap=all"];
  const finalArgs = [...commonMarketArgs(options, options.limit), `--target-cap=${options.targetCap}`];
  const accumulationCandidateArgs = [
    `--limit=${options.bootstrapLimit}`,
    "--min-accumulation=25",
    "--min-execution=55",
    "--max-risk=35",
    "--write-chain-candidates",
  ];
  const accumulationGateArgs = [
    "--input=data/altcoin/intelligence/validation/accumulation_chain_candidates_latest.csv",
    "--min-opportunity=25",
    "--min-tradability=55",
    "--max-fragility=35",
  ];

  return [
    { name: "Bootstrap OKX universe", script: "intelligence:accumulation:okx-scan", args: bootstrapArgs },
    { name: "CoinGecko OKX universe enrichment", script: "intelligence:coingecko:okx-universe", args: [`--limit=${options.bootstrapLimit}`, "--max-details=12"] },
    {
      name: "CoinGlass OKX universe features",
      script: "intelligence:coinglass:okx-universe",
      args: [...commonMarketArgs(options, options.coinglassLimit), "--source=okx", "--with-flow"],
      skipped: options.skipCoinglass,
    },
    { name: "Pre-chain accumulation scan", script: "intelligence:accumulation:okx-scan", args: bootstrapArgs },
    {
      name: "Build accumulation chain candidates",
      script: "intelligence:accumulation:chain-candidates",
      args: accumulationCandidateArgs,
      skipped: options.skipOnchain,
    },
    {
      name: "Gate accumulation chain candidates",
      script: "validation:chain-gate",
      args: accumulationGateArgs,
      skipped: options.skipOnchain,
    },
    { name: "Light chain scan", script: "intelligence:onchain:light-scan", args: [`--limit=${options.chainLimit}`], skipped: options.skipOnchain },
    { name: "Entity flow review", script: "intelligence:onchain:entity-flow", args: [`--limit=${options.chainLimit}`], skipped: options.skipOnchain },
    { name: "Holder identity review", script: "intelligence:onchain:holder-identity", args: [], skipped: options.skipOnchain },
    { name: "Holder delta review", script: "intelligence:onchain:holder-delta", args: [], skipped: options.skipOnchain },
    {
      name: "CEX flow windows",
      script: "intelligence:onchain:cex-flow",
      args: [`--limit=${options.chainLimit}`, `--pages=${options.cexFlowPages}`, "--windows=1,4,24", `--target-window-hours=${options.cexFlowTargetWindow}`],
      skipped: options.skipOnchain,
    },
    { name: "Onchain readiness", script: "intelligence:onchain:readiness", args: [], skipped: options.skipOnchain },
    { name: "Directional chain scan", script: "intelligence:onchain:directional", args: [], skipped: options.skipOnchain },
    { name: "Short executability scan", script: "intelligence:onchain:short-exec", args: [], skipped: options.skipOnchain },
    { name: "Qualified subset scan", script: "intelligence:onchain:qualified-subset", args: [], skipped: options.skipOnchain },
    { name: "Final target-cap accumulation scan", script: "intelligence:accumulation:okx-scan", args: finalArgs },
  ];
}

function runNpmScript(name: string, script: string, args: string[], skipped = false): StepResult {
  if (skipped) return { name, script, args, status: 0, skipped: true };
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd", "run", script, "--", ...args]
    : ["run", script, "--", ...args];
  console.log(`\n=== ${name} ===`);
  console.log(`npm run ${script}${args.length > 0 ? ` -- ${args.join(" ")}` : ""}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) console.error(result.error.message);
  return { name, script, args, status: result.status ?? 1, skipped: false };
}

function writeReport(results: StepResult[], options: Options): void {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const lines = [
    "# Accumulation Cycle",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Target cap: ${options.targetCap}`,
    `Final limit: ${options.limit}`,
    `Bootstrap limit: ${options.bootstrapLimit}`,
    `CoinGlass limit: ${options.coinglassLimit}`,
    `Chain limit: ${options.chainLimit}`,
    `CEX flow pages: ${options.cexFlowPages}`,
    "",
    "| step | script | status | args |",
    "| --- | --- | ---: | --- |",
    ...results.map((row) => `| ${row.name} | ${row.script} | ${row.skipped ? "SKIPPED" : row.status} | ${row.args.join(" ")} |`),
    "",
    "## Outputs",
    "",
    "- data/altcoin/intelligence/accumulation/okx_accumulation_watchlist_latest.csv",
    "- reports/altcoin/intelligence/accumulation/okx_accumulation_scan_latest.md",
  ];
  writeFileSync(join(REPORTS_DIR, "accumulation_cycle_latest.md"), lines.join("\n"), "utf-8");
}

function main(): void {
  const options = parseOptions();
  const results: StepResult[] = [];
  const runStep = (step: StepSpec): boolean => {
    const result = runNpmScript(step.name, step.script, step.args, Boolean(step.skipped));
    results.push(result);
    return result.status === 0;
  };

  for (const step of buildStepPlan(options)) {
    if (!runStep(step)) {
      writeReport(results, options);
      process.exit(results.at(-1)?.status || 1);
    }
  }

  writeReport(results, options);
  const failed = results.find((row) => row.status !== 0);
  if (failed) {
    console.error(`Accumulation cycle failed at: ${failed.name}`);
    process.exit(failed.status);
  }
  const audit = auditLatestOutputs({ root: ROOT, scope: "accumulation" });
  if (audit.status === "FAIL") {
    console.error("Latest output audit failed after accumulation cycle.");
    process.exit(1);
  }
  console.log(`\nCycle report: ${join(REPORTS_DIR, "accumulation_cycle_latest.md")}`);
}

if (process.argv[1]?.includes("accumulation_cycle_runner")) main();
