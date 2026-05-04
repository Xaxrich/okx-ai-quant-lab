# LAB DEX Turnover Review

**Date:** 2026-05-04

---

## 1. Where Does LAB's 25.8x Turnover Come From?

From `dex_token_level_features.csv`:
- Total DEX liquidity: $0.50M
- Total DEX volume 24h: $12.85M
- Turnover: $12.85M / $0.50M = **25.8x**

The 10 DEX pairs discovered (all on BSC):
- Primary pair (PancakeSwap): liq $0.30M, vol 24h — (61% of total liq)
- Remaining 9 pairs share $0.20M liquidity

---

## 2. Is Volume Concentrated in Few Pairs?

Likely yes. Primary pair holds 61% of liquidity. Without per-pair volume breakdown in the aggregated data, we can infer:
- If primary pair volume follows liquidity share: ~$7.8M vol on primary, ~$5.1M on remaining 9 pairs
- Primary pair turnover standalone would be ~26x (similar to token-level)

**Limitation:** DexScreener pair-level volume data was present but the aggregation CSV only stores token-level totals. Per-pair volume breakdown would require reading `dex_pair_level_features.csv` directly.

---

## 3. Primary Pair Liquidity Share

**61%** ($0.30M of $0.50M). This means:
- One pool dominates DEX liquidity
- If this pool is withdrawn, total DEX liquidity drops to ~$0.20M
- Liquidity concentration score: 0.61 (moderate, not extreme)

---

## 4. Does Buy/Sell Ratio 0.99 Mean Neutral?

**Yes.** 68,315 buys vs 69,154 sells across all pairs. The ratio of 0.99 means for every 100 sells, there are ~99 buys. This is almost perfectly balanced.

**Interpretation:** There is NO directional DEX pressure. The high turnover is NOT driven by one-sided selling or buying. Both sides are equally active.

---

## 5. High Turnover + Balanced Buy/Sell = Risk, Activity, or Noise?

**Cannot determine from current data.** Three possible interpretations:

| Interpretation | Evidence For | Evidence Against |
|:---|:---|:---|
| **Organic trading activity** | Balanced buy/sell, many txns (137K/24h), active ecosystem narrative | Token recently flash-crashed 80% — not "normal" activity |
| **Wash trading / bot activity** | Extreme turnover (25.8x), very low liquidity ($0.50M) relative to volume | Balanced ratio is atypical for wash trading (usually one-sided) |
| **Arbitrage / MEV activity** | High turnover + balanced = arbitrage bots crossing the spread | BSC chain has lower MEV than Ethereum |

**Without historical comparison, CEX flow data, or holder data — this remains ambiguous.**

---

## 6. Should LAB Be NEED_MORE_DATA Without CMC Supply?

**Yes.** The current scoring places LAB at WATCH (score 18), which is reasonable for a DEX-only assessment. But:

- Supply data is MISSING (no CMC ID configured)
- The token just flash-crashed from $3.64 to $0.73
- DEX turnover during/after a crash may be inflated by panic trading
- Without supply data, cannot assess structural risk

**Recommendation:** LAB should display as **WATCH (DEX activity) / NEED_MORE_DATA (supply)** until CMC ID is configured.

---

## 7. Can High DEX Turnover Alone Trigger WATCH_RISK?

**No.** High turnover alone, without:
- Directional imbalance (buy/sell ratio not extreme)
- Supply anomaly
- Liquidity withdrawal evidence
- CEX flow data

...is ambiguous. LAB currently has turnover=25.8x but buy/sell=0.99 and no supply data. WATCH is appropriate. WATCH_RISK would require additional evidence.

---

## 8. What Additional Data Is Needed?

| Priority | Data | How to Get |
|:---:|------|------|
| P0 | CMC ID for LAB | Find LAB on CoinMarketCap, get numeric ID |
| P0 | CMC circulating supply | Once CMC ID configured |
| P1 | Historical DEX liquidity (pre-crash) | DexScreener doesn't provide history. Need alternative. |
| P1 | BSC on-chain holder count + transfers | BscScan API (separate key needed) |
| P1 | CEX listing dates and volume split | CMC lists CEX volume |
| P2 | Social volume around May 2-3 crash | Twitter/social API |
| P2 | Token unlock schedule | CoinGecko/CMC/project docs |

---

## Conclusion

**LAB's 25.8x DEX turnover is notable but not independently alarming.** The balanced buy/sell ratio (0.99) suggests the high turnover is driven by bilateral trading activity, not one-sided dumping. However, given that the token recently experienced an 80% flash crash, the elevated turnover could also represent post-crash panic or bot-driven volatility.

**Current label: WATCH is appropriate. Upgrade to WATCH_RISK requires supply data confirmation.**
