import type { Strategy, Signal } from "./strategy.js";
import { buySignal, sellSignal, holdSignal } from "./strategy.js";
import { rsi } from "../indicators/rsi.js";
import type { NormalizedCandle } from "../data/fetch_candles.js";

export class RsiReversionStrategy implements Strategy {
  name = "RSI Mean Reversion";
  version = "1.0.0";

  constructor(
    private period: number = 14,
    private oversold: number = 30,
    private overbought: number = 70
  ) {}

  generate(candles: NormalizedCandle[], instId: string): Signal[] {
    const closes = candles.map((c) => c.close);
    const rsiValues = rsi(closes, this.period);

    const signals: Signal[] = [];
    let position: "long" | "flat" = "flat";

    for (let i = 0; i < candles.length; i++) {
      const ts = candles[i].ts;
      const r = rsiValues[i];

      if (r === null) {
        signals.push(holdSignal(ts, instId, this.version, "Insufficient data"));
        continue;
      }

      const prevR = i > 0 ? rsiValues[i - 1] : null;

      if (position === "flat" && prevR !== null && prevR > this.oversold && r <= this.oversold) {
        position = "long";
        const confidence = Math.min(0.8, (this.oversold - r) / this.oversold + 0.5);
        signals.push(
          buySignal(ts, instId, this.version, confidence, `RSI crossed below ${this.oversold} (oversold)`)
        );
        continue;
      }

      if (position === "long" && prevR !== null && prevR < this.overbought && r >= this.overbought) {
        position = "flat";
        const confidence = Math.min(0.8, (r - this.overbought) / (100 - this.overbought) + 0.5);
        signals.push(
          sellSignal(ts, instId, this.version, confidence, `RSI crossed above ${this.overbought} (overbought)`)
        );
        continue;
      }

      signals.push(holdSignal(ts, instId, this.version, "No reversion signal"));
    }

    return signals;
  }
}
