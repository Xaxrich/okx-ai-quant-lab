# No-Arkham Breakout Structure Discovery Report

Generated: 2026-05-05T07:15:03.831Z
NO_ARKHAM_MODE: true

## 1. Executive Summary

**NO_ARKHAM_SYSTEM_VIABLE**
Metrics evaluated: 18
STRUCTURAL_RISK: 5 | STRUCTURAL_CONTEXT: 6 | NOISE: 2 | INSUFFICIENT: 5
System viable without Arkham: true

## 2. Data Source Inventory

| Source | Status | Provides |
|--------|--------|----------|
| CoinGecko | ACTIVE | Price, volume, market cap, DEX pool OHLCV |
| CoinGlass | ACTIVE | Multi-exchange OI, funding, liquidation |
| OKX | ACTIVE | Single-exchange OI, funding |
| Moralis | ACTIVE | Transfer-lite, entity-lite labels, holder-lite |
| CMC | ACTIVE | Supply, FDV, market cap cross-check |
| DexScreener | ACTIVE | DEX snapshot liquidity, pair activity |
| Arkham | DISABLED | Local cache only: entity labels, holders, volume, segmented transfers |

## 3. Metric Validation Results

| Metric | Group | Source | P0 Mean | Ctrl Mean | Disc | Classification | Decision |
|--------|-------|--------|---------|-----------|------|---------------|----------|
| PV_001 | price_volume | CoinGecko | 0.289 | 0.013 | 10.1 | STRUCTURAL_RISK | PROMOTE_TO_REGISTRY_RISK_ONLY |
| PV_002 | price_volume | CoinGecko | 0.304 | -0.049 | 3.2 | STRUCTURAL_CONTEXT | PROMOTE_TO_REGISTRY_RESEARCH_ONLY |
| PV_004 | price_volume | CoinGecko | 0.455 | 0.103 | 4.4 | STRUCTURAL_RISK | PROMOTE_TO_REGISTRY_RISK_ONLY |
| CG_OI_001 | derivatives_v2 | CoinGlass | 17179025.803 | 78617521.959 | 0.4 | STRUCTURAL_CONTEXT | KEEP_AS_CANDIDATE |
| CG_OI_002 | derivatives_v2 | CoinGlass | 1052310.615 | -4534.857 | 1.3 | NOISE | REJECT_NOISE |
| CG_OI_003 | derivatives_v2 | CoinGlass | 5817753.772 | 409852.973 | 2.8 | STRUCTURAL_CONTEXT | PROMOTE_TO_REGISTRY_RESEARCH_ONLY |
| CG_OI_004 | derivatives_v2 | CoinGlass | -0.000 | -0.000 | 1.1 | NOISE | REJECT_NOISE |
| CG_FR_001 | derivatives_v2 | CoinGlass | 0.019 | -0.004 | Infinity | STRUCTURAL_CONTEXT | PROMOTE_TO_REGISTRY_RESEARCH_ONLY |
| CG_FR_002 | derivatives_v2 | CoinGlass | -0.000 | -0.000 | Infinity | STRUCTURAL_CONTEXT | PROMOTE_TO_REGISTRY_RESEARCH_ONLY |
| CG_LIQ_001 | derivatives_v2 | CoinGlass | 857373.471 | 144179.070 | 7.8 | STRUCTURAL_RISK | PROMOTE_TO_REGISTRY_RISK_ONLY |
| CG_LIQ_002 | derivatives_v2 | CoinGlass | 0.000 | 0.000 | 1.5 | STRUCTURAL_CONTEXT | KEEP_AS_CANDIDATE |
| OKX_OI_002 | derivatives_v2 | OKX | 0.000 | 0.000 | 0.0 | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| OKX_FR_001 | derivatives_v2 | OKX | 0.000 | 0.000 | Infinity | STRUCTURAL_RISK | PROMOTE_TO_REGISTRY_RISK_ONLY |
| OKX_FR_002 | derivatives_v2 | OKX | 0.000 | 0.000 | Infinity | STRUCTURAL_RISK | PROMOTE_TO_REGISTRY_RISK_ONLY |
| DEX_001 | dex_history | CoinGecko Pool OHLCV | 0.000 | 0.000 | 0.0 | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| DEX_002 | dex_history | CoinGecko Pool OHLCV | 0.000 | 0.000 | 0.0 | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| SUP_001 | supply_float | CMC+Etherscan | 0.000 | 0.000 | 0.0 | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| MT_001 | moralis_transfer_lite | Moralis | 0.000 | 0.000 | 0.0 | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |

## 4. Composite Candidates

| ID | Name | Metric A Status | Metric B Status | Combined |
|----|------|----------------|----------------|----------|
| NC_001 | price_quiet + OI_rising | STRUCTURAL_RISK | NOISE | KEEP_AS_CANDIDATE |
| NC_002 | volume_zscore + funding_neutral | STRUCTURAL_CONTEXT | STRUCTURAL_CONTEXT | STRUCTURAL_CONTEXT |
| NC_003 | OI_rising + funding_not_overheated | STRUCTURAL_CONTEXT | STRUCTURAL_CONTEXT | STRUCTURAL_CONTEXT |
| NC_004 | funding_overheated + liquidation_risk | STRUCTURAL_CONTEXT | STRUCTURAL_CONTEXT | KEEP_AS_CANDIDATE |
| NC_005 | DEX_activity + OI_confirmation | INSUFFICIENT_DATA | NOISE | NOISE |
| NC_006 | volume_zscore + OI_zscore | STRUCTURAL_CONTEXT | NOISE | KEEP_AS_CANDIDATE |

## 5. What We Can Do Without Arkham

- Market structure scan (price, volume, market cap) ✓
- Derivatives context scan (OI, funding, liquidation) ✓
- DEX activity scan (pool volume, compression/expansion) ✓
- Supply risk scan (float ratio, FDV/mcap, overhang) ✓
- Transfer-lite scan (Moralis transfer count, entity coverage) △
- Arkham local assets as historical research enrichment ✓

## 6. What We Cannot Do Without Arkham

- High-confidence entity flow attribution
- CEX flow proxy (only weak Moralis proxy available)
- Counterparty concentration analysis
- Entity-labeled transfer event windows
- Strong address/entity attribution
- Fund/market maker behavior proxy

## 7. Arkham Local Assets

- Entity label registry: 858 addresses (available offline)
- Holder entity features: 12 tokens (available offline)
- Volume time-series: 6,997 rows (available offline)
- P0 segmented transfer features: 10,559 transfers (available offline)
- Capability matrix: available for reference
- These assets remain as static enrichment — no live API needed

## 8. Scanner Candidate Layers

### Early Context Layer
- Price-volume: quiet_breakout, volume_zscore, price_acceleration
- DEX: pool volume expansion, DEX activity compression

### Confirmation Layer
- Derivatives: OI change, OI zscore, OI/market cap
- Volume: volume_zscore, volume_to_mcap

### Risk Layer
- Derivatives: funding overheated, liquidation spikes
- Supply: low float, supply overhang

### Structural Risk Layer
- Supply: circulating ratio, FDV/mcap
- DEX: low liquidity, high concentration

## 9. Next Recommendation

**RUN_NO_ARKHAM_WATCHLIST** — system viable without Arkham.
**KEEP_ARKHAM_DISABLED** — do not re-enable live API.
**CANCEL_ARKHAM_KEEP_LOCAL_ASSETS** — local assets sufficient for research enrichment.

## 10. Cannot Know

- Cannot confirm accumulation/distribution
- Cannot confirm buy/sell intent
- Cannot infer causality
- No trading recommendation