import type { Strategy, Signal } from "./strategy.js";
import { buySignal, sellSignal, holdSignal } from "./strategy.js";
import { sma } from "../indicators/sma.js";
import type { NormalizedCandle } from "../data/fetch_candles.js";

export class MaCrossStrategy implements Strategy {
  name = "MA Crossover";
  version = "1.0.0";

  constructor(
    private fastPeriod: number = 9,
    private slowPeriod: number = 21
  ) {}

  generate(candles: NormalizedCandle[], instId: string): Signal[] {
    const closes = candles.map((c) => c.close);
    const fastMa = sma(closes, this.fastPeriod);
    const slowMa = sma(closes, this.slowPeriod);

    const signals: Signal[] = [];
    let position: "long" | "flat" = "flat";

    for (let i = 0; i < candles.length; i++) {
      const ts = candles[i].ts;

      if (fastMa[i] === null || slowMa[i] === null) {
        signals.push(holdSignal(ts, instId, this.version, "Insufficient data"));
        continue;
      }

      const prevFast = i > 0 ? fastMa[i - 1] : null;
      const prevSlow = i > 0 ? slowMa[i - 1] : null;

      if (prevFast !== null && prevSlow !== null) {
        const crossedAbove = prevFast <= prevSlow && fastMa[i]! > slowMa[i]!;
        const crossedBelow = prevFast >= prevSlow && fastMa[i]! < slowMa[i]!;

        if (crossedAbove && position === "flat") {
          position = "long";
          signals.push(
            buySignal(
              ts,
              instId,
              this.version,
              0.6,
              `Fast MA(${this.fastPeriod}) crossed above Slow MA(${this.slowPeriod})`
            )
          );
          continue;
        }

        if (crossedBelow && position === "long") {
          position = "flat";
          signals.push(
            sellSignal(
              ts,
              instId,
              this.version,
              0.6,
              `Fast MA(${this.fastPeriod}) crossed below Slow MA(${this.slowPeriod})`
            )
          );
          continue;
        }
      }

      signals.push(holdSignal(ts, instId, this.version, "No crossover"));
    }

    return signals;
  }
}
