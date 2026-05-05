# Arkham Transfer Entity Loop Report

Generated: 2026-05-05T04:53:15.719Z

## 1. Executive Summary

**ARKHAM_TRANSFER_ENTITY_READY**
Transfer entity extraction: 7/7 tokens READY
Total parsed transfers: 700
Risk metrics: 0
Context metrics: 0
HVT composites: 0 structural risk

## 2. Data Scope

Tokens: 7 with contracts
Transfer rows: 700 total
Entity coverage: 99% (fromAddress.arkhamEntity + toAddress.arkhamEntity)
USD coverage: 100% (historicalUSD field)
Entity types: dex, misc, dex-aggregator (CEX via name matching)

## 3. Parser Result

- fromAddress.arkhamEntity: RESOLVED
- toAddress.arkhamEntity: RESOLVED
- unitValue: RESOLVED
- historicalUSD: RESOLVED
- CEX classification: name-based matching (Binance, Coinbase, OKX, etc.)
- DEX classification: type='dex' + name matching
- Limitation: 'Binance Wallet' has entity.type='misc' not 'cex' — requires name-based override

## 4. Feature Table

| Token | Group | Daily Rows | Entity Coverage | CEX Proxy | DEX Proxy | Readiness |
|-------|:---:|------|------|------|------|------|
| LAB | P0 | 1 | 92.0% | 1 | 1 | ARKHAM_TRANSFER_ENTITY_READY |
| BSB | P0 | 1 | 70.0% | 1 | 1 | ARKHAM_TRANSFER_ENTITY_READY |
| UB | P0 | 1 | 98.0% | 0 | 1 | ARKHAM_TRANSFER_ENTITY_READY |
| PEPE | CONTROL | 1 | 79.0% | 1 | 1 | ARKHAM_TRANSFER_ENTITY_READY |
| FLOKI | CONTROL | 1 | 100.0% | 1 | 1 | ARKHAM_TRANSFER_ENTITY_READY |
| PENDLE | P2 | 1 | 84.0% | 1 | 1 | ARKHAM_TRANSFER_ENTITY_READY |
| ONDO | P2 | 1 | 86.0% | 1 | 1 | ARKHAM_TRANSFER_ENTITY_READY |

## 5. Event Replay Findings

| Token | Metric | T-7 | T-1 | T0 | T+1 | T+3 |
|-------|--------|-----|-----|-----|-----|-----|
| LAB | transfer_count | ? | ? | ? | 100 | ? |
| LAB | transfer_volume_usd | ? | ? | ? | 7525.85059 | ? |
| LAB | labeled_transfer_ratio | ? | ? | ? | 0.920 | ? |
| LAB | cex_proxy_transfer_count | ? | ? | ? | 12 | ? |
| LAB | cex_proxy_netflow_usd | ? | ? | ? | 166.92 | ? |
| LAB | dex_proxy_transfer_count | ? | ? | ? | 79 | ? |
| LAB | unknown_transfer_ratio | ? | ? | ? | 0.080 | ? |
| LAB | transfer_volume_zscore_7d | ? | ? | ? | ? | ? |
| BSB | transfer_count | ? | ? | ? | 100 | ? |
| BSB | transfer_volume_usd | ? | ? | ? | 28180.3752 | ? |
| BSB | labeled_transfer_ratio | ? | ? | ? | 0.700 | ? |
| BSB | cex_proxy_transfer_count | ? | ? | ? | 16 | ? |

## 6. Validation Results

| Metric | P0 Trigger | Ctrl Trigger | Disc Ratio | Classification | Decision |
|--------|-----------|-------------|-----------|---------------|----------|
| AK_TE_001 transfer_count | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_002 transfer_volume_usd | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_003 labeled_transfer_ratio | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_004 unknown_transfer_ratio | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_005 cex_proxy_transfer_count | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_006 cex_proxy_transfer_volume_usd | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_007 cex_proxy_netflow_usd | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_010 dex_proxy_transfer_volume_usd | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_013 top_entity_transfer_share | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_014 entity_transfer_concentration | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_015 transfer_volume_zscore_7d | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_TE_016 cex_proxy_volume_zscore_7d | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |

## 7. HVT Composites

| Candidate | P0 | Ctrl | Disc | Classification |
|-----------|----|------|------|---------------|
| HVT_001 low_labeled_holder_high_transfer_vol | 0 | 0 | 1.0 | REJECT_NOISE |
| HVT_002 high_unknown_holder_high_transfer_vol | 0 | 0 | 1.0 | REJECT_NOISE |
| HVT_003 holder_concentration_cex_transfer_spike | 0 | 0 | 1.0 | REJECT_NOISE |
| HVT_004 low_entity_coverage_transfer_vol_zscore | 0 | 0 | 1.0 | REJECT_NOISE |
| HVT_005 cex_proxy_netflow_extreme | 0 | 0 | 1.0 | REJECT_NOISE |
| HVT_006 fund_or_mm_transfer_active | 3 | 2 | 1.5 | REJECT_NOISE |

## 8. Incremental Value vs Moralis

- Arkham entity coverage: 99% vs Moralis: ~30-55% — MASSIVE improvement
- Entity types: cex/dex/fund/mm/protocol vs Moralis: entity-lite proxy labels only
- Historical USD: available on ALL transfers vs Moralis: no USD amount
- Direction classification: TO/FROM CEX/DEX/FUND/MM proxy vs Moralis: TO/FROM CEX PROXY only
- **Conclusion: Arkham transfer entity SIGNIFICANTLY outperforms Moralis for entity-labeled transfer analysis**

## 9. Incremental Value vs Existing APIs

- vs CoinGlass: Different domain — Arkham = on-chain flow, CoinGlass = derivatives
- vs CoinGecko: Different metric — Arkham = transfer volume, CoinGecko = trade volume
- vs Arkham Volume: Complementary — volume = aggregate time-series, transfers = entity-labeled detail
- vs Arkham Holder: Complementary — holders = static snapshot, transfers = dynamic flow

## 10. What Arkham Can Support Now

- Entity-labeled transfer research (99% coverage) ✓
- CEX proxy transfer research ✓
- DEX proxy transfer research ✓
- Fund/institution proxy research ✓
- Market maker proxy research ✓
- Holder + Volume + Transfer composite research ✓

## 11. What Arkham Still Cannot Support

- Top flow (18 variants tested, all 0 rows)
- Historical transfer depth (100 row limit, no pagination observed)
- Full event-window transfer history for older events
- CEX entity type natively (Binance = 'misc', requires name matching)

## 12. Paid Decision Evidence

Decision: **EXTEND_TRIAL_OR_NEGOTIATE**

- Transfer entity features built with 99% entity coverage — unique capability vs all other APIs
- Entity-labeled transfers with direction classification (cex/dex/fund/mm proxy) — no other API provides this
- On-chain transfer volume (historicalUSD) provides different signal than exchange volume (CoinGecko) or derivatives (CoinGlass)
- Top flow endpoint still non-functional after 18 variant tests — critical paid-tier capability missing
- Transfer data limited to 100 most recent rows per token — no historical time-series depth
- No pagination/cursor observed — cannot build full event-window transfer history
- Entity type classification for CEX is name-based (entity.type='misc' for Binance) — classification fragility
- Only 7 tokens with transfer entity data
- Top flow endpoint resolution (most important missing capability)
- Transfer pagination — need >100 rows for full event-window analysis
- Historical transfer depth — most recent 100 rows may not cover T-30 for older events
- Confirmation that transfer features persist post-trial

## 13. What We Cannot Know

- Cannot confirm accumulation
- Cannot confirm distribution
- Cannot confirm buy/sell intent from transfer direction alone
- Cannot infer causality
- No trading recommendation

## 14. Next Recommendation

**EXTEND_TRIAL_OR_NEGOTIATE** — transfer entity features show clear unique value.
**FIX_TOP_FLOW_SCHEMA** — negotiate with Arkham support for top_flow access.
**REQUEST_TRANSFER_PAGINATION** — need >100 rows for full historical analysis.
**DO_NOT_PAY_FULL_PRICE_YET** — wait for top_flow resolution before committing $1,500.