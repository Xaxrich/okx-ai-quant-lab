# Final Scanner MVP Rules — Phase 4.1 Calibrated

**Based on:** Threshold sweep over 764 feature rows (13 tokens, 90-day CoinGecko API data)

---

## A. Enabled Rules (Entering MVP)

### P1_EARLY_RELATIVE_STRENGTH_01 (Calibrated)

```
rule_id: P1_EARLY_RELATIVE_STRENGTH_01_CAL
category: Early Setup Signal
formula: |
  price_return_3d > 0.25
  AND volume_zscore_7d > 1.0
  AND volume_zscore_7d < 2.0
calibrated_threshold: rel_strength=0.25, vol_z_min=1.0, vol_z_max=2.0
trigger_count: 7/764 (0.9%)
positive_rate: 3.3% (7/215 pos rows)
control_rate: 0.0% (0/549 ctrl rows)
discrimination: >100x (zero false positives in controls)
use_case: Early detection of tokens showing strong relative performance with moderate (not extreme) volume
output_label: WATCH
limitations: |
  - Low trigger rate (0.9%) — may miss many events
  - Depends on 3-day return window — short-term noise can trigger
  - Does not predict direction sustainability
  - Calibrated on 13 tokens — needs larger sample
```

---

## B. Watchlist Rules (Not in Scoring, Observed Only)

### P1_QUIET_BREAKOUT_01 (Calibrated)

```
rule_id: P1_QUIET_BREAKOUT_01_CAL
category: Early Setup Signal
formula: |
  price_return_3d > 0.08
  AND distance_to_7d_high > -0.01 (near or above 7d high)
  AND volume_zscore_7d < 2.0
calibrated_threshold: ret_3d=0.08, dist=-0.01, vol_z_max=2.0
trigger_count: 75/764 (9.8%)
positive_rate: 20.9%
control_rate: 5.5%
discrimination: 3.8x
use_case: Context signal — identifies tokens breaking out on not-yet-extreme volume
output_label: WATCH (low confidence — combine with other signals)
limitations: |
  - 5.5% false positive rate in controls
  - High trigger frequency may cause alert fatigue
  - Does not distinguish sustainable breakouts from failed ones
```

### P0_CRASH_VOLUME_01 (Calibrated)

```
rule_id: P0_CRASH_VOLUME_01_CAL
category: Lagging Confirmation
formula: |
  price_return_3d < -0.10
  AND volume_zscore_7d > 1.0
calibrated_threshold: price_drop=0.10, vol_z_min=1.0
trigger_count: 4/764 (0.5%)
positive_rate: 1.9%
control_rate: 0.0%
discrimination: >100x
use_case: Post-hoc crash confirmation — not predictive
output_label: WATCH_RISK
limitations: |
  - Confirms crash after it happened
  - Does not provide advance warning
  - Very low trigger rate
```

---

## C. Disabled Rules

| Rule | Reason |
|:---|:---|
| **P0_SUPPLY_ANOMALY_01** | CoinGecko API market cap data does not capture the extreme day-over-day supply changes visible in web-scraped data. Even at 5% threshold, only 1 trigger across 764 rows. **Cannot be implemented with free CoinGecko API.** Needs CoinMarketCap API cross-verification or on-chain supply data. |
| **P0_PRICE_CAP_DIVERGENCE_01** | Same root cause — API market cap is too smooth. Zero meaningful triggers. |
| **P0_EXTREME_VOLUME_HIGH_01** | Only 2 triggers at best threshold (vol_z > 1.5). Too rare to be useful as a scanner signal. |
| **P0_EFFORT_RESULT_01** | Requires intraday data (close_position_in_range) not available at daily CoinGecko granularity. |
| **P1_COMPRESSION_01** | Compression score formula produces zero triggers at all thresholds. Daily CoinGecko API data does not capture the compression patterns visible in case study data. Needs recalibration with intraday data. |

---

## Summary

| Status | Count | Rules |
|:---|:---:|:---|
| ENABLED | 1 | P1_EARLY_RELATIVE_STRENGTH_01_CAL |
| WATCHLIST | 2 | P1_QUIET_BREAKOUT_01_CAL, P0_CRASH_VOLUME_01_CAL |
| DISABLED | 5 | All P0 supply/volume/compression rules |

**The BSB/LAB case study's strongest finding — supply anomaly detection — cannot be implemented with the free CoinGecko API.** The case study used web-scraped market cap data that showed extreme day-over-day changes. The API returns smoother data. To recover this signal, we need CoinMarketCap API (cross-verification) or on-chain total supply data (Etherscan/BscScan).

**The MVP today: 1 enabled rule, 2 watchlist rules, 5 disabled rules.**
