import { describe, it, expect } from "vitest";
import { sma } from "../src/indicators/sma.js";
import { ema } from "../src/indicators/ema.js";
import { rsi } from "../src/indicators/rsi.js";
import { macd } from "../src/indicators/macd.js";
import { bollinger } from "../src/indicators/bollinger.js";
import { atr } from "../src/indicators/atr.js";

describe("SMA", () => {
  it("computes simple moving average", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = sma(values, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2, 5);
    expect(result[3]).toBeCloseTo(3, 5);
    expect(result[9]).toBeCloseTo(9, 5);
  });

  it("returns nulls for period larger than values", () => {
    const result = sma([1, 2], 5);
    expect(result.every((v) => v === null)).toBe(true);
  });

  it("handles single period", () => {
    const result = sma([5, 10, 15], 1);
    expect(result).toEqual([5, 10, 15]);
  });
});

describe("EMA", () => {
  it("computes exponential moving average", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = ema(values, 3);
    expect(result[2]).toBeCloseTo(2, 5);
    expect(result[3]).toBeGreaterThan(2);
    expect(result[9]).toBeGreaterThan(5);
  });

  it("returns nulls before period", () => {
    const result = ema([1, 2, 3, 4, 5], 5);
    expect(result[0]).toBeNull();
    expect(result[3]).toBeNull();
    expect(result[4]).not.toBeNull();
  });
});

describe("RSI", () => {
  it("returns null before sufficient data", () => {
    const values = Array(20).fill(100);
    const result = rsi(values, 14);
    expect(result[0]).toBeNull();
    expect(result[14]).toBeNull();
    expect(result[15]).not.toBeNull();
  });

  it("returns 100 when no losses", () => {
    const values: number[] = [];
    for (let i = 0; i < 20; i++) values.push(100 + i);
    const result = rsi(values, 14);
    expect(result[15]).toBe(100);
  });

  it("returns low RSI during downtrend", () => {
    const values: number[] = [];
    for (let i = 0; i < 30; i++) values.push(100 - i * 2);
    const result = rsi(values, 14);
    expect(result[20]!).toBeLessThan(50);
  });
});

describe("MACD", () => {
  it("computes MACD histogram", () => {
    const values: number[] = [];
    for (let i = 0; i < 100; i++) values.push(100 + Math.sin(i * 0.1) * 10);
    const result = macd(values);
    expect(result.macdLine.length).toBe(values.length);
    expect(result.signalLine.length).toBe(values.length);
    expect(result.histogram.length).toBe(values.length);
    expect(result.macdLine[50]).not.toBeNull();
    expect(result.signalLine[50]).not.toBeNull();
    expect(result.histogram[50]).not.toBeNull();
  });
});

describe("Bollinger Bands", () => {
  it("computes bollinger bands", () => {
    const values: number[] = [];
    for (let i = 0; i < 50; i++) values.push(100);
    const result = bollinger(values, 20);
    expect(result.middle[19]).toBeCloseTo(100, 5);
    expect(result.upper[19]).toBeCloseTo(100, 5);
    expect(result.lower[19]).toBeCloseTo(100, 5);
  });

  it("produces wider bands for volatile data", () => {
    const stable: number[] = Array(30).fill(100);
    const volatile: number[] = [];
    for (let i = 0; i < 30; i++) volatile.push(100 + (i % 2 === 0 ? 20 : -20));

    const stableResult = bollinger(stable, 20);
    const volatileResult = bollinger(volatile, 20);

    expect(volatileResult.bandwidth[25]!).toBeGreaterThan(stableResult.bandwidth[25]!);
  });
});

describe("ATR", () => {
  it("computes true range based on HLC", () => {
    const highs = [10, 12, 11, 13, 14];
    const lows = [8, 9, 9, 10, 11];
    const closes = [9, 11, 10, 12, 13];
    const result = atr(highs, lows, closes, 3);
    expect(result[0]).toBeNull();
    expect(result[3]).not.toBeNull();
    expect(result[3]!).toBeGreaterThan(0);
  });
});
