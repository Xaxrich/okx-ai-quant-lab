import { createOrderIntent, orderIntentToDisplay } from "./order_intent.js";
import { AuditLogger } from "../audit/logger.js";
import { loadRiskPolicy } from "../risk/risk_policy.js";
import { guardOrderIntent } from "../risk/order_guard.js";

const audit = new AuditLogger();

async function main() {
  console.log("=== OKX AI Quant Lab - Dry Run Demo ===\n");

  const policy = loadRiskPolicy();
  console.log(`Risk Policy: mode=${policy.mode}, dryRunByDefault=${policy.dryRunByDefault}`);
  console.log(`Allowed instruments: ${policy.allowedInstruments.join(", ")}`);
  console.log(`Max order notional: $${policy.maxOrderNotionalUSDT}`);
  console.log(`Max daily trades: ${policy.maxDailyTrades}\n`);

  const dailyStats = { tradeCount: 0, dailyLossUSDT: 0 };

  const testIntents = [
    createOrderIntent({
      ts: Date.now(),
      instId: "BTC-USDT",
      side: "buy",
      sz: "0.0001",
      ordType: "market",
      notionalUSDT: 7.8,
      strategyName: "MA Crossover",
      signalReason: "Fast MA crossed above Slow MA",
    }),
    createOrderIntent({
      ts: Date.now(),
      instId: "ETH-USDT",
      side: "sell",
      sz: "0.001",
      ordType: "limit",
      px: "3500",
      notionalUSDT: 3.5,
      strategyName: "RSI Mean Reversion",
      signalReason: "RSI crossed above 70 (overbought)",
    }),
  ];

  console.log("--- Risk-Only Verification (no API calls) ---\n");

  for (const intent of testIntents) {
    console.log(orderIntentToDisplay(intent));

    const guardResult = guardOrderIntent(intent, policy, dailyStats);

    if (guardResult.approved) {
      console.log("RESULT: APPROVED for execution\n");
    } else if (guardResult.pendingApproval) {
      console.log("RESULT: PENDING HUMAN APPROVAL\n");
    } else {
      console.log(`RESULT: REJECTED - ${guardResult.rejectedReason}\n`);
    }

    audit.logRiskCheck(
      intent,
      guardResult.approved,
      guardResult.rejectedReason ?? (guardResult.pendingApproval ? "pending_approval" : undefined)
    );
  }

  console.log("--- Summary ---");
  console.log("All orders processed in dry-run mode.");
  console.log("No actual orders were sent to OKX.");
  console.log(`Audit log written to logs/audit_*.jsonl`);
}

main().catch(console.error);
