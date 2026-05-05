# LAB Scheduler Dry Run Report

Generated: 2026-05-05T08:48:00Z

## 1. Executive Summary

**SCHEDULER_READY_SAFE_PLAN_A**

3 manual dry runs completed. All checks passed. Scheduler ready for Safe Plan A deployment.

## 2. Run Results

| Run | Mode | Time | CG Calls | Ext Calls | Budget After | State | Risk | Freshness |
|-----|------|------|---------|-----------|-------------|-------|------|-----------|
| 1 | standard | 08:46 | 0 | 0 | 485 | FUNDING_OVERHEATED | 30 | FRESH |
| 2 | micro | 08:47 | 0 | 0 | 485 | FUNDING_OVERHEATED | 30 | FRESH |
| 3 | micro | 08:48 | 0 | 1 | 485 | FUNDING_OVERHEATED | 30 | FRESH |

All three runs: CG calls ≤ 3 (standard) and ≤ 1 (micro). Zero MICRO_BUDGET_VIOLATION. Zero BUDGET_BLOCKED.

## 3. Cache Behavior

- **Standard**: Cache hit on all endpoints (OI age 4.5min, funding 5.6min, liq 5.6min). 0 API calls.
- **Micro run 2**: All from cache. 0 API calls. funding_source=CACHE, liquidation_source=CACHE.
- **Micro run 3**: Price cache expired (CoinGecko 1 call for fresh price). OI/funding/liq still from cache. 0 CG calls.

Micro mode confirmed: ZERO funding/liquidation API calls across all runs.

## 4. CSV / Ledger

- **lab_fast_watch_v2.csv**: 10 rows appended, schema consistent with `mode` field
- **lab_fast_watch.csv (legacy)**: Not appended since fix-2
- **lab_api_usage_ledger.jsonl**: 21 entries today, consistent with CG budget counter

## 5. Recommended Cron

**SAFE_PLAN_A_15M_STANDARD_PLUS_HOURLY_LIVE**

```bash
*/15 * * * * cd <repo> && NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode standard
0 * * * * cd <repo> && NO_ARKHAM_MODE=true npm run intelligence:lab:live-monitor
```

Daily estimate: 288 (standard) + 72 (live-monitor) = 360 / 500. SAFE.

After 12-24h stability confirmed, switch to Safe Plan B:
```bash
*/5 * * * * ... --mode micro
*/30 * * * * ... --mode standard
```

Daily estimate: 288 + 144 = 432 / 500. Do NOT add hourly live-monitor on top.

## 6. What To Watch Next

- Funding: 15.45% critical — watch for reversal or further escalation
- OI change: +$12M/4h (decelerating from +$41M) — watch for rollover
- Liquidation 4h: $545K — below alert threshold, monitor for spikes
- Efficiency decay: not triggered — price still advancing
- Data freshness: FRESH across all runs, no degradation
