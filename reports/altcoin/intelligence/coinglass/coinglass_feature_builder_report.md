# CoinGlass Feature Builder Report

Generated: 2026-05-04T13:34:37.533Z

## 1. Status

**COINGLASS_FEATURES_NOT_READY**
Readiness: OI data=false, Funding data=false, Liquidation data=false, Ready tokens=0/12

## 2. Token Coverage

Tokens: 0/12 with feature-ready data
Total feature rows: 0
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