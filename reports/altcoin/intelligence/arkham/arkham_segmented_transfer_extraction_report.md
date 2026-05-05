# Arkham Segmented Transfer Extraction Report

Generated: 2026-05-05T05:56:19.495Z

## 1. Executive Summary

**ARKHAM_SEGMENTED_TRANSFER_READY**
Segments with READY status: 22/22
Total parsed transfers (global dedup): 10559
Event replay segments: AVAILABLE
Risk/Confirmation metrics: NONE

## 2. Data Scope

Tokens: 7
Segments per token: up to 6 (A-F)
Pagination: bidirectional (asc+desc), 3 pages each, 100/page
Max per segment: 600 transfers
Global dedup: by tx_hash across all segments

## 3. Segment Coverage Audit

| Token | Segment | Rows | Min Time | Max Time | Covers Start | Covers End | Status |
|-------|---------|------|----------|----------|-------------|-----------|--------|
| LAB | SEG_A | 464 | 2026-03-24 | 2026-04-08 | true | true | SEGMENT_READY |
| LAB | SEG_B | 495 | 2026-04-09 | 2026-04-15 | true | true | SEGMENT_READY |
| LAB | SEG_C | 517 | 2026-04-16 | 2026-04-22 | true | true | SEGMENT_READY |
| LAB | SEG_D | 527 | 2026-04-23 | 2026-04-26 | true | true | SEGMENT_READY |
| LAB | SEG_E | 519 | 2026-04-11 | 2026-04-17 | true | true | SEGMENT_READY |
| LAB | SEG_F | 515 | 2026-04-18 | 2026-04-21 | true | true | SEGMENT_READY |
| UB | SEG_A | 451 | 2026-03-26 | 2026-04-10 | true | true | SEGMENT_READY |
| UB | SEG_B | 583 | 2026-04-11 | 2026-04-17 | true | true | SEGMENT_READY |
| UB | SEG_C | 569 | 2026-04-18 | 2026-04-24 | true | true | SEGMENT_READY |
| UB | SEG_D | 530 | 2026-04-25 | 2026-04-28 | true | true | SEGMENT_READY |
| UB | SEG_E | 521 | 2026-04-15 | 2026-04-21 | true | true | SEGMENT_READY |
| UB | SEG_F | 522 | 2026-04-22 | 2026-04-25 | true | true | SEGMENT_READY |
| BSB | SEG_A | 491 | 2026-03-26 | 2026-04-10 | true | true | SEGMENT_READY |
| BSB | SEG_B | 450 | 2026-04-11 | 2026-04-17 | true | true | SEGMENT_READY |
| BSB | SEG_C | 476 | 2026-04-18 | 2026-04-24 | true | true | SEGMENT_READY |
| BSB | SEG_D | 535 | 2026-04-25 | 2026-04-28 | true | true | SEGMENT_READY |
| BSB | SEG_E | 444 | 2026-04-13 | 2026-04-19 | true | true | SEGMENT_READY |
| BSB | SEG_F | 521 | 2026-04-20 | 2026-04-23 | true | true | SEGMENT_READY |
| PEPE | SEG_RECENT | 483 | 2026-03-21 | 2026-05-05 | true | true | SEGMENT_READY |
| FLOKI | SEG_RECENT | 420 | 2026-03-21 | 2026-05-05 | true | true | SEGMENT_READY |
| PENDLE | SEG_RECENT | 280 | 2026-03-21 | 2026-05-05 | true | true | SEGMENT_READY |
| ONDO | SEG_RECENT | 482 | 2026-03-21 | 2026-05-05 | true | true | SEGMENT_READY |

## 4. Segment Features

| Token | Segment | Transfers | Volume (M) | CEX | DEX | Labeled % | Readiness |
|-------|---------|-----------|-----------|-----|-----|----------|-----------|
| LAB | SEG_A | 464 | $0.07M | 20 | 442 | 100% | SEGMENT_READY |
| LAB | SEG_B | 495 | $0.11M | 32 | 454 | 98% | SEGMENT_READY |
| LAB | SEG_C | 517 | $0.17M | 34 | 462 | 96% | SEGMENT_READY |
| LAB | SEG_D | 527 | $0.25M | 18 | 489 | 96% | SEGMENT_READY |
| LAB | SEG_E | 519 | $0.16M | 66 | 449 | 99% | SEGMENT_READY |
| LAB | SEG_F | 515 | $0.17M | 68 | 440 | 99% | SEGMENT_READY |
| UB | SEG_A | 451 | $0.14M | 12 | 438 | 100% | SEGMENT_READY |
| UB | SEG_B | 579 | $0.16M | 5 | 572 | 100% | SEGMENT_READY |
| UB | SEG_C | 569 | $0.19M | 6 | 555 | 99% | SEGMENT_READY |
| UB | SEG_D | 530 | $0.16M | 10 | 494 | 95% | SEGMENT_READY |
| UB | SEG_E | 521 | $0.18M | 12 | 475 | 94% | SEGMENT_READY |
| UB | SEG_F | 522 | $0.33M | 3 | 489 | 94% | SEGMENT_READY |
| BSB | SEG_A | 491 | $0.08M | 29 | 63 | 31% | SEGMENT_READY |
| BSB | SEG_B | 450 | $21.90M | 43 | 92 | 56% | SEGMENT_READY |
| BSB | SEG_C | 476 | $0.46M | 88 | 76 | 50% | SEGMENT_READY |
| BSB | SEG_D | 535 | $1.57M | 173 | 50 | 47% | SEGMENT_READY |
| BSB | SEG_E | 237 | $0.01M | 45 | 65 | 57% | SEGMENT_READY |
| BSB | SEG_F | 503 | $0.33M | 130 | 63 | 50% | SEGMENT_READY |
| PEPE | SEG_RECENT | 483 | $4.06M | 245 | 83 | 73% | SEGMENT_READY |
| FLOKI | SEG_RECENT | 419 | $0.82M | 295 | 63 | 91% | SEGMENT_READY |
| PENDLE | SEG_RECENT | 279 | $0.97M | 51 | 110 | 86% | SEGMENT_READY |
| ONDO | SEG_RECENT | 477 | $2.94M | 270 | 88 | 78% | SEGMENT_READY |

## 5. Event Replay v2 (Segment-Level)

| Token | Metric | Baseline | Pre | Imm Pre | Breakout | Peak | Post | Peak/Base |
|-------|--------|----------|-----|---------|----------|------|------|-----------|
| LAB | unique_transfer_count | 464 | 495 | 517 | 527 | 519 | 515 | 1.12 |
| LAB | transfer_volume_usd | 70976.91 | 105872.05 | 174788.74 | 248376.78 | 162957.76 | 169201.03 | 2.30 |
| LAB | labeled_transfer_ratio | 0.998 | 0.982 | 0.961 | 0.962 | 0.992 | 0.986 | 0.99 |
| LAB | unknown_transfer_ratio | 0.002 | 0.018 | 0.039 | 0.038 | 0.008 | 0.014 | 4.00 |
| LAB | cex_proxy_transfer_count | 20 | 32 | 34 | 18 | 66 | 68 | 3.30 |
| LAB | cex_proxy_netflow_usd | 2923.28 | 1505.70 | 2466.96 | 2509.05 | 11740.91 | 2496.71 | 4.02 |
| LAB | dex_proxy_transfer_count | 442 | 454 | 462 | 489 | 449 | 440 | 1.02 |
| LAB | top_entity_transfer_share | 0.912 | 0.960 | 0.948 | 0.964 | 0.798 | 0.870 | 0.88 |
| UB | unique_transfer_count | 451 | 579 | 569 | 530 | 521 | 522 | 1.16 |
| UB | transfer_volume_usd | 140955.61 | 159003.58 | 194853.05 | 159828.51 | 175725.62 | 334818.77 | 1.25 |
| UB | labeled_transfer_ratio | 0.998 | 0.997 | 0.986 | 0.953 | 0.935 | 0.943 | 0.94 |
| UB | unknown_transfer_ratio | 0.002 | 0.003 | 0.014 | 0.047 | 0.065 | 0.057 | 32.50 |
| UB | cex_proxy_transfer_count | 12 | 5 | 6 | 10 | 12 | 3 | 1.00 |
| UB | cex_proxy_netflow_usd | 1728.27 | 742.40 | 21638.90 | 18286.48 | 756.24 | 180984.89 | 0.44 |
| UB | dex_proxy_transfer_count | 438 | 572 | 555 | 494 | 475 | 489 | 1.08 |
| UB | top_entity_transfer_share | 0.980 | 0.993 | 0.813 | 0.802 | 0.992 | 0.708 | 1.01 |

## 6. Segment Validation

| Metric | P0 Trigger | Ctrl Trigger | Disc | Classification | Decision |
|--------|-----------|-------------|------|---------------|----------|
| AK_STE_001 unique_transfer_count | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_STE_002 transfer_volume_usd | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_STE_003 labeled_transfer_ratio | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_STE_004 unknown_transfer_ratio | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_STE_005 cex_proxy_transfer_count | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_STE_006 cex_proxy_transfer_volume_usd | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_STE_007 cex_proxy_netflow_usd | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_STE_010 dex_proxy_transfer_volume_usd | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_STE_013 top_entity_transfer_share | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |
| AK_STE_014 entity_transfer_concentration | N/A | N/A | N/A | INSUFFICIENT_DATA | NEED_MORE_SAMPLE |

## 7. Bidirectional Pagination Effectiveness

- ASC sort: provides window-start data
- DESC sort: provides window-end data
- Together: coverage across full segment window without needing 100 sequential pages
- Dedup: tx_hash deduplication removes overlap between asc/desc

## 8. Paid Decision Evidence

- Segmented transfer extraction provides event-window coverage that single-window pagination could not

- Bidirectional pagination is the correct approach for event-window analysis
- maxPages=3 per direction provides 600 transfers per segment — sufficient for structural comparison

**Recommendation: CANCEL_ARKHAM_KEEP_LOCAL_ASSETS**

## 9. What We Cannot Know

- Cannot confirm accumulation
- Cannot confirm distribution
- Cannot confirm buy/sell intent
- Cannot infer causality
- No trading recommendation

## 10. Next Recommendation

**RUN_OPEN_DISCOVERY_WITH_SEGMENTED_TRANSFER**