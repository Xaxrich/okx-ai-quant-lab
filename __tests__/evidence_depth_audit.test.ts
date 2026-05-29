import { describe, expect, it } from "vitest";
import { classifyEvidenceDepth } from "../src/altcoin/intelligence/onchain/evidence_depth_audit.js";
import type { EvidenceDepthInput } from "../src/altcoin/intelligence/onchain/evidence_depth_audit.js";

const BASE: EvidenceDepthInput = {
  opportunityScore: 47,
  fragilityScore: 3,
  tradabilityScore: 86,
  lightScanOk: true,
  lightHolderRows: 20,
  lightTransferRows: 20,
  entityTransferRows: 100,
  entityCoverage: 0.5,
  entityDecision: "DEEPEN_ENTITY_FLOW",
  holderDecision: "IDENTITY_RESOLVED",
  holderIdentityClass: "ARKHAM_YIELD_RESOLVED",
  cex1hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  cex4hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  cex24hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
  cex1hTransfers: 100,
  cex4hTransfers: 500,
  cex24hTransfers: 2500,
  cex1hCoverage: 1,
  cex4hCoverage: 1,
  cex24hCoverage: 1,
  cex1hFetchStop: "TARGET_WINDOW_COVERED",
  cex4hFetchStop: "TARGET_WINDOW_COVERED",
  cex24hFetchStop: "TARGET_WINDOW_COVERED",
  cex1hFetchStatus: "OK",
  cex4hFetchStatus: "OK",
  cex24hFetchStatus: "OK",
  netCex1hValue: -1,
  netCex4hValue: -1,
  netCex24hValue: -1,
  readinessDecision: "READY_FOR_DEEP_SCAN",
  accumulationLabel: "WATCH_ACCUMULATION",
  accumulationConfidence: "HIGH",
};

describe("classifyEvidenceDepth", () => {
  it("classifies deep but contradictory evidence as conflict", () => {
    const result = classifyEvidenceDepth({
      ...BASE,
      cex24hDecision: "CEX_INFLOW_RISK",
      netCex24hValue: 1_000_000,
      readinessDecision: "RISK_MONITOR_CEX_FLOW",
    });

    expect(result.evidenceState).toBe("EVIDENCE_CONFLICT");
    expect(result.depthScore).toBeGreaterThanOrEqual(70);
    expect(result.conflictScore).toBeGreaterThanOrEqual(35);
  });

  it("classifies shallow or broken windows as under-mined", () => {
    const result = classifyEvidenceDepth({
      ...BASE,
      entityCoverage: 0.18,
      cex24hDecision: "PARTIAL_WINDOW",
      cex24hTransfers: 500,
      cex24hCoverage: 0.2,
      cex24hFetchStop: "FETCH_ERROR",
      cex24hFetchStatus: "HTTP_500",
      readinessDecision: "LOW_CONFIDENCE_SCAN",
    });

    expect(result.evidenceState).toBe("UNDER_MINED");
    expect(result.insufficiencyScore).toBeGreaterThanOrEqual(30);
  });

  it("does not hide severe CEX conflict behind a slightly sub-threshold depth score", () => {
    const result = classifyEvidenceDepth({
      ...BASE,
      opportunityScore: 48,
      tradabilityScore: 76,
      lightHolderRows: 0,
      entityDecision: "WATCH_CEX_INFLOW_RISK",
      holderDecision: "HIGH_CONCENTRATION_UNRESOLVED",
      cex1hDecision: "CEX_INFLOW_RISK",
      cex4hDecision: "CEX_INFLOW_RISK",
      cex24hDecision: "CEX_INFLOW_RISK",
      netCex1hValue: 1_000_000,
      netCex4hValue: 10_000_000,
      netCex24hValue: 40_000_000,
      readinessDecision: "BLOCKED_HOLDER_IDENTITY",
    });

    expect(result.evidenceState).toBe("EVIDENCE_CONFLICT");
    expect(result.depthScore).toBeGreaterThanOrEqual(60);
    expect(result.conflictScore).toBeGreaterThanOrEqual(70);
  });

  it("does not hide complete multi-window CEX risk behind a light-scan outage", () => {
    const result = classifyEvidenceDepth({
      ...BASE,
      opportunityScore: 48,
      tradabilityScore: 76,
      lightScanOk: false,
      lightHolderRows: 0,
      lightTransferRows: 0,
      holderDecision: "HIGH_CONCENTRATION_UNRESOLVED",
      entityDecision: "WATCH_CEX_INFLOW_RISK",
      cex1hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      cex4hDecision: "CEX_OUTFLOW_OR_NEUTRAL",
      cex24hDecision: "CEX_INFLOW_RISK",
      netCex24hValue: 40_000_000,
      readinessDecision: "BLOCKED_HOLDER_IDENTITY",
    });

    expect(result.evidenceState).toBe("EVIDENCE_CONFLICT");
    expect(result.depthScore).toBeGreaterThanOrEqual(40);
    expect(result.conflictScore).toBeGreaterThanOrEqual(70);
  });

  it("keeps clean deep-scan candidates separate from watch-only rows", () => {
    const result = classifyEvidenceDepth(BASE);

    expect(result.evidenceState).toBe("CANDIDATE_CLEAN");
    expect(result.depthScore).toBeGreaterThanOrEqual(70);
  });

  it("treats top-holder distribution as conflict even when other windows look acceptable", () => {
    const result = classifyEvidenceDepth({
      ...BASE,
      holderDeltaDecision: "TOP_HOLDER_DISTRIBUTION_RISK",
    });

    expect(result.conflictScore).toBeGreaterThanOrEqual(30);
    expect(result.reasons).toContain("top_holder_distribution_to_cex");
  });
});
