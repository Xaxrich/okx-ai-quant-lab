# OKX OI Lead-Lag Common Report

Generated: 2026-05-04T09:36:41.600Z

## 1. Scope

Tokens: BSB, LAB, PEPE, WIF, BONK, FLOKI
Data: OKX OI history (/rubik/stat) + funding rate history + CoinGecko prices

## 2. OI Lead/Lag Matrix

| Token | OI Days | OI Lead Days | OI Lead Lag | OI Confirm | OI Overheat | Fund Overheat | Delev | Label | Confidence |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|------|:---:|
| BSB | 32 | — | — | — | 3 | 0 | 2 | DERIVATIVES_OVERHEATED_LATE | LOW |
| LAB | 90 | — | — | — | 0 | 1 | 4 | DERIVATIVES_CONFIRMATION_ONLY | LOW |
| PEPE | 90 | — | — | — | 0 | 0 | 1 | NO_DERIVATIVES_SIGNAL | LOW |
| WIF | 90 | — | — | — | 0 | 0 | 0 | NO_DERIVATIVES_SIGNAL | LOW |
| BONK | 90 | — | — | — | 0 | 0 | 2 | NO_DERIVATIVES_SIGNAL | LOW |
| FLOKI | 90 | -9d | 2026-02-20 | — | 4 | 0 | 0 | DERIVATIVES_OVERHEATED_LATE | LOW |

## 3. What Changed from Phase 5.3

- Phase 5.3: OI was SNAPSHOT ONLY — could not compute OI change or lead/lag
- Phase 5.3.2: OI HISTORY used — 6/6 tokens have 90-day daily OI data
- Key correction: OI lead-lag IS computable with OKX /rubik/stat endpoint

## 4. Scanner Recommendation

- OI lead-lag: RESEARCH_ONLY — needs multi-exchange OI to confirm direction
- Funding overheated late: ADD_RISK_ONLY — consistent across BSB and LAB
- OI overheated late: ADD_RISK_ONLY — appeared before crashes
- Deleveraging: ADD_CONFIRMATION_ONLY — confirms crash severity

## 5. Limitations

- No long/short ratio — OI rise cannot distinguish long buildup from short buildup
- OKX only — single exchange OI. Multi-exchange OI needed for full picture.
- No taker volume — direction of flow unknown.

## 6. Decision

**Do NOT add OI lead-lag to Scanner v02 scoring yet.** Add RESEARCH_ONLY: display OI/funding derivatives signals separately from the main score. Let human researchers interpret them.