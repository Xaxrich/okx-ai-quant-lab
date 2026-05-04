import type { RiskPolicy } from "./risk_policy.js";

export interface OrderIntent {
  ts: number;
  instId: string;
  side: "buy" | "sell";
  sz: string;
  px?: string;
  ordType: "market" | "limit" | "post_only";
  notionalUSDT: number;
  strategyName: string;
  signalReason: string;
}

export interface GuardResult {
  approved: boolean;
  rejectedReason?: string;
  pendingApproval?: boolean;
  details: Record<string, unknown>;
}

export interface DailyStatsInput {
  tradeCount: number;
  dailyLossUSDT: number;
  lossLimitHit?: boolean;
}

export function guardOrderIntent(
  intent: OrderIntent,
  policy: RiskPolicy,
  dailyStats: DailyStatsInput
): GuardResult {
  // 1. Live mode always rejected
  if (policy.mode === "live" && !policy.allowLiveTrading) {
    return {
      approved: false,
      rejectedReason: "Live trading is disabled by policy (allowLiveTrading: false)",
      details: { policy },
    };
  }

  // 2. Blocked instrument types (SWAP, FUTURES, OPTION)
  for (const blocked of policy.blockedInstrumentTypes) {
    const instUpper = intent.instId.toUpperCase();
    if (instUpper.includes(blocked.toUpperCase())) {
      return {
        approved: false,
        rejectedReason: `Instrument ${intent.instId} matches blocked type: ${blocked}`,
        details: { intent, blocked },
      };
    }
  }

  // 3. Instrument must be in allowed list
  if (!policy.allowedInstruments.includes(intent.instId)) {
    return {
      approved: false,
      rejectedReason: `Instrument ${intent.instId} not in allowed list: ${policy.allowedInstruments.join(", ")}`,
      details: { intent, policy },
    };
  }

  // 4. No market orders
  if (intent.ordType === "market") {
    return {
      approved: false,
      rejectedReason: "Market orders are prohibited. Use limit or post_only.",
      details: { intent },
    };
  }

  // 5. Notional limit
  if (intent.notionalUSDT > policy.maxOrderNotionalUSDT) {
    return {
      approved: false,
      rejectedReason: `Order notional ${intent.notionalUSDT} exceeds max ${policy.maxOrderNotionalUSDT}`,
      details: { intent, policy },
    };
  }

  // 6. Daily trade count
  if (dailyStats.tradeCount >= policy.maxDailyTrades) {
    return {
      approved: false,
      rejectedReason: `Daily trade limit reached: ${dailyStats.tradeCount}/${policy.maxDailyTrades}`,
      details: { intent, dailyStats },
    };
  }

  // 7. Daily loss limit (from PnL tracker if available)
  if (dailyStats.lossLimitHit) {
    return {
      approved: false,
      rejectedReason: "Daily loss limit hit. No further orders allowed today.",
      details: { intent, dailyStats },
    };
  }

  if (dailyStats.dailyLossUSDT <= -policy.maxDailyLossUSDT) {
    return {
      approved: false,
      rejectedReason: `Daily loss limit exceeded: ${dailyStats.dailyLossUSDT.toFixed(2)} / -${policy.maxDailyLossUSDT}`,
      details: { intent, dailyStats, policy },
    };
  }

  // 8. Human approval
  if (policy.requireHumanApproval) {
    return {
      approved: false,
      pendingApproval: true,
      details: {
        message: "Human approval required. Use confirmation phrase EXECUTE_DEMO_ORDER.",
        intent,
        policy,
      },
    };
  }

  return {
    approved: true,
    details: { intent, policy },
  };
}
