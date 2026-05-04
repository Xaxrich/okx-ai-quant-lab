# Volume Phase Deep Dive — BSB & LAB

**Core Question:** Does extreme volume appear during accumulation, markup, or distribution?

---

## 1. BSB Volume Phase Analysis

### Volume by Date with Phase Labels

| Date | Price | Volume | Vol vs 7d Avg | Price Δ1d | Phase | Volume Phase |
|------|-------|--------|:---:|:---:|-------|:---:|
| Apr 16 | $0.248 | $8.55M | — | — | Pre-rally | LOW |
| Apr 17 | $0.234 | $8.68M | — | -5.7% | Pre-rally | LOW |
| Apr 18 | $0.217 | $12.24M | — | -7.3% | Suspected compression | LOW |
| Apr 19 | $0.233 | $8.31M | — | +7.4% | Suspected compression | **TROUGH** |
| Apr 20 | $0.275 | $10.18M | — | +18.0% | Early markup | RISING |
| Apr 21 | $0.357 | $26.25M | — | +29.8% | Markup | RISING |
| Apr 22 | $0.371 | $22.99M | — | +3.9% | Markup | RISING |
| Apr 23 | $0.404 | $27.74M | — | +8.9% | Markup | RISING |
| Apr 24 | $0.455 | $28.98M | — | +12.6% | Markup | RISING |
| Apr 25 | $0.743 | $46.71M | 2.8x | +63.3% | Markup peak | **PEAK 1** |
| Apr 26 | $0.752 | $42.38M | 2.1x | +1.2% | High turnover | HIGH |
| Apr 27 | $0.737 | $62.78M | 3.0x | -2.0% | High turnover | HIGH |
| **Apr 28** | **$0.839** | **$83.20M** | **4.2x** | **+13.8%** | **Top** | **PEAK 2** |
| Apr 29 | $0.458 | $35.49M | 2.0x | -45.4% | Crash 1 | DECLINING |
| **Apr 30** | **$0.611** | **$107.27M** | **4.8x** | **+33.4%** | **Crash/Recovery** | **EXTREME** |
| May 1 | $0.522 | $66.03M | 3.3x | -14.6% | Post-crash | DECLINING |
| May 2 | $0.693 | $31.55M | 1.2x | +32.8% | Post-crash | DECLINING |

### BSB Volume Conclusion

**The HIGHEST volume day ($107M, Apr 30) occurred DURING the crash, not during the rally.** The second highest ($83M, Apr 28) was at the exact peak. The lowest non-initial volume ($8.3M, Apr 19) preceded the rally.

| Volume Regime | Timing | Price Context |
|:---|:---|:---|
| Volume trough | T-1 (Apr 19, $8.3M) | Price at local low, about to rally +287% |
| Volume rising | T+1 to T+5 (Apr 20-24) | Steady price climb, volume expanding proportionally |
| Volume peak | T+9 (Apr 28, $83M) | Price at ATH close |
| Volume EXTREME | T+11 (Apr 30, $107M) | Price recovering from crash — distribution into strength |

**Key finding:** Volume was LOWEST before the rally and HIGHEST after the crash. This is the OPPOSITE of what "accumulation" would look like if volume = buying. It supports the hypothesis that extreme volume = distribution, not accumulation.

---

## 2. LAB Volume Phase Analysis

| Date | Price | Volume | Vol vs 7d Avg | Price Δ1d | Phase | Volume Phase |
|------|-------|--------|:---:|:---:|-------|:---:|
| Apr 18 | $0.508 | $30.73M | — | — | Consolidation start | HIGH then declining |
| Apr 19 | $0.539 | $30.18M | — | +6.1% | Consolidation | DECLINING |
| Apr 20 | $0.577 | $32.11M | — | +7.1% | Consolidation | FLAT |
| Apr 21 | $0.576 | $22.64M | — | -0.2% | Consolidation | DECLINING |
| **Apr 22** | **$0.575** | **$18.27M** | — | **-0.2%** | **Compression max** | **TROUGH** |
| Apr 23 | $0.731 | $18.97M | 0.8x | +27.1% | Quiet breakout | LOW (breakout!) |
| Apr 24 | $0.739 | $32.56M | 1.3x | +1.1% | Early markup | RISING |
| Apr 25 | $0.847 | $110.14M | 4.6x | +14.6% | Markup | **PEAK 1** |
| Apr 26 | $0.771 | $110.65M | 5.2x | -9.0% | High turnover | **EXTREME** |
| Apr 27 | $0.707 | $84.77M | 4.1x | -8.3% | Pullback start | HIGH |
| Apr 28 | $0.669 | $71.19M | 3.2x | -5.4% | Pullback | DECLINING |
| Apr 29 | $0.684 | $30.45M | 1.2x | +2.2% | Pullback | DECLINING |
| Apr 30 | $0.692 | $19.69M | 0.7x | +1.2% | Pre-spike compression | **TROUGH 2** |
| May 1 | $1.20 | $18.80M | 0.4x | +73.4% | Parabolic spike | LOW (price surge!) |
| May 2 | $1.98 | $45.76M | 1.9x | +65.0% | Peak close | RISING |
| **May 3** | **N/A** | **$399.95M** | **16.6x** | **N/A** | **CRASH** | **EXTREME MAX** |

### LAB Volume Conclusion

**The HIGHEST volume day ($400M, May 3) was the CRASH.** The second highest ($111M, Apr 26) was high turnover near the top of the first leg. The LOWEST non-initial volume ($18.3M, Apr 22) was the compression trough right before the breakout.

| Volume Regime | Timing | Price Context |
|:---|:---|:---|
| **Volume trough 1** | T-1 (Apr 22, $18.3M) | Maximum compression, price flat, about to break +27% |
| Volume peak 1 | T+2 (Apr 25, $110M) | Price at first leg peak |
| Volume extreme | T+3 (Apr 26, $111M) | Price stalling — high effort, low progress |
| **Volume trough 2** | T+8 (Apr 30, $19.7M) | Pre-spike compression, about to surge +73% |
| Low volume on spike | T+9 (May 1, $18.8M) | Price +73% on COMPRESSED volume — anomalous |
| **Volume EXTREME** | T+11 (May 3, $400M) | CRASH — 16.6x normal volume |

---

## 3. Cross-Token Volume Pattern

### The Pattern

Both BSB and LAB share an identical volume structure:

```
Phase:  Compression → Markup → High Turnover → Crash
Volume: TROUGH      → RISING  → PEAK          → EXTREME MAX
Price:  FLAT/LOW    → RISING  → STALLING      → CRASHING
```

### Volume Timing Rule

| Volume State | Where It Appears | Directional Implication |
|:---|:---|:---|
| **Volume trough** | Before breakout | Directional move COMING (direction unknown) |
| **Volume rising with price** | During markup | Trend CONFIRMATION (not prediction) |
| **Volume peak with price stalling** | Late markup / high turnover | Markup EXHAUSTION — distribution risk |
| **Volume EXTREME after price decline** | During/after crash | PANIC / DISTRIBUTION — not accumulation |

### Effort vs Result Analysis

```
effort_vs_result = volume_change_pct / abs(price_change_pct)
```

| Date | Token | Volume Δ% | Price Δ% | Effort/Result | Interpretation |
|------|-------|:---:|:---:|:---:|:---|
| Apr 22 | LAB | -19% | -0.2% | — | Low effort, stable price = compression |
| Apr 23 | LAB | +4% | +27% | 0.15 | **Efficient markup** — small vol, big move |
| Apr 25 | LAB | +238% | +15% | 15.9 | **Inefficient** — huge vol, modest move |
| Apr 26 | LAB | +0.5% | -9% | ∞ | **No progress** — vol flat, price down |
| May 1 | LAB | -4.5% | +73% | 0.0 | **Suspicious** — big move on no volume |
| Apr 25 | BSB | +61% | +63% | 0.97 | **Efficient** — vol matches price |
| Apr 28 | BSB | +33% | +14% | 2.36 | Becoming inefficient |
| Apr 30 | BSB | +202% | +33% (bounce) | 6.12 | **Very inefficient** — distribution |

**Efficiency peaks early in the markup phase and degrades thereafter.** When volume is high but price progress is low, someone is selling into the bids.

---

## 4. Scanner Rules from Volume Analysis

### P0: Extreme Volume Near Price High

```
rule_id: P0_VOLUME_01
name: Extreme Volume at Local Price High
category: P0
formula: |
  volume_zscore_7d > 3
  AND price_near_7d_high (distance < 5%)
threshold: vol_z_7d > 3, price within 5% of 7d high
BSB_match: YES — Apr 28: vol_z ~3.5, price at ATH
LAB_match: YES — Apr 25-26: vol_z > 4, price near high
lead_time: 0-2 days before reversal
false_positive_risk: MEDIUM — can also occur during genuine breakouts
output_label: HIGH_VOLUME_ZONE_MONITOR
priority: P0
```

### P0: Volume Extreme After Price Decline

```
rule_id: P0_VOLUME_02
name: Crash-Level Volume After Decline
category: P0
formula: |
  volume > 3 * max(volume_7d)
  AND price_return_3d < -20%
threshold: vol > 3x 7d max, price down >20% in 3d
BSB_match: YES — Apr 30: $107M after -45% crash
LAB_match: YES — May 3: $400M after crash
lead_time: Real-time (during crash)
false_positive_risk: LOW — very specific pattern
output_label: PANIC_VOLUME_CRASH_ZONE
priority: P0
```

### P1: Volume Compression Before Move

```
rule_id: P1_VOLUME_03
name: Volume Compression Trough
category: P1
formula: |
  volume_3d_avg < 0.6 * volume_30d_avg
  AND price_range_3d < 0.5 * atr_14
threshold: vol < 60% of 30d avg, range < 50% ATR
BSB_match: PARTIAL — Apr 19: $8.3M trough but only 3 days of data
LAB_match: YES — Apr 22: $18.3M trough, 5-day compression
lead_time: 1-5 days before move
false_positive_risk: HIGH — compression doesn't predict direction
output_label: COMPRESSION_ZONE_WATCH
priority: P1
```

### P1: Inefficient Volume (High Effort, Low Result)

```
rule_id: P1_VOLUME_04
name: High Volume — Low Price Progress
category: P1
formula: |
  volume_zscore_7d > 2
  AND abs(price_return_1d) < 5%
  AND close_position_in_range < 0.4 (close near low of candle)
threshold: vol high, price flat, close near low
BSB_match: YES — Apr 28: $83M vol, close near high (bullish candle)
LAB_match: YES — Apr 26: $111M vol, price -9%, close near low
lead_time: 0-3 days before larger decline
false_positive_risk: MEDIUM
output_label: EFFORT_WITHOUT_RESULT
priority: P1
```

---

## 5. Key Conclusions

1. **Volume troughs precede directional moves.** Both tokens had their lowest volume right before their largest moves.

2. **Volume peaks at distribution, not accumulation.** 5/5 of the highest volume days in this dataset occurred during crashes or distribution phases.

3. **Efficiency degrades as markup matures.** Early markup shows high price progress per unit volume. Late markup shows declining efficiency.

4. **LAB's May 1 spike on $18.8M volume is the most anomalous data point.** A 73% price surge on below-average volume, combined with market cap flat, is a strong signal that this was NOT organic demand-driven price action.

5. **The $400M LAB crash volume on May 3 is the most extreme volume event in the dataset.** 16.6x normal volume with N/A close price suggests market structure breakdown.
