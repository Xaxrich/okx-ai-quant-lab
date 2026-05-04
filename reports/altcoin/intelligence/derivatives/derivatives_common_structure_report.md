# Derivatives Common Structure Report

Generated: 2026-05-04T09:07:13.254Z

## 1. Data Coverage

| Token | OKX Swap InstId | Funding Records | OI Current | OI USD |
|-------|----------------|:---:|:---:|:---:|
| BSB | BSB-USDT-SWAP | 100 | 0.9M | $8.5M |
| LAB | LAB-USDT-SWAP | 100 | 0.7M | $12.0M |
| PEPE | PEPE-USDT-SWAP | 100 | 0.9M | $36.9M |
| WIF | WIF-USDT-SWAP | 100 | 23.3M | $4.5M |
| BONK | BONK-USDT-SWAP | 100 | 4.2M | $2.6M |
| FLOKI | FLOKI-USDT-SWAP | 100 | 0.4M | $1.3M |

## 2. Funding Rate Patterns

| Token | Rate Min | Rate Max | Rate Mean | Extreme Days | Crowded Longs Days |
|-------|:---:|:---:|:---:|:---:|:---:|
| BSB | -0.0154% | 0.1364% | 0.0389% | 1 | 0 |
| LAB | 0.0090% | 0.2749% | 0.0552% | 1 | 1 |
| PEPE | -0.0155% | 0.0100% | 0.0020% | 1 | 0 |
| WIF | -0.0150% | 0.0050% | 0.0009% | 1 | 0 |
| BONK | -0.0373% | 0.0100% | -0.0027% | 1 | 0 |
| FLOKI | -0.0205% | 0.0100% | 0.0005% | 2 | 0 |

## 3. Funding vs Event Timing

| Token | OI-Leads-Price Days | Interpretation |
|-------|:---:|------|
| BSB | 1 | NO_DERIVATIVES_SIGNAL — insufficient OI lead evidence |
| LAB | 1 | NO_DERIVATIVES_SIGNAL — insufficient OI lead evidence |
| PEPE | 0 | NO_DERIVATIVES_SIGNAL — insufficient OI lead evidence |
| WIF | 0 | NO_DERIVATIVES_SIGNAL — insufficient OI lead evidence |
| BONK | 0 | NO_DERIVATIVES_SIGNAL — insufficient OI lead evidence |
| FLOKI | 0 | NO_DERIVATIVES_SIGNAL — insufficient OI lead evidence |

## 4. Limitations

- OI data is current snapshot only (OKX free API limitation). OI change over time NOT available.
- OI-leads-price detection uses funding rate as proxy — higher funding = more long demand = possible OI buildup.
- Without historical OI time-series, cannot confirm OI accumulation before price.
- Funding rate history is available and working for all 6 tokens.
- PEPE/WIF/BONK/FLOKI events may be partially outside 90-day funding history window.
- This is a FIRST PASS with incomplete OI data. Full OI time-series would change the conclusions.

## 5. Recommendation

- Funding rate analysis: USABLE for detecting late-stage overheating and sentiment extremes.
- OI analysis: NEED OI HISTORY. Current snapshot is insufficient for positioning detection.
- **Do NOT add to Scanner v02 until OI time-series is available.**
- Priority: find OI history data source (OKX contract OI history endpoint, CoinGlass, or Bybit API).