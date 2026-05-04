# Report Quality Audit — BSB / LAB Deep Research v2

**Audit Date:** 2026-05-03

---

## 1. What Data Did Existing BSB Report Use?

| Data Category | Source | Granularity | Quality |
|:---|:---|:---|:---|
| Price (daily close) | CoinGecko | 1D, 18 rows | OK |
| Volume (daily) | CoinGecko | 1D, 18 rows | OK |
| Market cap (daily) | CoinGecko | 1D, 18 rows | OK |
| Token identity | CoinGecko | Single snapshot | OK |
| News/events | CoinGecko news section | Qualitative | Low |
| On-chain data | — | — | **MISSING** |
| DEX data | — | — | **MISSING** |
| Derivatives | — | — | **MISSING** |
| Social volume | — | — | **MISSING** |
| Multi-timeframe (4H/1H) | — | — | **MISSING** |
| Cross-exchange comparison | — | — | **MISSING** |
| Control group | — | — | **MISSING** |

**Data completeness score:** ~0.25 / 1.0

---

## 2. What Data Did Existing LAB Report Use?

Same as BSB — CoinGecko daily price/volume/market cap only. 20 rows of daily data.

---

## 3. What Key Data Is Missing From Both?

| Missing Data | Impact Severity | Which Conclusions Weakened |
|:---|:---:|:---|
| 4H / 1H OHLCV | **HIGH** | Cannot confirm intraday breakout structure, compression resolution, or flash crash microstructure |
| On-chain holder count & concentration | **CRITICAL** | Cannot confirm accumulation or distribution at holder level |
| Large transfer / CEX flow data | **CRITICAL** | Cannot confirm exchange inflow/outflow patterns |
| DEX liquidity & volume | **CRITICAL** | Cannot track LP behavior, pool health, or early DEX signals |
| Derivatives OI / funding / liquidations | **HIGH** | Cannot analyze leverage dynamics (only LAB's $39M liquidation was mentioned in news) |
| Social volume time series | **HIGH** | Cannot determine if social heat leads or lags price |
| Cross-exchange price/volume | **MEDIUM** | Cannot detect exchange-specific anomalies |
| Control group data | **CRITICAL** | Cannot calculate false positive rates for any signal |

---

## 4. Which Conclusions Are Data-Supported?

| Conclusion | Evidence Strength | Data Used |
|:---|:---:|:---|
| LAB had 5-day volume compression before breakout | **STRONG** | CoinGecko daily volume data clearly shows $30.7M → $18.3M decline over Apr 18-22 |
| BSB had news-driven breakout (acquisition announcement) | **MODERATE** | CoinGecko news section mentions the acquisition |
| Both had supply dilution (market cap/price divergence) | **STRONG** | CoinGecko market cap + price data: mathematical proof |
| Both had volume spikes at/near peaks | **STRONG** | Volume data clearly shows extreme values at distribution |
| Both crashed after reaching peaks | **STRONG** | Price data clearly shows crash |
| LAB's breakout followed a compression pattern | **STRONG** | 5 days of declining volume + flat price |

---

## 5. Which Conclusions Are Speculation?

| Claim | Why Speculative |
|:---|:---|
| "Accumulation phase" for BSB | Only 4 days of pre-rally data. Cannot distinguish accumulation from pre-launch noise. |
| "Distribution" as intentional action | We see supply dilution mathematically, but cannot attribute to specific actors or intent. |
| "Retail interest fading" | No holder data, no DEX data. Volume decline could mean many things. |
| "Panic selling" | Volume spike could be liquidations, arbitrage, or exchange-level activity, not necessarily retail panic. |
| BSB's recovery as "distribution into strength" | Possible but unprovable without holder/CEX flow data. |

---

## 6. Which Conclusions May Be Wrong Due to Data Gaps?

| Conclusion | Risk | Alternative Explanation |
|:---|:---|:---|
| LAB's compression was accumulation | **HIGH** | Could be low liquidity before a pump, not organic accumulation |
| BSB's -45% crash was dilution-driven | **MEDIUM** | Could be CoinGecko updating circulating supply methodology, not actual new tokens |
| LAB's May 1 market cap anomaly | **MEDIUM** | Could be CoinGecko data lag — market cap may have been stale while price updated |
| "Volume confirming trend" | **MEDIUM** | Without DEX/CEX breakdown, can't tell if volume is organic or wash trading |
| Scoring system confidence levels | **HIGH** | Scores computed from partial data — missing components would change results |

---

## 7. Which Indicators Are Too Shallow for Scanner Use?

| Indicator | Why Too Shallow |
|:---|:---|
| "Volatility compression" (v1) | Only used 7d/30d vol ratio. Need realized vol percentile, ATR percentile, range compression, multi-timeframe compression |
| "Volume z-score" (v1) | Only used 7d/30d. Need multi-window (1d/3d/7d/30d), volume trend slope, abnormal volume flag |
| "RSI" (v1) | Only spot RSI. Need RSI across timeframes, RSI divergence from price |
| "Return" metrics | Only absolute returns. Need relative vs BTC/ETH, vs sector, risk-adjusted |
| Phase labels | Too subjective. Need rule-based phase assignment with confidence scores |
| All scores (Accumulation/Markup/Distribution) | Missing too many input components. Confidence not meaningful. |

---

## 8. What Should Be Preserved from v1?

| Finding | Why Worth Keeping |
|:---|:---|
| Supply dilution signal (market cap/price divergence) | Mathematically objective. Strongest single signal found. |
| Volume compression preceding LAB breakout | Well-documented, clear temporal pattern in daily data. |
| Volume peaks at distribution, not accumulation | Cross-token pattern (5/5 in v1 study). |
| BSB news-driven vs LAB more organic | Useful categorization for future token classification. |
| Cross-token Jan 2026 meme rally | Demonstrates sector correlation reality. |

---

## 9. What Needs Re-Verification?

| Item | Verification Method Needed |
|:---|:---|
| Supply dilution magnitude | Cross-check with CoinMarketCap, on-chain total supply, explorer data |
| Volume compression lead time | Multi-timeframe (4H/1H) analysis to pinpoint compression start |
| Phase boundaries | Rule-based segmentation using objective thresholds |
| Holder behavior | On-chain data (currently unavailable through our tools) |
| DEX liquidity patterns | DexScreener/GeckoTerminal API (currently blocked) |
| Social volume timing | Twitter/social API (currently unavailable) |

---

## 10. Are BSB/LAB Sufficient as Scanner Seed Samples?

**No. Currently insufficient.**

Reasons:
1. **Sample size: N=2.** Statistical significance requires N>=20 with matched controls.
2. **Data dimension: only CEX daily.** Missing 4H/1H granularity, on-chain, DEX, derivatives, and social.
3. **No control group.** Cannot distinguish signal from noise.
4. **Both tokens are very young.** BSB has ~17 days of data, LAB ~20 days. Cannot study longer cycle patterns.
5. **Both are post-Binance Alpha tokens.** May represent a specific exchange listing dynamic, not general altcoin behavior.

**Minimum requirements for scanner seed:**
- Expand to N>=10 tokens with similar characteristics
- Add N>=10 control tokens
- Add at minimum: CoinGecko + 4H OHLCV + DEX volume (DexScreener) for all tokens
- Ideally add: on-chain holder data for Ethereum/BSC tokens

---

## 11. Summary of Quality Gaps

| Gap | Severity | Blocking Scanner? |
|:---|:---:|:---:|
| No 4H/1H data | HIGH | Yes — cannot detect intraday microstructure |
| No on-chain data | CRITICAL | Yes — cannot confirm accumulation/distribution |
| No DEX data | CRITICAL | Yes — missing pre-CEX signals |
| No derivatives | HIGH | Partial — only news-mentioned |
| No social time series | HIGH | Yes — cannot assess narrative timing |
| No control group | CRITICAL | Yes — no false positive assessment |
| N=2 samples | CRITICAL | Yes — statistically meaningless |

**Conclusion: The v1 reports provide useful case studies but are NOT sufficient as a scanner foundation. This v2 research will maximize depth from available data, clearly mark all gaps, and produce a scanner FRAMEWORK that can be populated when data sources expand.**
