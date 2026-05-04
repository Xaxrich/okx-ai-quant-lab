# DEX History Lead-Lag Common Report

Generated: 2026-05-04T10:11:37.209Z

## 1. Lead/Lag Matrix

| Token | Confidence | DEX Label | Comp Lead | Exp Lead | DEX Vol Lead | DEX Price Lead | OKX OI Label |
|-------|:---:|------|:---:|:---:|:---:|:---:|------|
| LAB | HIGH | NO_DEX_HISTORY_SIGNAL | —d | —d | —d | —d | DERIVATIVES_CONFIRMATION_ONLY |
| PEPE | HIGH | NO_DEX_HISTORY_SIGNAL | —d | —d | —d | —d | NO_DERIVATIVES_SIGNAL |
| WIF | HIGH | NO_DEX_HISTORY_SIGNAL | —d | —d | —d | —d | NO_DERIVATIVES_SIGNAL |
| BONK | HIGH | NO_DEX_HISTORY_SIGNAL | —d | —d | —d | —d | NO_DERIVATIVES_SIGNAL |
| FLOKI | HIGH | DEX_COMPRESSION_LEADING | -10d | —d | —d | —d | DERIVATIVES_OVERHEATED_LATE |
| BSB | LOW | DEX_HISTORY_DATA_INSUFFICIENT | —d | —d | —d | —d | DERIVATIVES_OVERHEATED_LATE |

## 2. DEX vs OKX OI Comparison

DEX leading signals: 0/5 high-confidence tokens
**Result: DEX activity is predominantly SYNCHRONOUS, not LEADING.** No token showed clear DEX-leads-price evidence.
Most DEX expansion/volume signals occurred within T-2 to T+2 of the breakout.

## 3. Recommendation

- DEX compression: ADD_RESEARCH_ONLY (appeared in some tokens pre-breakout)
- DEX expansion: ADD_CONFIRMATION_ONLY (synchronous, not leading)
- DEX efficiency decay: ADD_RISK_ONLY (appears near peak)
- DEX crash spike: ADD_CONFIRMATION_ONLY (confirms crash severity)
**Do NOT add DEX signals to Scanner v02 scoring.** Research layer only.

## 4. What Still Cannot Be Known

- Single pool OHLCV ≠ full DEX market activity
- Cannot identify accumulation or distribution
- Multi-chain tokens need cross-chain pool resolution
- No trader-level data available