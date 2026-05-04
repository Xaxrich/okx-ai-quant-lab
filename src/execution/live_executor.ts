import type { OrderIntent } from "./order_intent.js";
import type { RiskPolicy } from "../risk/risk_policy.js";

export async function liveExecuteOrder(
  _intent: OrderIntent,
  _riskPolicy: RiskPolicy
): Promise<never> {
  throw new Error(
    "Live trading is disabled by policy. Use demo mode first.\n" +
      "To enable live trading, you must:\n" +
      "1. Set LIVE_TRADING_ENABLED=true (currently disabled)\n" +
      "2. Use config/risk_policy.live.yaml\n" +
      "3. Set allowLiveTrading: true in risk policy\n" +
      "4. Obtain explicit human approval\n" +
      "5. Configure OKX live profile credentials"
  );
}
