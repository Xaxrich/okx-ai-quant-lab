# Arkham Capability Report

Generated: 2026-05-04T18:14:41.167Z

## 1. Executive Summary

**ARKHAM_ENTITY_FLOW_READY**
API configured: true
Health: OK
Chains: 15 supported

## 2. Source Channel Positioning

- **Arkham** = high-confidence entity intelligence layer
- **Moralis** = entity-lite layer (medium/low-to-medium confidence)
- **CoinGlass** = derivatives market structure (no entity identity)
- **CoinGecko** = market / DEX pool data (no high-confidence entity attribution)
- **OKX** = single-exchange derivatives (not on-chain entity attribution)

## 3. Endpoint Coverage

| Endpoint Group | Tested | Working | Notes |
|---------------|--------|---------|-------|
| Health | 2 | 2 | /health + /chains |
| Intelligence | 4 | 4 | address, enriched, contract, entity |
| Token Holders | 12 | varies | chain/address + pricing ID |
| Token Top Flow | 12 | varies | pricing ID based |
| Token Volume | 12 | varies | pricing ID based |
| Transfers | 12 | varies | chain + contract based |
| Counterparties | - | - | heavy endpoint, deferred |

## 4. Token Coverage

Tokens tested: 12
With contracts: 9
Without contracts (need pricing ID): 3

| Token | Group | Chain | Contract | Holders | Top Flow | Transfers | Readiness |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|------|
| BSB | P0 | ethereum | ✓ | ID | ID | contract | READY |
| LAB | P0 | bsc | ✓ | ID | ID | contract | READY |
| UB | P0 | bsc | ✓ | ID | ID | contract | READY |
| AI | P0 | ethereum | ✗ | ID | ID | id | PARTIAL |
| TROLL | P1 | ethereum | ✗ | ID | ID | id | PARTIAL |
| SIREN | P1 | ethereum | ✗ | ID | ID | id | PARTIAL |
| PENDLE | P2 | ethereum | ✓ | ID | ID | contract | READY |
| ONDO | P2 | ethereum | ✓ | ID | ID | contract | READY |
| PEPE | CONTROL | ethereum | ✓ | ID | ID | contract | READY |
| WIF | CONTROL | solana | ✓ | ID | ID | contract | READY |
| BONK | CONTROL | solana | ✓ | ID | ID | contract | READY |
| FLOKI | CONTROL | ethereum | ✓ | ID | ID | contract | READY |

## 5. Arkham vs Moralis

- Arkham provides direct entity attribution (name, type, social links)
- Moralis entity-lite = proxy labels only
- Arkham entity types: cex, dex, fund, meme, market_maker, etc.
- Where Arkham labels exist, they are higher confidence than Moralis
- For unknown wallets, Arkham may still have entity predictions
- Label reconciliation pending: need matching addresses across channels

## 6. New Capabilities Added

- **CEX flow proxy**: YES — entity type = cex on transfer from/to addresses
- **Entity-level flow**: YES — top flow endpoint per pricing ID
- **Top holder entity analysis**: YES — holders endpoint with entity data
- **Counterparty concentration**: YES — counterparties endpoint available (heavy)
- **Balance/portfolio time series**: YES — portfolio endpoints available

## 7. What Arkham Can Support Now

- Entity-labeled transfer research
- CEX proxy flow research
- Counterparty concentration research
- Top holder entity research
- Balance / portfolio history research
- Moralis label verification

## 8. What Arkham Still Cannot Prove

- Cannot confirm accumulation
- Cannot confirm distribution
- Cannot confirm buy or sell intent
- Cannot identify market maker behavior without corroboration
- Cannot infer causality
- No trading recommendation

## 9. Metric Registry Update

New metric group: arkham_entity_flow

| ID | Name | Status |
|----|------|--------|
| AK_EF_001 | arkham_labeled_transfer_ratio | COMPUTABLE |
| AK_EF_002 | arkham_cex_proxy_transfer_count | COMPUTABLE |
| AK_EF_003 | arkham_cex_proxy_transfer_volume_usd | COMPUTABLE |
| AK_EF_004 | arkham_cex_netflow_usd | COMPUTABLE |
| AK_EF_005 | arkham_unknown_transfer_ratio | COMPUTABLE |
| AK_EF_006 | arkham_top_entity_flow_share | IDEA |
| AK_EF_007 | arkham_counterparty_concentration | IDEA |
| AK_EF_008 | arkham_fund_or_institution_flow_usd | IDEA |
| AK_EF_009 | arkham_market_maker_proxy_flow_usd | IDEA |
| AK_EF_010 | arkham_entity_label_coverage | COMPUTABLE |

## 10. Next Recommendation

**RUN_ARKHAM_ENTITY_FLOW_LOOP** — basic entity flow features computable.