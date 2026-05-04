# CoinGlass Feature Builder Report

Generated: 2026-05-04T14:08:03.453Z

## 1. Status

**COINGLASS_FEATURES_READY_FOR_DERIVATIVES_V2**
Readiness: OI data=true, Funding data=true, Liquidation data=true, Ready tokens=10/12

## 2. Token Coverage

Tokens: 10/12 with feature-ready data
Total feature rows: 872
Fields: OI (change 1d/7d, z-score), Funding (OI-weighted, z-score, overheated), Liquidation (total, imbalance, z-score)

## 3. What CoinGlass Adds vs OKX

- Multi-exchange aggregated OI (not single-exchange)
- OI-weighted funding (more representative)
- Cross-exchange liquidation history (new capability)
- Exchange-level OI distribution (who dominates derivatives)

## 4. Next

**RUN_DERIVATIVES_V2_METRIC_LOOP** — feature table ready, metrics COMPUTABLE.

## 5. Cannot Prove

- Cannot confirm derivatives positioning from OI alone
- Cannot distinguish long vs short build-up
- No trading recommendations