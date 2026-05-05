import { existsSync, readFileSync } from "fs";
import { join } from "path";

const USAGE_LEDGER = join(import.meta.dirname, "..", "..", "..", "..", "data", "altcoin", "intelligence", "arkham", "usage", "arkham_usage_ledger.jsonl");
const DAILY_HEAVY_LIMIT = 500;

export interface BudgetStatus {
  today: string;
  heavyUsed: number;
  heavyRemaining: number;
  heavyLimit: number;
  canRun: boolean;
  plannedCalls: number;
  estimatedCalls: number;
}

export function getTodayHeavyUsage(): number {
  if (!existsSync(USAGE_LEDGER)) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const lines = readFileSync(USAGE_LEDGER, "utf-8").trim().split("\n").filter(Boolean);
  let count = 0;
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.timestamp?.slice(0, 10) === today && e.heavy_endpoint) count++;
    } catch { /* skip */ }
  }
  return count;
}

export function getRemainingHeavyBudget(): number {
  return Math.max(0, DAILY_HEAVY_LIMIT - getTodayHeavyUsage());
}

export function estimateBatchCalls(tokens: number, segments: number, sortDirs: number, maxPages: number): number {
  return tokens * segments * sortDirs * maxPages;
}

export function buildBudgetPlan(
  batch: string, tokens: number, segments: number, sortDirs: number, maxPages: number
): BudgetStatus {
  const today = new Date().toISOString().slice(0, 10);
  const heavyUsed = getTodayHeavyUsage();
  const planned = estimateBatchCalls(tokens, segments, sortDirs, maxPages);
  const remaining = DAILY_HEAVY_LIMIT - heavyUsed;
  return {
    today, heavyUsed, heavyRemaining: Math.max(0, remaining),
    heavyLimit: DAILY_HEAVY_LIMIT,
    canRun: remaining >= planned,
    plannedCalls: planned,
    estimatedCalls: planned,
  };
}

export function assertEnoughBudget(required: number): { ok: boolean; message: string } {
  const remaining = getRemainingHeavyBudget();
  if (remaining < required) {
    return { ok: false, message: `BUDGET_INSUFFICIENT: need ${required} heavy calls, only ${remaining} remaining` };
  }
  return { ok: true, message: `Budget OK: ${remaining} remaining, ${required} needed` };
}
