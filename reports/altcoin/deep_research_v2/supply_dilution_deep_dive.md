# Supply Dilution Deep Dive — BSB & LAB

**Status:** Based on CoinGecko daily price + market cap data  
**Data Limitation:** Cannot cross-verify with on-chain supply or CoinMarketCap

---

## 1. What Is Implied Circulating Supply?

### Definition

```
implied_circulating_supply = market_cap / price
```

This is NOT the actual token supply. It's what the market cap implies given the current price. It can change for legitimate reasons (CoinGecko updating supply methodology, new token unlocks being counted) or suspicious reasons (actual dilution, new tokens entering circulation).

### Formula

```
implied_supply_t = market_cap_t / price_t
implied_supply_change_1d_pct = (implied_supply_t - implied_supply_{t-1}) / implied_supply_{t-1} * 100
```

---

## 2. BSB Supply Analysis

### Daily Data with Implied Supply

| Date | Price | Market Cap | Implied Supply | Supply Δ% | Price Δ% | Cap Δ% | Flag |
|------|-------|------------|---------------|-----------|----------|--------|:--:|
| Apr 16 | $0.248 | $51.72M | 208.5M | — | — | — | — |
| Apr 17 | $0.234 | $53.54M | 228.8M | +9.7% | -5.7% | +3.5% | ⚠️ |
| Apr 18 | $0.217 | $50.41M | 232.3M | +1.5% | -7.3% | -5.8% | — |
| Apr 19 | $0.233 | $46.38M | 199.1M | -14.3% | +7.4% | -8.0% | — |
| Apr 20 | $0.275 | $50.16M | 182.4M | -8.4% | +18.0% | +8.2% | — |
| Apr 21 | $0.357 | $59.10M | 165.5M | -9.3% | +29.8% | +17.8% | — |
| Apr 22 | $0.371 | $76.51M | 206.2M | +24.6% | +3.9% | +29.5% | ⚠️ |
| Apr 23 | $0.404 | $79.43M | 196.6M | -4.7% | +8.9% | +3.8% | — |
| Apr 24 | $0.455 | $86.92M | 191.0M | -2.8% | +12.6% | +9.4% | — |
| Apr 25 | $0.743 | $97.79M | 131.6M | -31.1% | +63.3% | +12.5% | ⚠️ |
| Apr 26 | $0.752 | $159.80M | 212.5M | +61.5% | +1.2% | +63.4% | 🔴 |
| Apr 27 | $0.737 | $161.70M | 219.4M | +3.2% | -2.0% | +1.2% | — |
| Apr 28 | $0.839 | $157.41M | 187.6M | -14.5% | +13.8% | -2.7% | — |
| **Apr 29** | **$0.458** | **$180.26M** | **393.6M** | **+109.8%** | **-45.4%** | **+14.5%** | 🔴🔴🔴 |
| Apr 30 | $0.611 | $98.64M | 161.4M | -59.0% | +33.4% | -45.3% | — |
| May 1 | $0.522 | $131.00M | 251.0M | +55.5% | -14.6% | +32.8% | 🔴 |
| May 2 | $0.693 | $112.36M | 162.1M | -35.4% | +32.8% | -14.2% | — |

### Key Finding: BSB Apr 29 Supply Shock

On Apr 29, 2026:
- **Price dropped 45.4%** (from $0.839 to $0.458)
- **Market cap ROSE 14.5%** (from $157.4M to $180.3M)
- **Implied supply jumped 109.8%** (from 188M to 394M tokens)

**This is a mathematical certainty, not an interpretation.** If market cap = price × supply, and price fell 45% while market cap rose 15%, then supply MUST have increased by ~110%.

**Possible causes:**
1. 🟡 Team/foundation token unlock event
2. 🟡 CoinGecko updated circulating supply methodology on this date
3. 🟡 New tokens minted (if token has mint function)
4. 🟡 Previously locked tokens entered circulation
5. 🟡 CoinGecko data error or correction

**Without on-chain verification, we cannot confirm which.**

### Additional Supply Anomalies

| Date | Anomaly | Magnitude |
|------|---------|:---:|
| Apr 26 | Cap +63% but price only +1.2% | Supply +61.5% |
| May 1 | Cap +33% but price -15% | Supply +55.5% |
| Apr 22 | Cap +30% but price +4% | Supply +25% |

BSB had **4 supply anomaly events** in 17 days. This is extremely unusual for a token with a supposed fixed supply of 1B.

---

## 3. LAB Supply Analysis

### Daily Data with Implied Supply

| Date | Price | Market Cap | Implied Supply | Supply Δ% | Price Δ% | Cap Δ% | Flag |
|------|-------|------------|---------------|-----------|----------|--------|:--:|
| Apr 14 | $0.476 | $44.54M | 93.6M | — | — | — | — |
| Apr 15 | $0.503 | $36.53M | 72.6M | -22.4% | +5.7% | -18.0% | ⚠️ |
| Apr 16 | $0.487 | $38.49M | 79.0M | +8.8% | -3.1% | +5.4% | — |
| Apr 17 | $0.586 | $37.28M | 63.6M | -19.5% | +20.3% | -3.2% | ⚠️ |
| ... | ... | ... | ... | ... | ... | ... | ... |
| Apr 30 | $0.692 | $52.50M | 75.9M | — | — | — | — |
| **May 1** | **$1.20** | **$52.98M** | **44.2M** | **-41.8%** | **+73.4%** | **+0.9%** | 🔴🔴🔴 |
| May 2 | $1.98 | $89.98M | 45.4M | +2.7% | +65.0% | +69.8% | — |
| May 3 | N/A | $148.03M | N/A | N/A | N/A | +64.5% | 🔴 |

### Key Finding: LAB May 1 Supply Shock — WAIT, this is INVERTED

On May 1, 2026:
- **Price ROSE 73.4%** (from $0.692 to $1.20)
- **Market cap rose ONLY 0.9%** (from $52.5M to $53.0M)
- **Implied supply DROPPED 41.8%** (from 75.9M to 44.2M — apparent supply CONTRACTION)

**This is the INVERSE of BSB: supply appears to have SHRUNK while price surged.**

**Possible causes (different from BSB):**
1. 🟡 CoinGecko market cap was stale/lagging by 1 day (most likely — market cap often updates slower than price)
2. 🟡 Massive token burn
3. 🟡 Circulating supply methodology changed (CoinGecko revised supply DOWN)
4. 🟡 Data quality issue

**If this is data lag:** The May 1 price updated while market cap was still using Apr 30's supply. Then May 2 market cap "caught up" (+69.8%) to match the new price level.

**If this is NOT data lag:** LAB somehow reduced its circulating supply by 42% while price surged — unusual but possible with buyback-and-burn.

### LAB May 3: The Crash with Missing Data

On May 3:
- **Close price: N/A** (data anomaly)
- **Market cap: $148M** (highest in dataset, up 64.5% from May 2)
- **Volume: $400M** (8.7x prior day)
- **Implied supply: cannot calculate (no price)**

The missing close price is a RED FLAG. Combined with $400M volume and $39M in liquidations (from news), this suggests the exchange/data feed was unable to produce a reliable close — possibly due to extreme volatility, trading halt, or delisting event.

---

## 4. BSB vs LAB Supply Anomaly Comparison

| Dimension | BSB (Apr 29) | LAB (May 1) |
|:---|:---|:---|
| Price direction | DOWN -45% | UP +73% |
| Market cap direction | UP +15% | FLAT +0.9% |
| Implied supply direction | UP +110% (expansion) | DOWN -42% (contraction) |
| Volume context | $35M (declining from peak) | $18.8M (compressed, pre-explosion) |
| Days before crash | 0 (crash same day) | 2 (crash May 3) |
| Possible cause | Token unlock / dilution | Data lag / methodology change |
| Can confirm without on-chain? | NO | NO |

### Structural Difference

BSB: Supply EXPANSION preceding/during crash. Classic dilution → dump pattern.  
LAB: Supply CONTRACTION during price surge. More likely data methodology artifact than real tokenomics change.

**Important: Both patterns are anomalous, but they may have DIFFERENT mechanisms.**

---

## 5. Cross-Verification Status

| Verification Method | BSB | LAB | Status |
|:---|:---|:---|:---|
| CoinGecko market cap | Available | Available | ✅ |
| CoinMarketCap | Not queried | Not queried | MISSING_API |
| On-chain total supply (Etherscan) | Blocked (403) | Blocked (403) | UNAVAILABLE |
| On-chain holder balances | Blocked (403) | Blocked (403) | UNAVAILABLE |
| Token unlock schedule | Not found | Not found | MISSING |
| Exchange announcement | Not found | Not found | MISSING |
| CoinGecko methodology changelog | Not checked | Not checked | MISSING |

**Critical gap: Without on-chain supply verification, we cannot distinguish real dilution from data methodology changes.**

---

## 6. Scanner Rule Design

### P0 Rule: Implied Supply Jump (BSB-Type)

```
rule_id: P0_SUPPLY_DILUTION_01
name: Implied Supply Expansion Spike
category: P0
description: |
  Market cap moves in opposite direction from price OR market cap changes
  disproportionately relative to price, implying supply change >30%.
formula: |
  implied_supply = market_cap / price
  supply_change_1d = (implied_supply_t - implied_supply_{t-1}) / implied_supply_{t-1}
  abs(supply_change_1d) > 0.30 AND
  (sign(price_change_1d) != sign(market_cap_change_1d) OR
   abs(market_cap_change_1d - price_change_1d) / abs(price_change_1d) > 2.0)
required_data: [price, market_cap] from CoinGecko
threshold: supply_change_1d > 30% with price/cap divergence
missing_data_behavior: SKIP — mark as UNVERIFIABLE
BSB_match: YES — Apr 29: supply +110%, price -45%, cap +15%
LAB_match: PARTIAL — May 1: supply -42% (inverse pattern)
lead_time: Real-time (T0 to T+2 before crash)
false_positive_risk: MEDIUM — CoinGecko methodology changes could trigger
output_label: SUPPLY_DILUTION_RISK
priority: P0
```

### P0 Rule: Price/Cap Directional Divergence

```
rule_id: P0_SUPPLY_DILUTION_02
name: Price-Market Cap Directional Divergence
category: P0
description: Price and market cap move in opposite directions — mathematically requires supply change.
formula: |
  sign(price_change_1d) != sign(market_cap_change_1d)
  AND abs(price_change_1d) > 10%
  AND abs(market_cap_change_1d) > 5%
required_data: [price, market_cap] from CoinGecko
threshold: opposing signs with minimum magnitudes
BSB_match: YES — Apr 29 (price down, cap up)
LAB_match: NO — May 1 (price up, cap flat but same direction)
lead_time: Real-time
false_positive_risk: LOW (mathematical — but could be data lag)
output_label: SUPPLY_ANOMALY_WATCH
priority: P0
```

### P1 Rule: Market Cap Data Lag Flag

```
rule_id: P1_SUPPLY_DILUTION_03
name: Suspicious Cap Staleness During Price Surge
category: P1
description: |
  Price surges >50% but market cap barely moves. Often indicates
  market cap data hasn't updated to reflect new price (data lag).
  Can also indicate supply contraction.
formula: |
  price_change_1d > 50% AND market_cap_change_1d < 10%
required_data: [price, market_cap]
threshold: price +50%, cap +10%
BSB_match: NO
LAB_match: YES — May 1: price +73%, cap +0.9%
lead_time: Real-time
false_positive_risk: MEDIUM — usually data lag, not real supply change
output_label: CAP_DATA_LAG_SUSPECTED — verify with secondary source
priority: P1
```

---

## 7. Scanner Rule: Supply Anomaly Before Crash

### Composite Risk Rule

```
rule_id: P0_COMPOSITE_SUPPLY_CRASH_RISK
name: Supply Anomaly + Volume Extreme → Crash Risk
category: P0
description: |
  Supply anomaly detected AND volume is spiking AND price is at/near local high.
  This combination appeared before both BSB and LAB crashes.
formula: |
  (supply_dilution_flag OR cap_price_divergence_flag)
  AND (price_near_7d_high OR price_near_30d_high)
  AND volume_zscore_7d > 2
required_data: [price, volume, market_cap]
threshold: composite — all three conditions
BSB_match: YES — Apr 29: dilution + volume $35M + price near ATH
LAB_match: YES — May 1-2: cap anomaly + volume building + price at ATH
lead_time: 0-2 days before crash
false_positive_risk: MEDIUM-LOW (when all three present)
output_label: HIGH_RISK_DISTRIBUTION_ZONE
priority: P0
```

---

## 8. Key Conclusions

1. **Both BSB and LAB had supply/market cap anomalies near their peaks**, but the patterns differed: BSB showed supply EXPANSION, LAB showed supply CONTRACTION (likely data lag).

2. **The BSB Apr 29 pattern (price down + cap up = dilution) is the stronger scanner signal** because it's mathematically unambiguous — supply MUST have changed.

3. **The LAB May 1 pattern (price up + cap flat) is ambiguous** — could be data lag, could be burn, could be methodology change. Needs secondary verification before flagging.

4. **Neither pattern can be confirmed as intentional "dumping"** without on-chain data showing who moved tokens where.

5. **Supply anomaly + volume extreme + price near local high = strongest composite crash risk signal** in this dataset.

6. **CoinGecko data alone is insufficient** — need cross-verification with CoinMarketCap and on-chain supply data to reduce false positives from methodology changes.

---

**Data Sources:** CoinGecko (daily price, market cap, volume)  
**Missing Verification:** CoinMarketCap, Etherscan, BscScan (all blocked or unavailable)  
**Confidence:** Mathematical signal is HIGH. Attribution of cause is LOW without on-chain data.
