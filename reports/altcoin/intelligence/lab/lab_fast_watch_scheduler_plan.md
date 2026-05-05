# LAB Fast Watch Scheduler Plan

Generated: 2026-05-05T08:31:59.213Z
CoinGlass plan: HOBBYIST (daily limit ~500)
CoinGlass intraday: NOT AVAILABLE (5m/15m/1h all 403, only 4h+)

## Safe Plan (recommended for HOBBYIST)

Every 10 minutes, standard mode:
```bash
*/10 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode standard
```
Every 1 hour, full report:
```bash
0 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:live-monitor
```
Daily CoinGlass calls: ~432 (standard: 3 CG calls × 6/hr × 24hr) — SAFE under 500

## Aggressive But Budget-Aware Plan
Every 5 minutes, micro mode (OI only):
```bash
*/5 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode micro
```
Every 15 minutes, standard mode:
```bash
*/15 * * * * NO_ARKHAM_MODE=true npm run intelligence:lab:fast-watch -- --mode standard
```
Daily CoinGlass calls: 576 (micro: 1 CG × 12/hr + standard: 3 CG × 4/hr) — SAFE under 500

## NOT SAFE
5-minute STANDARD mode all day: 864 CG calls/day — EXCEEDS 500
Do NOT run standard mode every 5 minutes on HOBBYIST plan.

## Note
CoinGlass 5m/15m/1h intraday OI and liquidation are NOT available on HOBBYIST plan.
Fast watch uses 4h OI endpoint. Snapshot-to-snapshot deltas are NOT true 5m OI changes.
They are differences between successive 4h-OHLC readings — approximate trend only.