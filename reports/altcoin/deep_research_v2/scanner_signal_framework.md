# Scanner Signal Framework — From BSB/LAB Deep Research

**Purpose:** Convert BSB/LAB deep research findings into a structured, reusable scanner rule framework for future whole-market scanning.  
**Status:** FRAMEWORK v1 — requires larger sample validation before production use.

---

## 1. P0 Risk Signals (Immediate High-Risk Detection)

These signals detect elevated distribution/crash risk. They are designed for real-time monitoring.

### P0-01: Implied Supply Expansion Spike

```
rule_id: P0_SUPPLY_01
name: Implied Supply Expansion Spike
category: P0
definition: |
  Market cap and price move in opposite directions, OR market cap changes
  disproportionately to price, implying circulating supply changed >30%.
formula: |
  implied_supply = market_cap / price
  supply_change_1d = (implied_supply_t - implied_supply_{t-1}) / implied_supply_{t-1}
  flag = abs(supply_change_1d) > 0.30
         AND (sign(price_ret_1d) != sign(mcap_ret_1d)
              OR abs(mcap_ret_1d - price_ret_1d) / max(abs(price_ret_1d), 0.01) > 2.0)
data_source: CoinGecko (price, market_cap)
threshold: supply_change_1d > 30% with divergence
BSB_match: YES — Apr 29: supply +110%, price -45%, mcap +15%
LAB_match: PARTIAL — May 1: supply -42% (inverse pattern, likely data lag)
lead_or_lag: Real-time (T0)
false_positive_risk: MEDIUM — CoinGecko methodology changes can trigger
recommended_action_label: WATCH_RISK — cross-verify with CoinMarketCap
```

### P0-02: Extreme Volume at Local Price High

```
rule_id: P0_VOLUME_01
name: Extreme Volume at Local Price High
category: P0
formula: |
  volume > 3 * volume_7d_median
  AND price_close / max(price_7d_high) > 0.95
  AND price_return_3d > 10%
data_source: CEX OHLCV (CoinGecko daily minimum)
threshold: vol_z_7d > 3, price near 7d high, positive 3d return
BSB_match: YES — Apr 28: $83M at ATH
LAB_match: YES — Apr 25-26: $110-111M near first peak
lead_or_lag: 0-2 days before reversal
false_positive_risk: MEDIUM
recommended_action_label: WATCH_RISK
```

### P0-03: Crash-Level Volume After Price Decline

```
rule_id: P0_VOLUME_02
name: Panic Volume After Price Decline
category: P0
formula: |
  volume > 3 * volume_7d_median
  AND price_return_3d < -20%
  AND volume_is_highest_in_30d
data_source: CEX OHLCV
threshold: vol > 3x median, price down >20% in 3d, 30d vol record
BSB_match: YES — Apr 30: $107M after -45%
LAB_match: YES — May 3: $400M after flash crash
lead_or_lag: During crash (lagging but confirms severity)
false_positive_risk: LOW
recommended_action_label: AVOID_HIGH_RISK
```

### P0-04: Inefficient Volume — High Effort, No Result

```
rule_id: P0_EFFORT_01
name: High Volume Without Price Progress
category: P0
formula: |
  volume_zscore_7d > 2
  AND abs(price_return_1d) < 5%
  AND close_position_in_daily_range < 0.4
  AND preceding_trend = "UP" (was in markup)
data_source: OHLCV daily
threshold: vol high, price flat, close near low, was uptrend
BSB_match: PARTIAL — Apr 28: vol high, price +14% (still progressing)
LAB_match: YES — Apr 26: $111M vol, price -9%, close near low
lead_or_lag: 0-3 days before larger decline
false_positive_risk: MEDIUM
recommended_action_label: WATCH_RISK
```

### P0-05: Supply Anomaly Composite Crash Risk

```
rule_id: P0_COMPOSITE_01
name: Supply Anomaly + Volume Extreme + Price Near High
category: P0
formula: |
  (P0_SUPPLY_01 OR P0_EFFORT_01)
  AND (price_near_7d_high OR price_near_30d_high)
  AND volume_zscore_7d > 2
data_source: CoinGecko (price, mcap, volume)
threshold: composite — all three conditions present
BSB_match: YES — Apr 29-30
LAB_match: YES — Apr 25-26, May 1-2
lead_or_lag: 0-2 days before crash
false_positive_risk: LOW-MEDIUM
recommended_action_label: AVOID_HIGH_RISK
```

---

## 2. P1 Early Watch Signals (Pre-Breakout Detection)

### P1-01: Price-Volume Compression Zone

```
rule_id: P1_COMPRESSION_01
name: Price-Volume Compression Zone
category: P1
formula: |
  compression_days = consecutive days where:
    daily_range_pct < 0.5 * avg_daily_range_14d
    AND volume < 0.6 * volume_20d_avg
  flag = compression_days >= 3
data_source: OHLCV daily (CoinGecko ok)
threshold: 3+ days of tight range + declining volume
BSB_match: NO (only 1-2 days pre-data)
LAB_match: YES — Apr 18-22 (5 days), Apr 28-30 (3 days)
lead_or_lag: 1-5 days LEADING
false_positive_risk: HIGH — compression predicts move, not direction
recommended_action_label: RESEARCH_ONLY — needs confirmation signal
```

### P1-02: Quiet Breakout From Compression

```
rule_id: P1_BREAKOUT_01
name: Quiet Breakout After Compression
category: P1
formula: |
  compression_zone_active within last 5 days
  AND price > max(high of compression_period)
  AND price_return_1d > 5%
  AND volume < 2 * avg_volume_during_compression
data_source: OHLCV daily
threshold: breakout above compression range on modest volume
BSB_match: NO
LAB_match: YES — Apr 23: +27% on $19M (quiet)
lead_or_lag: T0 (catches breakout day)
false_positive_risk: HIGH — many false breakouts from compression
recommended_action_label: RESEARCH_ONLY — needs volume confirmation
```

### P1-03: Cross-Exchange Volume Leading Indicator

```
rule_id: P1_EXCHANGE_01
name: Small Exchange Volume Leads Large Exchange
category: P1
formula: |
  small_exchange_volume_growth_rate > large_exchange_volume_growth_rate
  AND small_exchange_volume_share_increasing for 3+ days
data_source: Multi-exchange volume data (MISSING for BSB/LAB — Gate, Bybit, MEXC, etc.)
threshold: small exchange growing faster
BSB_match: UNKNOWN — multi-exchange data not collected
LAB_match: UNKNOWN — multi-exchange data not collected
lead_or_lag: 2-5 days LEADING (hypothesized, not verified)
false_positive_risk: UNKNOWN
recommended_action_label: NEED_MORE_DATA
```

### P1-04: DEX Liquidity Growth Before Price (Hypothesis)

```
rule_id: P1_DEX_01
name: DEX Liquidity Growth Before Price Rally
category: P1
formula: |
  dex_liquidity_change_7d > 20%
  AND price_return_7d < 10%
  AND pair_age_days > 7
data_source: DexScreener / GeckoTerminal (CURRENTLY UNAVAILABLE)
threshold: LP +20% with flat price
BSB_match: UNKNOWN — DEX data blocked
LAB_match: UNKNOWN — DEX data blocked
lead_or_lag: 3-7 days LEADING (hypothesized)
false_positive_risk: UNKNOWN
recommended_action_label: NEED_MORE_DATA — requires DEX API access
```

---

## 3. P2 Context Signals (Enhance Interpretation)

### P2-01: Sector Correlation Score

```
rule_id: P2_SECTOR_01
name: Token-Sector Correlation
category: P2
formula: |
  sector_correlation = corr(token_returns_7d, sector_index_returns_7d)
  flag = correlation > 0.7 over 14d window
data_source: Multi-token price data
threshold: corr > 0.7
BSB_match: UNKNOWN — sector undefined (news-driven)
LAB_match: PARTIAL — DeFi/trading sector
lead_or_lag: Lagging
false_positive_risk: LOW
recommended_action_label: CONTEXT_ONLY
```

### P2-02: Narrative Tag + Stage Matching

```
rule_id: P2_NARRATIVE_01
name: Narrative-Stage Alignment Check
category: P2
formula: |
  narrative_tag IN [MEME, DEFI, AI, L2, RWA, GAMEFI, etc.]
  AND price_stage IN [COMPRESSION, MARKUP, DISTRIBUTION]
  AND sector_momentum_score
data_source: CoinGecko categories + price data
threshold: qualitative — tags must align with observed stage
BSB_match: Infrastructure + Acquisition (event-specific, not sector)
LAB_match: DeFi + Trading + Launchpad + Binance Alpha
lead_or_lag: Context only
false_positive_risk: N/A — not a signal, just context
recommended_action_label: CONTEXT_ONLY
```

---

## 4. Composite Scores

### 4.1 Early Breakout Setup Score

```
Components (equal weight where available):
  compression_quality_score      (0-1)  ← P1_COMPRESSION_01
  volume_compression_score       (0-1)  ← derived from vol trend
  price_stability_score          (0-1)  ← range tightness
  holder_growth_score            (0-1)  ← MISSING for BSB/LAB
  dex_liquidity_stability_score  (0-1)  ← MISSING for BSB/LAB
  social_not_extreme_score       (0-1)  ← MISSING for BSB/LAB

Formula: sum(available_scores) / count(available_scores)
Missing data penalty: -0.2 per missing component on confidence

BSB score: ~0.15 / 1.0 (low — no compression, no pre-data)
LAB score: ~0.55 / 1.0 (medium — compression present, but holder/dex/social missing)
```

### 4.2 Markup Confirmation Score

```
Components:
  breakout_clarity              (0-1)  ← above range + magnitude
  volume_confirmation           (0-1)  ← vol expanding with price
  relative_strength_vs_btc      (0-1)  ← outperforming
  efficiency_score              (0-1)  ← price progress per unit volume
  multi_timeframe_alignment     (0-1)  ← MISSING (no 4H/1H data)

BSB score: ~0.55 / 1.0 (news-driven, efficiency degraded fast)
LAB score: ~0.70 / 1.0 (organic phase), ~0.20 (anomaly phase)
```

### 4.3 Supply / Distribution Risk Score

```
Components:
  supply_anomaly_score          (0-1)  ← implied supply change
  volume_efficiency_score       (0-1)  ← high vol, low progress
  price_momentum_decay          (0-1)  ← returns decelerating
  crash_volume_flag             (0-1)  ← extreme vol after decline
  holder_distribution_proxy     (0-1)  ← MISSING
  cex_inflow_proxy              (0-1)  ← MISSING
  dex_liquidity_withdrawal      (0-1)  ← MISSING

BSB score: ~0.65 / 1.0 (HIGH — supply anomaly, volume extremes)
LAB score: ~0.85 / 1.0 (VERY HIGH — all available signals + crash magnitude)
```

### 4.4 Data Quality Score

```
Components:
  cex_price_volume_available        0.3  ← ALWAYS (CoinGecko free)
  cex_orderbook_available           0.1  ← if on OKX
  derivatives_available             0.2  ← if swap listed
  onchain_holders_available         0.2  ← BLOCKED (need explorer API)
  dex_liquidity_available           0.1  ← BLOCKED (need DexScreener API)
  social_available                  0.1  ← BLOCKED (need social API)

BSB: 0.3 / 1.0
LAB: 0.3 / 1.0
```

---

## 5. Scanner Rule Priority Matrix

| Priority | Count | Purpose | Data Required |
|:---:|:---:|:---|:---|
| P0 | 5 rules | Immediate risk detection | CoinGecko free tier (price, mcap, vol) |
| P1 | 4 rules | Early watch / pre-breakout | CoinGecko + ideally DEX + multi-exchange |
| P2 | 2 rules | Context enhancement | CoinGecko + sector classification |

**All P0 rules are implementable TODAY with only CoinGecko free API.**

---

## 6. What CANNOT Be Scanned Without Additional Data

| Desired Signal | Blocked By | Alternative |
|:---|:---|:---|
| Holder accumulation | Etherscan/BscScan 403 | Need Etherscan API key (free tier available) |
| DEX liquidity growth | DexScreener 403 | Need DexScreener API or GeckoTerminal |
| CEX inflow/outflow | No exchange API access | Need exchange-specific API keys |
| Social volume timing | No social API | Need Twitter API or LunarCrush/Santiment |
| Derivatives OI/funding | Token not on OKX swap | Need exchange-specific API |
| Cross-exchange comparison | No multi-exchange data | Need exchange aggregator |

---

## 7. Minimum Viable Scanner (Today)

With ONLY CoinGecko free API, these P0 rules can run today:

```
For each token in watchlist:
  1. Compute implied_supply = market_cap / price
  2. Flag if abs(supply_change_1d) > 30% AND price/cap diverge
  3. Flag if volume > 3x median AND price near 7d high
  4. Flag if volume > 3x median AND price down >20% in 3d
  5. Flag if volume high AND abs(price_change) < 5% AND was uptrend

Output: ranked risk list with explanations
```

**This is implementable in <200 lines of TypeScript in okx-ai-quant-lab.**
