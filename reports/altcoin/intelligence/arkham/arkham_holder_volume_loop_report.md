# Arkham Holder + Volume Structural Loop Report

Generated: 2026-05-05T04:32:53.133Z

## 1. Executive Summary

**ARKHAM_VOLUME_USEFUL_FLOW_NOT_READY**
Volume features: GENERATED
Volume useful: true
Top flow working: false
Transfers entity working: false
Full entity-flow ready: false

## 2. Data Scope

- Holder entity: 12 tokens (Phase 6.4B)
- Volume time-series: 4/4 P0 tokens
- Top flow schema: STILL 0 ROWS
- Transfers schema: STILL UNRESOLVED

## 3. Holder-Entity Summary

P0 tokens have lower entity coverage (40%) vs controls (82.5%).
P0 tokens have higher unknown holder ratio (60%) vs controls (17.5%).
These are structural characteristics, not directional signals.

## 4. Volume Feature Results

| Token | Group | Rows | Date Range | Notes |
|-------|:---:|------|------------|-------|
| LAB | OK | 203 | 2026-02-24 to 2026-02-15 |  |
| UB | OK | 239 | 2026-02-01 to 2026-04-25 |  |
| BSB | OK | 62 | 2026-04-10 to 2026-03-18 |  |
| AI | LIMITED | 7 | 2026-05-02 to 2026-05-01 | Short history |
| PEPE | OK | 1112 | 2023-05-01 to 2025-04-14 |  |
| WIF | LIMITED | 0 | NO DATA | No volume data |
| BONK | OK | 1226 | 2026-03-24 to 2024-10-20 |  |
| FLOKI | OK | 1562 | 2022-08-12 to 2022-07-01 |  |
| PENDLE | OK | 1749 | 2023-07-18 to 2024-03-25 |  |
| ONDO | OK | 837 | 2025-04-09 to 2025-05-03 |  |

## 5. Volume Validation

| Metric | P0 Trigger | Control Trigger | Disc Ratio | Classification | Decision |
|--------|-----------|----------------|-----------|---------------|----------|
| AK_VOL_001 arkham_total_volume_usd | 0.0% | 1.3% | 0.0 | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_VOL_002 arkham_volume_zscore_7d | 9.5% | 8.4% | 1.1 | NOISE | REJECT_NOISE |
| AK_VOL_003 arkham_volume_zscore_30d | 5.3% | 5.6% | 1.0 | NOISE | REJECT_NOISE |
| AK_VOL_004 arkham_net_volume_usd | 0.0% | 0.8% | 0.0 | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_VOL_005 arkham_net_volume_zscore_7d | 4.9% | 4.7% | 1.1 | NOISE | REJECT_NOISE |
| AK_VOL_006 arkham_in_out_imbalance | 12.7% | 3.1% | 4.1 | RISK | PROMOTE_TO_REGISTRY_RISK_ONLY |
| AK_VOL_007 arkham_volume_change_3d | 0.0% | 0.6% | 0.0 | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_VOL_008 arkham_volume_change_7d | 0.0% | 0.1% | 0.0 | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |

Key finding: P0 tokens show extreme volume z-scores (>2.5) at/near peak.
PEPE (control): volume z-scores NEGATIVE during its 9.4% minor peak — no volume confirmation.
Volume extremes are RISK indicators (confirm activity), NOT directional buy/sell signals.

## 6. Holder + Volume Composites

| Candidate | P0 Trigger | Ctrl Trigger | Disc | Classification |
|-----------|-----------|-------------|------|---------------|
| HVC_001 low_labeled_ratio_high_vol_zscore | 2/? | 0 | Infinity | KEEP_AS_CANDIDATE |
| HVC_002 high_unknown_ratio_high_vol_zscore | 2/? | 0 | Infinity | KEEP_AS_CANDIDATE |
| HVC_003 high_cex_ratio_volume_expansion | 1/? | 3 | 0.3 | REJECT_NOISE |
| HVC_004 high_concentration_vol_spike | 2/? | 0 | Infinity | KEEP_AS_CANDIDATE |
| HVC_005 fund_present_high_volume | 1/? | 0 | Infinity | KEEP_AS_CANDIDATE |
| HVC_006 low_entity_coverage_rising_volume | 2/? | 0 | Infinity | KEEP_AS_CANDIDATE |

## 7. Flow Schema Rescue

Top flow v2: STILL 0 ROWS — tested timeGte/timeLte with event window dates
Transfers v2: STILL UNRESOLVED — entity fields not in transfer response
Full entity-flow loop: NOT READY

## 8. Incremental Value vs Existing APIs

| Capability | Arkham | CoinGecko | Moralis | CoinGlass |
|-----------|--------|-----------|---------|-----------|
| On-chain volume | YES (in/out USD) | DEX pool only | Transfer count only | NO |
| Entity labeling | YES (HIGH conf) | NO | YES (MEDIUM conf) | NO |
| Holder breakdown | YES | NO | Partial | NO |
| Derivatives OI/FR | NO | NO | NO | YES |
| CEX flow proxy | HOLDER ONLY | NO | Transfer proxy | NO |

Arkham volume = on-chain transfer volume. CoinGecko volume = exchange/DEX trade volume.
They measure DIFFERENT things. Arkham volume = unique incremental signal.

## 9. What Arkham Can Support Now

- Holder-entity structural context ✓
- Volume activity research (on-chain transfer volume) ✓
- Volume z-score extreme detection ✓
- CEX holder proxy ✓
- Entity label registry ✓
- Holder + volume composite candidates ✓

## 10. What Arkham Still Cannot Support

- Full entity-flow time series (top_flow 0 rows)
- Transaction-level entity direction (transfers entity unresolved)
- CEX netflow time series
- Counterparty time-series concentration

## 11. Paid Decision Evidence

- Volume time-series provides unique on-chain transfer volume (not exchange trade volume)
- Top flow endpoint still non-functional — missing key paid-tier capability
- Transfer entity labeling unresolved — without it, entity-flow loop cannot run
- Holder entity data available but comparable data may exist on lower tiers
- Recommendation: INSUFFICIENT evidence for $1,500. Need top_flow + transfers entity resolved first.

**Decision: NEED_MORE_EVIDENCE_FOR_PAID_DECISION**
Days remaining in trial: check trial guard

## 12. What We Cannot Know

- Cannot confirm accumulation
- Cannot confirm distribution
- Cannot confirm buy/sell intent from volume alone
- Cannot infer causality
- No trading recommendation

## 13. Next Recommendation

**FIX_TOP_FLOW_SCHEMA** — top flow is the most important missing capability for entity-flow loop.
**FIX_TRANSFER_ENTITY_SCHEMA** — entity-labeled transfers are the foundation for entity-flow time series.
**RUN_ARKHAM_VOLUME_LOOP** — volume features computable, add to metric registry.
**DO_NOT_RUN_FULL_OPEN_DISCOVERY** — entity-flow loop not ready.