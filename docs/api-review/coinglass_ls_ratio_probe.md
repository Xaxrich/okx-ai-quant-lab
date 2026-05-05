# CoinGlass Long/Short Ratio — Endpoint Probe

Date: 2026-05-05
Plan: HOBBYIST
Status: NOT AVAILABLE

## Variants tested (all return 404)

- `/api/futures/long-short-ratio/aggregated-history?symbol=LAB&interval=1d`
- `/api/futures/long-short-ratio/aggregated-history?symbol=LAB&interval=4h`
- `/api/futures/long-short-ratio/aggregated-history?symbol=LAB&interval=4h&exchange=Binance`
- `/api/futures/long-short-ratio/aggregated-history?symbol=BTC&interval=1d`
- `/api/futures/long-short-ratio/global`
- `/api/futures/long-short-ratio/aggregated`
- `/api/futures/longShortRatio/aggregated-history`
- `/api/futures/accounts/long-short-ratio`

All return: `{"code":"404","msg":"Endpoint not found."}`

## Conclusion

L/S ratio endpoint requires STANDARD or higher plan. Not available on HOBBYIST.

## Workaround

Use liquidation direction bias as a proxy for market sentiment:
- Upward liquidation > Downward = longs being squeezed (bullish pressure)
- Downward liquidation > Upward = shorts being squeezed (bearish pressure)
- Already implemented in `lab_advanced_indicators.ts`
