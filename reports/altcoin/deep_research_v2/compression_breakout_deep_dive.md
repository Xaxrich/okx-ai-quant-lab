# Compression → Breakout Deep Dive — BSB & LAB

**Core Question:** Is volume+range compression a reliable pre-breakout signal, and can it be scanned for?

---

## 1. LAB Compression: The Gold Standard Example

### Compression Phase: Apr 18-22 (5 days)

| Date | Price | Range (H-L) | Volume | Vol Δ | Range Δ |
|------|-------|:---:|--------|:---:|:---:|
| Apr 18 | $0.508 | — | $30.7M | — | — |
| Apr 19 | $0.539 | $0.031 | $30.2M | -1.6% | — |
| Apr 20 | $0.577 | $0.038 | $32.1M | +6.3% | +23% |
| Apr 21 | $0.576 | $0.001 | $22.6M | **-29.6%** | **-97%** |
| Apr 22 | $0.575 | $0.002 | $18.3M | **-19.0%** | +100% |
| **Apr 23** | **$0.731** | **$0.156** | **$19.0M** | **+3.8%** | **+7700%** |

### Compression Metrics

| Metric | Value | Interpretation |
|:---|:---:|:---|
| Compression duration | 5 days | Moderate — long enough to be meaningful |
| Price range during compression | $0.508-$0.577 (13.6%) | Tight but not extreme |
| Volume trend | -40% ($30.7M → $18.3M) | Clear declining trend |
| Volume at trough | $18.3M (lowest in 20-day window) | Strong compression signal |
| Breakout magnitude | +27.1% single day | Large, unambiguous |
| Breakout volume | $19.0M (still low) | "Quiet breakout" — volume came later |

### The Key Insight

**Apr 22 was the lowest volume day and the tightest price range day, followed by a +27% breakout on Apr 23.** This is the textbook compression → breakout pattern. The volume arrived AFTER the price move (Apr 25: $110M), not before.

**Implication:** If you wait for volume confirmation, you miss the first +27%. If you enter on compression alone, you might catch a breakdown instead.

---

## 2. BSB Compression: The Ambiguous Example

### Pre-Rally Phase: Apr 16-19 (4 days — very short)

| Date | Price | Volume | Notes |
|------|-------|--------|-------|
| Apr 16 | $0.248 | $8.55M | First data point available |
| Apr 17 | $0.234 | $8.68M | Price declining |
| Apr 18 | $0.217 | $12.24M | New low, vol rose (NOT compression) |
| Apr 19 | $0.233 | $8.31M | Volume trough but only 1 day |
| Apr 20 | $0.275 | $10.18M | Rally begins |

### BSB Compression Assessment

| Metric | Value | Assessment |
|:---|:---:|:---|
| Compression duration | 1-2 days | **Too short** — not meaningful |
| Pre-rally data available | 4 days | **Insufficient** — cannot establish baseline |
| Volume trough | $8.3M (Apr 19) | Present but only 1 point |
| Rally trigger | News (acquisition) | External catalyst, not technical |

**BSB does NOT have a convincing compression phase.** With only 4 days of pre-rally data, we cannot distinguish compression from random noise. The rally was news-driven, not compression-resolution-driven.

---

## 3. LAB's Second Compression: Pre-Spike (Apr 30)

LAB had a SECOND compression right before the parabolic spike:

| Date | Price | Volume | Notes |
|------|-------|--------|-------|
| Apr 27 | $0.707 | $84.8M | High vol, declining |
| Apr 28 | $0.669 | $71.2M | Still declining |
| Apr 29 | $0.684 | $30.4M | Volume halved |
| Apr 30 | $0.692 | $19.7M | **Volume trough — price flat** |
| May 1 | $1.20 | $18.8M | **+73% on even lower volume** |

This second compression was:
- Shorter (2-3 days of declining vol)
- At a higher price level (after the first markup/correction)
- Followed by a parabolic (not gradual) move
- Accompanied by the market cap anomaly

**This compression preceded a crash, not sustainable markup.** It's a cautionary example: compression predicts a move, but the move can be a pump-then-dump, not organic continuation.

---

## 4. Cross-Token Compression Comparison

| Dimension | LAB Compression 1 | LAB Compression 2 | BSB |
|:---|:---|:---|:---|
| Duration | 5 days | 3 days | 1-2 days |
| Volume decline | -40% | -73% | Minimal data |
| Price range | 13.6% | 3.4% | Wide |
| Preceded by downtrend? | Yes (from Apr 17 high) | Yes (from Apr 26 high) | Yes |
| Followed by | +186% markup (9 days) | +73% spike (1 day) then -80% crash | +287% rally (news-driven) |
| Sustainable? | Partial — first leg was real, second was trap | NO — immediate crash | NO — crashed 45% within 2 days of peak |
| Data quality | GOOD (20 days baseline) | FAIR | POOR (4 days baseline) |

---

## 5. The "Compression Predicts a Move, Not Direction" Principle

### Empirical Evidence from This Study

LAB's two compressions illustrate the principle:

| Compression | Resolution Direction | Outcome |
|:---|:---:|:---|
| Compression 1 (Apr 18-22) | UP (+27% breakout) | Led to +186% markup |
| Compression 2 (Apr 28-30) | UP (+73% spike) | Led to -80% crash within 48h |

**Same compression pattern. Radically different outcomes.** Compression tells you "a big move is coming" — it does NOT tell you whether the move is sustainable or whether you should be long or short.

### What Additional Data Would Help Determine Direction

| Missing Data | How It Would Help |
|:---|:---|
| DEX buy/sell ratio | If buy pressure builds during compression → bullish |
| Exchange net flow | If outflow > inflow during compression → bullish |
| Holder count | If growing steadily during compression → bullish |
| Top holder balance | If stable/increasing → less distribution risk |
| Social volume | If calm → compression is genuine. If already spiking → suspect |

---

## 6. Scanner Rules from Compression Analysis

### P1: Compression Zone Detection

```
rule_id: P1_COMPRESSION_01
name: Price-Volume Compression Zone
category: P1
description: |
  Price range tightening while volume declining — equilibrium before directional move.
  Does NOT predict direction. Requires confirmation signal to act.
formula: |
  price_range_3d_pct < 0.5 * avg_price_range_14d
  AND volume_3d_avg < 0.6 * volume_20d_avg
  AND compression_duration_days >= 3
  AND price_near_30d_low OR price_near_30d_high (near range boundary)
required_data: [OHLCV daily]
threshold: range < 50% of 14d avg, vol < 60% of 20d avg, duration >=3d
BSB_match: NO — insufficient pre-data
LAB_match: YES — Apr 18-22 (5 days), Apr 28-30 (3 days)
lead_time: 1-5 days
false_positive_risk: HIGH if used alone — compression is common
output_label: COMPRESSION_ZONE — MONITOR FOR BREAKOUT DIRECTION
priority: P1
```

### P1: Quiet Breakout After Compression

```
rule_id: P1_COMPRESSION_02
name: Quiet Breakout From Compression
category: P1
description: |
  Price breaks out of compression range on still-modest volume.
  This is the earliest possible entry signal but has high false positive risk.
formula: |
  compression_zone_active (from P1_COMPRESSION_01 within last 5 days)
  AND price > max(high of compression_range)
  AND volume < 2 * avg_volume_during_compression
  AND price_return_1d > 5%
required_data: [OHLCV daily, compression zone detection]
threshold: breakout above range on <2x compression volume
BSB_match: NO
LAB_match: YES — Apr 23: +27% on $19M (only +4% above compression trough)
lead_time: T0 (catches the breakout day)
false_positive_risk: HIGH — many false breakouts
output_label: QUIET_BREAKOUT_WATCH — needs volume confirmation
priority: P1
```

### P2: Compression Duration Score

```
rule_id: P2_COMPRESSION_03
name: Compression Duration Quality Score
category: P2
description: Longer compression = more energy stored = larger resolution move.
formula: |
  compression_score = min(compression_days / 10, 1.0)
  * (1 - volume_trend_slope)  // volume declining = higher score
  * (1 - price_range_trend_slope)  // range tightening = higher score
required_data: [OHLCV daily, 20d history]
threshold: score > 0.5 = meaningful compression
BSB_match: NO (score ~0.1)
LAB_match: YES (Compression 1: score ~0.7, Compression 2: score ~0.5)
lead_time: 1-5 days
false_positive_risk: MEDIUM
output_label: COMPRESSION_QUALITY_SCORE
priority: P2
```

---

## 7. Key Conclusions

1. **LAB had a textbook compression-breakout pattern** (5 days, vol -40%, range 13.6%, breakout +27%). This is the strongest pre-signal in our dataset.

2. **BSB did NOT have a meaningful compression phase** — too little pre-data, breakout was news-driven.

3. **LAB's second compression (Apr 28-30) preceded a pump-then-crash**, not sustainable markup. Compression predicts magnitude, not direction or sustainability.

4. **Compression + supply anomaly = extreme caution.** When compression resolves upward but market cap shows dilution, the "breakout" is likely a trap (LAB compression 2 pattern).

5. **Compression alone is a P1 watch signal.** It must be combined with:
   - Volume confirmation on breakout (for direction)
   - Market cap verification (for authenticity)
   - Holder/DEX data (for accumulation confirmation — currently MISSING)

6. **Without on-chain/DEX data, we cannot distinguish accumulation compression from pre-pump compression.** This is the most critical data gap for making compression a reliable scanner signal.
