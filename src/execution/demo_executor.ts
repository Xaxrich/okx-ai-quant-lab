import { okxJson } from "../connectors/okx_cli.js";
import { AuditLogger } from "../audit/logger.js";
import type { OrderIntent } from "./order_intent.js";
import { orderIntentToDisplay } from "./order_intent.js";
import type { RiskPolicy } from "../risk/risk_policy.js";
import { guardOrderIntent } from "../risk/order_guard.js";

const audit = new AuditLogger();

export interface DemoExecutorOptions {
  executeDemo: boolean;
  riskPolicy: RiskPolicy;
  dailyStats: { tradeCount: number; dailyLossUSDT: number };
}

export async function demoExecuteOrder(
  intent: OrderIntent,
  options: DemoExecutorOptions
): Promise<{ executed: boolean; orderId?: string; error?: string; dryRun: boolean }> {
  const dryRun = !options.executeDemo || options.riskPolicy.dryRunByDefault;

  const guardResult = guardOrderIntent(intent, options.riskPolicy, options.dailyStats);

  console.log(orderIntentToDisplay(intent));

  if (!guardResult.approved) {
    if (guardResult.pendingApproval) {
      console.log("STATUS: PENDING HUMAN APPROVAL");
      console.log(JSON.stringify(guardResult.details, null, 2));
      audit.logRiskCheck(intent, false, "pending_human_approval");
      return { executed: false, dryRun: true, error: "Human approval required" };
    }

    console.log(`REJECTED: ${guardResult.rejectedReason}`);
    audit.logRiskCheck(intent, false, guardResult.rejectedReason);
    return { executed: false, dryRun: true, error: guardResult.rejectedReason };
  }

  if (dryRun) {
    console.log("DRY RUN - No actual order placed.");
    console.log("To execute demo orders, pass --execute-demo flag.");
    audit.logOrderIntent(intent, "dry_run");
    return { executed: false, dryRun: true };
  }

  console.log("Placing demo order...");
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
  ];

  if (intent.px && intent.ordType === "limit") {
    args.push("--px", intent.px);
  }

  const result = await okxJson(args);

  if (!result.ok) {
    console.error(`Order failed: ${result.stderr}`);
    audit.logExecution(args.join(" "), null, result.stderr);
    return { executed: false, dryRun: false, error: result.stderr };
  }

  const data = result.data as { ordId?: string };
  console.log(`Order placed successfully. Order ID: ${data?.ordId ?? "unknown"}`);
  audit.logExecution(args.join(" "), data);

  return { executed: true, orderId: data?.ordId, dryRun: false };
}
