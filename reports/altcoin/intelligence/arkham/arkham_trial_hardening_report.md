# Arkham Trial Hardening Report

Generated: 2026-05-04T18:36:37.234Z

## 1. Executive Summary

**ARKHAM_HOLDER_ENTITY_READY_FLOW_NOT_READY**
API configured: false
Trial active: true | Days remaining: 30
Heavy endpoints allowed: true
Today's usage: 12 standard, 24 heavy

## 2. Trial Guard / Cache / Usage

- Trial end: 2026-06-03
- Cancel decision date: 2026-06-01
- Heavy endpoints disabled after: 2026-06-01
- Daily standard limit: 5000
- Daily heavy limit: 500
- Cache: ACTIVE
- Usage ledger: ACTIVE

## 3. Frozen Phase 6.4A Assets

Phase 6.4A assets archived to snapshots/phase64a/

## 4. Entity Label Registry v1

**858** addresses in registry
- ARKHAM_ONLY: 0
- MORALIS_ONLY: 0
- MATCH: 0
- CONFLICT: 0
- UNKNOWN_BOTH: 0
- CEX entities: 83
- HOLDERs: 108
- UNKNOWN_WALLETs: 626

## 5. Holder-Entity Features

| Token | Group | Holders | Labeled % | CEX % | Unknown % | Top Entity Share | Concentration | Readiness |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|------|
| LAB | P0 | 20 | 0.5 | 0.4 | 0.5 | 0.30602425519904314 | 0.613 | ARKHAM_HOLDER_ENTITY_READY |
| UB | P0 | 20 | 0.35 | 0.25 | 0.65 | 0.44997087440501204 | 0.101 | ARKHAM_HOLDER_ENTITY_READY |
| BSB | P0 | 20 | 0.25 | 0.2 | 0.75 | 0.8611133536836566 | 0.862 | ARKHAM_HOLDER_ENTITY_PARTIAL |
| AI | P0 | 20 | 0.5 | 0.2 | 0.5 | 0.4782327383528637 | 0.023 | ARKHAM_HOLDER_ENTITY_READY |
| PEPE | CONTROL | 20 | 0.95 | 0.95 | 0.05 | 0.43358988304295326 | 0.239 | ARKHAM_HOLDER_ENTITY_READY |
| WIF | CONTROL | 20 | 0.9 | 0.85 | 0.1 | 0.32715119076199617 | 0.288 | ARKHAM_HOLDER_ENTITY_READY |
| BONK | CONTROL | 20 | 0.55 | 0.4 | 0.45 | 0.30732939824620387 | 0.183 | ARKHAM_HOLDER_ENTITY_READY |
| FLOKI | CONTROL | 20 | 0.9 | 0.7 | 0.1 | 0.5040048703984308 | 0.164 | ARKHAM_HOLDER_ENTITY_READY |
| PENDLE | P2 | 20 | 0.75 | 0.35 | 0.25 | 0.38808771612326726 | 0.447 | ARKHAM_HOLDER_ENTITY_READY |
| ONDO | P2 | 20 | 0.9 | 0.7 | 0.1 | 0.8401548987798424 | 0.66 | ARKHAM_HOLDER_ENTITY_READY |
| TROLL | P1 | 20 | 0.3 | 0.2 | 0.7 | 0.41049586499979396 | 0.145 | ARKHAM_HOLDER_ENTITY_READY |
| SIREN | P1 | 20 | 0.05 | 0 | 0.95 | 0.41285011143477085 | 0.191 | ARKHAM_HOLDER_ENTITY_EMPTY |

## 6. Holder-Entity Validation

| Metric | P0 Avg | Control Avg | Disc Ratio | Classification | Decision |
|--------|--------|-------------|-----------|---------------|----------|
| AK_HE_001 labeled_holder_ratio | 0.400 | 0.825 | 0.48 | STRUCTURAL_RISK | ADD_STRUCTURAL_RISK_ONLY |
| AK_HE_002 cex_holder_ratio | 0.263 | 0.725 | 0.36 | STRUCTURAL_CONTEXT | ADD_STRUCTURAL_RESEARCH_ONLY |
| AK_HE_003 unknown_holder_ratio | 0.600 | 0.175 | 3.43 | STRUCTURAL_RISK | ADD_STRUCTURAL_RISK_ONLY |
| AK_HE_004 top_entity_holder_share | 0.524 | 0.393 | 1.33 | NOISE | REJECT_NOISE |
| AK_HE_005 holder_entity_concentration | 0.400 | 0.218 | 1.83 | STRUCTURAL_CONTEXT | KEEP_AS_CONTEXT |
| AK_HE_006 market_maker_proxy_holder_count | 0.000 | 0.000 | 0.00 | STRUCTURAL_CONTEXT | ADD_STRUCTURAL_RESEARCH_ONLY |
| AK_HE_007 fund_holder_count | 0.750 | 0.000 | Infinity | STRUCTURAL_RISK | ADD_STRUCTURAL_RISK_ONLY |
| AK_HE_008 holder_entity_coverage | 0.400 | 0.825 | 0.48 | STRUCTURAL_RISK | ADD_STRUCTURAL_RISK_ONLY |

Notes:
- Holder snapshots are NEVER classified as LEADING — they are structural context only.
- Market maker proxy holder count = 0 for all samples (no MM holders detected in top 20).
- P0 tokens show higher unknown holder ratio than controls — structural characteristic, not signal.

## 7. Top Flow / Volume / Transfers Schema

- Top Flow: NOT WORKING — all 9 variant tests returned 0 rows
- Volume: WORKING — works with granularity=1d (203-1112 rows per token)
  Volume fields: inUSD, outUSD, inValue, outValue, time
- Transfers Entity: NOT WORKING — entity fields unresolved in transfer response

**TRANSFER_ENTITY_SCHEMA_UNRESOLVED** — time-series entity-flow loop NOT ready.

## 8. Arkham vs Moralis Reconciliation v2

Current status: limited address universe overlap.
- Arkham holder addresses ≠ Moralis transfer addresses (different data sources).
- Direct label cross-validation requires same-address matches.
- Where same address exists in both channels, Arkham labels are higher confidence.
- Full calibration requires Arkham transfer data with entity fields — currently unresolved.

## 9. What Arkham Can Support Now

- Holder entity analysis (12/12 tokens, 5-95% entity coverage)
- Entity label registry (858 addresses, 144 Arkham-labeled)
- CEX holder proxy identification (83 CEX entity addresses)
- Structural context: P0 tokens have distinct holder entity profiles
- Volume time series (with granularity=1d parameter)

## 10. What Arkham Cannot Support Yet

- Time-series entity flow (top_flow endpoint not returning data)
- CEX netflow time series (requires top_flow or entity-labeled transfers)
- Counterparty concentration time series (requires entity-labeled transfers)
- Full Arkham vs Moralis calibration (transfer entity schema unresolved)
- Entity-labeled transfer direction classification

## 11. What We Still Cannot Know

- Cannot confirm accumulation
- Cannot confirm distribution
- Cannot confirm buy/sell intent
- Cannot infer causality from holder snapshots
- No trading recommendation

## 12. Next Recommendation


**RUN_ARKHAM_HOLDER_ENTITY_LOOP** — holder entity features are computable for all 12 tokens.
**FIX_ARKHAM_FLOW_SCHEMA** — top_flow endpoint needs parameter investigation.
**FIX_ARKHAM_TRANSFER_SCHEMA** — transfer entity field parsing needs resolution.
**VOLUME_ENDPOINT_READY** — can build volume-based features with granularity=1d.
