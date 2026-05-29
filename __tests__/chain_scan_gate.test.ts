import { describe, expect, it } from "vitest";
import { decideChainGate, normalizeChain, type CandidateRow } from "../src/altcoin/intelligence/validation/chain_scan_gate.js";

function row(overrides: Partial<CandidateRow>): CandidateRow {
  return {
    snapshot_id: "snap",
    observed_at: "2026-04-25T00:00:00.000Z",
    token: "LAB",
    scanner_label: "WATCH_RISK",
    opportunity_score: "45",
    fragility_score: "22",
    tradability_score: "70",
    state_matrix: "MEDIUM_OPP__LOW_FRAG__GOOD_TRAD",
    triggered_rules: "",
    missing_required_data: "",
    ...overrides,
  };
}

describe("normalizeChain", () => {
  it("normalizes common EVM chains", () => {
    expect(normalizeChain("ethereum")).toBe("eth");
    expect(normalizeChain("bsc")).toBe("bsc");
    expect(normalizeChain("binance-smart-chain")).toBe("bsc");
    expect(normalizeChain("arbitrum-one")).toBe("arbitrum");
    expect(normalizeChain("polygon-pos")).toBe("polygon");
    expect(normalizeChain("optimistic-ethereum")).toBe("optimism");
    expect(normalizeChain("avalanche-contract-chain")).toBe("avalanche");
    expect(normalizeChain("solana")).toBe("");
  });
});

describe("decideChainGate", () => {
  const opts = { minOpportunity: 40, minTradability: 40, maxFragility: 60, input: "" };
  const availability = { moralisOk: true, arkhamOk: true };

  it("promotes a complete candidate to ready for chain scan", () => {
    const decision = decideChainGate(row({}), {
      symbol: "LAB",
      category: "current_focus",
      primary_chain: "bsc",
      contract_address: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A",
      coingecko_id: "lab",
      cmc_id: "33223",
      dex_enabled: "true",
      cex_enabled: "true",
    }, opts, availability);

    expect(decision.decision).toBe("READY_FOR_CHAIN_SCAN");
    expect(decision.scanStage).toBe("GO_LIGHT_SCAN");
    expect(decision.scanChain).toBe("bsc");
    expect(decision.scanChannel).toBe("MORALIS_PRIMARY");
  });

  it("routes insufficient deep data to repair queue", () => {
    const decision = decideChainGate(row({
      scanner_label: "INSUFFICIENT_DEEP_DATA",
      missing_required_data: "contract_address;dex_data",
    }), {
      symbol: "POPCAT",
      category: "meme",
      primary_chain: "solana",
      contract_address: "",
      coingecko_id: "popcat",
      cmc_id: "28782",
      dex_enabled: "false",
      cex_enabled: "true",
    }, opts, availability);

    expect(decision.decision).toBe("DATA_REPAIR_REQUIRED");
    expect(decision.scanStage).toBe("BLOCK");
    expect(decision.reason).toContain("INSUFFICIENT_DEEP_DATA");
    expect(decision.reason).toContain("missing_contract_address");
  });
});
