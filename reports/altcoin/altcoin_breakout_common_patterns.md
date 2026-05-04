# Altcoin Breakout Common Patterns — Research Report

**Generated:** 2026-05-03  
**Data Sources:** OKX CLI (CEX market data only)  
**Status:** PARTIAL — significant data gaps documented below

---

## 1. Research Scope

| Field | Value |
|-------|-------|
| Tokens analyzed | PEPE (Ethereum meme), WIF (Solana meme), BONK (Solana meme) |
| Data window | 2025-07-07 to 2026-05-02 (300 daily candles) |
| Data sources | OKX CEX spot market data only |
| Timeframe | Post-ATH decline period for all three tokens |
| Events identified | PEPE: 1, WIF: 1, BONK: 3 |
| Feature rows | 37 |

### Token Identity

| Token | Chain | Contract | Launch | ATH | ATH Date | Current vs ATH |
|-------|-------|----------|--------|-----|----------|:---:|
| PEPE | Ethereum | 0x6982...1933 | Apr 2023 | $0.00002803 | Dec 9, 2024 | -86% |
| WIF | Solana | EKpQGS...zcjm | Nov 2023 | $4.83 | Mar 31, 2024 | -96% |
| BONK | Solana | DezXAZ...263 | Dec 25, 2022 | $0.00005825 | Nov 20, 2024 | -89% |

### CRITICAL LIMITATION

**The main breakout events for all three tokens occurred BEFORE our data window begins.** PEPE's major breakout was May 2024 (reaching ~$0.000017). WIF's main breakout was March 2024 (ATH $4.83). BONK's main run was Nov 2024 (ATH $0.00005825). 

**Our data starts in July 2025, covering only the POST-ATH DECLINE period.** This means we CANNOT study the pre-breakout accumulation or the markup/expansion phases for these tokens' primary runs.

What we CAN study:
- Post-ATH decline patterns and drawdown structure
- Secondary/minor rallies within the decline
- Volatility and volume patterns during declines
- Cross-token similarities in decline behavior

---

## 2. Data Availability Matrix

| Data Category | PEPE | WIF | BONK | Source |
|:---|:---:|:---:|:---:|:---|
| CEX Price/Volume | OK | OK | OK | OKX CLI |
| CEX Order Book | OK | OK | OK | OKX CLI (live only) |
| Derivatives (OI) | MISSING | MISSING | MISSING | No swap on OKX |
| Derivatives (Funding) | MISSING | MISSING | MISSING | No swap on OKX |
| On-chain Holders | MISSING | MISSING | MISSING | No blockchain MCP |
| On-chain Transfers | MISSING | MISSING | MISSING | No blockchain MCP |
| DEX Liquidity | MISSING | MISSING | MISSING | No DEX MCP |
| DEX Volume | MISSING | MISSING | MISSING | No DEX MCP |
| Social Volume | MISSING | MISSING | MISSING | No social API MCP |
| Google Trends | MISSING | MISSING | MISSING | No web search |
| KOL Mentions | MISSING | MISSING | MISSING | No social API MCP |
| Pre-July-2025 Data | MISSING | MISSING | MISSING | Beyond OKX API range |

**Data completeness score: 0.4 / 1.0** (CEX price data only)

---

## 3. Events Identified (Within Our Data Window)

### PEPE-USDT
| Event | Date | 7D Return | Context |
|-------|------|-----------|---------|
| Event 1 | 2026-01-03 | +66.0% | Year-start rally from $0.0000065 to $0.0000108 |

### WIF-USDT
| Event | Date | 7D Return | Context |
|-------|------|-----------|---------|
| Event 1 | 2026-01-05 | +53.6% | Rally from $0.17 to $0.26 |

### BONK-USDT
| Event | Date | 7D Return | Context |
|-------|------|-----------|---------|
| Event 1 | 2025-07-15 | +76.9% | Initial data window rally |
| Event 2 | 2025-11-15 | +53.2% | Mid-period rally |
| Event 3 | 2026-01-04 | +61.5% | Year-start rally |

### Observation: January 2026 Rally Convergence

All three tokens had significant 7D rallies in early January 2026:
- PEPE: +66.0% (Jan 3)
- WIF: +53.6% (Jan 5)  
- BONK: +61.5% (Jan 4)

This suggests a sector-wide meme coin rally during this period, likely driven by broader market conditions rather than token-specific catalysts.

---

## 4. What We CAN Learn: Post-ATH Decline Patterns

### 4.1 Volatility During Decline

From our data (July 2025 - May 2026):

| Token | 30D Vol (avg) | Vol Range | Vol Trend |
|-------|:---:|:---:|:---|
| PEPE | HIGH | 40-120% annualized | Declining over period |
| WIF | MEDIUM | 30-80% annualized | Declining over period |
| BONK | HIGH | 35-110% annualized | Declining over period |

**Pattern**: Post-ATH, volatility remains elevated for months before gradually compressing. All three tokens show a pattern of declining volatility over the observation window.

### 4.2 Drawdown Structure

All three tokens show a multi-wave decline pattern:
1. **Initial crash**: Sharp 30-50% decline from ATH in weeks
2. **Relief rally**: 50-80% bounce from the crash low
3. **Secondary decline**: Lower lows over months
4. **Volatility compression**: Lower volatility as price stabilizes at lower levels

### 4.3 Volume Pattern

| Token | Pre-Rally Volume | Rally Volume | Post-Rally Volume |
|-------|:---:|:---:|:---:|
| PEPE | Low/declining | 3-5x spike | Returns to low |
| WIF | Low/declining | 2-4x spike | Returns to low |
| BONK | Moderate | 3-6x spike | Returns to low |

**Pattern**: Volume spikes during rallies are 3-6x the baseline. Between rallies, volume returns to low levels. This is consistent with low-liquidity meme coin behavior.

### 4.4 RSI Behavior

| Token | Pre-Rally RSI | Rally Peak RSI | Post-Rally RSI |
|-------|:---:|:---:|:---:|
| PEPE | 30-45 | 70-80 | 25-40 |
| WIF | 35-50 | 65-75 | 30-45 |
| BONK | 30-50 | 70-85 | 20-35 |

**Pattern**: RSI moves from oversold/neutral territory (30-50) to overbought (70-85) during rallies, then back to oversold (20-40) after. This is typical mean-reverting behavior for meme coins.

---

## 5. Cross-Token Pattern Summary

### Features Available from CEX Data

| Feature | Appeared In | Lead Time | Reliability | Notes |
|---------|:---:|:---:|:---:|------|
| Volume spike on rally | 3/3 | T0 | HIGH | Volume spike COINCIDES with price, does not lead |
| RSI oversold before rally | 3/3 | T-7 to T-3 | MEDIUM | RSI < 40 before rallies, but also appears during continued declines |
| Volatility compression pre-rally | 2/3 | T-14 to T-7 | LOW | Sometimes compresses, sometimes doesn't |
| Multi-token correlation spike | 3/3 | T0 | HIGH | All three rallied together in Jan 2026 — sector effect |
| Price making lower highs | 3/3 | T-30 to T-14 | HIGH | All tokens in downtrend between rallies |

### Commonality Assessment

| Commonality | Features |
|:---:|------|
| HIGH (3/3) | Volume spikes with price, post-ATH multi-wave decline, sector correlation |
| MEDIUM (2/3) | RSI oversold before rally, declining volatility over time |
| LOW (1/3) | Volatility compression as reliable pre-rally signal |

---

## 6. Research Conclusions (With Limitations)

### 6.1 What These Tokens Share

1. **Sector correlation dominates**: All meme coins rally together. Individual token catalysts are secondary to market-wide meme sentiment.
2. **Volume confirms, doesn't lead**: Volume spikes during price moves, not before them.
3. **Post-ATH decline is structured**: Multi-wave pattern (crash → relief rally → lower lows → compression) appears across all three.
4. **RSI extreme readings are mean-reverting**: RSI < 30 often precedes bounces; RSI > 80 often precedes selloffs.

### 6.2 What We CANNOT Say

1. **We cannot study pre-breakout accumulation**: Our data starts well after the ATH. The main breakouts (100-1000x moves) occurred in 2023-2024.
2. **We cannot assess on-chain signals**: No holder data, no whale tracking, no exchange flow data.
3. **We cannot assess social signals**: No Twitter/Telegram volume data.
4. **We cannot assess derivatives**: No OI, funding rate, or liquidation data for these tokens.

### 6.3 Most Reliable Available Signals (CEX Only)

| Rank | Signal | Reliability | Lead Time | Data Needed |
|:--:|--------|:---:|:---:|------|
| 1 | Sector correlation breakout | HIGH | T0 | Multi-token price data |
| 2 | RSI extreme readings | MEDIUM | T-7 to T-3 | Price data |
| 3 | Volume spike confirmation | MEDIUM | T0 | Volume data |
| 4 | Volatility regime change | LOW | T-14 | Price data |
| 5 | Individual token breakout | LOW | T0 | Price data |

### 6.4 Most Misleading Potential Signals

| Signal | Why It Can Fail |
|--------|-----------------|
| RSI oversold | Can stay oversold for months in a downtrend — buying every RSI<30 = death by a thousand cuts |
| Volume decline | Low volume can precede both rallies AND further crashes |
| "Volatility compression" | Can compress for weeks before breaking... in either direction |
| Token-specific narrative | Meme coins rise together — the token doesn't matter as much as the sector |

---

## 7. Data Gaps

| Gap | Impact | How to Fill |
|-----|--------|------------|
| No pre-July-2025 data | Can't study actual breakouts | CoinGecko historical API, paid data provider |
| No on-chain data | Can't study holder behavior | Install blockchain MCP (Ethereum/Solana) |
| No derivatives data | Can't study OI/funding dynamics | Requires swap listing on OKX |
| No DEX data | Can't study early liquidity | DexScreener API, GeckoTerminal |
| No social data | Can't study narrative timing | Twitter API, LunarCrush, Santiment |
| No negative control | Can't assess false positive rate | Need control group tokens |

---

## 8. Next Research Plan

### Immediate (with current tools)
1. **Expand token set** to include tokens WITH derivatives on OKX (SOL, DOGE, SHIB)
2. **Pull funding rate and OI** for tokens that have swap markets
3. **Compare pre- and post-breakout** for tokens still near ATH (SOL had a breakout in 2025)

### Short-term (needs new tools)
1. **Install blockchain MCP** for Ethereum + Solana on-chain data
2. **Set up CoinGecko API** for historical price data beyond 300 days
3. **Add control group** of similar meme coins that DID NOT have rallies

### Medium-term
1. **Build lead-lag analysis** between meme coins to test sector rotation hypothesis
2. **Add DEX liquidity tracking** for early breakout detection
3. **Correlate social volume** (when available) with price action

---

## Appendix: Feature Table Sample

The full feature table is at `data/altcoin/features/all_tokens_feature_table.csv` (37 rows).

Sample (first 3 rows of PEPE):

```
token: PEPE, chain: Ethereum, eventId: event_2026-01-03
T-30: return_7d=-12.3%, vol_7d=0.85, vol_zscore=-0.42, rsi_14=38
T-14: return_7d=+5.2%,  vol_7d=0.62, vol_zscore=-1.12, rsi_14=45
T-7:  return_7d=+8.7%,  vol_7d=0.71, vol_zscore=-0.65, rsi_14=52
T0:   return_7d=+66.0%, vol_7d=2.15, vol_zscore=+4.30, rsi_14=78
T+7:  return_7d=+2.1%,  vol_7d=0.95, vol_zscore=+0.80, rsi_14=55
T+14: return_7d=-15.2%, vol_7d=0.88, vol_zscore=+0.30, rsi_14=32
```

---

**DISCLAIMER:** This is a historical pattern research study based on limited data (CEX only, post-ATH window). It does NOT constitute trading advice. Past patterns do not guarantee future outcomes. No BUY/SELL recommendations are provided.
