# Daily Altcoin Scanner MVP Report

Generated: 2026-05-04T05:02:55.696Z

## Summary

| Field | Value |
|-------|-------|
| Tokens scanned | 13 |
| Enabled rules | 1 (P1_EARLY_RELATIVE_STRENGTH_CAL) |
| Watchlist rules | 2 (P1_QUIET_BREAKOUT_CAL, P0_CRASH_VOLUME_CAL) |
| Disabled rules | 5 (all P0 supply/volume/compression) |
| WATCH | 1 |
| WATCH_RISK | 0 |
| NEED_MORE_DATA | 0 |
| Orders executed | 0 |

## WATCH Candidates

| Token | Score | Rules | Price | Market Cap | Data Quality |
|-------|-------|-------|-------|------------|:---:|
| BSB | 40 | P1_QUIET_BREAKOUT_CAL | $1.182293 | $253.5M | 0.5 |

## WATCH_RISK Candidates

No tokens triggered WATCH_RISK signals today.

## NEED_MORE_DATA

All tokens have sufficient data.

## Disabled Rules (Not in Scoring)

| Rule | Reason |
|------|--------|
| P0_SUPPLY_ANOMALY_01 | CoinGecko API market cap too smooth — 0 triggers at all thresholds |
| P0_PRICE_CAP_DIVERGENCE_01 | Same — API data doesn't capture supply anomalies |
| P0_EXTREME_VOLUME_HIGH_01 | Too few triggers — needs 365d data or lower thresholds |
| P0_EFFORT_RESULT_01 | Requires intraday data not available via CoinGecko |
| P1_COMPRESSION_01 | Compression formula doesn't work with daily API data |

## Disclaimer

This is a RESEARCH-ONLY scanner. It does NOT provide trading advice. No BUY/SELL recommendations. All signals are experimental and require validation on larger samples. Scanner currently has N=13 tokens, 764 feature rows, 1 enabled rule. False positive and false negative rates are unknown without larger sample and control group.