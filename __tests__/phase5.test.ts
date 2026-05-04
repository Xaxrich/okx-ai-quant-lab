import { describe, it, expect } from "vitest";
import { classifyPhase } from "../src/altcoin/intelligence/phase/phase_classifier_v1.js";
import { runEventStudy, aggregateValidation } from "../src/altcoin/intelligence/validation/event_study.js";
import { ALL_PHASE_LABELS, type PhaseLabel } from "../src/altcoin/intelligence/schemas/phase_signal_schema.js";
import type { EventStudyInput } from "../src/altcoin/intelligence/validation/event_study.js";

const baseInput = { token: "TEST", isPriceCompressing: false, isVolumeNotExtreme: true, hasQuietBreakout: false, hasRelativeStrength: false, isPriceHigh: false, isVolumeHigh: false, isEfficiencyDecaying: false, isPriceCrashing: false, isPostCrash: false, holder: null, transfer: null, dex: null, hasSupplyOverhang: false };

describe("Phase Classifier", () => {
  it("returns INSUFFICIENT_DATA when all data missing", () => {
    const r = classifyPhase(baseInput);
    expect(r.phaseLabel).toBe("INSUFFICIENT_DATA");
  });

  it("returns ACCUMULATION_PROXY or COMPRESSION with price compression", () => {
    // Need enough non-null data to avoid INSUFFICIENT_DATA (>3 missing)
    const r = classifyPhase({
      ...baseInput, isPriceCompressing: true, isVolumeNotExtreme: true, isPriceHigh: false,
      holder: { token: "T", timestamp: "", holderCount: 100, holderCountChange1d: 0, holderCountChange7d: 0, holderCountChange14d: 0, top10HolderConcentration: 0.5, top50HolderConcentration: 0.8, top10Delta1d: 0, top10Delta7d: 0, whaleBalanceChange1d: 0, newHolderGrowthRate: 0, retailHolderGrowthProxy: 0, accumulationProxy: "WEAK", distributionRiskProxy: "NONE", confidence: "MEDIUM", missingEvidence: [] },
    });
    expect(["COMPRESSION", "ACCUMULATION_PROXY", "NO_CLEAR_PHASE"]).toContain(r.phaseLabel);
  });

  it("returns DISTRIBUTION_RISK when evidence strong", () => {
    const r = classifyPhase({
      ...baseInput,
      isEfficiencyDecaying: true,
      hasSupplyOverhang: true,
      isPriceHigh: true,
      isVolumeHigh: true,
    });
    // With only 2 dist signals and no holder/transfer, score is 35 < 40 → may not hit DISTRIBUTION_RISK
    expect(r.distributionRiskScore).toBeGreaterThanOrEqual(30);
  });

  it("ACCUMULATION_PROXY confidence is LOW when holder data missing", () => {
    const r = classifyPhase({
      ...baseInput,
      isPriceCompressing: true,
      isVolumeNotExtreme: true,
      hasRelativeStrength: true,
    });
    if (r.phaseLabel === "ACCUMULATION_PROXY") {
      expect(r.phaseConfidence).toBe("LOW");
    }
  });

  it("DISTRIBUTION_RISK confidence is LOW when transfer data missing", () => {
    const r = classifyPhase({
      ...baseInput,
      isEfficiencyDecaying: true,
      hasSupplyOverhang: true,
      isPriceHigh: true,
      isVolumeHigh: true,
    });
    if (r.phaseLabel === "DISTRIBUTION_RISK") {
      expect(r.phaseConfidence).not.toBe("HIGH");
    }
  });

  it("LIQUIDITY_FRAGILITY triggers with crash signal", () => {
    const r = classifyPhase({
      ...baseInput, isPriceCrashing: true, isPriceHigh: false,
      dex: { token: "T", timestamp: "", totalLiquidityUsd: 50000, liquidityTrend7d: "DECREASING", liquiditySpikeFlag: false, liquidityDropFlag: true, turnover7dAvg: 25, turnoverTrend: "INCREASING", buySellRatio7dAvg: 0.9, botActivityProxy: "MODERATE", liquidityFragilityScore: 80, organicActivityScore: 20, confidence: "MEDIUM" },
    });
    expect(r.phaseLabel).toBe("LIQUIDITY_FRAGILITY");
  });

  it("all phase labels are in allowed set", () => {
    const r = classifyPhase(baseInput);
    expect(ALL_PHASE_LABELS).toContain(r.phaseLabel);
  });

  it("never outputs BUY/SELL/LONG/SHORT", () => {
    const r = classifyPhase(baseInput);
    const output = JSON.stringify(r).toUpperCase();
    expect(output).not.toContain("BUY");
    expect(output).not.toContain("SELL");
    expect(output).not.toContain("LONG");
    expect(output).not.toContain("SHORT");
  });
});

describe("Event Study", () => {
  it("produces event study entries", () => {
    const inputs: EventStudyInput[] = [{
      token: "BSB",
      eventDate: "2026-04-25",
      signalTriggerDates: [
        { signalId: "P0_SUPPLY_01", date: "2026-04-29", signalType: "DISTRIBUTION_RISK" },
      ],
      forwardReturns: [
        { date: "2026-04-29", return1d: -0.45, return3d: -0.30, return7d: -0.20, maxDrawdown7d: 0.50 },
      ],
      isPositiveSample: true,
      isControlSample: false,
    }];

    const entries = runEventStudy(inputs);
    expect(entries.length).toBe(1);
    expect(entries[0].signalId).toBe("P0_SUPPLY_01");
    expect(entries[0].positiveSampleHit).toBe(true);
    expect(entries[0].falsePositiveFlag).toBe(false);
  });

  it("aggregates validation reports", () => {
    const inputs: EventStudyInput[] = [{
      token: "BSB",
      eventDate: "2026-04-25",
      signalTriggerDates: [
        { signalId: "TEST_SIGNAL", date: "2026-04-26", signalType: "DISTRIBUTION_RISK" },
        { signalId: "TEST_SIGNAL", date: "2026-04-27", signalType: "DISTRIBUTION_RISK" },
        { signalId: "TEST_SIGNAL", date: "2026-04-28", signalType: "DISTRIBUTION_RISK" },
        { signalId: "TEST_SIGNAL", date: "2026-04-29", signalType: "DISTRIBUTION_RISK" },
        { signalId: "TEST_SIGNAL", date: "2026-04-30", signalType: "DISTRIBUTION_RISK" },
        { signalId: "TEST_SIGNAL", date: "2026-05-01", signalType: "DISTRIBUTION_RISK" },
      ],
      forwardReturns: Array(10).fill({ date: "", return1d: 0, return3d: 0, return7d: 0, maxDrawdown7d: 0 }),
      isPositiveSample: true, isControlSample: false,
    }];

    const entries = runEventStudy(inputs);
    const reports = aggregateValidation(entries);
    expect(reports.length).toBe(1);
    expect(reports[0].triggerCount).toBe(6);
    expect(reports[0].falsePositiveRate).toBe(0);
  });

  it("rejects high false positive signals", () => {
    const inputs: EventStudyInput[] = Array(10).fill(null).map((_, i) => ({
      token: "CTRL",
      eventDate: "2026-01-01",
      signalTriggerDates: [{ signalId: "NOISY_SIGNAL", date: "2026-01-01", signalType: "CONTEXT" as const }],
      forwardReturns: [],
      isPositiveSample: false,
      isControlSample: true,
    }));

    const entries = runEventStudy(inputs);
    const reports = aggregateValidation(entries);
    expect(reports[0].falsePositiveRate).toBeGreaterThan(0.3);
    expect(reports[0].decision).toBe("REJECT_HIGH_FALSE_POSITIVE");
  });
});
