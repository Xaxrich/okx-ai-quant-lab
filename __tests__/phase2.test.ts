import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { generateClOrdId, validateClOrdId } from "../src/execution/client_order_id.js";
import { guardOrderIntent } from "../src/risk/order_guard.js";
import { loadRiskPolicy } from "../src/risk/risk_policy.js";
import { PositionLedger, type FillRecord } from "../src/portfolio/position_ledger.js";
import { PnLTracker } from "../src/portfolio/pnl_tracker.js";
import type { OrderIntent } from "../src/risk/order_guard.js";

const LEDGER_PATH = join(import.meta.dirname, "..", "data", "portfolio", "positions.json");
const STATS_PATH = join(import.meta.dirname, "..", "data", "portfolio", "daily_stats.json");

function cleanLedgerFiles() {
  if (existsSync(LEDGER_PATH)) unlinkSync(LEDGER_PATH);
  if (existsSync(STATS_PATH)) unlinkSync(STATS_PATH);
}

const cleanStats = { tradeCount: 0, dailyLossUSDT: 0 };

const validIntent: OrderIntent = {
  ts: Date.now(),
  instId: "BTC-USDT",
  side: "buy",
  sz: "0.0001",
  ordType: "limit",
  px: "70000",
  notionalUSDT: 7,
  strategyName: "Test",
  signalReason: "Test",
};

describe("clOrdId", () => {
  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateClOrdId();
      expect(validateClOrdId(id)).toBe(true);
      expect(id.length).toBeLessThanOrEqual(32);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });
});

describe("Risk Guard Phase 2", () => {
  it("rejects live mode", () => {
    const policy = loadRiskPolicy("config/risk_policy.live.yaml");
    const result = guardOrderIntent(validIntent, policy, cleanStats);
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("Live trading is disabled");
  });

  it("rejects market orders", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, ordType: "market" },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("Market orders are prohibited");
  });

  it("rejects oversized orders", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, notionalUSDT: 999999 },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("exceeds max");
  });

  it("rejects unsupported instrument", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, instId: "SOL-USDT" },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("not in allowed list");
  });

  it("rejects swaps", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, instId: "BTC-USDT-SWAP" },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("matches blocked type");
  });

  it("rejects futures", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, instId: "ETH-USDT-FUTURES" },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("matches blocked type");
  });

  it("requires human approval for valid orders", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(validIntent, policy, cleanStats);
    expect(result.approved).toBe(false);
    expect(result.pendingApproval).toBe(true);
  });

  it("rejects when daily trade limit reached", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(validIntent, policy, {
      ...cleanStats,
      tradeCount: 999,
    });
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("Daily trade limit");
  });
});

describe("Position Ledger", () => {
  beforeEach(cleanLedgerFiles);

  it("tracks positions from fills", () => {
    const ledger = new PositionLedger();

    ledger.applyFill({
      instId: "BTC-USDT",
      side: "buy",
      fillSz: 0.001,
      fillPx: 78000,
      fee: 0.078,
      feeCcy: "USDT",
      ts: Date.now(),
    }, 78000);

    const pos = ledger.get("BTC-USDT");
    expect(pos).toBeDefined();
    expect(pos!.qty).toBe(0.001);
    expect(pos!.avgEntryPrice).toBe(78000);
  });

  it("handles partial fills", () => {
    const ledger = new PositionLedger();

    ledger.applyFill({
      instId: "ETH-USDT",
      side: "buy",
      fillSz: 0.01,
      fillPx: 3500,
      fee: 0.035,
      feeCcy: "USDT",
      ts: Date.now(),
    }, 3500);

    ledger.applyFill({
      instId: "ETH-USDT",
      side: "sell",
      fillSz: 0.005,
      fillPx: 3600,
      fee: 0.018,
      feeCcy: "USDT",
      ts: Date.now(),
    }, 3600);

    const pos = ledger.get("ETH-USDT");
    expect(pos).toBeDefined();
    expect(pos!.qty).toBe(0.005);
  });

  it("calculates unrealized PnL", () => {
    const ledger = new PositionLedger();

    ledger.applyFill({
      instId: "BTC-USDT",
      side: "buy",
      fillSz: 0.001,
      fillPx: 78000,
      fee: 0,
      feeCcy: "USDT",
      ts: Date.now(),
    }, 78000);

    const unrealized = ledger.getUnrealizedPnl("BTC-USDT", 80000);
    expect(unrealized).toBe(2); // (80000 - 78000) * 0.001
  });

  it("rebuilds from fills", () => {
    const fills: FillRecord[] = [
      { instId: "BTC-USDT", side: "buy", fillSz: 0.001, fillPx: 78000, fee: 0, feeCcy: "USDT", ts: 1 },
    ];

    const ledger = new PositionLedger();
    ledger.rebuildFromFills(fills, { "BTC-USDT": 79000 });
    expect(ledger.getTotalUnrealizedPnl({ "BTC-USDT": 79000 })).toBe(1);
  });
});

describe("PnL Tracker", () => {
  beforeEach(cleanLedgerFiles);

  it("starts at given equity", () => {
    const ledger = new PositionLedger();
    const tracker = new PnLTracker(ledger, 1000);
    expect(tracker.getStats().startingEquity).toBe(1000);
  });

  it("tracks trade count", () => {
    const ledger = new PositionLedger();
    const tracker = new PnLTracker(ledger, 1000);
    tracker.recordTrade();
    expect(tracker.getStats().tradeCountToday).toBe(1);
  });

  it("checks loss limit", () => {
    const ledger = new PositionLedger();
    ledger.applyFill({
      instId: "BTC-USDT", side: "buy", fillSz: 0.01, fillPx: 78000,
      fee: 0, feeCcy: "USDT", ts: Date.now(),
    }, 70000);

    const tracker = new PnLTracker(ledger, 1000);
    tracker.update({ "BTC-USDT": 70000 });
    expect(tracker.checkLossLimit(20)).toBe(true);
  });
});

describe("Strategy Admission", () => {
  it("rejects strategies with insufficient data", () => {
    const result = {
      strategyName: "Test Strategy",
      instId: "BTC-USDT",
      bar: "1H",
      level: "REJECTED",
      reasons: ["Trade count (5) < min (30)", "Test windows (1) < min (8)"],
      metrics: { tradeCount: 5, testWindows: 1 },
    };
    expect(result.level).toBe("REJECTED");
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
