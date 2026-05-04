import { describe, it, expect } from "vitest";
import { runBacktest } from "../src/backtest/engine.js";
import { MaCrossStrategy } from "../src/strategies/ma_cross.js";
import { RsiReversionStrategy } from "../src/strategies/rsi_reversion.js";
import { VolatilityBreakoutStrategy } from "../src/strategies/volatility_breakout.js";
import type { NormalizedCandle } from "../src/data/fetch_candles.js";

function generateCandles(count: number): NormalizedCandle[] {
  const candles: NormalizedCandle[] = [];
  let price = 50000;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.5) * 200;
    const o = price;
    const c = price + (Math.random() - 0.5) * 100;
    candles.push({
      ts: now + i * 3600000,
      open: o,
      high: Math.max(o, c) + Math.random() * 50,
      low: Math.min(o, c) - Math.random() * 50,
      close: c,
      volume: Math.random() * 100,
      volumeCcy: Math.random() * 10000000,
    });
  }
  return candles;
}

describe("Backtest Engine", () => {
  const candles = generateCandles(500);

  it("produces metrics for MA Crossover strategy", () => {
    const result = runBacktest(candles, new MaCrossStrategy(), "BTC-USDT");
    expect(result.metrics).toBeDefined();
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.signals.length).toBe(500);
  });

  it("produces metrics for RSI Reversion strategy", () => {
    const result = runBacktest(candles, new RsiReversionStrategy(), "BTC-USDT");
    expect(result.metrics).toBeDefined();
    expect(result.metrics.tradeCount).toBeGreaterThanOrEqual(0);
  });

  it("produces metrics for Volatility Breakout strategy", () => {
    const result = runBacktest(candles, new VolatilityBreakoutStrategy(), "BTC-USDT");
    expect(result.metrics).toBeDefined();
  });

  it("handles empty candles gracefully", () => {
    const result = runBacktest([], new MaCrossStrategy(), "BTC-USDT");
    expect(result.metrics.tradeCount).toBe(0);
    expect(result.metrics.totalReturn).toBe(0);
  });

  it("respects initial capital", () => {
    const result = runBacktest(candles, new MaCrossStrategy(), "BTC-USDT", {
      initialCapital: 5000,
    });
    expect(result.config.initialCapital).toBe(5000);
  });
});
