import { describe, expect, it } from "vitest";
import {
  aggregateByMarketRegime,
  classifyMarketRegime,
  evaluateSnapshot,
  parseLabeledCandidate,
  type BacktestOptions,
  type LabeledCandidate,
} from "../src/altcoin/intelligence/validation/topk_cross_section_backtest.js";

const opts: BacktestOptions = {
  horizonDays: 7,
  topKs: [2, 3],
  minHitReturn: 0.2,
  rankMetric: "scanner_score",
  excludeLabels: [],
  minTradability: null,
  maxFragility: null,
  minOpportunity: null,
};

function candidate(overrides: Partial<LabeledCandidate>): LabeledCandidate {
  return {
    snapshotId: "s1",
    observedAt: "2026-04-25T00:00:00.000Z",
    token: "AAA",
    category: "meme",
    scannerLabel: "WATCH",
    score: 0,
    dataQualityScore: 1,
    forwardReturn: 0,
    maxDrawdown: 0,
    maxRunup: 0,
    label: "FLAT",
    labelStatus: "OK",
    triggeredRules: "",
    missingRequiredData: "",
    opportunityScore: 0,
    fragilityScore: 0,
    tradabilityScore: 100,
    stateMatrix: "",
    ...overrides,
  };
}

describe("parseLabeledCandidate", () => {
  it("keeps only resolved rows with numeric score and forward return", () => {
    const parsed = parseLabeledCandidate({
      snapshot_id: "snap",
      observed_at: "2026-04-25T00:00:00.000Z",
      token: "LAB",
      category: "current_focus",
      scanner_label: "WATCH_RISK",
      scanner_score: "25",
      data_quality_score: "1",
      fwd_return_7d: "0.653315",
      max_drawdown_7d: "-0.185749",
      max_runup_7d: "0.653315",
      label_7d: "UP_50",
      label_status_7d: "OK",
      triggered_rules: "DEX_TURNOVER_EXTREME",
    }, { horizonDays: 7, rankMetric: "scanner_score" });

    expect(parsed?.token).toBe("LAB");
    expect(parsed?.score).toBe(25);
    expect(parsed?.forwardReturn).toBeCloseTo(0.653315);
  });

  it("drops pending rows", () => {
    const parsed = parseLabeledCandidate({
      scanner_score: "10",
      fwd_return_7d: "0.1",
      label_status_7d: "NO_FUTURE_PRICE",
    }, { horizonDays: 7, rankMetric: "scanner_score" });

    expect(parsed).toBeNull();
  });

  it("applies label and execution filters before ranking", () => {
    const rows = [
      candidate({ token: "AAA", scannerLabel: "WATCH", score: 50, tradabilityScore: 80, fragilityScore: 20, opportunityScore: 60, forwardReturn: 0.3 }),
      candidate({ token: "BBB", scannerLabel: "INSUFFICIENT_DEEP_DATA", score: 100, tradabilityScore: 80, fragilityScore: 20, opportunityScore: 70, forwardReturn: 0.5 }),
      candidate({ token: "CCC", scannerLabel: "WATCH", score: 40, tradabilityScore: 10, fragilityScore: 20, opportunityScore: 60, forwardReturn: -0.1 }),
      candidate({ token: "DDD", scannerLabel: "WATCH", score: 30, tradabilityScore: 80, fragilityScore: 80, opportunityScore: 60, forwardReturn: -0.1 }),
    ];

    const result = evaluateSnapshot(rows, {
      ...opts,
      topKs: [2],
      excludeLabels: ["INSUFFICIENT_DEEP_DATA"],
      minTradability: 40,
      maxFragility: 60,
      minOpportunity: 40,
    });

    expect(result.summaries[0].selectedCount).toBe(1);
    expect(result.summaries[0].bestToken).toBe("AAA");
  });
});

describe("evaluateSnapshot", () => {
  it("computes topK precision, excess return, and false positives", () => {
    const rows = [
      candidate({ token: "AAA", score: 50, forwardReturn: 0.4, maxDrawdown: -0.05 }),
      candidate({ token: "BBB", score: 40, forwardReturn: -0.1, maxDrawdown: -0.2 }),
      candidate({ token: "CCC", score: 30, forwardReturn: 0.25, maxDrawdown: -0.03 }),
      candidate({ token: "DDD", score: 20, forwardReturn: 0.05, maxDrawdown: -0.01 }),
    ];

    const result = evaluateSnapshot(rows, opts);
    const top2 = result.summaries.find((summary) => summary.topK === 2)!;
    const top3 = result.summaries.find((summary) => summary.topK === 3)!;

    expect(top2.selectedCount).toBe(2);
    expect(top2.hitCount).toBe(1);
    expect(top2.precision).toBeCloseTo(0.5);
    expect(top2.avgForwardReturn).toBeCloseTo(0.15);
    expect(top2.universeAvgForwardReturn).toBeCloseTo(0.15);
    expect(top2.excessAvgForwardReturn).toBeCloseTo(0);
    expect(top2.bestToken).toBe("AAA");
    expect(top2.worstToken).toBe("BBB");

    expect(top3.hitCount).toBe(2);
    expect(result.falsePositives.filter((row) => row.topK === 2)).toHaveLength(1);
    expect(result.falsePositives.find((row) => row.token === "BBB")?.reason).toBe("NEGATIVE_RETURN");
  });

  it("adds point-in-time market regime and aggregates results by regime", () => {
    const rows = [
      candidate({ token: "AAA", score: 50, forwardReturn: 0.4 }),
      candidate({ token: "BBB", score: 40, forwardReturn: -0.1 }),
    ];

    const result = evaluateSnapshot(rows, { ...opts, topKs: [2] }, {
      marketRegime: "BTC_UPTREND",
      btcReturn7d: 0.08,
      btcReturn30d: 0.12,
      source: "test",
    });
    const regimeRows = aggregateByMarketRegime(result.summaries);

    expect(result.summaries[0].marketRegime).toBe("BTC_UPTREND");
    expect(regimeRows[0].marketRegime).toBe("BTC_UPTREND");
    expect(regimeRows[0].selectedCount).toBe(2);
    expect(regimeRows[0].precision).toBeCloseTo(0.5);
  });
});

describe("classifyMarketRegime", () => {
  it("classifies BTC-only point-in-time regimes without future returns", () => {
    expect(classifyMarketRegime({ btcReturn7d: 0.06, btcReturn30d: 0.08 })).toBe("BTC_UPTREND");
    expect(classifyMarketRegime({ btcReturn7d: -0.06, btcReturn30d: 0.01 })).toBe("BTC_DOWNTREND");
    expect(classifyMarketRegime({ btcReturn7d: 0.01, btcReturn30d: 0.03 })).toBe("BTC_RANGE");
    expect(classifyMarketRegime({ btcReturn7d: null, btcReturn30d: 0.03 })).toBe("REGIME_DATA_MISSING");
  });
});
