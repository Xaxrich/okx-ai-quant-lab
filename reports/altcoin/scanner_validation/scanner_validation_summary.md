# Scanner Rule Validation Report

Generated: 2026-05-04T04:51:02.346Z

## Sample Summary

- Positive samples: 4 (BONK, BSB, LAB, PEPE)
- Control samples: 9 (ARB, BTC, DOGE, ETH, FLOKI, OP, PEOPLE, SHIB, SOL)
- Total feature rows: 6112
- Data source: CoinGecko free API (90-day window)

## Rule Performance Matrix

| Rule ID | Category | Total Triggers | Positive Triggers | Control Triggers | Pos Rate | Ctrl Rate | Discrimination | Decision |
|---------|----------|:---:|:---:|:---:|:---:|:---:|:---:|--------|
| P0_SUPPLY_ANOMALY_01 | Distribution/Supply Risk | 0 | 0 | 0 | 0.0% | 0.0% | 0.0x | NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range. |
| P0_PRICE_CAP_DIVERGENCE_01 | Distribution/Supply Risk | 0 | 0 | 0 | 0.0% | 0.0% | 0.0x | NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range. |
| P0_EXTREME_VOLUME_HIGH_01 | Distribution/Supply Risk | 0 | 0 | 0 | 0.0% | 0.0% | 0.0x | NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range. |
| P0_EFFORT_RESULT_01 | Distribution/Supply Risk | 0 | 0 | 0 | 0.0% | 0.0% | 0.0x | NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range. |
| P0_CRASH_VOLUME_01 | Lagging Confirmation | 0 | 0 | 0 | 0.0% | 0.0% | 0.0x | NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range. |
| P1_COMPRESSION_01 | Early Setup | 0 | 0 | 0 | 0.0% | 0.0% | 0.0x | NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range. |
| P1_QUIET_BREAKOUT_01 | Early Setup | 66 | 35 | 31 | 16.3% | 5.6% | 2.9x | KEEP_AS_RISK_SIGNAL — moderate discrimination, needs larger sample. |
| P1_EARLY_RELATIVE_STRENGTH_01 | Markup Confirmation | 20 | 17 | 3 | 7.9% | 0.5% | 14.5x | KEEP — strong discrimination, low false positive rate. |

## BSB/LAB Rule Replay

### BSB

- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-05 (20d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-12 (13d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-13 (12d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-15 (10d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-20 (5d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-21 (4d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-22 (3d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-23 (2d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-24 (1d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-25 (ON event day)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-28 (3d after event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-05-04 (9d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-04-26 (1d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-04-27 (2d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-04-28 (3d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-05-02 (7d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-05-03 (8d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-05-04 (9d after event)

### LAB

- **P1_QUIET_BREAKOUT_01** triggered on 2026-03-13 (41d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-03-14 (40d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-03-21 (33d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-03-28 (26d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-04 (19d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-05 (18d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-06 (17d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-07 (16d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-09 (14d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-10 (13d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-17 (6d before event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-23 (ON event day)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-04-25 (2d after event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-05-01 (8d after event)
- **P1_QUIET_BREAKOUT_01** triggered on 2026-05-02 (9d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-03-14 (40d before event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-03-15 (39d before event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-04-07 (16d before event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-04-08 (15d before event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-04-09 (14d before event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-04-10 (13d before event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-04-12 (11d before event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-04-25 (2d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-05-02 (9d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-05-03 (10d after event)
- **P1_EARLY_RELATIVE_STRENGTH_01** triggered on 2026-05-04 (11d after event)

## Key Findings

### 1. P0 Supply/Risk Rules: Zero Triggers Across Sample

5 out of 8 rules (all P0 risk rules + P1 compression) produced **zero triggers** across 764 feature rows covering 13 tokens over 90 days.

**Possible explanations:**
- The BSB/LAB events were genuinely extreme outliers — not representative of typical altcoin behavior
- Daily CoinGecko data smooths out intraday anomalies. The +110% implied supply jump on BSB was visible in the case study's daily data, but the 90-day CoinGecko API may provide differently aggregated data
- Thresholds calibrated on N=2 are too strict for a 13-token sample
- The 90-day window may not capture the full event cycle for all positive samples
- Market cap data from CoinGecko API may differ from the web-scraped data used in the case study

### 2. P1_QUIET_BREAKOUT: Moderate Discrimination

- 16.3% trigger rate in positive samples vs 5.6% in controls (2.9x discrimination)
- Triggers broadly across many tokens — not specific enough for a standalone signal
- May have value as a **context signal** when combined with other indicators

### 3. P1_EARLY_RELATIVE_STRENGTH: Best Discrimination

- 7.9% positive rate vs 0.5% control rate (15.8x discrimination)
- Only 3 false positives across all control tokens over 90 days
- **This is the most promising signal in the current validation.** It identifies tokens showing strong relative performance without extreme volume — a possible early mark of genuine interest.

## Final Rule Decisions

- **P0_SUPPLY_ANOMALY_01** (Distribution/Supply Risk): NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range.
- **P0_PRICE_CAP_DIVERGENCE_01** (Distribution/Supply Risk): NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range.
- **P0_EXTREME_VOLUME_HIGH_01** (Distribution/Supply Risk): NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range.
- **P0_EFFORT_RESULT_01** (Distribution/Supply Risk): NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range.
- **P0_CRASH_VOLUME_01** (Lagging Confirmation): NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range.
- **P1_COMPRESSION_01** (Early Setup): NEED_MORE_DATA — zero triggers across entire sample. Thresholds may be too strict for daily data, or event window outside 90-day range.
- **P1_QUIET_BREAKOUT_01** (Early Setup): KEEP_AS_RISK_SIGNAL — moderate discrimination, needs larger sample.
- **P1_EARLY_RELATIVE_STRENGTH_01** (Markup Confirmation): KEEP — strong discrimination, low false positive rate.

## Limitations

- N=13 tokens (4 positive, 9 control) — still small sample
- WIF and AEVO data unavailable (network errors / 404)
- 90-day window may miss events for PEPE (Dec 2025), BONK (Jul 2025), WIF (Dec 2025)
- CoinGecko free API at daily granularity — intraday anomalies invisible
- No on-chain, DEX, or social data — cannot verify supply anomalies or accumulation
- Thresholds from N=2 case study — need calibration on larger sample