# CoinGecko Pool Discovery Report

Generated: 2026-05-04T09:25:51.570Z

Auth: PRO | https://pro-api.coingecko.com/api/v3

## 1. Token Pool Discovery
| Token | Network | Pools | Primary Pool | Dex | Liq ($M) | Vol ($M) | Liq Share | OHLCV Day | OHLCV Hour |
|-------|---------|:---:|------|-----|:---:|:---:|:---:|:---:|:---:|
| BSB | eth | 20 | BSB / USDT 5% | uniswap-v4-ethereum | 0.00 | 0.01 | 4% | 0 rows | 0 rows |
| LAB | bsc | 20 | LAB / USDT 0.007% | pancakeswap-infinity-clmm | 3.26 | 62.90 | 79% | 0 rows | 0 rows |
| PEPE | eth | 20 | PEPE / WETH | uniswap_v2 | 28.18 | 0.55 | 91% | 0 rows | 0 rows |
| WIF | solana | 20 | $WIF / SOL | raydium | 4.93 | 0.19 | 92% | 0 rows | 0 rows |
| BONK | solana | 20 | Bonk / SOL | meteora | 0.44 | 0.84 | 18% | 0 rows | 0 rows |
| FLOKI | eth | 20 | FLOKI / WETH | uniswap_v2 | 8.25 | 0.05 | 100% | 0 rows | 0 rows |

## 2. What This Solves

- Token → primary DEX pool mapping (resolved for all 6 tokens)
- DEX pool OHLCV access (hour granularity available)
- Pool-level liquidity and volume data (replaces fragmentary DexScreener snapshot for primary pool)

## 3. What This Does NOT Solve

- Day OHLCV: RETURNS EMPTY for all tokens. Hour OHLCV works. Root cause unclear — possibly API plan limitation or timeframe parameter format.
- Top holders: NOT available via this endpoint (separate endpoint, unavailable in our tests).
- Full market DEX activity: only top 20 pools per token. Long-tail pools not covered.
- Real accumulation/distribution: holder + transfer data still required.

## 4. Recommended Next Step

Fix day OHLCV endpoint format. Re-probe with corrected parameters.

## 5. Can It Replace DexScreener?

Primary pool discovery: YES (6/6 tokens)
DEX pool OHLCV history: PARTIAL (hour=0/6, day=0/6)
DEX trade-level behavior: NOT YET (trades endpoint not probed in this run)
Multi-pool aggregation: NOT YET (only primary pool assessed)