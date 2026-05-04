# Demo Strategy Runner Report

Generated: 2026-05-03T09:00:28.233Z
Run ID: run_1777798823874_c66e20fe

## Summary

| Field | Value |
|-------|-------|
| Total raw signals | 66 |
| Displayed in report | 15 |
| Strategies evaluated | 3 |
| Instruments evaluated | 2 |
| Timeframes evaluated | 1H |
| BLOCKED signals | 60 |
| OBSERVATION_ONLY signals | 6 |
| PROPOSAL_DRY_RUN signals | 0 |
| NO_SIGNAL entries | 0 |
| Executed orders | 0 |

## Strategy Summary

### MA Crossover
- **Admission status:** REJECTED
- **Raw signal count:** 50
- **Displayed:** 5
- **Actions:** BLOCKED=50, OBSERVE=0, PROPOSAL=0, NO_SIGNAL=0
- **Blocked reasons:** Strategy status is REJECTED — all signals blocked.
- **Recommendation:** Do not use — all signals blocked

### RSI Mean Reversion
- **Admission status:** REJECTED
- **Raw signal count:** 10
- **Displayed:** 5
- **Actions:** BLOCKED=4, OBSERVE=6, PROPOSAL=0, NO_SIGNAL=0
- **Blocked reasons:** Strategy status is REJECTED — all signals blocked.
- **Recommendation:** Do not use — all signals blocked

### Volatility Breakout
- **Admission status:** REJECTED
- **Raw signal count:** 6
- **Displayed:** 5
- **Actions:** BLOCKED=6, OBSERVE=0, PROPOSAL=0, NO_SIGNAL=0
- **Blocked reasons:** Strategy status is REJECTED — all signals blocked.
- **Recommendation:** Do not use — all signals blocked

## Instrument Summary

### BTC-USDT
- Signal count: 30
  - MA Crossover: 24
  - RSI Mean Reversion: 4
  - Volatility Breakout: 2

### ETH-USDT
- Signal count: 36
  - MA Crossover: 26
  - RSI Mean Reversion: 6
  - Volatility Breakout: 4

## Market Snapshot

### BTC-USDT
- Price: $78387.1
- 24H High: $79198.6 / Low: $78061.9
- Volume: 1837.42019851
- Regime: N/A

### ETH-USDT
- Price: $2308.25
- 24H High: $2343.12 / Low: $2297.7
- Volume: 34361.264401
- Regime: N/A

## Signal Samples

### MA Crossover — BTC-USDT (showing 5/24)

| # | Signal | Confidence | Admission | Action | Reason |
|---|--------|------------|-----------|--------|--------|
| 1 | BUY | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed above Slow MA(21) |
| 2 | SELL | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed below Slow MA(21) |
| 3 | BUY | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed above Slow MA(21) |
| 4 | SELL | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed below Slow MA(21) |
| 5 | BUY | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed above Slow MA(21) |

### RSI Mean Reversion — BTC-USDT (showing 4/4)

| # | Signal | Confidence | Admission | Action | Reason |
|---|--------|------------|-----------|--------|--------|
| 1 | BUY | 0.59 | REJECTED | BLOCKED | RSI crossed below 30 (oversold) |
| 2 | SELL | 0.56 | REJECTED | BLOCKED | RSI crossed above 70 (overbought) |
| 3 | BUY | 0.52 | REJECTED | BLOCKED | RSI crossed below 30 (oversold) |
| 4 | SELL | 0.60 | REJECTED | BLOCKED | RSI crossed above 70 (overbought) |

### Volatility Breakout — BTC-USDT (showing 2/2)

| # | Signal | Confidence | Admission | Action | Reason |
|---|--------|------------|-----------|--------|--------|
| 1 | BUY | 0.55 | REJECTED | BLOCKED | Close 74631.2 broke above 74605.85 |
| 2 | SELL | 0.70 | REJECTED | BLOCKED | Stop loss: close 73892.5 below stop 73928.60 |

### MA Crossover — ETH-USDT (showing 5/26)

| # | Signal | Confidence | Admission | Action | Reason |
|---|--------|------------|-----------|--------|--------|
| 1 | BUY | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed above Slow MA(21) |
| 2 | SELL | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed below Slow MA(21) |
| 3 | BUY | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed above Slow MA(21) |
| 4 | SELL | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed below Slow MA(21) |
| 5 | BUY | 0.60 | REJECTED | BLOCKED | Fast MA(9) crossed above Slow MA(21) |

### RSI Mean Reversion — ETH-USDT (showing 5/6)

| # | Signal | Confidence | Admission | Action | Reason |
|---|--------|------------|-----------|--------|--------|
| 1 | BUY | 0.57 | RESEARCH_ONLY | OBSERVATION_ONLY | RSI crossed below 30 (oversold) |
| 2 | SELL | 0.63 | RESEARCH_ONLY | OBSERVATION_ONLY | RSI crossed above 70 (overbought) |
| 3 | BUY | 0.67 | RESEARCH_ONLY | OBSERVATION_ONLY | RSI crossed below 30 (oversold) |
| 4 | SELL | 0.54 | RESEARCH_ONLY | OBSERVATION_ONLY | RSI crossed above 70 (overbought) |
| 5 | BUY | 0.51 | RESEARCH_ONLY | OBSERVATION_ONLY | RSI crossed below 30 (oversold) |

### Volatility Breakout — ETH-USDT (showing 4/4)

| # | Signal | Confidence | Admission | Action | Reason |
|---|--------|------------|-----------|--------|--------|
| 1 | BUY | 0.55 | REJECTED | BLOCKED | Close 2352.82 broke above 2320.34 |
| 2 | SELL | 0.70 | REJECTED | BLOCKED | Stop loss: close 2314.23 below stop 2314.45 |
| 3 | BUY | 0.55 | REJECTED | BLOCKED | Close 2436.92 broke above 2429.29 |
| 4 | SELL | 0.70 | REJECTED | BLOCKED | Stop loss: close 2405.14 below stop 2406.93 |

## Risk Decisions

- [BLOCKED] Strategy status is REJECTED — all signals blocked.
- [OBSERVATION] 6 signals logged for research
- [PROPOSAL] 0 proposals generated (dry-run only)

## Paper Portfolio

- BTC-USDT: qty=0.01, avgEntry=$78000.00, realizedPnL=$0.00
- Daily PnL: realized=$0.00, unrealized=$-80.00
- Trade count today: 0
- Loss limit: HIT

## Audit

- Signal journal: data/signals/signal_journal.jsonl
- Audit log: logs/audit_20260503.jsonl
- Run ID: run_1777798823874_c66e20fe

## Safety State

| Gate | Status |
|------|--------|
| Live trading | DISABLED |
| Demo execution | DISABLED |
| Market order | BLOCKED |
| Derivatives (SWAP/FUTURES/OPTION) | BLOCKED |
| Executed orders | 0 |
| Strategies admitted | 0 |