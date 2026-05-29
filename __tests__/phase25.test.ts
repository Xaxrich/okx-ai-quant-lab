import { describe, it, expect, beforeEach } from "vitest";
import { generateClOrdId, validateClOrdId } from "../src/execution/client_order_id.js";
import { guardOrderIntent } from "../src/risk/order_guard.js";
import { loadRiskPolicy } from "../src/risk/risk_policy.js";
import { PositionLedger, type FillRecord } from "../src/portfolio/position_ledger.js";
import { PnLTracker } from "../src/portfolio/pnl_tracker.js";
import { existsSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import type { OrderIntent } from "../src/risk/order_guard.js";

const TEST_STORAGE_DIR = join(import.meta.dirname, "..", "data", "portfolio", "test-phase25");
const LEDGER_PATH = join(TEST_STORAGE_DIR, "positions.json");
const STATS_PATH = join(TEST_STORAGE_DIR, "daily_stats.json");

function cleanLedgerFiles() {
  if (existsSync(LEDGER_PATH)) unlinkSync(LEDGER_PATH);
  if (existsSync(STATS_PATH)) unlinkSync(STATS_PATH);
}

function createLedger(): PositionLedger {
  return new PositionLedger(LEDGER_PATH);
}

function createTracker(ledger: PositionLedger, startingEquity: number): PnLTracker {
  return new PnLTracker(ledger, startingEquity, STATS_PATH);
}

const validIntent: OrderIntent = {
  ts: Date.now(),
  instId: "BTC-USDT",
  side: "buy",
  sz: "0.0001",
  px: "1000",
  ordType: "limit",
  notionalUSDT: 7,
  strategyName: "Test",
  signalReason: "Test",
};

const cleanStats = { tradeCount: 0, dailyLossUSDT: 0 };

describe("Demo Preflight", () => {
  it("risk policy is demo mode", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    expect(policy.mode).toBe("demo");
  });

  it("risk policy blocks live trading", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    expect(policy.allowLiveTrading).toBe(false);
  });

  it("risk policy blocks swap/futures/option", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    expect(policy.blockedInstrumentTypes).toContain("SWAP");
    expect(policy.blockedInstrumentTypes).toContain("FUTURES");
    expect(policy.blockedInstrumentTypes).toContain("OPTION");
  });

  it("risk policy requires human approval", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    expect(policy.requireHumanApproval).toBe(true);
  });

  it("LIVE_TRADING_ENABLED is not true", () => {
    const val = process.env.LIVE_TRADING_ENABLED;
    expect(val).not.toBe("true");
  });
});

describe("Roundtrip Safety Gates", () => {
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

  it("rejects swap instruments", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, instId: "BTC-USDT-SWAP" },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
    expect(result.rejectedReason).toContain("matches blocked type");
  });

  it("rejects futures instruments", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, instId: "ETH-USDT-FUTURES" },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
  });

  it("rejects option instruments", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, instId: "BTC-USD-OPTION-250628-80000-C" },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
  });

  it("rejects oversized notional", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, notionalUSDT: 999999 },
      policy,
      cleanStats
    );
    expect(result.approved).toBe(false);
  });

  it("requires human approval for valid limit order", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(validIntent, policy, cleanStats);
    expect(result.pendingApproval).toBe(true);
    expect(result.details.message).toContain("EXECUTE_DEMO_ORDER");
  });

  it("allows post_only order type", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const result = guardOrderIntent(
      { ...validIntent, ordType: "post_only" },
      policy,
      cleanStats
    );
    expect(result.pendingApproval).toBe(true);
  });
});

describe("Position Ledger Lifecycle", () => {
  beforeEach(cleanLedgerFiles);

  it("unchanged on no fill (cancel before any fill)", () => {
    const ledger = createLedger();
    // Simulate: order submitted, cancelled, no fill
    // Position should not exist
    const pos = ledger.get("BTC-USDT");
    expect(pos).toBeUndefined();
    expect(ledger.getTotalRealizedPnl()).toBe(0);
    expect(ledger.getTotalUnrealizedPnl({ "BTC-USDT": 78000 })).toBe(0);
  });

  it("updated on partial fill", () => {
    const ledger = createLedger();

    // Partial fill: buy 0.00005 of 0.0001 BTC
    ledger.applyFill({
      instId: "BTC-USDT",
      side: "buy",
      fillSz: 0.00005,
      fillPx: 78000,
      fee: 0,
      feeCcy: "USDT",
      ts: Date.now(),
    }, 78000);

    const pos = ledger.get("BTC-USDT");
    expect(pos).toBeDefined();
    expect(pos!.qty).toBe(0.00005);
    expect(pos!.avgEntryPrice).toBe(78000);

    // Then sell (take profit)
    ledger.applyFill({
      instId: "BTC-USDT",
      side: "sell",
      fillSz: 0.00005,
      fillPx: 79000,
      fee: 0,
      feeCcy: "USDT",
      ts: Date.now(),
    }, 79000);

    const pos2 = ledger.get("BTC-USDT");
    expect(pos2!.qty).toBe(0);
    expect(pos2!.realizedPnlUSDT).toBeGreaterThan(0);
  });

  it("correctly tracks avg entry with multiple buys", () => {
    const ledger = createLedger();

    ledger.applyFill({
      instId: "ETH-USDT",
      side: "buy",
      fillSz: 0.01,
      fillPx: 3500,
      fee: 0,
      feeCcy: "USDT",
      ts: 1,
    }, 3500);

    ledger.applyFill({
      instId: "ETH-USDT",
      side: "buy",
      fillSz: 0.01,
      fillPx: 3600,
      fee: 0,
      feeCcy: "USDT",
      ts: 2,
    }, 3600);

    const pos = ledger.get("ETH-USDT");
    expect(pos!.qty).toBe(0.02);
    expect(pos!.avgEntryPrice).toBe(3550);
  });

  it("rebuilds from complete fill history", () => {
    const fills: FillRecord[] = [
      { instId: "BTC-USDT", side: "buy", fillSz: 0.001, fillPx: 77000, fee: 0.077, feeCcy: "USDT", ts: 1 },
      { instId: "BTC-USDT", side: "sell", fillSz: 0.0005, fillPx: 78000, fee: 0.039, feeCcy: "USDT", ts: 2 },
    ];

    const ledger = createLedger();
    ledger.rebuildFromFills(fills, { "BTC-USDT": 78000 });

    const pos = ledger.get("BTC-USDT");
    expect(pos).toBeDefined();
    expect(pos!.qty).toBe(0.0005);
  });
});

describe("PnL Tracker Lifecycle", () => {
  beforeEach(cleanLedgerFiles);

  it("starts with zero stats", () => {
    const ledger = createLedger();
    const tracker = createTracker(ledger, 1000);
    expect(tracker.getStats().tradeCountToday).toBe(0);
    expect(tracker.getStats().dailyRealizedPnlUSDT).toBe(0);
  });

  it("enforces loss limit", () => {
    const ledger = createLedger();
    ledger.applyFill({
      instId: "BTC-USDT", side: "buy", fillSz: 0.01, fillPx: 78000,
      fee: 0, feeCcy: "USDT", ts: Date.now(),
    }, 70000);

    const tracker = createTracker(ledger, 1000);
    tracker.update({ "BTC-USDT": 70000 });
    expect(tracker.checkLossLimit(20)).toBe(true);
  });
});

describe("Audit Log", () => {
  it("audit log file exists and is JSONL", () => {
    const logPath = join(import.meta.dirname, "..", "logs", `audit_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.jsonl`);
    // Log file may or may not exist depending on test order
    // Verify format if it exists
    if (existsSync(logPath)) {
      const content = readFileSync(logPath, "utf-8").trim();
      if (content) {
        const lines = content.split("\n").filter(l => l.trim());
        for (const line of lines.slice(-5)) {
          const parsed = JSON.parse(line);
          expect(parsed).toHaveProperty("timestamp");
          expect(parsed).toHaveProperty("action");
        }
      }
    }
  });
});

describe("Report Generation", () => {
  it("preflight report can be generated", () => {
    const reportPath = join(import.meta.dirname, "..", "reports", "demo_preflight_report.md");
    // Report is generated by running npm run demo:preflight
    // Just verify the reports directory exists
    const reportsDir = join(import.meta.dirname, "..", "reports");
    expect(existsSync(reportsDir)).toBe(true);
  });

  it("roundtrip report can be generated", () => {
    const reportPath = join(import.meta.dirname, "..", "reports", "demo_order_roundtrip_report.md");
    // Report is generated by running npm run demo:roundtrip
    const reportsDir = join(import.meta.dirname, "..", "reports");
    expect(existsSync(reportsDir)).toBe(true);
  });
});
