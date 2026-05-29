// Self-contained autonomous cycle runner
// Runs enhanced data collection → saves snapshot → can be called by external scheduler
// Designed for Windows Task Scheduler or cron: runs every 5-15 minutes

import { execSync } from "child_process";
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const LOG_DIR = join(ROOT, "data", "altcoin", "intelligence", "lab", "live");

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", timeout: 120000, env: { ...process.env } });
  } catch (e: any) {
    return `ERROR: ${e.message}`;
  }
}

async function main() {
  const ts = new Date().toISOString();
  console.log(`=== Auto Cycle ${ts} ===\n`);

  // Step 1: Enhanced data collection
  console.log("[1/3] Enhanced data...");
  const enhanced = run("npx tsx src/altcoin/intelligence/lab/lab_enhanced_data.ts");
  console.log(enhanced.split("\n").slice(0, 5).join("\n"));

  // Step 2: AI analysis + Feishu push
  console.log("\n[2/3] AI analysis + Feishu...");
  const aiAnalysis = run("npx tsx src/altcoin/intelligence/lab/lab_ai_analysis_loop.ts");
  console.log(aiAnalysis.split("\n").slice(-5).join("\n"));

  // Step 3: Fast-watch data point
  console.log("\n[3/3] Fast-watch...");
  const fw = run("npx tsx src/altcoin/intelligence/lab/lab_fast_watch.ts --mode=standard");
  console.log(fw.split("\n").slice(0, 5).join("\n"));

  // Log
  const logPath = join(LOG_DIR, "auto_cycle_log.jsonl");
  if (!existsSync(join(LOG_DIR))) mkdirSync(join(LOG_DIR), { recursive: true });
  appendFileSync(logPath, JSON.stringify({ ts, status: "complete" }) + "\n");

  console.log(`\n=== Cycle complete: ${ts} ===`);
}

main().catch(console.error);
