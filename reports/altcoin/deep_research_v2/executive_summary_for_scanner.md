# Executive Summary — BSB/LAB Deep Research v2 for Scanner Design

---

## What This Research Did

Upgraded from v1's shallow price/volume analysis to a 130+ indicator, multi-phase, rule-based deep study of two altcoin breakout-then-crash events. Added: deep dives on supply dilution, volume phase analysis, compression-breakout mechanics, event-driven vs organic classification, control group design, and 11 concrete scanner rules.

---

## The Two Tokens

| | BSB (Block Street) | LAB |
|:---|:---|:---|
| Type | Infrastructure, news-driven pump | DeFi/Trading, organic-then-manipulated |
| Peak | $0.84 (+287% from low) | $3.64 (+430% from base) |
| Crash | -45% in 1 day | -80% intraday, $39M liquidated |
| Key Anomaly | Supply expanded 110% during crash | Supply anomaly at spike, then $400M crash vol |

---

## The Deepest Commonality

Both tokens followed: **[Compression] → [Markup] → [Efficiency Decay] → [Supply Anomaly] → [Crash]**

LAB showed the full 5-stage sequence. BSB showed a compressed version (skipped compression due to news catalyst). The supply anomaly + efficiency decay pair appeared in both before their crashes.

---

## Top 5 Scanner Signals (Implementable Today)

| # | Signal | Priority | Data Required |
|:--:|:---|:---:|:---|
| 1 | Implied supply change >30% with price/cap divergence | P0 | CoinGecko free |
| 2 | Volume >3x median at local price high | P0 | CoinGecko free |
| 3 | High volume + low price progress (effort/result decay) | P0 | CoinGecko free |
| 4 | Volume compression trough (3+ days declining vol + tight range) | P1 | CoinGecko free |
| 5 | Supply anomaly + vol extreme + price near high (composite) | P0 | CoinGecko free |

---

## Top 5 Misleading Signals (Do NOT Use Alone)

1. "Price is going up" — noise without context
2. "Volume is high" — appears at distribution, not accumulation
3. "News is positive" — BSB's news-led rally crashed in 4 days
4. "Bull flag pattern" — LAB's perfect bull flag was the pre-crash zone
5. "RSI oversold" — buying LAB's crash RSI would have been catastrophic

---

## What's Missing

- On-chain holder data (Etherscan/BscScan blocked)
- DEX liquidity data (DexScreener blocked)
- Multi-timeframe OHLCV (4H/1H)
- Social volume time series
- Control group (N=0)
- Larger sample (N=2)

---

## Next Steps

1. Get Etherscan API key (free) → add holder count + top holder concentration to scanner
2. Get DexScreener API access → add DEX liquidity monitoring
3. Expand sample to 20+ tokens with matched controls
4. Build minimum viable scanner using 5 P0 rules on CoinGecko data
5. Validate false positive rate on control group
