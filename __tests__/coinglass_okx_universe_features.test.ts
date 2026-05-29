import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  changeRatio,
  classifyCoinGlassFeatureReadiness,
  zscoreLatest,
} from "../src/altcoin/intelligence/coinglass/coinglass_okx_universe_features.js";

describe("CoinGlass OKX universe feature helpers", () => {
  it("computes change ratios from valid numeric rows only", () => {
    expect(changeRatio([100, null, 110, 121], 1)).toBeCloseTo(0.1, 6);
    expect(changeRatio([100, 110, 121], 2)).toBeCloseTo(0.21, 6);
    expect(changeRatio([100], 1)).toBeNull();
  });

  it("returns a latest z-score when enough history exists", () => {
    const z = zscoreLatest([10, 10, 11, 12, 13, 14], 6);
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(0);
  });

  it("classifies ready, partial, short, and unavailable states", () => {
    expect(classifyCoinGlassFeatureReadiness({
      oiRows: 12,
      fundingRows: 8,
      liqRows: 6,
      oiUsdLatest: 1_000_000,
      fundingRateLatest: 0.0001,
    })).toBe("COINGLASS_OKX_FEATURE_READY");

    expect(classifyCoinGlassFeatureReadiness({
      oiRows: 12,
      fundingRows: 8,
      liqRows: 0,
      oiUsdLatest: 1_000_000,
      fundingRateLatest: 0.0001,
    })).toBe("COINGLASS_OKX_FEATURE_PARTIAL_LIQ_MISSING");

    expect(classifyCoinGlassFeatureReadiness({
      oiRows: 2,
      fundingRows: 0,
      liqRows: 0,
      oiUsdLatest: 1_000_000,
      fundingRateLatest: null,
    })).toBe("COINGLASS_OKX_SHORT_HISTORY");

    expect(classifyCoinGlassFeatureReadiness({
      oiRows: 0,
      fundingRows: 0,
      liqRows: 0,
      oiUsdLatest: null,
      fundingRateLatest: null,
    })).toBe("COINGLASS_OKX_UNAVAILABLE");
  });
});

describe("package scripts", () => {
  it("includes the dynamic CoinGlass OKX universe command", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8"));
    expect(pkg.scripts["intelligence:coinglass:okx-universe"]).toBeDefined();
  });
});
