export function sma(values: number[], period: number): (number | null)[] {
  if (period <= 0 || values.length === 0) return values.map(() => null);

  const result: (number | null)[] = [];
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i < period - 1) {
      result.push(null);
    } else {
      if (i >= period) {
        sum -= values[i - period];
      }
      result.push(sum / period);
    }
  }

  return result;
}
