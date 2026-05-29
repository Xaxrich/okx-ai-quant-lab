import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { generateClOrdId } from "./client_order_id.js";
import type { OrderIntent, OrderExecutionResult } from "./order_types.js";
import { okxJson } from "../connectors/okx_cli.js";
import { AuditLogger } from "../audit/logger.js";
import { loadRiskPolicy } from "../risk/risk_policy.js";
import { guardOrderIntent } from "../risk/order_guard.js";
import { cancelOrderByClOrdId, queryOrderByClOrdId } from "./order_status.js";

const INTENT_DIR = join(import.meta.dirname, "..", "..", "data", "order_intents");
const audit = new AuditLogger();

export interface DemoRoundtripOptions {
  profile: string;
  executeDemo: boolean;
  confirmPhrase?: string;
  cancelAfterSubmit?: boolean;
}

type RoundtripAction = "propose" | "execute-demo" | "cancel-demo";

function loadDailyStats() {
  return { tradeCount: 0, dailyLossUSDT: 0 };
}

export async function proposeOrderIntent(intent: OrderIntent): Promise<string> {
  if (!existsSync(INTENT_DIR)) mkdirSync(INTENT_DIR, { recursive: true });

  const filename = `order_intent_${intent.intentId}.json`;
  const filepath = join(INTENT_DIR, filename);

  writeFileSync(filepath, JSON.stringify(intent, null, 2), "utf-8");

  audit.logOrderIntent(
    {
      ts: Date.now(),
      instId: intent.instId,
      side: intent.side,
      sz: intent.sz,
      px: intent.px,
      ordType: intent.ordType,
      notionalUSDT: intent.notionalUSDT,
      strategyName: intent.strategyName,
      signalReason: intent.reason,
    },
    "proposed"
  );

  console.log("Order intent saved:", filepath);
  console.log(JSON.stringify(intent, null, 2));
  return filepath;
}

export async function readOrderIntent(intentId: string): Promise<OrderIntent | null> {
  const filepath = join(INTENT_DIR, `order_intent_${intentId}.json`);
  if (!existsSync(filepath)) return null;
  return JSON.parse(readFileSync(filepath, "utf-8")) as OrderIntent;
}

export async function executeDemoOrder(
  intent: OrderIntent,
  options: DemoRoundtripOptions
): Promise<OrderExecutionResult> {
  const policy = loadRiskPolicy();
  const dailyStats = loadDailyStats();

  console.log("═══════════════════════════════════════");
  console.log("  DEMO ORDER EXECUTION");
  console.log("═══════════════════════════════════════");
  console.log(`  Intent ID:    ${intent.intentId}`);
  console.log(`  Profile:      ${intent.profile}`);
  console.log(`  Instrument:   ${intent.instId}`);
  console.log(`  Side:         ${intent.side.toUpperCase()}`);
  console.log(`  Type:         ${intent.ordType.toUpperCase()}`);
  console.log(`  Size:         ${intent.sz}`);
  console.log(`  Price:        ${intent.px}`);
  console.log(`  Notional:     $${intent.notionalUSDT.toFixed(2)}`);
  console.log("═══════════════════════════════════════");

  if (intent.mode !== "demo" || intent.profile !== "okx-demo") {
    const err = "Only demo mode with okx-demo profile is allowed.";
    console.log(`REJECTED: ${err}`);
    audit.logSystem("demo_execution", intent, null, err);
    return {
      intentId: intent.intentId,
      clOrdId: "",
      ordId: "",
      status: "cancelled",
      submittedAt: new Date().toISOString(),
      exchangeResponse: null,
      error: err,
    };
  }

  if (intent.ordType !== "limit" && intent.ordType !== "post_only") {
    const err = `Order type must be limit or post_only, got: ${intent.ordType}`;
    console.log(`REJECTED: ${err}`);
    audit.logSystem("demo_execution", intent, null, err);
    return {
      intentId: intent.intentId,
      clOrdId: "",
      ordId: "",
      status: "cancelled",
      submittedAt: new Date().toISOString(),
      exchangeResponse: null,
      error: err,
    };
  }

  const guardResult = guardOrderIntent(
    {
      ts: Date.now(),
      instId: intent.instId,
      side: intent.side,
      sz: intent.sz,
      px: intent.px,
      ordType: intent.ordType,
      notionalUSDT: intent.notionalUSDT,
      strategyName: intent.strategyName,
      signalReason: intent.reason,
    },
    policy,
    dailyStats
  );

  if (!guardResult.approved) {
    if (guardResult.pendingApproval) {
      if (options.confirmPhrase !== "EXECUTE_DEMO_ORDER") {
        const err = "Human approval required. Set confirmPhrase to EXECUTE_DEMO_ORDER.";
        console.log(`PENDING APPROVAL: ${err}`);
        audit.logSystem("demo_execution_approval_needed", intent, null, err);
        return {
          intentId: intent.intentId,
          clOrdId: "",
          ordId: "",
          status: "cancelled",
          submittedAt: new Date().toISOString(),
          exchangeResponse: null,
          error: err,
        };
      }
      console.log("Human approval confirmed via EXECUTE_DEMO_ORDER.");
    } else {
      const err = `Risk guard rejected: ${guardResult.rejectedReason}`;
      console.log(`REJECTED: ${err}`);
      audit.logSystem("demo_execution_rejected", intent, null, err);
      return {
        intentId: intent.intentId,
        clOrdId: "",
        ordId: "",
        status: "cancelled",
        submittedAt: new Date().toISOString(),
        exchangeResponse: null,
        error: err,
      };
    }
  }

  if (!options.executeDemo) {
    console.log("DRY RUN — no order placed. Pass --execute-demo to submit.");
    audit.logSystem("demo_execution_dry_run", intent);
    return {
      intentId: intent.intentId,
      clOrdId: "",
      ordId: "",
      status: "cancelled",
      submittedAt: new Date().toISOString(),
      exchangeResponse: null,
      error: "Dry run",
    };
  }

  const clOrdId = generateClOrdId();
  const args = [
    "spot",
    "place",
    intent.instId,
    "--side",
    intent.side,
    "--sz",
    intent.sz,
    "--ordType",
    intent.ordType,
    "--px",
    intent.px,
    "--tdMode",
    "cash",
    "--clOrdId",
    clOrdId,
    "--profile",
    options.profile,
  ];

  console.log(`Submitting order with clOrdId: ${clOrdId}`);

  const result = await okxJson(args);

  if (!result.ok) {
    audit.logExecution(args.join(" "), null, result.stderr);
    return {
      intentId: intent.intentId,
      clOrdId,
      ordId: "",
      status: "cancelled",
      submittedAt: new Date().toISOString(),
      exchangeResponse: null,
      error: result.stderr,
    };
  }

  const data = result.data as { ordId?: string; clOrdId?: string };
  const ordId = data?.ordId ?? "";

  console.log(`Order submitted. ordId: ${ordId}, clOrdId: ${clOrdId}`);
  audit.logExecution(args.join(" "), data);

  if (options.cancelAfterSubmit) {
    console.log("Cancel-after-submit mode. Waiting 2s then cancelling...");
    await new Promise((r) => setTimeout(r, 2000));
    const cancelResult = await cancelOrderByClOrdId(clOrdId, intent.instId, options.profile);
    console.log(`Cancel result: ${cancelResult.cancelled ? "SUCCESS" : "FAILED"}`);
  }

  const status = await queryOrderByClOrdId(clOrdId, intent.instId, options.profile);

  return {
    intentId: intent.intentId,
    clOrdId,
    ordId,
    status: status?.state ?? "live",
    submittedAt: new Date().toISOString(),
    exchangeResponse: data,
  };
}
