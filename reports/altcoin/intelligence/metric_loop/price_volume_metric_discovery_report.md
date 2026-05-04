# Price-Volume Metric Discovery — Round 1A.1

Generated: 2026-05-04T12:44:15.112Z
**Validation: PARTIAL_VALIDATION** (P0: 3/4)

## 1. Scope

Tokens: 17 (4 P0, 3 P2, 11 CONTROL)
Missing: AI
Classification: fixed (NOISE >= 15% ctrl rate, CONTEXT for >= 3x disc)
Metrics: 4 (PV_001-PV_004)

## 2. Validation Results

| Metric | Pos Rate | Mom Rate | Ctrl Rate | Disc | Avg Lead | Classification | Decision |
|--------|:---:|:---:|:---:|:---:|:---:|------|------|
| PV_001 | 47.4% | 24.6% | 10.0% | 4.7x | -7.0d | CONTEXT | **ADD_RESEARCH_ONLY** |
| PV_002 | 38.3% | 15.3% | 10.0% | 3.8x | -13.0d | CONTEXT | **ADD_RESEARCH_ONLY** |
| PV_003 | 26.0% | 37.7% | 43.5% | 0.6x | -22.6d | NOISE | **REJECT_NOISE** |
| PV_004 | 45.5% | 24.6% | 10.3% | 4.4x | -9.8d | CONTEXT | **ADD_RESEARCH_ONLY** |

## 3. What We Still Cannot Know

- Price-volume alone cannot confirm accumulation or distribution
- Cannot infer causality from correlation
- All findings are from N=17 sample, not statistically significant
- No trading recommendations

## 4. Next Recommendation

Round 1A complete. Metrics classified. Proceed to derivatives or expand metric library.