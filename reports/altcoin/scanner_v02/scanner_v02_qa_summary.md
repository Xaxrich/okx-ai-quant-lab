# Scanner v02 QA Summary

**Generated:** 2026-05-04

---

## 1. Security Check

| Check | Result |
|-------|:---:|
| API keys in source files (hardcoded) | **FIXED** — keys moved to `.env` (gitignored), source reads from `process.env` |
| API keys in `.env` | EXPECTED — `.env` is gitignored |
| API keys in `.env.example` | CLEAN — only variable names |
| API keys in scanner reports | CLEAN — no keys in any generated reports |
| API keys in logs | CLEAN — no keys in logs |
| `.env` in `.gitignore` | CONFIRMED |

---

## 2. Label System Fix

| Before (v0.1/v2) | After (v02) |
|:---|:---|
| OK | **REMOVED** — replaced with `NO_CURRENT_FLAG` |
| SAFE | **FORBIDDEN** |
| WATCH | RETAINED |
| WATCH_RISK | RETAINED |
| — | **NEW:** `AVOID_HIGH_RISK` (score >= 60) |
| — | **NEW:** `NEED_MORE_DATA` (data quality < 0.3) |
| — | **NEW:** `NO_CURRENT_FLAG` (no rules triggered, sufficient data) |
| BUY/SELL/LONG/SHORT | **FORBIDDEN — never emitted** |

---

## 3. Supply Metric Correction

| Old | New |
|:---|:---|
| "circulating ratio" | `circulating_to_onchain_supply_ratio` |
| "large unlock risk" | "supply overhang — requires unlock schedule verification" |
| "confirmed dilution" | **FORBIDDEN** — replaced with "supply overhang risk detected, cross-verification required" |
| No scope tracking | `supply_scope`: SINGLE_CHAIN_ONLY, MULTICHAIN_AGGREGATED, CMC_ONLY, ONCHAIN_PARTIAL, INSUFFICIENT_SUPPLY_SCOPE |
| No confidence | `supply_scope_confidence`: HIGH, MEDIUM, LOW, NONE |

---

## 4. BSB AVOID_HIGH_RISK Validation

### Current Assessment

| Signal | Score | Evidence Type | Confidence |
|:---|:---:|:---|:---|
| Supply overhang (21% circ/onchain) | 30 | **STRONG** — two independent sources (CMC + Etherscan) | MEDIUM |
| Low DEX liquidity ($50K) | 15 | **STRONG** — DexScreener direct observation | HIGH |
| Extreme DEX turnover (123x) | 15 | **MODERATE** — numerator (CMC DEX vol) ≠ denominator (single DexScreener pair liquidity) | LOW |

### What's Strong Evidence
- CMC circulating supply (207.8M) and Etherscan total supply (1B) are from independent sources — the 21% ratio is well-supported
- DEX liquidity $50K is directly observed from DexScreener

### What's Weak Evidence
- DEX turnover 123x uses CMC's aggregated DEX volume (across all pairs) divided by a single pair's liquidity — this mismatch inflates the ratio
- Supply scope is SINGLE_CHAIN_ONLY — BSB is on Ethereum, Base, BSC, Mantle. The Etherscan total supply is Ethereum-only
- No unlock schedule data — cannot confirm WHEN or IF the non-circulating supply will enter circulation

### Conclusion
**BSB AVOID_HIGH_RISK is supported by supply overhang and liquidity fragility evidence.** The label is warranted based on available data. However, all conclusions are limited by:
1. Single-chain supply scope (Ethereum only)
2. DEX liquidity from single pair
3. No unlock/vesting schedule data
4. No holder distribution data

---

## 5. Why LAB is NO_CURRENT_FLAG Now

LAB previously showed no issues. The v02 scanner confirms:
- LAB has no CMC circulating supply data (cmcId was null in our config)
- LAB's DEX liquidity is $0.1M (moderate)
- LAB's DEX buy/sell ratio is 0.96 (balanced)
- Without supply data, the supply overhang analysis is disabled

LAB could still have supply issues — we simply don't have the CMC data to assess them.

---

## 6. Historical Replay Status

**NOT YET PERFORMED** — the CMC free tier does not support historical circulating supply queries. The `integrated_data_fetcher.ts` pulls current snapshots only.

DexScreener API provides current data only (no historical liquidity/volume endpoints in free tier).

This means: **Scanner v02 is a SNAPSHOT scanner, not a time-series scanner.** It cannot be historically replayed for supply or DEX metrics.

---

## 7. Snapshot vs Time-Series Signals

| Signal Type | Examples | Available? | Historical Replay? |
|:---|:---|:---|:---|
| **Snapshot** | circulating ratio, DEX liquidity, CEX/DEX ratio | YES | NO — APIs return current only |
| **Time-Series (Price)** | returns, volatility, volume z-score | YES (CoinGecko) | YES |
| **Time-Series (Supply)** | supply change 1d/7d | NO | NO — CMC free tier no history |
| **Time-Series (DEX)** | liquidity change, volume trend | NO | NO — DexScreener no history |
| **Time-Series (On-chain)** | holder growth, transfer growth | NO | NO — Etherscan no holder history in free tier |

---

## 8. Final v02 Status

**LIMITED_SNAPSHOT_SCANNER**

The v02 scanner can:
- Detect current supply overhang (CMC + Etherscan snapshot)
- Detect current DEX liquidity fragility (DexScreener snapshot)
- Detect current CEX/DEX volume imbalance (CMC snapshot)
- Use CoinGecko price history for time-series price/volume features

The v02 scanner CANNOT:
- Historically replay supply or DEX signals
- Track supply changes over time
- Track DEX liquidity changes
- Track holder count changes
- Distinguish between long-standing low circulation (normal vesting) and sudden supply events

---

## 9. Next Data Upgrade

| Priority | Upgrade | Effect |
|:---:|------|------|
| P0 | CMC historical endpoint (requires paid tier or alternative) | Enable supply change time-series |
| P1 | DexScreener pair historical data (requires different endpoint) | Enable DEX liquidity trend detection |
| P1 | Multi-chain supply aggregation (BSC, Base, Mantle for BSB) | Fix supply scope from SINGLE_CHAIN_ONLY to MULTICHAIN_AGGREGATED |
| P2 | Holder count time-series (Etherscan Pro or alternative) | Enable accumulation/distribution detection |
| P2 | Token unlock schedule scraping | Verify whether supply overhang has scheduled unlocks |
