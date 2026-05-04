# Strategy Scorecard

Generated: 2026-05-03T09:00:23.073Z

## Overall Summary

| Strategy | Cross-Instrument Stability | Cross-Timeframe Stability | Recommendation |
|----------|---------------------------|---------------------------|----------------|
| MA Crossover | 0.890 | 0.200 | Do not use — fails core criteria |
| RSI Mean Reversion | 0.895 | 0.200 | Continue research, more data needed |
| Volatility Breakout | 0.094 | 0.200 | Do not use — fails core criteria |

## Per-Strategy Details

### MA Crossover

| Inst | Bar | Return % | MaxDD % | Sharpe | Trades | Stability | Status |
|------|-----|----------|---------|--------|--------|-----------|--------|
| BTC-USDT | 1H | 1.61 | 4.82 | -0.175 | 12 | 0.000 | REJECTED |
| ETH-USDT | 1H | 2.04 | 5.13 | -0.119 | 13 | 0.000 | REJECTED |

**Recommendation:** Do not use — fails core criteria

**Per-score recommendations:**
- BTC-USDT/1H: Unstable parameters — likely overfit (Return: 1.61%, Sharpe: -0.175)
- ETH-USDT/1H: Unstable parameters — likely overfit (Return: 2.04%, Sharpe: -0.119)

### RSI Mean Reversion

| Inst | Bar | Return % | MaxDD % | Sharpe | Trades | Stability | Status |
|------|-----|----------|---------|--------|--------|-----------|--------|
| BTC-USDT | 1H | 8.50 | 0.00 | 0.736 | 2 | 0.234 | REJECTED |
| ETH-USDT | 1H | 10.52 | 0.00 | 1.090 | 5 | 0.690 | RESEARCH_ONLY |

**Recommendation:** Continue research, more data needed

**Per-score recommendations:**
- BTC-USDT/1H: Insufficient trades — not enough signal (Return: 8.50%, Sharpe: 0.736)
- ETH-USDT/1H: Promising stability — gather more data (Return: 10.52%, Sharpe: 1.090)

### Volatility Breakout

| Inst | Bar | Return % | MaxDD % | Sharpe | Trades | Stability | Status |
|------|-----|----------|---------|--------|--------|-----------|--------|
| BTC-USDT | 1H | 0.00 | 1.29 | 0.000 | 0 | 0.000 | REJECTED |
| ETH-USDT | 1H | -1.94 | 3.51 | -2.063 | 1 | 0.712 | REJECTED |

**Recommendation:** Do not use — fails core criteria

**Per-score recommendations:**
- BTC-USDT/1H: Insufficient trades — not enough signal (Return: 0.00%, Sharpe: 0.000)
- ETH-USDT/1H: Insufficient trades — not enough signal (Return: -1.94%, Sharpe: -2.063)

## Warnings

- **MA Crossover / BTC-USDT / 1H:** Trade count: 12 (minimum recommended: 30) — **under-sampled**; Parameter stability: 0.000 (minimum: 0.6) — **likely overfit**
- **MA Crossover / ETH-USDT / 1H:** Trade count: 13 (minimum recommended: 30) — **under-sampled**; Parameter stability: 0.000 (minimum: 0.6) — **likely overfit**
- **RSI Mean Reversion / BTC-USDT / 1H:** Sample size: 2 trades (minimum recommended: 30) — **SEVERE UNDER-SAMPLING**; Parameter stability: 0.234 (minimum: 0.6) — **likely overfit**
- **RSI Mean Reversion / ETH-USDT / 1H:** Trade count: 5 (minimum recommended: 30) — **under-sampled**
- **Volatility Breakout / BTC-USDT / 1H:** Sample size: 0 trades (minimum recommended: 30) — **SEVERE UNDER-SAMPLING**; Parameter stability: 0.000 (minimum: 0.6) — **likely overfit**
- **Volatility Breakout / ETH-USDT / 1H:** Sample size: 1 trades (minimum recommended: 30) — **SEVERE UNDER-SAMPLING**

## Current Recommendation

- **MA Crossover / BTC-USDT / 1H:** Fails core criteria. **Allowed action: BLOCKED. Do not use.**
- **MA Crossover / ETH-USDT / 1H:** Fails core criteria. **Allowed action: BLOCKED. Do not use.**
- **RSI Mean Reversion / BTC-USDT / 1H:** Fails core criteria. **Allowed action: BLOCKED. Do not use.**
- **RSI Mean Reversion / ETH-USDT / 1H:** Promising but under-sampled. Continue observation. Gather more walk-forward windows. **Allowed action: OBSERVATION_ONLY only.**
- **Volatility Breakout / BTC-USDT / 1H:** Fails core criteria. **Allowed action: BLOCKED. Do not use.**
- **Volatility Breakout / ETH-USDT / 1H:** Fails core criteria. **Allowed action: BLOCKED. Do not use.**

## Safety Note

- All scores below ADMITTED_TO_DEMO threshold. No strategy may auto-execute.
- Live trading remains disabled.
- Demo execution requires explicit --execute-demo + EXECUTE_DEMO_ORDER.