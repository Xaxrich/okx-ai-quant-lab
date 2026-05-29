import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  buildSourceObservation,
  getSourceEndpoint,
  requiredSourceKeysForTier,
  sha256Hex,
  stableJson,
  writeRawSnapshot,
  writeSourceObservationsCsv,
} from "../src/altcoin/intelligence/sources/index.js";

describe("industrial source registry", () => {
  it("lists the core sources required for execution review", () => {
    const keys = requiredSourceKeysForTier("EXECUTION_REVIEW_CANDIDATE");

    expect(keys).toContain("okx:public/instruments+tickers");
    expect(keys).toContain("okx:market/books");
    expect(keys).toContain("moralis:erc20/transfers");
    expect(keys).toContain("arkham:entity+address-intelligence");
    expect(keys).toContain("coinglass:futures/oi-funding-liquidation");
  });

  it("keeps endpoint metadata addressable by provider and endpoint", () => {
    const spec = getSourceEndpoint("coingecko", "onchain/pool-trades");

    expect(spec?.role).toBe("dex_microstructure");
    expect(spec?.rawSnapshotRequired).toBe(true);
  });
});

describe("raw snapshot writer", () => {
  it("hashes payloads deterministically across object key order", () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
    expect(sha256Hex({ b: 2, a: 1 })).toBe(sha256Hex({ a: 1, b: 2 }));
  });

  it("writes raw snapshots under provider and endpoint paths", () => {
    const root = mkdtempSync(join(tmpdir(), "okx-lineage-"));
    const result = writeRawSnapshot(root, {
      provider: "okx",
      endpoint: "public/instruments+tickers",
      requestedAt: "2026-05-29T00:00:00.000Z",
      params: { instType: "SWAP", uly: "USDT" },
      payload: { data: [{ instId: "CHZ-USDT-SWAP" }] },
    });

    expect(existsSync(result.path)).toBe(true);
    expect(result.path).toContain(join("raw", "okx", "public_instruments_tickers", "2026-05-29"));
    expect(result.rawPayloadHash).toHaveLength(64);
  });
});

describe("source observations", () => {
  it("builds and writes lineage rows with freshness status", () => {
    const spec = getSourceEndpoint("moralis", "erc20/transfers");
    if (!spec) throw new Error("missing moralis transfers spec");

    const observation = buildSourceObservation(spec, {
      runId: "run-1",
      token: "CHZ",
      provider: "moralis",
      endpoint: "erc20/transfers",
      paramsHash: "params",
      rawPayloadHash: "payload",
      requestedAt: "2026-05-29T00:00:00.000Z",
      responseAt: "2026-05-29T00:00:03.000Z",
      rows: 42,
      normalizedTable: "cex_flow_window_scan_latest.csv",
      featureVersion: "v1",
    }, new Date("2026-05-29T00:05:03.000Z"));

    expect(observation.status).toBe("OK");
    expect(observation.freshnessSeconds).toBe(300);

    const root = mkdtempSync(join(tmpdir(), "okx-observations-"));
    const output = join(root, "source_observations_latest.csv");
    writeSourceObservationsCsv(output, [observation]);

    const text = readFileSync(output, "utf-8");
    expect(text).toContain("run_id,token,provider,endpoint");
    expect(text).toContain("run-1,CHZ,moralis,erc20/transfers");
  });

  it("marks unconfigured sources explicitly instead of hiding coverage gaps", () => {
    const spec = getSourceEndpoint("bscscan", "token-transfers+holders");
    if (!spec) throw new Error("missing bscscan spec");

    const observation = buildSourceObservation(spec, {
      runId: "run-1",
      token: "LAB",
      provider: "bscscan",
      endpoint: "token-transfers+holders",
      paramsHash: "params",
      rawPayloadHash: "",
      requestedAt: "2026-05-29T00:00:00.000Z",
      responseAt: "2026-05-29T00:00:00.000Z",
      rows: 0,
      configured: false,
    }, new Date("2026-05-29T00:00:00.000Z"));

    expect(observation.status).toBe("NOT_CONFIGURED");
  });
});
