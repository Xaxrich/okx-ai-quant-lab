import { describe, expect, it } from "vitest";
import { classifyQualifiedSubset } from "../src/altcoin/intelligence/onchain/qualified_subset_scan.js";

describe("classifyQualifiedSubset", () => {
  it("includes ready long ambush candidates", () => {
    const result = classifyQualifiedSubset({
      readinessDecision: "READY_FOR_DEEP_SCAN",
      primaryDirection: "LONG_AMBUSH",
      longBucket: "LONG_AMBUSH",
      shortBucket: "NO_SHORT",
      confidence: "HIGH",
    });

    expect(result.included).toBe(true);
    expect(result.side).toBe("LONG");
    expect(result.scanBucket).toBe("LONG_AMBUSH_SCAN");
    expect(result.executionGate).toBe("SCAN_ALLOWED");
  });

  it("excludes data repair rows even when scores look attractive", () => {
    const result = classifyQualifiedSubset({
      readinessDecision: "LOW_CONFIDENCE_SCAN",
      primaryDirection: "DATA_REPAIR",
      longBucket: "NO_LONG",
      shortBucket: "NO_SHORT",
      confidence: "LOW",
    });

    expect(result.included).toBe(false);
    expect(result.scanBucket).toBe("EXCLUDED_DATA_REPAIR");
    expect(result.executionGate).toBe("REPAIR_ONLY");
  });

  it("keeps directional short setups watch-only when execution is not ready", () => {
    const result = classifyQualifiedSubset({
      readinessDecision: "READY_FOR_DEEP_SCAN",
      primaryDirection: "SHORT_SETUP",
      longBucket: "NO_LONG",
      shortBucket: "SHORT_SETUP",
      confidence: "MEDIUM",
      shortExecutionDecision: "SHORT_WATCH_ONLY",
    });

    expect(result.included).toBe(true);
    expect(result.side).toBe("SHORT");
    expect(result.executionGate).toBe("WATCH_ONLY");
  });
});
