# OKX 10-Result Chain Sweep Research Report

Generated: 2026-05-29

Scope: OKX-listed USDT swap contracts, research-only. This report does not authorize order placement.

## Executive Summary

The expanded directional chain-sweep framework found 10 suitable research results:

- 1 long-side ambush result: `CHZ-USDT-SWAP`
- 9 short-side setup results: `ENA`, `WLD`, `H`, `BSB`, `INJ`, `LIT`, `SAHARA`, `RAVE`, `AI`

Execution gate split:

- `SCAN_ALLOWED`: `CHZ` long; `LIT`, `SAHARA`, `RAVE` short
- `WATCH_ONLY`: `ENA`, `WLD`, `H`, `BSB`, `INJ`, `AI` short

Interpretation:

- `SCAN_ALLOWED` means the result may go to pre-trade risk review.
- `WATCH_ONLY` means the result is suitable for monitoring, but execution is blocked by incomplete or adverse execution evidence.
- All results are research states, not trade instructions.

## Method And Gate Changes

The prior strict framework only surfaced clean long accumulation candidates. That produced one valid result, `CHZ`. To satisfy a 10-result research mandate without forcing weak longs, the framework now uses a directional research mode:

```bash
npm run intelligence:accumulation:chain-candidates -- --limit=40 --min-accumulation=15 --min-execution=40 --max-risk=100 --research-scan --write-chain-candidates
npm run validation:chain-gate -- --input=data/altcoin/intelligence/validation/accumulation_chain_candidates_latest.csv --min-opportunity=0 --min-tradability=40 --max-fragility=100
npm run intelligence:onchain:cex-flow -- --tokens=<candidate-batch> --pages=40 --windows=1,4,24 --target-window-hours=24
npm run intelligence:onchain:readiness
npm run intelligence:onchain:directional
npm run intelligence:onchain:short-exec
npm run intelligence:onchain:qualified-subset
```

Key rule:

- CEX inflow risk blocks long accumulation, but can qualify a short-side research setup.
- Short rows with blockers are included only as `WATCH_ONLY`.

## Result Table

| token | side | bucket | gate | conf | opp | frag | trad | final state | 24h | 7d | OI 7d | funding | 24h CEX decision | 24h net CEX value | short exec | blockers |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |
| CHZ | LONG | LONG_AMBUSH_SCAN | SCAN_ALLOWED | HIGH | 54 | 0 | 77 | WAIT_CONFIRMATION | 1.01% | -21.31% | -21.92% | -0.00% | CEX_OUTFLOW_OR_NEUTRAL | -10,496,307.83 | N/A |  |
| LIT | SHORT | SHORT_SETUP_SCAN | SCAN_ALLOWED | MEDIUM | 0 | 56 | 77 | DISTRIBUTION_RISK | 6.48% | -9.86% | -8.27% | 0.01% | CEX_OUTFLOW_OR_NEUTRAL | 58,799.97 | SHORT_EXEC_READY |  |
| SAHARA | SHORT | SHORT_SETUP_SCAN | SCAN_ALLOWED | MEDIUM | 0 | 50 | 67 | DISTRIBUTION_RISK | 4.45% | -1.38% | 17.89% | 0.01% | CEX_INFLOW_RISK | 40,044,171.68 | SHORT_EXEC_READY |  |
| RAVE | SHORT | SHORT_SETUP_SCAN | SCAN_ALLOWED | MEDIUM | 0 | 50 | 67 | DISTRIBUTION_RISK | -1.65% | -23.12% | -7.70% | 0.02% | CEX_INFLOW_RISK | 220,226.90 | SHORT_EXEC_READY |  |
| ENA | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 3 | 50 | 67 | DISTRIBUTION_RISK | -0.94% | -19.38% | 11.91% | -0.01% | CEX_INFLOW_RISK | 11,364,002.95 | SHORT_EXEC_READY | COINGLASS_OI_INCOMPLETE |
| WLD | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 50 | 93 | DISTRIBUTION_RISK | -1.11% | 4.35% | 38.37% | -0.02% | CEX_INFLOW_RISK | 6,453,105.62 | SHORT_EXEC_READY | COINGLASS_OI_INCOMPLETE |
| H | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 56 | 85 | DISTRIBUTION_RISK | 4.34% | 25.93% | 43.73% | 0.01% | CEX_INFLOW_RISK | 31,791,258.68 | SHORT_WATCH_ONLY | COINGLASS_OI_INCOMPLETE |
| BSB | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 100 | 85 | DISTRIBUTION_RISK | -8.35% | -60.10% | 205.93% | 0.01% | CEX_OUTFLOW_OR_NEUTRAL | -324,424.15 | SHORT_WATCH_ONLY | COINGLASS_AGAINST_SHORT |
| INJ | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 50 | 77 | DISTRIBUTION_RISK | 12.03% | 12.93% | 35.46% | -0.02% | CEX_INFLOW_RISK | 102,173.10 | SHORT_WATCH_ONLY | COINGLASS_AGAINST_SHORT |
| AI | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 100 | 67 | DISTRIBUTION_RISK | 17.68% | -3.49% | -14.68% | -0.82% | CEX_INFLOW_RISK | 13,096,767.15 | SHORT_WATCH_ONLY | COINGLASS_AGAINST_SHORT |

## Result Notes

### CHZ Long Ambush

CHZ is the only long-side result. It has a clean 1h/4h/24h CEX-flow profile, supported CEX-flow gate, risk score 0, and `READY_FOR_DEEP_SCAN`.

Thesis:

- 7d price is still down, while CEX proxy flow is neutral/outflow.
- Funding is near neutral and derivatives are not overheated.
- This is a wait-for-confirmation long ambush setup, not a chase.

Invalidation:

- Any 4h/24h CEX-flow flip to `CEX_INFLOW_RISK`.
- Holder identity becomes unresolved.
- Price loses compression while OI continues falling.

### LIT Short Setup

LIT is `SHORT_EXEC_READY` with no current blockers, despite a 24h CEX window that is not cleanly inflow. The short setup comes from 1h and 4h inflow risk, recent positive 24h move, and distribution-risk final state.

Thesis:

- Short-term CEX deposit pressure appeared during the rebound.
- Execution/tradability score is acceptable.

Invalidation:

- 1h and 4h CEX-flow flip neutral/outflow.
- Price holds above the recent expansion range with rising OI and no renewed CEX inflow.

### SAHARA Short Setup

SAHARA is one of the cleanest short-side results. It has persistent CEX inflow across all windows and `SHORT_EXEC_READY`.

Thesis:

- 24h CEX net value is strongly positive.
- OI is up on the 7d window, making inflow risk more relevant.

Invalidation:

- 4h/24h CEX-flow turns neutral/outflow.
- Funding cools and price absorbs inflow without losing structure.

### RAVE Short Setup

RAVE is `SHORT_EXEC_READY`, with persistent CEX inflow across 1h/4h/24h and no blockers.

Thesis:

- 7d price remains weak, and CEX inflow pressure has not cleared.
- Execution gate allows pre-trade review, but market cap and liquidity still require cautious sizing.

Invalidation:

- CEX-flow flips neutral/outflow.
- Price reclaims the prior range with declining inflow pressure.

### ENA Short Watch

ENA has persistent CEX inflow risk and a short setup directionally, but execution is `WATCH_ONLY` because OI evidence is incomplete.

Thesis:

- 24h CEX net value is strongly positive.
- 7d price is weak, so continued inflow can cap rebounds.

Invalidation:

- CEX-flow clears.
- OI/funding confirmation improves against the short thesis.

### WLD Short Watch

WLD has strong execution quality but is watch-only due incomplete OI confirmation.

Thesis:

- 4h and 24h CEX inflow risk persists.
- 7d OI is up sharply, so distribution pressure could matter if price stalls.

Invalidation:

- CEX-flow clears or OI expansion resolves into upside continuation.

### H Short Watch

H has a strong CEX inflow profile and high tradability, but short-execution evidence is incomplete.

Thesis:

- 24h CEX net value is materially positive.
- 7d price and OI are both up, which can turn into crowded upside if deposits persist.

Invalidation:

- 4h/24h inflow risk clears.
- Price continues higher while funding and OI remain controlled.

### BSB Short Watch

BSB is the highest-risk watch-only result. It has extreme fragility and 7d OI expansion, but 24h CEX-flow is not consistently inflow.

Thesis:

- 4h CEX inflow and extreme derivative/fragility state keep it on the risk monitor.
- It is not execution-ready.

Invalidation:

- CEX-flow remains outflow/neutral across 4h and 24h.
- Deleveraging completes without renewed inflow.

### INJ Short Watch

INJ has persistent CEX inflow risk and strong recent price/OI expansion, but execution gate is watch-only.

Thesis:

- Positive 24h/7d price with OI expansion and CEX inflow can become distribution risk.
- Short thesis needs better execution confirmation.

Invalidation:

- CEX inflow clears.
- Momentum continues with cleaner flow and no funding stress.

### AI Short Watch

AI has strong CEX inflow and high risk, but funding/Coinglass context blocks execution.

Thesis:

- CEX inflow is persistent and label coverage is high.
- Funding is already stressed, so chasing short without a reset is unsafe.

Invalidation:

- Funding normalizes while price absorbs supply.
- CEX-flow clears.

## Excluded But Monitored

These rows were not counted in the 10:

- `LAB`, `UB`, `BEAT`, `EDEN`: BSC path has no usable current transfer data because `BSCSCAN_NOT_CONFIGURED`.
- `OP`: Optimism explorer path is not available on the current free Etherscan plan.
- `ARB`: 24h CEX window is partial and low confidence.
- `RIVER`: label coverage is too low.
- `ALLO`, `BILL`: clean transfer flow but no active directional bucket.

## Operator Checklist

Before any execution review:

1. Rerun CEX-flow for the chosen token alone.
2. Confirm OKX depth, slippage, and funding.
3. Re-run short-exec for short candidates.
4. Treat `WATCH_ONLY` as non-executable until blockers clear.
5. Invalidate short results immediately if CEX-flow flips neutral/outflow.
6. Invalidate CHZ long if CEX inflow appears or holder identity becomes unresolved.

## Bottom Line

The framework produced exactly 10 suitable directional research results under the upgraded methodology:

- Long: `CHZ`
- Short scan allowed: `LIT`, `SAHARA`, `RAVE`
- Short watch-only: `ENA`, `WLD`, `H`, `BSB`, `INJ`, `AI`

The cleanest executable-review candidates are `CHZ` for long research and `SAHARA` / `RAVE` / `LIT` for short research. The rest should stay on watch until execution blockers clear.
