# LAB Live Overheating & Reversal-Risk Monitor (v2)

Generated: 2026-05-05T08:04:16.322Z
Core DQ: 1.00 | Context DQ: 0.30 | Final DQ: 1.00

## 1. Executive Summary

**Main State: LAB_FUNDING_OVERHEATED** (confidence: HIGH)

Secondary: LAB_BREAKOUT_CONFIRMATION

## 2. Current Market Snapshot

- Price: $2.220000
- Market cap: $166,829,531
- Volume 24h: $83,121,211
- 1h: 15.6% | 24h: 20.8% | 7d: 225.7%
- Volume/MCap: 49.8%

## 3. Derivatives (CoinGlass)

- Aggregated OI: $364,195,731.354
- OI/MCap: 2.18 (EXTREME)
- OI 4h: +$10,589,601.354
- OI 24h: +$72,094,748.354 (25%) 
- OI z-score (12×4h): 1.12

- Funding raw: 0.0905
- Funding percent: 9.05% (unit: CONFIRMED_DECIMAL)
- Funding z-score: -0.89
- Funding streak: 12 positive EXTREME
- Funding abs extreme: YES

- Liq 4h: $23,721.67 (3,179.04 upward / 20,542.63 downward)
- Liq 24h: $3,661,589.212
- Liq 4h imbalance: -0.73
- Liq 4h/OI: 0.0065% | Liq 24h/OI: 1.0054%

## 4. OKX Cross-Check

- OKX OI unit: USD_DIRECT
- OKX OI USD: $16,001,620.96
- OKX vs Global: 4.4%
- OKX funding: 0.0007 (0.07%)

## 5. DEX Context

- DEX_DATA_INSUFFICIENT

## 6. Risk State Evidence

| State | Status | Evidence | Confidence | Limitations |
|-------|--------|----------|------------|-------------|
| LAB_FUNDING_OVERHEATED | MAIN | Funding=9.05% (raw=0.0905); Streak=12; OI/MCap=2.18 | HIGH | Funding overheated = risk indicator, not reversal signal |
| LAB_BREAKOUT_CONFIRMATION | secondary | Price 24h=20.8%; Vol/MCap=50%; OI rising=true | HIGH | Breakout confirmation = research context, not entry signal |

## 7. Manual Review Checklist

- [ ] Multi-exchange OI同步: Normal
- [ ] Funding极端: YES (9.1%)
- [ ] Liquidation放大: YES ($3.7M)
- [ ] 价格推进效率下降: UNCLEAR
- [ ] OI开始下降: NO (still rising)
- [ ] 出现去杠杆: NO
- [ ] OKX确认: YES
- [ ] DEX确认: NO
- [ ] 数据完整: YES

## 8. What We Cannot Know

- Cannot confirm accumulation
- Cannot confirm distribution
- Cannot confirm directional entry
- Cannot infer buy/sell intent
- No trading recommendation