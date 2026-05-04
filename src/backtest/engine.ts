import type { NormalizedCandle } from "../data/fetch_candles.js";
import type { Strategy, Signal } from "../strategies/strategy.js";
import type { Trade } from "./metrics.js";
import { computeMetrics, type BacktestMetrics } from "./metrics.js";

export interface BacktestConfig {
  initialCapital: number;
  feeBps: number;
  slippageBps: number;
  positionSizePct: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  signals: Signal[];
  trades: Trade[];
  equityCurve: number[];
  metrics: BacktestMetrics;
  instId: string;
  strategyName: string;
}

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 1000,
  feeBps: 10,
  slippageBps: 5,
  positionSizePct: 1.0,
};

export function runBacktest(
  candles: NormalizedCandle[],
  strategy: Strategy,
  instId: string,
  config: Partial<BacktestConfig> = {}
): BacktestResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const signals = strategy.generate(candles, instId);

  const trades: Trade[] = [];
  const equityCurve: number[] = [cfg.initialCapital];
  let capital = cfg.initialCapital;
  let position: { entryPrice: number; entryTs: number; size: number } | null = null;

  for (const signal of signals) {
    if (signal.action === "BUY" && position === null) {
      const slippagePrice = signal.action === "BUY"
        ? getPriceAtTs(candles, signal.ts) * (1 + cfg.slippageBps / 10000)
        : 0;
      const price = slippagePrice || getPriceAtTs(candles, signal.ts);
      const size = (capital * cfg.positionSizePct) / price;
      position = { entryPrice: price, entryTs: signal.ts, size };
    } else if (signal.action === "SELL" && position !== null) {
      const slippagePrice = getPriceAtTs(candles, signal.ts) * (1 - cfg.slippageBps / 10000);
      const exitPrice = slippagePrice || getPriceAtTs(candles, signal.ts);
      const grossPnl = (exitPrice - position.entryPrice) * position.size;
      const feeCost = (position.entryPrice + exitPrice) * position.size * (cfg.feeBps / 10000);
      const netPnl = grossPnl - feeCost;
      const pnlPct = (exitPrice - position.entryPrice) / position.entryPrice;

      trades.push({
        entryTs: position.entryTs,
        exitTs: signal.ts,
        instId,
        side: "BUY",
        entryPrice: position.entryPrice,
        exitPrice,
        pnl: grossPnl,
        pnlPct,
        pnlAfterFees: netPnl,
        holdingPeriod: signal.ts - position.entryTs,
      });

      capital += netPnl;
      position = null;
    }

    equityCurve.push(capital);
  }

  const metrics = computeMetrics(trades, equityCurve, cfg.initialCapital);

  return {
    config: cfg,
    signals,
    trades,
    equityCurve,
    metrics,
    instId,
    strategyName: strategy.name,
  };
}

function getPriceAtTs(candles: NormalizedCandle[], ts: number): number {
  const candle = candles.find((c) => c.ts === ts);
  return candle ? candle.close : candles[candles.length - 1]?.close ?? 0;
}
