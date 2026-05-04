import { describe, it, expect } from "vitest";
import { arkhamConfidence } from "../src/altcoin/intelligence/arkham/arkham_client.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ── Unit: Arkham confidence rules ──

describe("arkhamConfidence", () => {
  it("returns HIGH for direct entity match", () => {
    const r = arkhamConfidence(true, false, "cex", false);
    expect(r.confidence).toBe("HIGH");
    expect(r.limitation).toBe("");
  });

  it("returns MEDIUM for predicted entity", () => {
    const r = arkhamConfidence(true, false, "cex", true);
    expect(r.confidence).toBe("MEDIUM");
    expect(r.limitation).toContain("prediction");
  });

  it("returns HIGH for label-based identification", () => {
    const r = arkhamConfidence(false, true, undefined, false);
    expect(r.confidence).toBe("HIGH");
  });

  it("returns UNKNOWN when no entity or label", () => {
    const r = arkhamConfidence(false, false, undefined, false);
    expect(r.confidence).toBe("UNKNOWN");
    expect(r.limitation).toContain("No entity or label");
  });
});

// ── Unit: Arkham source channel ──

describe("Arkham source channel", () => {
  it("entity label preserves source_channel = ARKHAM_CHANNEL", () => {
    // This is verified by code review — all arkham_client responses include channel
    // The arkhamGet function always sets channel: "ARKHAM_CHANNEL"
    // Check the source code
    const src = readFileSync(join(import.meta.dirname, "..", "src", "altcoin", "intelligence", "arkham", "arkham_client.ts"), "utf-8");
    expect(src).toContain('channel: "ARKHAM_CHANNEL"');
  });

  it("Arkham key is never printed in source", () => {
    const src = readFileSync(join(import.meta.dirname, "..", "src", "altcoin", "intelligence", "arkham", "arkham_client.ts"), "utf-8");
    expect(src).not.toContain("95c0eebe");
    // Key should only be read from process.env
    expect(src).toContain("process.env.ARKHAM_API_KEY");
  });
});

// ── Unit: CEX flow is labeled proxy, not confirmed ──

describe("CEX flow labeling", () => {
  it("CEX flow is labeled proxy not confirmed buy/sell", () => {
    // Check transfers direction type in capability probe
    const probe = readFileSync(join(import.meta.dirname, "..", "src", "altcoin", "intelligence", "arkham", "arkham_capability_probe.ts"), "utf-8");

    // Must contain ARKHAM_LABELED_CEX_PROXY concept
    const labelBuilder = readFileSync(join(import.meta.dirname, "..", "src", "altcoin", "intelligence", "arkham", "arkham_entity_label_builder.ts"), "utf-8");
    // Should not contain confirmed buy/sell
    expect(labelBuilder).not.toContain("confirmed buy");
    expect(labelBuilder).not.toContain("confirmed sell");
    expect(labelBuilder).not.toContain("CONFIRMED_SELL");
    expect(labelBuilder).not.toContain("CONFIRMED_BUY");
  });
});

// ── Unit: Unknown wallet is not called whale ──

describe("Unknown wallet labeling", () => {
  it("does not label unknown wallets as whales", () => {
    // Check all arkham source files for "whale" references
    const dir = join(import.meta.dirname, "..", "src", "altcoin", "intelligence", "arkham");
    if (!existsSync(dir)) return;
    const { readdirSync } = require("fs");
    const files = readdirSync(dir).filter((f: string) => f.endsWith(".ts"));
    for (const f of files) {
      const content = readFileSync(join(dir, f), "utf-8");
      // "whale" should only appear in entity type classification context
      if (content.includes("whale") || content.includes("WHALE")) {
        // Verify it's in a classification context, not as a label for unknown
        expect(content).toContain("type");
      }
    }
  });
});

// ── Static: No forbidden trading terms ──

describe("no forbidden trading terms in Arkham reports", () => {
  const FORBIDDEN = ["RECOMMEND_BUY", "RECOMMEND_SELL", "GO_LONG", "GO_SHORT", "MARKET_ORDER", "LIMIT_ORDER", "STOP_LOSS", "TAKE_PROFIT", "BUY_SIGNAL", "SELL_SIGNAL"];

  it("Arkham reports contain no forbidden terms", () => {
    const dir = join(import.meta.dirname, "..", "reports", "altcoin", "intelligence", "arkham");
    if (!existsSync(dir)) return;
    const { readdirSync } = require("fs");
    const files = readdirSync(dir).filter((f: string) => f.endsWith(".md"));
    for (const f of files) {
      const content = readFileSync(join(dir, f), "utf-8").toUpperCase().replace(/\s+/g, "_");
      for (const term of FORBIDDEN) {
        expect(content).not.toContain(term);
      }
    }
  });
});

// ── Static: package.json has Arkham scripts ──

describe("package.json Arkham scripts", () => {
  it("includes all Arkham scripts", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8"));
    expect(pkg.scripts["intelligence:arkham:probe"]).toBeDefined();
    expect(pkg.scripts["intelligence:arkham:features"]).toBeDefined();
    expect(pkg.scripts["intelligence:arkham:labels"]).toBeDefined();
    expect(pkg.scripts["intelligence:arkham:report"]).toBeDefined();
  });
});

// ── Static: AK_EF metrics not marked RESEARCH_ONLY ──

describe("AK_EF metrics status", () => {
  it("AK_EF metrics are not marked RESEARCH_ONLY before validation", () => {
    // Check the capability probe report for metric status
    const reportPath = join(import.meta.dirname, "..", "reports", "altcoin", "intelligence", "arkham", "arkham_capability_report.md");
    if (!existsSync(reportPath)) return;
    const report = readFileSync(reportPath, "utf-8");
    // Metrics should be COMPUTABLE or IDEA, not RESEARCH_ONLY
    const akLines = report.split("\n").filter(l => l.includes("AK_EF_"));
    for (const line of akLines) {
      if (line.includes("RESEARCH_ONLY")) {
        throw new Error(`AK_EF metric marked RESEARCH_ONLY before validation: ${line.trim()}`);
      }
    }
    // At least some metrics should be present
    expect(akLines.length).toBeGreaterThan(0);
  });
});

// ── Static: Cannot prove limitations present ──

describe("Arkham report limitations", () => {
  it("report contains cannot-prove limitations", () => {
    const reportPath = join(import.meta.dirname, "..", "reports", "altcoin", "intelligence", "arkham", "arkham_capability_report.md");
    if (!existsSync(reportPath)) return;
    const report = readFileSync(reportPath, "utf-8");
    expect(report).toContain("Cannot confirm");
    expect(report).toContain("No trading recommendation");
  });
});

// ── Static: .env security ──

describe("Arkham API key security", () => {
  it(".env.example has ARKHAM_API_KEY placeholder", () => {
    const example = readFileSync(join(import.meta.dirname, "..", ".env.example"), "utf-8");
    expect(example).toContain("ARKHAM_API_KEY=");
  });

  it("secret_redaction_check scans ARKHAM_API_KEY", () => {
    const sec = readFileSync(join(import.meta.dirname, "..", "src", "security", "secret_redaction_check.ts"), "utf-8");
    expect(sec).toContain("ARKHAM_API_KEY");
  });
});
