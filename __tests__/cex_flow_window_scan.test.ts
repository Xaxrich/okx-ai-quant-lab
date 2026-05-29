import { describe, expect, it } from "vitest";
import {
  bucketCexFlow,
  buildAddressLabelMapFromRows,
  decimalStringToNumber,
  normalizeCexFlowSource,
  normalizeMergeExisting,
  parseEtherscanTokenTransfer,
} from "../src/altcoin/intelligence/onchain/cex_flow_window_scan.js";

const NOW = Date.UTC(2026, 4, 10, 12, 0, 0);

describe("bucketCexFlow", () => {
  it("normalizes transfer source selection", () => {
    expect(normalizeCexFlowSource("explorer")).toBe("explorer");
    expect(normalizeCexFlowSource("moralis")).toBe("moralis");
    expect(normalizeCexFlowSource("unknown")).toBe("auto");
    expect(normalizeCexFlowSource(undefined)).toBe("auto");
  });

  it("requires an explicit flag before merging old latest rows", () => {
    expect(normalizeMergeExisting("true")).toBe(true);
    expect(normalizeMergeExisting("1")).toBe(true);
    expect(normalizeMergeExisting("yes")).toBe(true);
    expect(normalizeMergeExisting("false")).toBe(false);
    expect(normalizeMergeExisting(undefined)).toBe(false);
  });

  it("flags CEX inflow risk when deposits dominate withdrawals", () => {
    const stats = bucketCexFlow("AAA", [
      { token: "AAA", timestampMs: NOW - 10 * 60 * 1000, valueDecimal: 100, direction: "TO_CEX_PROXY", labeled: true },
      { token: "AAA", timestampMs: NOW - 20 * 60 * 1000, valueDecimal: 50, direction: "TO_CEX_PROXY", labeled: true },
      { token: "AAA", timestampMs: NOW - 30 * 60 * 1000, valueDecimal: 20, direction: "FROM_CEX_PROXY", labeled: true },
    ], 1, NOW, true);

    expect(stats.decision).toBe("CEX_INFLOW_RISK");
    expect(stats.netCexCount).toBe(1);
    expect(stats.netCexValue).toBe(130);
  });

  it("flags CEX inflow risk when value dominates even if withdrawal count is higher", () => {
    const stats = bucketCexFlow("AAA", [
      { token: "AAA", timestampMs: NOW - 10 * 60 * 1000, valueDecimal: 1000, direction: "TO_CEX_PROXY", labeled: true },
      { token: "AAA", timestampMs: NOW - 20 * 60 * 1000, valueDecimal: 100, direction: "FROM_CEX_PROXY", labeled: true },
      { token: "AAA", timestampMs: NOW - 30 * 60 * 1000, valueDecimal: 100, direction: "FROM_CEX_PROXY", labeled: true },
    ], 1, NOW, true);

    expect(stats.decision).toBe("CEX_INFLOW_RISK");
    expect(stats.netCexCount).toBe(-1);
    expect(stats.netCexValue).toBe(800);
  });

  it("marks low coverage before interpreting direction", () => {
    const stats = bucketCexFlow("AAA", [
      { token: "AAA", timestampMs: NOW - 10 * 60 * 1000, valueDecimal: 100, direction: "TO_CEX_PROXY", labeled: false },
      { token: "AAA", timestampMs: NOW - 20 * 60 * 1000, valueDecimal: 50, direction: "BETWEEN_UNKNOWN_WALLETS", labeled: false },
    ], 1, NOW, true);

    expect(stats.decision).toBe("LOW_COVERAGE");
  });

  it("does not interpret direction when the fetched sample does not cover the requested window", () => {
    const stats = bucketCexFlow("AAA", [
      { token: "AAA", timestampMs: NOW - 10 * 60 * 1000, valueDecimal: 100, direction: "TO_CEX_PROXY", labeled: true },
      { token: "AAA", timestampMs: NOW - 20 * 60 * 1000, valueDecimal: 50, direction: "TO_CEX_PROXY", labeled: true },
    ], 4, NOW, false);

    expect(stats.decision).toBe("PARTIAL_WINDOW");
    expect(stats.windowFullyCovered).toBe(false);
    expect(stats.windowCoverageRatio).toBeLessThan(1);
  });

  it("parses Etherscan V2 raw token transfers with cached CEX labels", () => {
    const labels = buildAddressLabelMapFromRows([], [{
      chain: "ethereum",
      address: "0xabc0000000000000000000000000000000000000",
      address_type: "CEX_ENTITY",
      arkham_entity_name: "Bybit",
      arkham_entity_type: "cex",
      arkham_label: "Hot Wallet",
      moralis_entity: "",
      moralis_label: "",
      merged_entity: "Bybit",
      merged_label: "Hot Wallet",
    }]);

    const parsed = parseEtherscanTokenTransfer("AAA", "eth", {
      timeStamp: String(Math.floor(NOW / 1000)),
      from: "0xdef0000000000000000000000000000000000000",
      to: "0xabc0000000000000000000000000000000000000",
      value: "123450000",
      tokenDecimal: "6",
    }, labels);

    expect(parsed?.valueDecimal).toBe(123.45);
    expect(parsed?.direction).toBe("TO_CEX_PROXY");
    expect(parsed?.labeled).toBe(true);
  });

  it("converts large integer token values without scientific notation loss in normal scan ranges", () => {
    expect(decimalStringToNumber("1000000000000000000", "18")).toBe(1);
    expect(decimalStringToNumber("123456789000000", "6")).toBe(123456789);
  });
});
