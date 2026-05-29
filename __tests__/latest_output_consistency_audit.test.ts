import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { auditLatestOutputs, reportField } from "../src/altcoin/intelligence/validation/latest_output_consistency_audit.js";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "latest-audit-"));
}

function write(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text, "utf-8");
}

function writeAccumulationFixture(root: string, snapshot = "snap-1", reportSnapshot = snapshot): void {
  write(join(root, "data", "altcoin", "intelligence", "accumulation", "okx_accumulation_features_latest.csv"), [
    "snapshot_id,observed_at,token,state",
    `${snapshot},2026-05-26T00:00:05.000Z,AAA,NO_EDGE`,
  ].join("\n"));
  write(join(root, "reports", "altcoin", "intelligence", "accumulation", "okx_accumulation_scan_latest.md"), [
    "# OKX Accumulation Scan",
    "",
    "Generated: 2026-05-26T00:00:10.000Z",
    `Snapshot: ${reportSnapshot}`,
    "Target cap: small-mid",
  ].join("\n"));
  write(join(root, "reports", "altcoin", "intelligence", "cycles", "accumulation_cycle_latest.md"), [
    "# Accumulation Cycle",
    "",
    "Generated: 2026-05-26T00:00:20.000Z",
    "Target cap: small-mid",
  ].join("\n"));
}

describe("latest output consistency audit", () => {
  it("parses report fields", () => {
    expect(reportField("Generated: 2026-05-26\nSnapshot: abc", "Snapshot")).toBe("abc");
  });

  it("passes when accumulation CSV, report, and cycle report agree", () => {
    const root = makeRoot();
    writeAccumulationFixture(root);

    const result = auditLatestOutputs({ root, scope: "accumulation", writeOutputs: false });

    expect(result.status).toBe("PASS");
    expect(result.checks.some((row) => row.name === "accumulation snapshot match" && row.status === "PASS")).toBe(true);
  });

  it("fails on accumulation snapshot mismatch", () => {
    const root = makeRoot();
    writeAccumulationFixture(root, "snap-1", "snap-2");

    const result = auditLatestOutputs({ root, scope: "accumulation", writeOutputs: false });

    expect(result.status).toBe("FAIL");
    expect(result.checks.find((row) => row.name === "accumulation snapshot match")?.detail).toContain("snap-1");
  });
});
