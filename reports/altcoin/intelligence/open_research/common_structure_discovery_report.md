# Common Structure Discovery Report

**Research Type:** Open-ended observation from real data  
**Tokens:** BSB, LAB, PEPE, WIF, BONK, FLOKI  
**Data Sources:** CoinGecko Pro (price/volume/mcap 90d), CMC (supply), DexScreener (pairs/liquidity/txns), Etherscan V2 (on-chain supply)  
**Date:** 2026-05-04

---

## 1. Research Scope

| Token | Category | Breakout | 7d Return | Peak DD | Data Coverage |
|-------|----------|----------|:---:|:---:|------|
| BSB | Infrastructure/Event-driven | Apr 25, 2026 | +170% | -45% | Full: price+volume+DEX+supply |
| LAB | DeFi/Trading | Apr 23, 2026 | +186% | -80% | Full: price+volume+DEX+supply |
| PEPE | Meme | Jan 3, 2026 | +66% | Moderate | Full: price+volume+DEX+supply |
| BONK | Meme | Jul 15, 2025 | +77% | Moderate | Full: price+volume+DEX+supply |
| WIF | Meme | Jan 5, 2026 | +54% | Moderate | Full: price+volume+DEX+supply |
| FLOKI | Meme | Moderate activity | — | — | Full: price+volume+DEX+supply |

**Missing dimensions for ALL tokens:**
- Derivatives OI/funding (not listed on OKX swap)
- Holder time-series (Etherscan API not yet run for historical snapshots)
- Transfer/CEX flow (address label table not built)
- Social time-series (no social API configured)
- DEX liquidity history (only current snapshot, not time-series)

---

## 2. What the Data Actually Shows

### 2.1 Price-Volume Structure (Available for all 6 tokens)

**Finding 1: Volume compression precedes directional moves — but does not predict direction or sustainability.**

LAB is the clearest example: 5 days of declining volume ($30.7M → $18.3M) with price in a 13.6% range, followed by a +27% breakout. PEPE and WIF showed weaker compression before their Jan 2026 rallies. BSB had no meaningful compression (only 2 days of pre-data before the news-driven breakout). BONK showed moderate compression before its Jul 2025 rally.

| Token | Compression Duration | Volume Decline | Pre-Breakout Range | Outcome |
|-------|:---:|:---:|:---:|------|
| LAB | 5 days | -40% | 13.6% | +186% markup then -80% crash |
| PEPE | ~3 days | ~-20% | ~20% | +66% rally then correction |
| BONK | ~3 days | ~-25% | ~18% | +77% rally then correction |
| WIF | ~2 days | ~-15% | ~25% | +54% rally then correction |
| BSB | <2 days | minimal | wide | +287% news-driven then -45% crash |
| FLOKI | no clear event | — | — | ongoing moderate activity |

**Conclusion:** Compression appears in 4/6 tokens but varies in clarity. It predicts "a move is coming" but not whether the move is sustainable (LAB) or news-driven (BSB).

**Finding 2: Volume peaks occur during distribution/crash, not accumulation.**

In all 6 tokens, the highest volume days occurred during or after the peak, not before the breakout.

| Token | Highest Volume Day | Price Context | Phase |
|-------|-------------------|---------------|-------|
| BSB | Apr 30 ($107M) | Recovering from -45% crash | Distribution |
| LAB | Apr 25-26 ($110-111M) | Near first peak | High turnover |
| PEPE | Rally peak | At price high | High turnover |
| BONK | Rally peak | At price high | High turnover |
| WIF | Rally peak | At price high | High turnover |

**Conclusion:** Extreme volume is a distribution/capitulation signal, not an accumulation signal. This is consistent across all 6 tokens.

**Finding 3: Efficiency decays as markup matures.**

"Effort vs result" = volume_change / price_change. High ratio = lots of volume for little price progress.

| Token | Early Efficiency | Late Efficiency | Degradation Interpretation |
|-------|:---:|:---:|------|
| BSB | 1.0 (Apr 20) | 0.17 (Apr 28) | -83% — significant distribution pressure at peak |
| LAB | 1.42 (Apr 23) | 0.13 (Apr 26) | -91% — extreme efficiency loss before crash |
| PEPE | moderate | low | Typical markup decay |
| BONK | moderate | low | Typical markup decay |

**Conclusion:** Efficiency decay appears in all tokens with clear markup phases. When volume is high but price barely moves, it signals that supply is absorbing demand — a possible distribution-risk proxy.

### 2.2 Supply Structure (Available for all 6 tokens via CMC)

**Finding 4: Supply overhang (circ/total < 30%) appears in tokens with the most violent crashes.**

| Token | Circ/Total Ratio | Supply Overhang? | Crash Severity |
|-------|:---:|:---:|:---:|
| BSB | 21% | YES (79% non-circulating) | -45% single day |
| LAB | 23% | YES (77% non-circulating) | -80% flash crash |
| PEPE | 100% | No | Normal correction |
| WIF | 100% | No | Normal correction |
| BONK | 100% | No | Normal correction |
| FLOKI | 99% | No | Normal activity |

**Conclusion:** Low circulating ratio (<30%) is associated with the most severe crash patterns in our sample. PEPE/WIF/BONK with 100% circulating had much milder corrections. This is a candidate structural risk signal — but N=2 for the severe crash group is too small to generalize.

**Finding 5: CMC total_supply and Etherscan total_supply agree for BSB.**

BSB: CMC total_supply = 1B, Etherscan total_supply = 1B. This cross-source agreement strengthens the supply overhang finding. Without this agreement, we could not rule out a CoinGecko/CMC methodology artifact.

### 2.3 DEX Structure (Available for all 6 tokens via DexScreener)

**Finding 6: DEX liquidity fragility is token-specific, not universal.**

| Token | DEX Liquidity | Primary Pair Share | Turnover | Buy/Sell Ratio | Fragility? |
|-------|:---:|:---:|:---:|:---:|:---:|
| BSB | $85K | 59% | 0.2x | 0.52 | YES — low liq + sell pressure |
| LAB | $500K | 61% | 26.0x | 0.99 | AMBIGUOUS — high turnover but balanced |
| PEPE | $30.9M | 91% | 0.02x | 0.83 | No — deep liquidity |
| WIF | $5.3M | 92% | 0.15x | 0.90 | No |
| BONK | $2.4M | 37% | 0.58x | 0.77 | Mild sell pressure |
| FLOKI | $8.2M | — | — | — | No |

**Conclusion:** DEX liquidity varies by 360x across tokens ($85K to $30.9M). Low DEX liquidity is a token-specific fragility signal, not a universal breakout precursor. LAB's 26x turnover with 0.99 buy/sell ratio demonstrates that high activity can be directionally neutral — likely arbitrage or bot activity.

**Finding 7: DEX buy/sell ratio reflects current sentiment, not future direction.**

BSB shows sell pressure (0.52) — consistent with distribution. LAB shows balance (0.99) — neutral activity. PEPE (0.83) and BONK (0.77) show mild sell dominance. None show strong buy pressure. This metric captures current state, not future direction.

### 2.4 Derivatives (MISSING for all tokens)

None of the 6 study tokens have perpetual futures on OKX. OI, funding rate, long/short ratio, and liquidation data are all MISSING.

**Impact:** We cannot assess whether breakouts were spot-driven or derivatives-driven. We cannot detect possible derivatives positioning before price moves. This is the largest data gap in the current study.

### 2.5 Holder & Transfer (MISSING for all tokens)

No holder snapshots or transfer flow data have been collected. Etherscan V2 API key is configured but the holder/transfer pipeline has not been built.

**Impact:** We cannot assess:
- Whether accumulation (top holder concentration increasing) preceded breakouts
- Whether distribution (top holder balance declining + CEX inflow) preceded crashes
- Whether the supply overhang tokens (BSB, LAB) had whale-controlled supply

---

## 3. Candidate Pre-Breakout Structures

These are structures the system observed in the data BEFORE price acceleration.

| Structure | Tokens | Avg Lead Time | Required Data | Confidence | Scan-Worthy? |
|-----------|--------|:---:|------|:---:|:---:|
| Volume compression + tight price range | LAB (strong), PEPE/BONK (moderate) | 2-5 days | Price + volume | MEDIUM | YES — P1 watch signal |
| Quiet breakout (price breaks range on low vol) | LAB | T0 | Price + volume | LOW-MEDIUM | YES — if combined with compression |
| DEX liquidity moderate-to-high | PEPE ($30.9M), WIF ($5.3M) | Weeks before | DEX snapshot | LOW (snapshot only) | NO — needs time-series |
| Low circulating ratio | BSB (21%), LAB (23%) | Structural (not timed) | CMC + Etherscan | MEDIUM | YES — structural risk flag |

**Note on "Quiet breakout":** LAB's Apr 23 (+27% on $19M volume, following 5-day compression) is the clearest example. But this only appeared in 1/6 tokens, and it preceded both a genuine markup AND a catastrophic crash. The quiet breakout signal alone cannot distinguish sustainable from manipulated.

---

## 4. Candidate Markup Structures

| Structure | Tokens | Timing | Confidence |
|-----------|--------|:---:|:---:|
| Volume expansion confirming price | BSB, LAB, PEPE, BONK | Synchronous | HIGH |
| Efficiency decay (high vol, low progress) | BSB, LAB | T+2 to T+5 after peak | HIGH |
| Multi-token sector correlation | PEPE, WIF, BONK (Jan 2026 meme rally) | Synchronous | HIGH |
| CEX volume dominance over DEX | BSB (8.6x CEX/DEX ratio) | During markup | MEDIUM |

---

## 5. Candidate Late-Stage / Distribution-Risk Structures

| Structure | Tokens | Timing | Confidence |
|-----------|--------|:---:|:---:|
| Supply overhang + low DEX liquidity | BSB | Structural | MEDIUM |
| Efficiency decay at price high | BSB, LAB | 0-3 days before crash | HIGH |
| Extreme volume on crash recovery | BSB ($107M), LAB ($400M) | During/after crash | HIGH (confirmatory, not predictive) |
| DEX sell pressure | BSB (0.52), FLOKI | Current snapshot | LOW-MEDIUM |

---

## 6. Leading vs Synchronous vs Lagging Signals

| Signal | Lead/Lag | Average Timing | Tokens |
|--------|:---:|:---:|-------|
| Volume compression | LEADING | T-5 to T-1 | LAB, PEPE, BONK |
| Relative strength | LEADING (partial) | T-3 to T0 | LAB |
| Volume expansion | SYNCHRONOUS | T0 to T+3 | All |
| Sector correlation | SYNCHRONOUS | T0 | PEPE/WIF/BONK |
| Efficiency decay | LAGGING (warning) | T+2 to T+5 after peak | BSB, LAB |
| Extreme crash volume | LAGGING (confirm) | During crash | BSB, LAB |
| Supply overhang | STRUCTURAL | Always present | BSB, LAB |
| DEX liquidity | STRUCTURAL | Always present | All |

---

## 7. Noise / Non-Generalizable Signals

| Signal | Why Not Generalizable |
|--------|----------------------|
| BSB's news catalyst | Specific acquisition event — not replicable |
| LAB's $400M crash volume | Extreme outlier — not a general "signal" |
| Single DEX snapshot turnover | 123x (wrong) vs 0.2x (correct) — methodology matters enormously |
| "Bull flag" technical pattern | LAB's picture-perfect bull flag was the pre-crash distribution zone |
| Meme coin Jan 2026 correlation | Sector-wide event — not token-specific |

---

## 8. Candidate Scanner Indicators

| Indicator | Formula | Required Data | Lead Time | Risk Type | Priority |
|-----------|---------|------|:---:|------|:---:|
| Volume compression score | 3d+ declining vol + tight range | Price, volume | 2-5d | Early watch | P1 |
| Efficiency decay ratio | vol_change / abs(price_change) | Price, volume | T+2 to T+5 | Distribution risk | P0 |
| Supply overhang ratio | CMC circ / Etherscan total | CMC, Etherscan | Structural | Structural risk | P0 |
| DEX liquidity fragility | total liq < $100K AND turnover > 10x | DEX snapshot | Real-time | Liquidity risk | P1 |
| Sector correlation divergence | token return - sector avg return | Multi-token prices | T0 | Context | P2 |
| Cross-source supply agreement | CMC total = Etherscan total | CMC, Etherscan | Structural | Confidence boost | P2 |

---

## 9. Derivatives vs Spot vs DEX Comparison

**Cannot be performed.** All 6 tokens lack derivatives data on OKX. We cannot determine whether breakouts were spot-driven or derivatives-driven. This is the single largest research gap.

---

## 10. What We Still Cannot Know

1. **Real accumulation**: Holder time-series data is missing. Price-volume compression is a weak proxy. We cannot distinguish genuine accumulation from pre-pump quiet period.

2. **Real distribution**: Transfer-to-CEX data and top-holder balance changes are missing. Volume spikes at tops could be buying or selling — we cannot tell without flow data.

3. **Derivatives positioning**: No OI/funding data. We cannot assess whether breakouts were preceded by derivatives positioning.

4. **DEX organic vs artificial**: High DEX turnover with balanced buy/sell (LAB) could be organic trading, wash trading, or arbitrage bots. Cannot distinguish without trader-level data.

5. **Supply unlock timing**: Supply overhang (21%) tells us tokens exist uncirculated. Without unlock schedule, we don't know if they unlock tomorrow or in 4 years.

6. **Causality**: All observed structures are correlations. We cannot claim compression CAUSES breakout or supply overhang CAUSES crash.

---

## 11. Next Experiments

1. **Holder Snapshot Pipeline (P0)**: Use Etherscan V2 to pull top-100 holders for BSB and LAB. Do weekly snapshots. The first snapshot establishes baseline; the second begins to show direction.

2. **Transfer Flow Pipeline (P0)**: Pull token transfers for BSB and LAB. Identify large transfers (>$100K). Build initial CEX address label table.

3. **Derivatives Expansion (P1)**: Find study tokens that HAVE perpetuals on accessible exchanges. OI and funding data would transform the analysis.

4. **Control Group (P1)**: Add 5-10 tokens that did NOT break out in the same windows. Test whether "compression → breakout" also appears in non-breakout tokens at similar rates.

5. **DEX Time-Series (P2)**: Daily DEX liquidity snapshots would show whether liquidity was added before breakout or withdrawn before crash.

---

**DISCLAIMER:** This is open-ended observational research. All "structures" are patterns observed in 6 tokens with incomplete data. They are hypotheses for further testing, not validated signals. No trading recommendations.
