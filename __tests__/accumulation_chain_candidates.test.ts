import { describe, expect, it } from "vitest";
import { decideAccumulationChainCandidate, type CandidateInput } from "../src/altcoin/intelligence/accumulation/accumulation_chain_candidates.js";

const base: CandidateInput = {
  snapshotId: "snap",
  observedAt: "2026-05-28T00:00:00.000Z",
  token: "AAA",
  state: "NO_EDGE",
  accumulationScore: 42,
  riskScore: 30,
  executionScore: 70,
  confidence: "MEDIUM",
  marketCapBucket: "MID_CAP_100M_1B",
  cexFlowGate: "MISSING_OR_WEAK",
  cgChain: "ethereum",
  cgContract: "0xabc",
  registryChain: "",
  registryContract: "",
};

const opts = { minAccumulation: 35, minExecution: 45, maxRisk: 55 };

describe("decideAccumulationChainCandidate", () => {
  it("promotes a current accumulation context with contract metadata to light scan", () => {
    const decision = decideAccumulationChainCandidate(base, opts);

    expect(decision.decision).toBe("READY_FOR_CHAIN_SCAN");
    expect(decision.scanStage).toBe("GO_LIGHT_SCAN");
    expect(decision.scanChain).toBe("eth");
  });

  it("blocks distribution risk even when execution is liquid", () => {
    const decision = decideAccumulationChainCandidate({
      ...base,
      state: "DISTRIBUTION_RISK",
      accumulationScore: 70,
      executionScore: 90,
    }, opts);

    expect(decision.decision).toBe("WATCH_ONLY");
    expect(decision.reason).toContain("distribution_risk");
  });

  it("routes missing contract metadata to repair", () => {
    const decision = decideAccumulationChainCandidate({
      ...base,
      cgChain: "ethereum",
      cgContract: "",
    }, opts);

    expect(decision.decision).toBe("DATA_REPAIR_REQUIRED");
    expect(decision.reason).toContain("missing_contract_address");
  });
});
