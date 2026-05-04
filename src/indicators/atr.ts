export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): (number | null)[] {
  if (period <= 0 || highs.length < 2) {
    return highs.map(() => null);
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  const result: (number | null)[] = [null];

  let atrValue = 0;
  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period - 1) {
      result.push(null);
      if (i === period - 2) {
        atrValue = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
      }
      continue;
    }

    if (i === period - 1) {
      atrValue = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      atrValue = (atrValue * (period - 1) + trueRanges[i]) / period;
    }
    result.push(atrValue);
  }

  return result;
}
