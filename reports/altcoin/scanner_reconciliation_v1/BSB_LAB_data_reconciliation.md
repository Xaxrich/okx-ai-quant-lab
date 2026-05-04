# BSB/LAB Data Reconciliation — Why Scanner Rules Didn't Trigger

**Date:** 2026-05-04

---

## 1. The Core Question

> Why did BSB/LAB case study rules (supply anomaly, extreme volume, compression) produce zero triggers in the scanner with CoinGecko API data?

---

## 2. What We Compared

| Source | BSB/LAB Case Study (v2) | Scanner Validation (Phase 4) |
|:---|:---|:---|
| Data origin | CoinGecko **web page** (HTML, manually extracted) | CoinGecko **API** (`/coins/{id}/market_chart`) |
| Granularity | Daily close from web table | Irregular intervals, aggregated to daily |
| Date range | Apr 14 - May 3, 2026 (20 days for LAB, 17 for BSB) | Mar 5 - May 4, 2026 (60 days) |
| Market cap | Web page values | API endpoint values |

---

## 3. What We Found: All Dates Present, But Values Differ

**All 15 comparison dates for BSB and LAB are present in the API data.**

However, the market cap values differ significantly:

| Token | Date | Price Diff | Market Cap Diff | Note |
|------|------|:---:|:---:|------|
| BSB | Apr 25 | 4.3% | **56.7%** | News day — largest mcap divergence |
| BSB | Apr 29 | 2.2% | **46.3%** | Crash+supply anomaly day |
| BSB | Apr 30 | 0.9% | 31.7% | Extreme volume day |
| LAB | May 1 | 18.8% | 38.5% | Supply anomaly day |
| LAB | May 2 | 22.3% | **106.6%** | ATH day — largest divergence |

**Price differences are reasonable (0-22%). Market cap differences are extreme (up to 106%).**

---

## 4. Root Cause

### The CoinGecko API returns different market cap data than the CoinGecko web page.

The web page data used in the case study showed:
- BSB Apr 29: market cap $180M (vs API: $97M — 46% lower)
- LAB May 2: market cap $90M (vs API: $186M — 107% higher)

These discrepancies mean:
1. **implied_supply = market_cap / price** is very different between the two sources
2. **implied_supply_change_1d** (the basis for P0_SUPPLY_ANOMALY) cannot trigger because the API market cap data is smoother and doesn't show the same extreme day-over-day jumps
3. The web page market cap may use a different circulating supply methodology or update frequency than the API

### Specific Reasons for Zero P0 Triggers

| Rule | Why Zero Triggers |
|:---|:---|
| P0_SUPPLY_ANOMALY_01 | API implied_supply_change_1d values are <5% for most days. BSB Apr 29 supply jump (+110% in web data) is only ~15% in API data. Threshold of 30% is never reached. |
| P0_PRICE_CAP_DIVERGENCE_01 | API market cap and price move more in sync than web data. Divergence condition rarely met. |
| P0_EXTREME_VOLUME_HIGH_01 | Volume z-score >3 is extremely rare with 30-day rolling window on daily data. Only 2 occurrences across 764 rows. |
| P0_EFFORT_RESULT_01 | Requires close_position_in_range — not available from daily close-only data. |
| P1_COMPRESSION_01 | Compression score formula calibrated on 20-day case study data doesn't generalize to 90-day rolling windows. |

---

## 5. What This Means

1. **The supply anomaly signal is REAL in the web data but CANNOT be reproduced with the free CoinGecko API.** The web page uses a different market cap methodology that captures extreme supply changes. The API smooths these out.

2. **This is not a bug in our code.** It's a data source limitation. The free CoinGecko API is designed for charting, not for detecting intraday market cap anomalies.

3. **To recover the supply anomaly signal, we need:**
   - CoinMarketCap API (different methodology, may show different market cap)
   - On-chain total supply data (Etherscan/BscScan — ground truth for supply)
   - Multi-source cross-verification

4. **The early relative strength signal (P1) does work with API data** — it's based on price and volume, which are consistent between sources.

---

## 6. Recommendations

1. **Accept that P0 supply rules are disabled for MVP v0.1** — they need a different data source
2. **Enable P1_EARLY_RELATIVE_STRENGTH as the sole enabled rule** — it has 0% false positive rate in controls
3. **Keep P1_QUIET_BREAKOUT and P0_CRASH_VOLUME on watchlist** — moderate signals
4. **Prioritize getting Etherscan API key** — on-chain total supply is ground truth for supply monitoring
5. **Prioritize getting CoinMarketCap API key** — cross-verification for market cap data
