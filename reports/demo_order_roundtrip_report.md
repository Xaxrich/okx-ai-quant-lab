# Demo Order Roundtrip Report

Generated: 2026-05-03T08:12:10.078Z

**Outcome: COMPLETED SUCCESSFULLY**

## Roundtrip Summary

| Field | Value |
|-------|-------|
| Intent ID | intent_1777795925407_2490d0c6 |
| Profile | okx-demo |
| Mode | demo |
| Instrument | BTC-USDT |
| Side | buy |
| Order Type | limit |
| Price | $7843 |
| Size | 0.0001 |
| Notional | $0.78 |
| Risk Decision | PENDING_APPROVAL |
| Human Confirmation | EXECUTE_DEMO_ORDER |
| clOrdId | okxql20260503f2c77c0dd79a |
| Submit Command | okx spot place --instId BTC-USDT --side buy --sz 0.0001 --ordType limit --px 7843 --tdMode cash --clOrdId okxql20260503f2c77c0dd79a --profile ***REDACTED*** |
| Ledger Update | unchanged: no fill |

## Safety Gates

| Gate | Status |
|------|--------|
| Live trading | BLOCKED |
| Market order | NOT USED |
| SWAP/FUTURES/OPTION | NOT TARGETED |
| Far-from-market price | YES |
| Cancel-after-submit | YES |
| Audit log written | YES |
| API keys in report | NO |

## Phase Timeline

1. Risk Policy Check — verify all safety gates
2. Order Intent — generate far-from-market limit order
3. Risk Guard — validate against policy
4. Execution — submit, query, cancel, query
5. Audit — write complete audit trail