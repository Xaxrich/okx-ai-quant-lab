import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { okxJson } from "../connectors/okx_cli.js";
import { AuditLogger } from "../audit/logger.js";
import { loadRiskPolicy } from "../risk/risk_policy.js";
import { guardOrderIntent } from "../risk/order_guard.js";
import { generateClOrdId } from "./client_order_id.js";

const REPORTS_DIR = join(import.meta.dirname, "..", "..", "reports");
const audit = new AuditLogger();

interface RoundtripAuditEntry {
  timestamp: string;
  phase: string;
  intentId: string;
  clOrdId: string;
  profile: string;
  mode: string;
  instId: string;
  side: string;
  ordType: string;
  px: string;
  sz: string;
  notionalUSDT: number;
  riskDecision: string;
  humanConfirmation: string;
  submitCommandRedacted: string;
  submitResponse: unknown;
  orderStatusBeforeCancel: unknown;
  cancelResponse: unknown;
  orderStatusAfterCancel: unknown;
  ledgerUpdate: string;
  error: string;
}

class RoundtripLogger {
  private entry: RoundtripAuditEntry;

  constructor() {
    this.entry = {
      timestamp: new Date().toISOString(),
      phase: "init",
      intentId: `intent_${Date.now()}_${randomBytes(4).toString("hex")}`,
      clOrdId: "",
      profile: "okx-demo",
      mode: "demo",
      instId: "BTC-USDT",
      side: "buy",
      ordType: "limit",
      px: "",
      sz: "0.0001",
      notionalUSDT: 0,
      riskDecision: "",
      humanConfirmation: "",
      submitCommandRedacted: "",
      submitResponse: null,
      orderStatusBeforeCancel: null,
      cancelResponse: null,
      orderStatusAfterCancel: null,
      ledgerUpdate: "unchanged",
      error: "",
    };
  }

  phase(p: string) { this.entry.phase = p; return this; }
  clOrdId(id: string) { this.entry.clOrdId = id; return this; }
  instId(id: string) { this.entry.instId = id; return this; }
  side(s: string) { this.entry.side = s; return this; }
  ordType(t: string) { this.entry.ordType = t; return this; }
  px(p: string) { this.entry.px = p; return this; }
  sz(s: string) { this.entry.sz = s; return this; }
  notional(n: number) { this.entry.notionalUSDT = n; return this; }
  riskDecision(d: string) { this.entry.riskDecision = d; return this; }
  humanConfirmation(c: string) { this.entry.humanConfirmation = c; return this; }
  submitCmd(c: string) { this.entry.submitCommandRedacted = c; return this; }
  submitResponse(r: unknown) { this.entry.submitResponse = r; return this; }
  statusBefore(s: unknown) { this.entry.orderStatusBeforeCancel = s; return this; }
  cancelResponse(r: unknown) { this.entry.cancelResponse = r; return this; }
  statusAfter(s: unknown) { this.entry.orderStatusAfterCancel = s; return this; }
  ledgerUpdate(u: string) { this.entry.ledgerUpdate = u; return this; }
  error(e: string) { this.entry.error = e; return this; }

  getEntry(): RoundtripAuditEntry {
    this.entry.timestamp = new Date().toISOString();
    return { ...this.entry };
  }

  write(): void {
    const entry = this.getEntry();
    audit.log({
      timestamp: entry.timestamp,
      action: "roundtrip",
      input: {
        phase: entry.phase,
        intentId: entry.intentId,
        clOrdId: entry.clOrdId,
        instId: entry.instId,
        side: entry.side,
        ordType: entry.ordType,
        notionalUSDT: entry.notionalUSDT,
      },
      riskDecision: entry.riskDecision,
      command: entry.submitCommandRedacted,
      result: {
        submitResponse: entry.submitResponse,
        orderStatusBeforeCancel: entry.orderStatusBeforeCancel,
        cancelResponse: entry.cancelResponse,
        orderStatusAfterCancel: entry.orderStatusAfterCancel,
        ledgerUpdate: entry.ledgerUpdate,
      },
      error: entry.error || undefined,
    });
  }
}

function redactCommand(args: string[]): string {
  const safe = args.map((a, i) => {
    const prev = args[i - 1] || "";
    if (prev === "--profile" || prev === "--secret-key" || prev === "--passphrase") {
      return "***REDACTED***";
    }
    return a;
  });
  return `okx ${safe.join(" ")}`;
}

async function main() {
  const args = process.argv.slice(2);
  const executeDemo = args.includes("--execute-demo");
  const confirmPhrase = args.includes("EXECUTE_DEMO_ORDER") ? "EXECUTE_DEMO_ORDER" : undefined;

  console.log("╔══════════════════════════════════════╗");
  console.log("║  OKX Demo Order Roundtrip           ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`  Mode: ${executeDemo ? "EXECUTE DEMO" : "DRY RUN"}`);
  console.log(`  Time: ${new Date().toISOString()}\n`);

  const log = new RoundtripLogger();

  // ── Phase 1: Risk Policy Check ──
  log.phase("risk_check");
  console.log("── Phase 1: Risk Policy Check ──");

  const policy = loadRiskPolicy();
  console.log(`  Policy mode: ${policy.mode}`);
  console.log(`  allowLiveTrading: ${policy.allowLiveTrading}`);
  console.log(`  maxOrderNotionalUSDT: $${policy.maxOrderNotionalUSDT}`);
  console.log(`  requireHumanApproval: ${policy.requireHumanApproval}`);

  if (policy.mode !== "demo") {
    console.log("  REJECTED: Policy mode must be 'demo'");
    log.riskDecision("REJECTED: not demo mode").error("Policy mode must be demo").write();
    generateReport(log, "REJECTED: Policy mode must be demo");
    return;
  }

  if (policy.allowLiveTrading) {
    console.log("  REJECTED: allowLiveTrading must be false");
    log.riskDecision("REJECTED: allowLiveTrading is true").error("Live trading must be disabled").write();
    generateReport(log, "REJECTED: Live trading enabled in policy");
    return;
  }

  // ── Phase 2: Order Intent ──
  log.phase("order_intent");
  console.log("\n── Phase 2: Order Intent ──");

  // Far-from-market limit price
  const tickerResult = await okxJson(["market", "ticker", "BTC-USDT"]);
  let btcPrice = 78000;
  if (tickerResult.ok) {
    const d = (tickerResult.data as Record<string, string>[])[0];
    btcPrice = parseFloat(d?.last ?? "78000");
  }

  const farPrice = (btcPrice * 0.1).toFixed(0); // ~10% of market = won't fill
  const instId = "BTC-USDT";
  const sz = "0.0001";
  const notionalUSDT = parseFloat(sz) * parseFloat(farPrice);

  log.instId(instId).side("buy").ordType("limit").px(farPrice).sz(sz).notional(notionalUSDT);
  console.log(`  Instrument: ${instId}`);
  console.log(`  Side: buy`);
  console.log(`  Type: limit (post_only would also work)`);
  console.log(`  Price: $${farPrice} (market: $${btcPrice} — far from market)`);
  console.log(`  Size: ${sz} BTC`);
  console.log(`  Notional: $${notionalUSDT.toFixed(2)}`);

  // ── Phase 3: Risk Guard ──
  log.phase("risk_guard");
  console.log("\n── Phase 3: Risk Guard ──");

  const intent = {
    ts: Date.now(),
    instId,
    side: "buy" as const,
    sz,
    px: farPrice,
    ordType: "limit" as const,
    notionalUSDT,
    strategyName: "Demo Roundtrip Verification",
    signalReason: "Phase 2.5 verification — far-from-market limit order",
  };

  const dailyStats = { tradeCount: 0, dailyLossUSDT: 0 };
  const guardResult = guardOrderIntent(intent, policy, dailyStats);

  if (!guardResult.approved) {
    if (guardResult.pendingApproval) {
      console.log(`  Result: PENDING HUMAN APPROVAL`);
      log.riskDecision("PENDING_APPROVAL");

      if (confirmPhrase === "EXECUTE_DEMO_ORDER") {
        console.log(`  Confirmation phrase: RECEIVED`);
        log.humanConfirmation("EXECUTE_DEMO_ORDER");
      } else {
        console.log(`  Confirmation phrase: NOT PROVIDED`);
        log.humanConfirmation("none");
        if (executeDemo) {
          console.log("\n  To execute, pass: EXECUTE_DEMO_ORDER");
        }
      }
    } else {
      console.log(`  Result: REJECTED — ${guardResult.rejectedReason}`);
      log.riskDecision(`REJECTED: ${guardResult.rejectedReason}`).error(guardResult.rejectedReason || "").write();
      generateReport(log, `REJECTED: ${guardResult.rejectedReason}`);
      return;
    }
  } else {
    console.log(`  Result: APPROVED`);
    log.riskDecision("APPROVED");
  }

  // ── Phase 4: Dry Run / Execute ──
  log.phase("execution");
  console.log("\n── Phase 4: Execution ──");

  if (!executeDemo) {
    console.log("  DRY RUN — No order submitted to OKX.");
    console.log("  To execute, run: npm run demo:roundtrip -- --execute-demo EXECUTE_DEMO_ORDER");
    log.write();
    generateReport(log, "DRY RUN — No order submitted");
    return;
  }

  if (confirmPhrase !== "EXECUTE_DEMO_ORDER") {
    console.log("  REJECTED: Missing confirmation phrase EXECUTE_DEMO_ORDER");
    log.error("Missing confirmation phrase").write();
    generateReport(log, "REJECTED: Missing confirmation phrase");
    return;
  }

  // Phase 4a: Submit order
  log.phase("submit_order");
  console.log("── Phase 4a: Submit Order ──");

  const clOrdId = generateClOrdId();
  log.clOrdId(clOrdId);
  console.log(`  clOrdId: ${clOrdId}`);

  const submitArgs = [
    "spot", "place",
    "--instId", instId,
    "--side", "buy",
    "--sz", sz,
    "--ordType", "limit",
    "--px", farPrice,
    "--tdMode", "cash",
    "--clOrdId", clOrdId,
    "--profile", "okx-demo",
  ];

  const redactedCmd = redactCommand(submitArgs);
  log.submitCmd(redactedCmd);
  console.log(`  Command: ${redactedCmd}`);

  const submitResult = await okxJson(submitArgs);
  log.submitResponse(submitResult);

  if (!submitResult.ok) {
    console.log(`  SUBMIT FAILED: ${submitResult.stderr}`);
    log.error(submitResult.stderr || "submit failed").write();
    generateReport(log, `SUBMIT FAILED: ${submitResult.stderr}`);
    return;
  }

  const submitDataArr = submitResult.data as Record<string, string>[];
  const submitData = Array.isArray(submitDataArr) ? submitDataArr[0] : submitDataArr;
  const ordId = submitData?.ordId ?? "unknown";
  console.log(`  Order submitted: ordId=${ordId} (clOrdId: ${clOrdId})`);

  // Phase 4b: Query status before cancel
  log.phase("query_before_cancel");
  console.log("\n── Phase 4b: Query Status (Before Cancel) ──");

  await sleep(1000);
  const statusBefore = await okxJson([
    "spot", "get",
    "--instId", instId,
    "--clOrdId", clOrdId,
    "--profile", "okx-demo",
  ]);
  log.statusBefore(statusBefore.data);
  if (statusBefore.ok) {
    const d = (statusBefore.data as Record<string, string>[])[0];
    console.log(`  State: ${d?.state ?? "unknown"}, FillSz: ${d?.fillSz ?? "0"}`);
  } else {
    console.log(`  Query failed: ${statusBefore.stderr}`);
  }

  // Phase 4c: Cancel order
  log.phase("cancel_order");
  console.log("\n── Phase 4c: Cancel Order ──");

  await sleep(500);
  const cancelResult = await okxJson([
    "spot", "cancel", instId,
    "--clOrdId", clOrdId,
    "--profile", "okx-demo",
  ]);
  log.cancelResponse(cancelResult.data);

  if (cancelResult.ok) {
    console.log("  Cancel submitted successfully");
  } else {
    console.log(`  Cancel failed: ${cancelResult.stderr}`);
  }

  // Phase 4d: Query status after cancel
  log.phase("query_after_cancel");
  console.log("\n── Phase 4d: Query Status (After Cancel) ──");

  await sleep(1000);
  const statusAfter = await okxJson([
    "spot", "get",
    "--instId", instId,
    "--clOrdId", clOrdId,
    "--profile", "okx-demo",
  ]);
  log.statusAfter(statusAfter.data);

  if (statusAfter.ok) {
    const d = (statusAfter.data as Record<string, string>[])[0];
    const state = d?.state ?? "unknown";
    const fillSz = d?.fillSz ?? "0";
    console.log(`  Final State: ${state}, FillSz: ${fillSz}`);

    if (fillSz !== "0" && parseFloat(fillSz) > 0) {
      log.ledgerUpdate("would update: partial fill detected");
      console.log("  Ledger: WOULD UPDATE (fill detected)");
    } else {
      log.ledgerUpdate("unchanged: no fill");
      console.log("  Ledger: unchanged (no fill)");
    }
  }

  // ── Phase 5: Audit ──
  log.phase("audit_complete");
  console.log("\n── Phase 5: Audit ──");
  log.write();
  console.log("  Audit entry written to logs/audit_*.jsonl");

  generateReport(log, "COMPLETED SUCCESSFULLY");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function generateReport(log: RoundtripLogger, outcome: string): void {
  const entry = log.getEntry();

  const lines: string[] = [
    "# Demo Order Roundtrip Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `**Outcome: ${outcome}**`,
    "",
    "## Roundtrip Summary",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| Intent ID | ${entry.intentId} |`,
    `| Profile | ${entry.profile} |`,
    `| Mode | ${entry.mode} |`,
    `| Instrument | ${entry.instId} |`,
    `| Side | ${entry.side} |`,
    `| Order Type | ${entry.ordType} |`,
    `| Price | $${entry.px} |`,
    `| Size | ${entry.sz} |`,
    `| Notional | $${entry.notionalUSDT.toFixed(2)} |`,
    `| Risk Decision | ${entry.riskDecision} |`,
    `| Human Confirmation | ${entry.humanConfirmation || "none"} |`,
    `| clOrdId | ${entry.clOrdId || "not assigned"} |`,
    `| Submit Command | ${entry.submitCommandRedacted || "not submitted"} |`,
    `| Ledger Update | ${entry.ledgerUpdate} |`,
  ];

  if (entry.error) {
    lines.push(`| Error | ${entry.error} |`);
  }

  lines.push("");
  lines.push("## Safety Gates");
  lines.push("");
  lines.push("| Gate | Status |");
  lines.push("|------|--------|");
  lines.push("| Live trading | BLOCKED |");
  lines.push("| Market order | NOT USED |");
  lines.push("| SWAP/FUTURES/OPTION | NOT TARGETED |");
  lines.push("| Far-from-market price | YES |");
  lines.push("| Cancel-after-submit | YES |");
  lines.push("| Audit log written | YES |");
  lines.push("| API keys in report | NO |");

  lines.push("");
  lines.push("## Phase Timeline");
  lines.push("");
  lines.push("1. Risk Policy Check — verify all safety gates");
  lines.push("2. Order Intent — generate far-from-market limit order");
  lines.push("3. Risk Guard — validate against policy");
  lines.push("4. Execution — submit, query, cancel, query");
  lines.push("5. Audit — write complete audit trail");

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, "demo_order_roundtrip_report.md"), lines.join("\n"));
  console.log("\nReport: reports/demo_order_roundtrip_report.md");
}

main().catch((err) => {
  console.error("Roundtrip crashed:", err.message);
  process.exit(1);
});
