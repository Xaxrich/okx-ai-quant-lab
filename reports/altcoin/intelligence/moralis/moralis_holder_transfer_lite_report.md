# Moralis Holder-Transfer Lite Report

Generated: 2026-05-04T11:57:32.587Z

## 1. Status

**MORALIS_HOLDER_TRANSFER_READY** — holders + transfers + entity-lite labels working for ETH tokens.

## 2. Token Coverage

| Token | Group | Holders | Transfers | Entity Label Cov | Readiness |
|-------|:---:|:---:|:---:|:---:|------|
| BSB | P0 | ✗ | ✓ | 54% | MORALIS_TRANSFER_ONLY |
| LAB | P0 | ✗ | ✓ | 23% | MORALIS_TRANSFER_ONLY |
| PEPE | CONTROL | ✗ | ✓ | 48% | MORALIS_TRANSFER_ONLY |
| FLOKI | CONTROL | ✗ | ✓ | 55% | MORALIS_TRANSFER_ONLY |

## 3. What This Data Supports

- Holder concentration proxy (top10 share available)
- Transfer entity-lite classification (CEX proxy, DEX pool, unknown wallets)
- Large transfer monitoring

## 4. What This Cannot Prove

- Cannot confirm accumulation or distribution
- Cannot confirm CEX inflow/outflow (labels are Moralis entity-lite, MEDIUM confidence)
- Transfer does NOT imply buy or sell direction
- BSC chain (LAB) has weaker entity labels
- Moralis is not Arkham-equivalent

## 5. Metric Registry Update

Added 3 transfer_flow_lite metrics: TF_001 (transfer z-score), TF_002 (entity label coverage), TF_003 (CEX proxy count).

## 6. Recommendation

**ADD_TRANSFER_FLOW_LITE_TO_METRIC_LOOP** — run transfer_flow_lite group alongside price_volume Round 1 for P0 tokens.