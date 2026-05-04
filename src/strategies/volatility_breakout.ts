import type { Strategy, Signal } from "./strategy.js";
import { buySignal, sellSignal, holdSignal } from "./strategy.js";
import { atr } from "../indicators/atr.js";
import type { NormalizedCandle } from "../data/fetch_candles.js";

export class VolatilityBreakoutStrategy implements Strategy {
  name = "Volatility Breakout";
  version = "1.0.0";

  constructor(
    private lookback: number = 20,
    private atrPeriod: number = 14,
    private atrMultiplier: number = 2
  ) {}

  generate(candles: NormalizedCandle[], instId: string): Signal[] {
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const atrValues = atr(highs, lows, closes, this.atrPeriod);

    const signals: Signal[] = [];
    let position: "long" | "flat" = "flat";
    let entryPrice = 0;

    for (let i = 0; i < candles.length; i++) {
      const ts = candles[i].ts;

      if (atrValues[i] === null || i < this.lookback) {
        signals.push(holdSignal(ts, instId, this.version, "Insufficient data"));
        continue;
      }

      const recentHigh = Math.max(...highs.slice(i - this.lookback, i));
      const recentLow = Math.min(...lows.slice(i - this.lookback, i));
      const currentAtr = atrValues[i]!;

      const breakoutUpper = recentHigh + this.atrMultiplier * currentAtr;
      const breakoutLower = recentLow - this.atrMultiplier * currentAtr;

      if (position === "flat" && candles[i].close > breakoutUpper) {
        position = "long";
        entryPrice = candles[i].close;
        signals.push(
          buySignal(
            ts,
            instId,
            this.version,
            0.55,
            `Close ${candles[i].close} broke above ${breakoutUpper.toFixed(2)}`
          )
        );
        continue;
      }

      if (position === "long") {
        const stopPrice = entryPrice - 1.5 * currentAtr;
        if (candles[i].close < stopPrice) {
          position = "flat";
          signals.push(
            sellSignal(
              ts,
              instId,
              this.version,
              0.7,
              `Stop loss: close ${candles[i].close} below stop ${stopPrice.toFixed(2)}`
            )
          );
          continue;
        }

        if (candles[i].close < breakoutLower) {
          position = "flat";
          signals.push(
            sellSignal(
              ts,
              instId,
              this.version,
              0.5,
              `Close ${candles[i].close} broke below ${breakoutLower.toFixed(2)}`
            )
          );
          continue;
        }
      }

      signals.push(holdSignal(ts, instId, this.version, "No breakout"));
    }

    return signals;
  }
}
