export interface Trade {
  entryTs: number;
  exitTs: number;
  instId: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  pnlAfterFees: number;
  holdingPeriod: number;
}

export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
  profitFactor: number;
  avgTradeReturn: number;
  maxConsecutiveLosses: number;
  tradeCount: number;
}

export function computeMetrics(
  trades: Trade[],
  equityCurve: number[],
  initialCapital: number,
  riskFreeRate: number = 0.02
): BacktestMetrics {
  const tradeCount = trades.length;
  if (tradeCount === 0) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      sharpe: 0,
      winRate: 0,
      profitFactor: 0,
      avgTradeReturn: 0,
      maxConsecutiveLosses: 0,
      tradeCount: 0,
    };
  }

  const finalEquity = equityCurve[equityCurve.length - 1] ?? initialCapital;
  const totalReturn = (finalEquity - initialCapital) / initialCapital;

  const tradingDays = equityCurve.length;
  const annualizedReturn =
    tradingDays > 0
      ? Math.pow(1 + totalReturn, 365 / tradingDays) - 1
      : totalReturn;

  let peak = equityCurve[0];
  let maxDrawdown = 0;
  for (const eq of equityCurve) {
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const winningTrades = trades.filter((t) => t.pnlAfterFees > 0);
  const losingTrades = trades.filter((t) => t.pnlAfterFees <= 0);
  const winRate = winningTrades.length / tradeCount;

  const totalWins = winningTrades.reduce((sum, t) => sum + t.pnlAfterFees, 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlAfterFees, 0));
  const profitFactor = totalLosses === 0 ? totalWins : totalWins / totalLosses;

  const avgTradeReturn =
    trades.reduce((sum, t) => sum + t.pnlPct, 0) / tradeCount;

  let maxConsecutiveLosses = 0;
  let currentStreak = 0;
  for (const t of trades) {
    if (t.pnlAfterFees <= 0) {
      currentStreak++;
      if (currentStreak > maxConsecutiveLosses) {
        maxConsecutiveLosses = currentStreak;
      }
    } else {
      currentStreak = 0;
    }
  }

  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }

  const meanReturn =
    dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      : 0;

  const returnStd =
    dailyReturns.length > 1
      ? Math.sqrt(
          dailyReturns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) /
            (dailyReturns.length - 1)
        )
      : 0;

  const dailyRf = riskFreeRate / 365;
  const sharpe =
    returnStd === 0 ? 0 : ((meanReturn - dailyRf) / returnStd) * Math.sqrt(365);

  return {
    totalReturn,
    annualizedReturn,
    maxDrawdown,
    sharpe,
    winRate,
    profitFactor,
    avgTradeReturn,
    maxConsecutiveLosses,
    tradeCount,
  };
}
