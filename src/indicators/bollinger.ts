import { sma } from "./sma.js";

export interface BollingerResult {
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
  bandwidth: (number | null)[];
}

export function bollinger(
  values: number[],
  period: number = 20,
  stdMultiplier: number = 2
): BollingerResult {
  const middle = sma(values, period);

  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  const bandwidth: (number | null)[] = [];

  for (let i = 0; i < values.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
      bandwidth.push(null);
      continue;
    }

    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);

    const mid = middle[i]!;
    upper.push(mid + stdMultiplier * std);
    lower.push(mid - stdMultiplier * std);
    bandwidth.push(stdMultiplier * 2 * std);
  }

  return { middle, upper, lower, bandwidth };
}
