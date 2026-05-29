import { describe, expect, it } from "vitest";
import { buildStepPlan, type Options } from "../scripts/accumulation_cycle_runner.js";

const options: Options = {
  limit: "20",
  bootstrapLimit: "60",
  coinglassLimit: "20",
  chainLimit: "8",
  cexFlowPages: "60",
  cexFlowTargetWindow: "24",
  targetCap: "small-mid",
  minVolumeUsd: "2000000",
  minOiUsd: "1000000",
  includeMajors: false,
  skipOnchain: false,
  skipCoinglass: false,
};

describe("accumulation cycle runner", () => {
  it("builds onchain scans from current accumulation candidates", () => {
    const plan = buildStepPlan(options);
    const names = plan.map((step) => step.name);

    expect(names.indexOf("Pre-chain accumulation scan")).toBeLessThan(names.indexOf("Build accumulation chain candidates"));
    expect(names.indexOf("Build accumulation chain candidates")).toBeLessThan(names.indexOf("Gate accumulation chain candidates"));
    expect(names.indexOf("Gate accumulation chain candidates")).toBeLessThan(names.indexOf("CEX flow windows"));
    expect(plan.some((step) => step.script === "intelligence:onchain:scan-cycle")).toBe(false);
  });

  it("keeps CoinGlass enrichment bounded separately from bootstrap breadth", () => {
    const plan = buildStepPlan(options);
    const coinglass = plan.find((step) => step.name === "CoinGlass OKX universe features");

    expect(coinglass?.args).toContain("--limit=20");
    expect(coinglass?.args).not.toContain("--limit=60");
  });

  it("gates against accumulation candidates and carries CEX window controls", () => {
    const plan = buildStepPlan(options);
    const gate = plan.find((step) => step.name === "Gate accumulation chain candidates");
    const cexFlow = plan.find((step) => step.name === "CEX flow windows");

    expect(gate?.args).toContain("--input=data/altcoin/intelligence/validation/accumulation_chain_candidates_latest.csv");
    expect(cexFlow?.args).toContain("--limit=8");
    expect(cexFlow?.args).toContain("--pages=60");
    expect(cexFlow?.args).toContain("--target-window-hours=24");
  });
});
