export function ema(values: number[], period: number): (number | null)[] {
  if (period <= 0 || values.length === 0) return values.map(() => null);

  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }

    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[j];
      }
      result.push(sum / period);
    } else {
      const prev = result[i - 1]!;
      result.push((values[i] - prev) * multiplier + prev);
    }
  }

  return result;
}
