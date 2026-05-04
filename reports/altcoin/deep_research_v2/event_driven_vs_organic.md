# Event-Driven vs Organic Breakout — BSB & LAB

---

## 1. Classification

| Token | Classification | Confidence | Reason |
|:---|:---|:---:|:---|
| BSB | **Event-Driven** | HIGH | AI Financial acquisition ($43M) announced Apr 25 directly catalyzed the 63% single-day surge |
| LAB | **Mixed — Organic Compression + Supply Anomaly** | MEDIUM | Showed organic compression → breakout, but May 1-3 showed classic pump-dump with supply anomaly |

---

## 2. Event-Driven Characteristics (BSB)

### Evidence for Event-Driven

| Evidence | Strength |
|:---|:---:|
| Clear news catalyst (acquisition by Trump-affiliated company) | STRONG |
| Price was declining before news (Apr 16-19: -6%) | STRONG |
| 63% surge on the exact day of news (Apr 25) | STRONG |
| No multi-day compression before rally | STRONG |
| Severe crash within 4 days of peak (-45% in one day) | STRONG |
| Supply dilution detected during crash | STRONG |

### BSB Price Path

```
Pre-news:  $0.25 → $0.22 (declining, low vol)
News day:  $0.22 → $0.74 (+236% in days around news)
Post-peak: $0.84 → $0.46 (-45% crash)
Now:       $0.65 (volatile, well below peak)
```

### Key Risk of Event-Driven Tokens

Event-driven pumps share a dangerous pattern:
1. **No accumulation phase** — the rally comes from a news event, not organic demand building
2. **Volume is concentrated around the event** — no gradual expansion
3. **Post-event crash is sharp** — once the news is priced in, there's no sustained demand
4. **Supply dilution often follows** — team/insiders may use the news-driven volume to exit

**Scanner implication:** Event-driven tokens should be tagged separately. Their "breakout" patterns are not replicable and their risk profile is different from organic breakouts.

---

## 3. Organic Characteristics (LAB)

### Evidence for Organic

| Evidence | Strength |
|:---|:---:|
| Multi-day volume/price compression before breakout | STRONG |
| Quiet breakout (low vol, then volume confirmation later) | STRONG |
| Gradual holder/value discovery (price rose from $0.074 ATL over months) | MODERATE |
| Trading ecosystem narrative (DeFi, Launchpad, Binance Alpha) | MODERATE |

### Evidence Against Organic (Red Flags)

| Evidence | Strength |
|:---|:---:|
| Supply/market cap anomaly on May 1 | STRONG |
| Parabolic spike on DECLINING volume | STRONG |
| -80% flash crash within 24h of ATH | STRONG |
| $400M crash volume with no closing price | STRONG |
| $39M in liquidations | STRONG |

### LAB Price Path

```
Organic phase:    $0.48 → $0.85 (Apr 14-25, 12 days) — gradual markup with volume
Correction:       $0.85 → $0.69 (Apr 25-30, 5 days)  — orderly pullback
Anomaly phase:    $0.69 → $1.98 (Apr 30-May 2, 3 days) — parabolic on low vol
Crash:            $3.64 → $0.73 (May 2-3, intraday) — catastrophic
```

### Interpretation

LAB had a GENUINE organic phase (compression → quiet breakout → markup → orderly correction). Then something changed: the May 1-3 period shows all the hallmarks of a manufactured pump or liquidity event, not organic continuation.

**This is the most important finding for scanner design:** A token can transition from "organic" to "manipulated" mid-lifecycle. The scanner must detect the TRANSITION, not just classify the token.

---

## 4. Differentiating Event-Driven from Organic

| Feature | Event-Driven | Organic (Early) | Organic (Late/Manipulated) |
|:---|:---|:---|:---|
| Pre-rally compression | Absent or very short | Present (3-7 days) | May appear before spike |
| Volume before rally | Low/random | Declining trend | May re-compress |
| Rally trigger | Specific news/announcement | No single trigger | Unclear catalyst |
| Volume during rally | Explosive from T0 | Gradual expansion | Low then explosive |
| Supply anomaly near peak | Common | Rare/uncommon | COMMON |
| Post-peak crash speed | Very fast (1-3 days) | Gradual (7-14+ days) | Very fast (hours) |
| Recovery after crash | Volatile, unclear | Often stabilizes | Usually continues declining |

---

## 5. Scanner Rules for Event Detection

### P1: Event-Driven Rally Flag

```
rule_id: P1_EVENT_01
name: News-Correlated Price Spike
category: P1
description: |
  Price surges >20% in 1 day coinciding with major news/announcement.
  Tag token as EVENT_DRIVEN — patterns may not generalize.
formula: |
  price_return_1d > 20%
  AND news_count_1d > 3 OR major_announcement_flag
  AND pre_rally_compression_days < 2
required_data: [price, news feed]
threshold: return >20% + news + no prior compression
BSB_match: YES
LAB_match: NO (initial breakout was not news-driven)
lead_time: T0
false_positive_risk: LOW
output_label: EVENT_DRIVEN_RALLY — different risk profile
priority: P1
```

### P2: Organic-to-Manipulated Transition

```
rule_id: P2_EVENT_02
name: Late-Stage Supply Anomaly in Previously Organic Token
category: P2
description: |
  Token that showed organic accumulation/compression → markup pattern
  suddenly shows supply anomaly and parabolic spike. This is a
  transition from organic to high-risk.
formula: |
  was_organic_breakout (P1_COMPRESSION_01 matched in last 14 days)
  AND supply_dilution_flag (P0_SUPPLY_DILUTION_01)
  AND price_return_3d > 50%
  AND volume_declining_during_rally
required_data: [price, volume, market_cap, compression history]
threshold: organic history + supply anomaly + parabolic price
BSB_match: NO — was never organic
LAB_match: YES — May 1-2: organic compression history + supply anomaly + parabolic
lead_time: Real-time (during transition)
false_positive_risk: MEDIUM
output_label: ORGANIC_TO_HIGH_RISK_TRANSITION
priority: P2
```

---

## 6. Key Conclusions

1. **BSB is a pure event-driven pump.** Its patterns should NOT be used as templates for "organic breakout" scanning. The acquisition catalyst is not replicable.

2. **LAB is a hybrid** — started organic, ended manipulated. The transition point (May 1) is the most instructive data point for scanner design.

3. **The organic-to-manipulated transition is the highest-value scanner target.** Catching a token that was behaving normally and suddenly shows supply anomalies, parabolic price on low volume, and extreme volume crashes would give the earliest possible risk warning.

4. **Event-driven tokens need their own classification and risk scoring.** Their lifecycles are shorter, crashes are sharper, and supply dilution is more common.
