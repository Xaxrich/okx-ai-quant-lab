import { describe, it, expect } from "vitest";
import { guardOrderIntent } from "../src/risk/order_guard.js";
import type { OrderIntent } from "../src/execution/order_intent.js";
import { loadRiskPolicy } from "../src/risk/risk_policy.js";

const demoIntent: OrderIntent = {
  ts: Date.now(),
  instId: "BTC-USDT",
  side: "buy",
  sz: "0.0001",
  px: "70000",
  ordType: "limit",
  notionalUSDT: 10,
  strategyName: "MA Crossover",
  signalReason: "Test signal",
};

const cleanStats = { tradeCount: 0, dailyLossUSDT: 0 };

describe("Order Guard", () => {
  it("rejects when live trading is disabled", () => {
    const policy = loadRiskPolicy("config/risk_policy.live.yaml");
    const result = guardOrderIntent(demoIntent, policy, cleanStats);
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("Live trading is disabled");
  });

  it("rejects instruments not in allowed list", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...demoIntent, instId: "SOL-USDT" },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("not in allowed list");
  });

  it("rejects blocked instrument types", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...demoIntent, instId: "BTC-USDT-SWAP" },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("matches blocked type");
  });

  it("rejects order exceeding max notional", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...demoIntent, notionalUSDT: 999999 },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("exceeds max");
  });

  it("rejects when daily trade limit reached", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(demoIntent, policy, {
      tradeCount: 999,
      dailyLossUSDT: 0,
    });
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("Daily trade limit");
  });

  it("requires human approval in demo mode", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(demoIntent, policy, cleanStats);
    expect(result.approved).toBe(false);
    expect(result.pendingApproval).toBe(true);
    expect(result.details.message).toContain("Human approval required");
  });
});
