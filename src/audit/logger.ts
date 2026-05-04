import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { OrderIntent } from "../execution/order_intent.js";

const LOGS_DIR = join(import.meta.dirname, "..", "..", "logs");

export interface AuditEntry {
  timestamp: string;
  action: string;
  input: unknown;
  riskDecision?: string;
  command?: string;
  result?: unknown;
  error?: string;
}

export class AuditLogger {
  private logPath: string;

  constructor() {
    if (!existsSync(LOGS_DIR)) {
      mkdirSync(LOGS_DIR, { recursive: true });
    }
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    this.logPath = join(LOGS_DIR, `audit_${date}.jsonl`);
  }

  log(entry: AuditEntry): void {
    const line = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    });
    writeFileSync(this.logPath, line + "\n", { flag: "a" });
  }

  logOrderIntent(intent: OrderIntent, riskDecision: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      action: "order_intent",
      input: intent,
      riskDecision,
    });
  }

  logExecution(
    command: string,
    result: unknown,
    error?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      action: "execution",
      input: { command },
      command,
      result,
      error,
    });
  }

  logRiskCheck(intent: OrderIntent, approved: boolean, reason?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      action: "risk_check",
      input: intent,
      riskDecision: approved ? "approved" : `rejected: ${reason}`,
    });
  }

  logSystem(action: string, input: unknown, result?: unknown, error?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      action,
      input,
      result,
      error,
    });
  }
}
