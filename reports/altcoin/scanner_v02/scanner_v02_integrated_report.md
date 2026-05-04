# Scanner v02 Integrated Report

Generated: 2026-05-04T06:42:41.084Z

## 1. What Changed

- DEX aggregation (`dex_token_level_features.csv`) now used as primary DEX data source
- Supply scope summary (`supply_scope_summary.csv`) now used for supply assessment
- **Removed:** CMC DEX volume / single pair liquidity (invalid cross-source ratio)
- **Removed:** OK label, AVOID_HIGH_RISK label
- **Added:** STRUCTURAL_RISK_HIGH, WATCH_RISK_HIGH labels
- **Added:** Supply confidence multiplier (MULTICHAIN_PARTIAL caps score at 0.7x)
- **Added:** Token-level DEX turnover = sum(pair_vol) / sum(pair_liq)

## 2. Final Token Scores

| Token | Label | Score | Confidence | Supply | DEX Liq | DEX Turn | Buy/Sell | DQ | Main Reason |
|-------|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|------|
| BSB | **WATCH_RISK** | 34 | LOW_TO_MEDIUM | 14 | 10 | 0 | 10 | 0.7 | Supply overhang: circulating/total ratio 21%. Scope: MULTICHAIN_PARTIAL. Confide |
| LAB | **WATCH** | 18 | null | 0 | 3 | 15 | 0 | 0.7 | Extreme DEX turnover: 26.0x token-level (sum vol/sum liq). 138733 txns/24h. |
| PEPE | **NEED_MORE_DATA** | 5 | MEDIUM | 0 | 5 | 0 | 0 | 0.45 | Supply data unavailable — CMC ID may not be configured or on-chain fetch failed. |
| WIF | **NEED_MORE_DATA** | 5 | MEDIUM | 0 | 5 | 0 | 0 | 0.45 | Supply data unavailable — CMC ID may not be configured or on-chain fetch failed. |
| BONK | **NEED_MORE_DATA** | 0 | MEDIUM | 0 | 0 | 0 | 0 | 0.45 | Supply data unavailable — CMC ID may not be configured or on-chain fetch failed. |

## 3. Deprecated Metrics (Removed)

| Metric | Why Removed |
|--------|------------|
| CMC DEX volume / single pair liquidity | Cross-source ratio — numerator and denominator from different aggregations. Replaced by token-level sum(vol)/sum(liq). |
| OK label | Implied safety assessment. Replaced by NO_CURRENT_FLAG. |
| AVOID_HIGH_RISK label | Trading-advice connotation. Replaced by STRUCTURAL_RISK_HIGH. |
| 123x BSB DEX turnover | Based on invalid cross-source ratio. Correct value: 0.2x token-level. |

## 4. Current Scanner Status

**LIMITED_SNAPSHOT_SCANNER**

- Supply: snapshot only (CMC + single-chain on-chain). No historical supply tracking.
- DEX: snapshot only (DexScreener current pairs). No historical liquidity/volume trend.
- N=5 tokens. Not statistically meaningful.
- No on-chain holder/transfer data integrated.

## 5. Next Step

Integrated scores stable. Ready to expand to N=20-30 tokens after:
1. Configure CMC IDs for LAB, PEPE, WIF, BONK
2. Set up BaseScan/BscScan API for multi-chain supply verification
3. Add CoinGecko price/volume history back for time-series features