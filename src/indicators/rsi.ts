export function rsi(values: number[], period: number = 14): (number | null)[] {
  if (period <= 0 || values.length < period + 1) {
    return values.map(() => null);
  }

  const result: (number | null)[] = [null];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < gains.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }

    if (i < period) {
      result.push(null);
      if (i === period - 1) {
        avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
        avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
      }
      continue;
    }

    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  return result;
}
