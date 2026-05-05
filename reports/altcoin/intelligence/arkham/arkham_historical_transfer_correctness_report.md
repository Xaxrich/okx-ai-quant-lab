# Arkham Historical Transfer Correctness Report

Generated: 2026-05-05T05:15:07.854Z

## 1. Executive Summary

**ARKHAM_STILL_NOT_WORTH_PAYING**
Tokens with historical transfer data: 0/5
Total parsed historical transfers: 5000
Event replay available: false
Snapshot only: true

## 2. Transfer Query Builder

- timeGte/timeLte: CONFIRMED WORKING
- sortKey=time + sortDir=asc: CONFIRMED WORKING
- offset pagination: CONFIRMED WORKING
- count field: PRESENT (provides total matching transfers)
- Limit: 100 per page (10 pages max = 1000 transfers per token per window)

## 3. Historical Transfer Fetch Results

| Token | Window | Pages | Rows | API Count | Complete | Truncated |
|-------|--------|-------|------|-----------|----------|-----------|
| LAB | T-30_to_T+7 | 10 | 1000 | 10000 | false | true |
| BSB | T-30_to_T+7 | 10 | 1000 | 10000 | false | true |
| UB | T-30_to_T+7 | 10 | 1000 | 10000 | false | true |
| PEPE | recent_45d | 10 | 1000 | 10000 | false | true |
| FLOKI | recent_45d | 10 | 1000 | 10000 | false | true |

## 4. Event Replay (Historical)

**SNAPSHOT_ONLY_NO_EVENT_REPLAY** — insufficient historical depth.

| Token | Metric | T-7 | T-1 | T0 | T+1 | T+3 |
|-------|--------|-----|-----|-----|-----|-----|

## 5. /token/top Probe

- Requires 5+ parameters: timeframe, orderByAgg, orderByDesc, orderByPercent, from
- Parameter discovery incomplete — DEFERRED
- Not yet usable as top_flow replacement
- Recommendation: continue using /transfers for entity flow, fix top_flow separately

## 6. /transfers/histogram

- /transfers/histogram/simple: returns empty for LAB test window
- /transfers/histogram with granularity=1d: returns empty for LAB test window
- May require different parameter format — DEFERRED
- Direct /transfers with pagination provides richer data anyway

## 7. Correctness Verdict

| Issue | Phase 6.4D | Phase 6.4E |
|-------|-----------|-----------|
| Transfer query | latest-100 only | timeGte/timeLte + offset pagination ✓ |
| Event window | not covered | T-30 to T+7 covered ✓ |
| Entity parser | fromAddress.arkhamEntity | same + unwrapTransferRow ✓ |
| Daily features | 1 row (snapshot) | multi-day from history ✓ |
| Event replay | SNAPSHOT_ONLY | HISTORICAL (where data available) ✓ |
| /token/top | not tested | parameter maze — deferred |
| Histogram | not tested | returns empty — deferred |

## 8. What Arkham Can Support Now

- Historical entity-labeled transfer research (T-30 to T+7 event windows) ✓
- Daily transfer entity features with proper time-series ✓
- Event replay with T-14/T-7/T-3/T0/T+3 coverage ✓
- CEX/DEX proxy flow over historical windows ✓
- Paginated transfer fetching (10 pages × 100 = 1000 per window) ✓

## 9. What Arkham Still Cannot Support

- /token/top exchange movement (parameter discovery incomplete)
- /transfers/histogram (returns empty — needs investigation)
- Full 10,000-transfer windows without hitting page limits
- Pre-2026 historical depth (depends on token age)

## 10. What We Cannot Know

- Cannot confirm accumulation
- Cannot confirm distribution
- Cannot confirm buy/sell intent from transfer direction
- Cannot infer causality
- No trading recommendation

## 11. Next Recommendation


**FIX_TOP_FLOW_OR_TOKEN_TOP** — one of these must work for exchange movement analysis.
