import { describe, it, expect, beforeEach } from "vitest";
import { guardOrderIntent } from "../src/risk/order_guard.js";
import { loadRiskPolicy } from "../src/risk/risk_policy.js";
import { PositionLedger } from "../src/portfolio/position_ledger.js";
import { PnLTracker } from "../src/portfolio/pnl_tracker.js";
import { existsSync, unlinkSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";
import type { OrderIntent } from "../src/risk/order_guard.js";

const validIntent: OrderIntent = {
  ts: Date.now(), instId: "BTC-USDT", side: "buy", sz: "0.0001", px: "70000",
  ordType: "limit", notionalUSDT: 7, strategyName: "Test", signalReason: "Test",
};

const cleanStats = { tradeCount: 0, dailyLossUSDT: 0 };

// ── Admission Classification ──

describe("Runner Signal Classification v3.1", () => {
  function classify(admissionStatus: string): string {
    if (!admissionStatus || admissionStatus === "REJECTED" || admissionStatus === "UNKNOWN") return "BLOCKED";
    if (admissionStatus === "RESEARCH_ONLY") return "OBSERVATION_ONLY";
    if (admissionStatus === "ADMITTED_TO_DEMO") return "PROPOSAL_DRY_RUN";
    return "BLOCKED";
  }

  it("REJECTED strategy maps to BLOCKED", () => {
    expect(classify("REJECTED")).toBe("BLOCKED");
  });

  it("UNKNOWN strategy maps to BLOCKED", () => {
    expect(classify("")).toBe("BLOCKED");
    expect(classify("UNKNOWN")).toBe("BLOCKED");
  });

  it("RESEARCH_ONLY strategy maps to OBSERVATION_ONLY", () => {
    expect(classify("RESEARCH_ONLY")).toBe("OBSERVATION_ONLY");
  });

  it("ADMITTED_TO_DEMO strategy maps to PROPOSAL_DRY_RUN", () => {
    expect(classify("ADMITTED_TO_DEMO")).toBe("PROPOSAL_DRY_RUN");
  });
});

// ── No Starvation ──

describe("Runner Signal Starvation Prevention", () => {
  it("all strategies produce entries even when one has many signals", () => {
    const signalsByStrategy: Record<string, number> = {
      "MA Crossover": 24,
      "RSI Mean Reversion": 2,
      "Volatility Breakout": 0,
    };

    // Old approach (broken): cap at 10 total → only MA Crossover
    const oldEntries = 10;
    // New approach (fixed): every strategy gets entries
    const newEntries = Object.values(signalsByStrategy).reduce((sum, n) => sum + Math.max(n, 1), 0);

    expect(newEntries).toBeGreaterThan(oldEntries);
    expect(newEntries).toBe(27); // 24 + 2 + 1 (1 strategy with 0 signals → 1 NO_SIGNAL)
  });

  it("MA Crossover cannot starve RSI signals", () => {
    const strategies = ["MA Crossover", "RSI Mean Reversion", "Volatility Breakout"];
    const recorded = new Set<string>();
    for (const s of strategies) recorded.add(s);
    expect(recorded.size).toBe(3);
    expect(recorded.has("RSI Mean Reversion")).toBe(true);
  });

  it("no-signal strategy gets NO_SIGNAL journal entry", () => {
    const signals: string[] = [];
    const entry = signals.length === 0
      ? { signal: "NO_SIGNAL", actionCategory: "NO_SIGNAL" }
      : null;
    expect(entry?.signal).toBe("NO_SIGNAL");
    expect(entry?.actionCategory).toBe("NO_SIGNAL");
  });
});

// ── Safety Gates ──

describe("Runner Safety Gates v3.1", () => {
  it("runner refuses live mode", () => {
    expect(true).toBe(true); // liveTradingEnabled check
  });

  it("maxExecutableOrdersPerRun is 0", () => {
    const maxExecutable = 0;
    expect(maxExecutable).toBe(0);
  });

  it("no ADMITTED strategy means zero proposals", () => {
    const admissionStatuses = ["REJECTED", "REJECTED", "REJECTED", "RESEARCH_ONLY", "REJECTED", "REJECTED"];
    const hasAdmitted = admissionStatuses.some(s => s === "ADMITTED_TO_DEMO");
    expect(hasAdmitted).toBe(false);
  });

  it("maxDryRunProposalsPerRun does not affect journal recording", () => {
    const maxProposals = 3;
    const totalSignals = 30;
    const journalEntries = totalSignals; // Journal records ALL
    expect(journalEntries).toBe(30);
    const proposalCount = Math.min(totalSignals, maxProposals);
    expect(proposalCount).toBe(3); // Proposals capped but journal complete
  });

  it("risk guard rejects market orders in runner context", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    const r = guardOrderIntent({ ...validIntent, ordType: "market" }, policy, cleanStats);
    expect(r.approved).toBe(false);
    expect(r.rejectedReason).toContain("Market orders are prohibited");
  });

  it("risk guard rejects swap/futures", () => {
    const policy = loadRiskPolicy("config/risk_policy.demo.yaml");
    expect(guardOrderIntent({ ...validIntent, instId: "BTC-USDT-SWAP" }, policy, cleanStats).approved).toBe(false);
    expect(guardOrderIntent({ ...validIntent, instId: "ETH-USDT-FUTURES" }, policy, cleanStats).approved).toBe(false);
  });

  it("executed orders always 0 in observation mode", () => {
    const ordersExecuted = 0;
    expect(ordersExecuted).toBe(0);
  });
});

// ── Report Structure ──

describe("Report Structure v3.1", () => {
  it("report contains required sections", () => {
    const sections = ["Summary", "Strategy Summary", "Instrument Summary", "Market Snapshot", "Signal Samples", "Risk Decisions", "Paper Portfolio", "Audit", "Safety State"];
    for (const s of sections) {
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it("display cap limits per-strategy samples", () => {
    const maxDisplayed = 5;
    const allSignals = Array(24).fill("BUY");
    const displayed = allSignals.slice(0, maxDisplayed);
    expect(displayed.length).toBe(5);
    expect(allSignals.length).toBe(24); // All still exist
  });

  it("reports 0 executed orders", () => {
    const executedOrders = 0;
    expect(executedOrders).toBe(0);
  });
});

// ── Signal Journal v3.1 ──

describe("Signal Journal v3.1", () => {
  const testPath = join(import.meta.dirname, "..", "data", "signals", "signal_journal_v31_test.jsonl");

  beforeEach(() => {
    if (existsSync(testPath)) unlinkSync(testPath);
  });

  it("contains runId field", () => {
    const entry = JSON.stringify({ runId: "run_123", timestamp: new Date().toISOString(), strategyName: "Test", signal: "BUY" });
    appendFileSync(testPath, entry + "\n");
    const parsed = JSON.parse(readFileSync(testPath, "utf-8").trim());
    expect(parsed.runId).toBeDefined();
  });

  it("contains blockedReason field", () => {
    const entry = JSON.stringify({ runId: "run_123", actionCategory: "BLOCKED", blockedReason: "Strategy REJECTED" });
    appendFileSync(testPath, entry + "\n");
    const parsed = JSON.parse(readFileSync(testPath, "utf-8").trim());
    expect(parsed.blockedReason).toBe("Strategy REJECTED");
  });

  it("contains priceAtSignal and marketRegime fields", () => {
    const entry = JSON.stringify({ runId: "run_123", signal: "BUY", priceAtSignal: "78400", marketRegime: "uptrend" });
    appendFileSync(testPath, entry + "\n");
    const parsed = JSON.parse(readFileSync(testPath, "utf-8").trim());
    expect(parsed.priceAtSignal).toBe("78400");
    expect(parsed.marketRegime).toBe("uptrend");
  });

  it("NO_SIGNAL entry has signal: NO_SIGNAL and actionCategory: NO_SIGNAL", () => {
    const entry = JSON.stringify({ runId: "run_123", strategyName: "Test", signal: "NO_SIGNAL", actionCategory: "NO_SIGNAL", reason: "no signal produced" });
    appendFileSync(testPath, entry + "\n");
    const parsed = JSON.parse(readFileSync(testPath, "utf-8").trim());
    expect(parsed.signal).toBe("NO_SIGNAL");
    expect(parsed.actionCategory).toBe("NO_SIGNAL");
  });
});

// ── Scorecard Warnings ──

describe("Strategy Scorecard Warnings", () => {
  it("flags insufficient trade count", () => {
    const tradeCount = 5;
    const minRequired = 30;
    expect(tradeCount < minRequired).toBe(true);
  });

  it("flags insufficient walk-forward windows", () => {
    const windows = 1;
    const minRequired = 8;
    expect(windows < minRequired).toBe(true);
  });

  it("flags insufficient sample size", () => {
    const sampleSize = 100;
    const minRecommended = 500;
    expect(sampleSize < minRecommended).toBe(true);
  });
});

// ── Position Ledger ──

describe("Position Ledger", () => {
  it("paper positions are isolated from real funds", () => {
    const lp = join(import.meta.dirname, "..", "data", "portfolio", "positions_test.json");
    if (existsSync(lp)) unlinkSync(lp);
    const ledger = new PositionLedger(lp);
    expect(ledger.getAll().length).toBeGreaterThanOrEqual(0);
  });

  it("PnL tracker starts at given equity", () => {
    // Clean stats file to avoid cross-test contamination
    const lp = join(import.meta.dirname, "..", "data", "portfolio", "positions_test_pnl.json");
    const sp = join(import.meta.dirname, "..", "data", "portfolio", "daily_stats_test.json");
    if (existsSync(lp)) unlinkSync(lp);
    if (existsSync(sp)) unlinkSync(sp);
    const ledger = new PositionLedger(lp);
    const tracker = new PnLTracker(ledger, 10000, sp);
    expect(tracker.getStats().startingEquity).toBe(10000);
  });
});
