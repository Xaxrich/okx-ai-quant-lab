# Moralis Maximization Without Arkham Report

Generated: 2026-05-04T12:18:46.202Z

## 1. Status

**MORALIS_READY_FOR_ETH_ONLY_TRANSFER_LOOP** — ETH tokens have sufficient coverage.

## 2. Token Readiness

| Token | Group | Chain | Holder Stats | Hist Holders | Transfers | Entity-Lite | Readiness |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|------|
| BSB | P0 | eth | OK | FAILED | 300 rows | 50% cov, 8 CEX | MORALIS_ETH_TRANSFER_READY |
| LAB | P0 | bsc | OK | FAILED | 300 rows | 9% cov, 13 CEX | MORALIS_TRANSFER_BASIC |
| PEPE | CONTROL | eth | OK | FAILED | 300 rows | 48% cov, 67 CEX | MORALIS_ETH_TRANSFER_READY |
| FLOKI | CONTROL | eth | OK | FAILED | 300 rows | 57% cov, 45 CEX | MORALIS_ETH_TRANSFER_READY |

## 3. Metrics Added

- MT_001, MT_002: transfer z-score metrics (COMPUTABLE for ETH tokens)
- ME_001, ME_002: entity-lite coverage + CEX proxy (COMPUTABLE for ETH tokens)
- MH_001, MH_002: holder metrics (IDEA — need endpoint fix)

## 4. What Moralis Can Do Without Arkham

- ETH transfer event-window coverage: 4/4 tokens with 100+ transfers
- Entity-lite CEX proxy detection: working for ETH tokens (53-55% coverage)
- BSC coverage: weak (1-6% entity labels)
- Holder metrics endpoint: needs investigation
- Historical holders: endpoint returns data format needs validation

## 5. What Still Requires Arkham

- High-confidence entity/address intelligence
- CEX flow with strong confidence
- Top flow / token flow analysis
- Multi-source label verification

## 6. Recommendation

**RUN_PRICE_VOLUME_ROUND1A_FIRST** — price_volume has 4 computable metrics × 28 tokens. Moralis ETH transfer loop can run as Round 2 after PV is solid.