# Arkham Paid Decision Report

Generated: 2026-05-05T04:53:15.719Z

## 1. Decision

**EXTEND_TRIAL_OR_NEGOTIATE**

Transfer entity extraction: 7 tokens READY
Risk metrics found: false
Structural composites found: false
Context metrics found: false

## 2. Evidence Summary

### Supporting Paid Decision

- Transfer entity features built with 99% entity coverage — unique capability vs all other APIs
- Entity-labeled transfers with direction classification (cex/dex/fund/mm proxy) — no other API provides this
- On-chain transfer volume (historicalUSD) provides different signal than exchange volume (CoinGecko) or derivatives (CoinGlass)

### Against Paid Decision

- Top flow endpoint still non-functional after 18 variant tests — critical paid-tier capability missing
- Transfer data limited to 100 most recent rows per token — no historical time-series depth
- No pagination/cursor observed — cannot build full event-window transfer history
- Entity type classification for CEX is name-based (entity.type='misc' for Binance) — classification fragility
- Only 7 tokens with transfer entity data

## 3. What's Missing

- Top flow endpoint resolution (most important missing capability)
- Transfer pagination — need >100 rows for full event-window analysis
- Historical transfer depth — most recent 100 rows may not cover T-30 for older events
- Confirmation that transfer features persist post-trial

## 4. Recommendation

**CANCEL_ARKHAM_KEEP_LOCAL_ASSETS** — insufficient evidence to justify $1,500. Keep entity label registry and parsed transfers as local assets.