# Scanner MVP Design — From BSB/LAB Research to Validated Monitor

**Status:** DESIGN — based on Phase 4 rule validation results

---

## 1. What We Know After Validation (Honest Assessment)

### Rules That Worked (in N=13 sample)

| Rule | Discrimination | False Positive Rate | Verdict |
|:---|:---:|:---:|:---|
| P1_EARLY_RELATIVE_STRENGTH_01 | 14.5x | 0.5% (3/549 ctrl rows) | **KEEP** — strongest signal |
| P1_QUIET_BREAKOUT_01 | 2.9x | 5.6% (31/549 ctrl rows) | **KEEP_AS_RISK_SIGNAL** — needs combination |

### Rules That Failed (0 triggers across 764 rows)

| Rule | Why |
|:---|:---|
| P0_SUPPLY_ANOMALY_01 | Thresholds too strict for daily CoinGecko API data |
| P0_PRICE_CAP_DIVERGENCE_01 | Same — daily data smooths out anomalies |
| P0_EXTREME_VOLUME_HIGH_01 | Threshold >3 z-score too strict |
| P0_EFFORT_RESULT_01 | Needs intraday data for close-in-range calculation |
| P0_CRASH_VOLUME_01 | Same — daily granularity limitation |
| P1_COMPRESSION_01 | Compression score thresholds need recalibration |

### What This Means

**The BSB/LAB case study identified real patterns, but the thresholds calibrated on N=2 are too strict for broader application.** This is a normal and expected finding — it's why we validate before deploying. The case study was hypothesis generation. The validation is hypothesis testing. The test says: most hypotheses need recalibration.

---

## 2. MVP Data Sources

### v1 (Today — Implementable)

Only CoinGecko free API:
- price (daily close)
- market_cap
- total_volume
- implied_supply = market_cap / price

### v2 (Next — Needs API Access)

- DexScreener: liquidity, pair volume, buy/sell ratio
- Etherscan/BscScan: holder count, top holder concentration

### v3 (Later — Needs Paid/Configured Access)

- Social APIs: Twitter volume, sentiment
- Multi-exchange OHLCV
- Derivatives OI/Funding

---

## 3. MVP Output Labels (ONLY These)

```
WATCH                    — Early setup signal detected. Research only.
WATCH_RISK               — Risk signal detected. Monitor for distribution.
AVOID_HIGH_RISK          — Multiple risk signals. Extreme caution.
NEED_MORE_DATA           — Insufficient data for assessment.
RESEARCH_ONLY            — Context/informational signal.

NEVER: BUY, SELL, LONG, SHORT
```

---

## 4. MVP Daily Report Format

```markdown
# Scanner Daily Report — YYYY-MM-DD

## Active Watches
| Token | Score | Category | Triggered Rules | Data Quality | Action |
|-------|-------|----------|----------------|:---:|--------|
| TOKEN | 65 | EARLY_STRENGTH | P1_EARLY_RELATIVE_STRENGTH | 0.3 | WATCH |

## Risk Flags
| Token | Score | Risk Level | Triggered Rules | Notes |
|-------|-------|------------|----------------|-------|
| TOKEN | 80 | HIGH | P1_Q_BREAKOUT + PRICE_EXTREME | WATCH_RISK |

## Data Quality Issues
| Token | Missing Data | Impact |
|-------|-------------|--------|
| TOKEN | No DEX liquidity | Cannot verify organic demand |

## Summary
- Tokens monitored: N
- WATCH signals: N
- WATCH_RISK signals: N
- AVOID_HIGH_RISK: N
- NEED_MORE_DATA: N
- Orders executed: 0
```

---

## 5. What MVP Does NOT Do

- Does NOT place orders
- Does NOT execute trades
- Does NOT recommend positions
- Does NOT predict future prices
- Does NOT claim to "find the next 100x"
- Does NOT auto-trade
- Does NOT connect to live trading

---

## 6. Next Steps for Production Scanner

1. **Recalibrate thresholds** on expanded sample (N>=50)
2. **Add DEX data** via DexScreener API to verify organic demand
3. **Add holder data** via Etherscan/BscScan API to detect accumulation/distribution
4. **Build daily cron job** that runs scanner and outputs report
5. **Integrate with demo:runner** observation mode for paper tracking
6. **Add lead-lag analysis** between scanner signals and actual price moves
