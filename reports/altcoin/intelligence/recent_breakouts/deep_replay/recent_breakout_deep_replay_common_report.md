# Recent Breakout Deep Replay Common Report

Generated: 2026-05-04T10:35:57.772Z

## 1. Scope

Tokens: LAB, UB, BSB, AI (4 confirmed OKX swap explosive breakouts)
Window: 2026-04-27 to 2026-05-04
Data: CoinGecko price + OKX OI/funding + CoinGecko DEX pool OHLCV + CMC/Etherscan supply

## 2. Event Window Matrix

| Token | 7d Return | Peak Date | Post-Peak DD | Current Status |
|-------|:---:|------|:---:|------|
| **LAB** | **464%** | 2026-05-02 | -75% | CRASHED |
| **UB** | **255%** | 2026-05-02 | -37% | PULLING_BACK |
| **BSB** | **253%** | 2026-05-04 | -9% | NEAR_PEAK |
| **AI** | **238%** | 2026-04-29 | -70% | CRASHED |

## 3. Cross-Layer Summary

| Token | Price | Derivatives | DEX | Supply | Cross-Layer |
|-------|------|------------|-----|--------|------------|
| LAB | EXPLOSIVE_BREAKOUT | DERIVATIVES_CONFIRMATION_ONLY | NO_DEX_HISTORY_SIGNAL | SUPPLY_DATA_INSUFFICIENT | price: explosive breakout | dex: insufficient data | structure: severe post-peak drawdown |
| UB | EXPLOSIVE_BREAKOUT | DERIVATIVES_DATA_AVAILABLE | DEX_HISTORY_DATA_INSUFFICIENT | SUPPLY_DATA_INSUFFICIENT | price: explosive breakout | dex: insufficient data |
| BSB | EXPLOSIVE_BREAKOUT | DERIVATIVES_OVERHEATED_LATE | DEX_HISTORY_DATA_INSUFFICIENT | SUPPLY_DATA_INSUFFICIENT | price: explosive breakout | derivatives: overheated late | dex: insufficient data |
| AI | EXPLOSIVE_BREAKOUT | DERIVATIVES_DATA_AVAILABLE | DEX_HISTORY_DATA_INSUFFICIENT | SUPPLY_DATA_INSUFFICIENT | price: explosive breakout | dex: insufficient data | structure: severe post-peak drawdown |

## 4. Common Structures

- **Supply overhang**: 0/4 tokens (none)
- **Derivatives overheated late**: 1/4 tokens (BSB)
- **Deleveraging during crash**: 0/4 tokens
- **DEX activity leading**: 0/4 — no token showed DEX-leads-price evidence
- **Price-volume**: All 4 show EXPLOSIVE_BREAKOUT or STRONG_BREAKOUT

## 5. What We Still Cannot Know

- Cannot confirm accumulation (no holder time-series)
- Cannot confirm distribution (no transfer-to-CEX data)
- Cannot confirm derivatives positioning (no long/short ratio or taker volume)
- DEX data insufficient for BSB (multichain pool issue)
- All findings are correlations from N=4, not causal proof

## 6. Recommendation

- Supply overhang: ADD_RISK_ONLY (appears in BSB/LAB, correlated with severe drawdown)
- Derivatives overheated late: ADD_RISK_ONLY (consistent across LAB/BSB)
- DEX: DO_NOT_ADD (no leading signal, low confidence for BSB)
- **Do NOT update Scanner v02 scoring. Research-only observation.**
- Next: add transfer flow + entity labels to distinguish real distribution from data noise.