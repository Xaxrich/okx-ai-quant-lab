# DEX History Data Pipeline Report

Generated: 2026-05-04T10:07:07.134Z
Auth: PRO

## 1. Token Coverage

| Token | Pool | Confidence | Hour | Day | Covers Breakout | Covers Peak | Readiness |
|-------|------|:---:|:---:|:---:|:---:|:---:|------|
| BSB | BSB / USDT 5% | MEDIUM | 100 | 5 | ✗ | ✗ | DEX_HISTORY_PARTIAL |
| LAB | LAB / USDT 0.007% | HIGH | 720 | 90 | ✗ | ✗ | DEX_HISTORY_READY |
| PEPE | PEPE / WETH | HIGH | 720 | 90 | ✗ | ✗ | DEX_HISTORY_READY |
| WIF | $WIF / SOL | HIGH | 720 | 90 | ✗ | ✗ | DEX_HISTORY_READY |
| BONK | Bonk / SOL | HIGH | 720 | 90 | ✗ | ✗ | DEX_HISTORY_READY |
| FLOKI | FLOKI / WETH | HIGH | 720 | 90 | ✗ | ✗ | DEX_HISTORY_READY |

## 2. What This Data Can Support

- DEX pool-level OHLCV history (hour + day granularity)
- DEX volume compression / expansion research
- Primary pool price discovery research

## 3. What This Data Cannot Prove

- Cannot confirm accumulation (single pool ≠ all DEX activity)
- Cannot confirm distribution (no trader identification)
- Cannot identify buyer/seller (only pool-level data)
- Multi-chain tokens need cross-chain pool resolution

## 4. Recommendation

**READY_FOR_DEX_LEAD_LAG_ANALYSIS** — sufficient coverage for lead-lag study.