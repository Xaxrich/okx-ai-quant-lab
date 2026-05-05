# LAB Fast Watch Scheduler Plan

CoinGlass plan: HOBBYIST (daily limit ~500)
CoinGlass intraday: NOT AVAILABLE (5m/15m/1h all 403, only 4h+)

## Safe Plan A: 15min standard only

```bash
*/15 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode standard
```

Daily CG calls: 3 x 4/hr x 24hr = 288 -- SAFE under 500

## Safe Plan B: 5min micro + 30min standard

```bash
*/5 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode micro
*/30 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode standard
```

Daily CG calls: micro(1x12x24=288) + standard(3x2x24=144) = 432 -- SAFE under 500

## UNSAFE Plans (DO NOT USE)

- **5min micro + 15min standard**: micro(288) + standard(3x4x24=288) = **576 > 500** -- UNSAFE
- **10min standard all day**: 3x6x24 = 432 | + live-monitor(3x24=72) = **504 > 500** -- UNSAFE unless live-monitor reuses cache
- **5min standard all day**: 3x12x24 = **864 > 500** -- UNSAFE

## Live Monitor Compatibility

1-hour live-monitor adds ~3 CoinGlass calls per run (OI + funding + liquidation).
Only safe with 15min standard (288+72=360) or when live-monitor reuses fast-watch cache.
If not reusing cache: budget must account for live-monitor calls separately.

## Note

All CG call counts are approximate. Actual usage tracked in lab_api_usage_ledger.jsonl.
If ledger shows remaining < 50, stop standard mode and use micro only.
CoinGlass 4h-only on HOBBYIST. Snapshot deltas are NOT true intraday OI changes.
