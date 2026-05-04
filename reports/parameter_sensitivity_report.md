# Parameter Sensitivity Analysis Report

Generated: 2026-05-03T07:51:23.978Z

## Summary

### MA Crossover — BTC-USDT / 1H

| Rank | Params | Return % | MaxDD % | Sharpe | Trades |
|------|--------|----------|---------|--------|--------|
| 1 | fastPeriod=5, slowPeriod=21 | -3.18 | 8.56 | -0.585 | 31 |
| 2 | fastPeriod=13, slowPeriod=26 | -3.61 | 5.67 | -0.907 | 20 |
| 3 | fastPeriod=17, slowPeriod=26 | -3.66 | 7.19 | -0.850 | 24 |
| 4 | fastPeriod=9, slowPeriod=21 | -3.68 | 6.49 | -0.778 | 25 |
| 5 | fastPeriod=5, slowPeriod=18 | -5.61 | 8.45 | -0.769 | 35 |

- **Best Return:** -3.18%
- **Stability Ranking:** 0.624
- **Overfit Warning:** YES
- **Total Parameter Combos Tested:** 16

### RSI Mean Reversion — BTC-USDT / 1H

| Rank | Params | Return % | MaxDD % | Sharpe | Trades |
|------|--------|----------|---------|--------|--------|
| 1 | period=7, oversold=25, overbought=75 | 13.92 | 3.73 | 0.609 | 12 |
| 2 | period=21, oversold=35, overbought=70 | 12.27 | 1.16 | 0.477 | 4 |
| 3 | period=7, oversold=25, overbought=70 | 11.25 | 4.82 | 0.424 | 13 |
| 4 | period=7, oversold=30, overbought=70 | 10.85 | 4.82 | 0.390 | 16 |
| 5 | period=14, oversold=30, overbought=75 | 9.78 | 2.08 | 0.338 | 4 |

- **Best Return:** 13.92%
- **Stability Ranking:** 0.223
- **Overfit Warning:** no
- **Total Parameter Combos Tested:** 27

### Volatility Breakout — BTC-USDT / 1H

| Rank | Params | Return % | MaxDD % | Sharpe | Trades |
|------|--------|----------|---------|--------|--------|
| 1 | lookback=10, atrPeriod=21, atrMultiplier=1.5 | 10.55 | 0.00 | 0.397 | 2 |
| 2 | lookback=20, atrPeriod=21, atrMultiplier=1.5 | 10.55 | 0.00 | 0.397 | 2 |
| 3 | lookback=30, atrPeriod=21, atrMultiplier=1.5 | 10.55 | 0.00 | 0.397 | 2 |
| 4 | lookback=20, atrPeriod=14, atrMultiplier=1.5 | 4.53 | 0.00 | -0.127 | 1 |
| 5 | lookback=10, atrPeriod=14, atrMultiplier=1.5 | 2.89 | 1.57 | -0.317 | 2 |

- **Best Return:** 10.55%
- **Stability Ranking:** 0.000
- **Overfit Warning:** YES
- **Total Parameter Combos Tested:** 27
