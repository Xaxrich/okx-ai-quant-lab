# CHZ Long Ambush Research Report

Generated: 2026-05-29

Instrument: `CHZ-USDT-SWAP`

Contract evidence path: `CHZ` Ethereum contract `0x3506424f91fd33084466f402d5d97f05f8e3b4af`; OKX listed USDT perpetual swap.

This is a research-only report. It is not financial advice and does not authorize order placement.

## Executive Decision

`CHZ-USDT-SWAP` is the current suitable result from the OKX chain-sweep framework.

Final state:

- Final OKX accumulation state: `WAIT_CONFIRMATION`
- On-chain readiness: `READY_FOR_DEEP_SCAN`
- Directional chain scan: `LONG_AMBUSH`
- Qualified subset: included, `side=LONG`, `bucket=LONG_AMBUSH_SCAN`, `gate=SCAN_ALLOWED`

Practical interpretation:

- Suitable for a long ambush research watchlist.
- Not yet a direct execution ticket.
- Needs fresh holder/entity-flow, CVD/OI, and liquidity/slippage confirmation before any trade decision.

## Framework Run Summary

Commands used:

```bash
npm run intelligence:accumulation:okx-scan -- --limit=40 --min-volume-usd=1000000 --min-oi-usd=500000 --target-cap=small-mid
npm run intelligence:accumulation:chain-candidates -- --limit=120 --min-accumulation=15 --min-execution=40 --max-risk=45 --write-chain-candidates
npm run validation:chain-gate -- --input=data/altcoin/intelligence/validation/accumulation_chain_candidates_latest.csv --min-opportunity=15 --min-tradability=40 --max-fragility=45
npm run intelligence:onchain:cex-flow -- --tokens=CHZ,ARB,INJ,SAHARA,H,OP --pages=80 --windows=1,4,24 --target-window-hours=24
npm run intelligence:onchain:readiness
npm run intelligence:onchain:directional
npm run intelligence:onchain:qualified-subset
npm run intelligence:accumulation:okx-scan -- --limit=40 --min-volume-usd=1000000 --min-oi-usd=500000 --target-cap=small-mid
```

Latest outputs:

- OKX reviewed small/mid rows: 30
- Focused watchlist count: 1
- Chain-ready candidates: 6
- Qualified long candidates: 1

## Why CHZ Passed

Final OKX scan:

| field | value |
| --- | ---: |
| State | `WAIT_CONFIRMATION` |
| Accumulation score | 56 |
| Risk score | 0 |
| Execution score | 77 |
| Confidence | `MEDIUM` |
| CEX-flow gate | `SUPPORTED` |
| Market cap bucket | `MID_CAP_100M_1B` |
| Market cap | $354.04M |
| 24h return | +2.65% |
| 7d return | -19.80% |
| 7d OI change | -21.92% |
| Funding | about +0.01% in the scanner table |
| 24h OKX volume | about $14.13M |
| OKX OI | about $6.42M |

Positive evidence:

- Price compression after a 7d drawdown.
- CEX-flow is supported and clean across 1h, 4h, and 24h windows.
- Derivatives are not overheated.
- Risk score is currently 0 in the final OKX layer.

## On-Chain CEX-Flow Evidence

Latest CEX-flow run, aligned to the current 6-token candidate set:

| window | decision | transfers | net CEX count | net CEX value | label coverage | window coverage |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1h | `CEX_OUTFLOW_OR_NEUTRAL` | 5 | -2 | -118,783.63 CHZ | 100.0% | 100.0% |
| 4h | `CEX_OUTFLOW_OR_NEUTRAL` | 77 | -2 | -1,407,909.31 CHZ | 59.7% | 100.0% |
| 24h | `CEX_OUTFLOW_OR_NEUTRAL` | 406 | -17 | -9,510,975.98 CHZ | 54.9% | 100.0% |

Interpretation:

- The CEX proxy flow layer does not show fresh exchange-deposit pressure.
- 4h and 24h net values are negative, which supports a long ambush watch state.
- This is transfer-direction proxy evidence only; it does not prove exchange buying or selling.

## Cross-Candidate Comparison

| token | readiness | primary direction | long status | exclusion reason |
| --- | --- | --- | --- | --- |
| CHZ | `READY_FOR_DEEP_SCAN` | `LONG_AMBUSH` | included | Clean CEX-flow and scores pass. |
| ARB | `LOW_CONFIDENCE_SCAN` | `DATA_REPAIR` | excluded | 24h CEX-flow partial; 4h inflow risk. |
| OP | `LOW_CONFIDENCE_SCAN` | `DATA_REPAIR` | excluded | No usable CEX-flow through current Optimism free explorer path. |
| INJ | `RISK_MONITOR_CEX_FLOW` | `SHORT_SETUP` | excluded | 24h CEX inflow risk. |
| SAHARA | `RISK_MONITOR_CEX_FLOW` | `SHORT_SETUP` | excluded | 1h and 24h CEX inflow risk. |
| H | `RISK_MONITOR_CEX_FLOW` | `SHORT_SETUP` | excluded | 4h and 24h CEX inflow risk. |

This comparison is the main reason CHZ is the selected result. It is not merely top-ranked; it is the only current candidate surviving the long-side chain gate.

## OKX Market Snapshot

Public OKX data captured during the report pass:

| metric | value |
| --- | ---: |
| Last price | 0.03448 USDT |
| Best bid / ask | 0.03447 / 0.03448 |
| Approx top-of-book spread | 2.9 bps |
| 24h high / low | 0.03561 / 0.03343 |
| 24h open | 0.03358 |
| Current funding rate | 0.0000120869, about 0.0012% |
| Current OI | 186,324,380 CHZ, about $6.42M |
| 1H RSI(14) | 47.51 |
| 1H Bollinger(20,2) | upper 0.03536, middle 0.03449, lower 0.03363 |

Market read:

- Price is near the 1H Bollinger middle band, not extended above the upper band.
- Funding is close to neutral.
- The OKX final scan sees 7d OI contraction of about -21.92%, which supports the idea of leverage reset rather than overheated chase.
- Current OI is only around $6.4M, so position sizing and slippage checks matter.

## Project And Fundamental Context

CHZ is the native token of Chiliz Chain. Official Chiliz documentation describes Chiliz Chain as an EVM-compatible chain focused on sports and entertainment, and CHZ is used for gas, cross-chain operations, and staking/delegation.

Relevant source links:

- Chiliz Chain docs: https://docs.chiliz.com/learn/about-chiliz-chain
- Chiliz Chain API docs: https://docs.chiliz.com/develop/chiliz-chain-api
- OKX CHZ perpetual market page: https://www.okx.com/markets/swap-info/chz-usdt-swap
- CHZ MiCA white paper v1.1: https://www.chiliz.com/CHZ_whitepaper_v1.1.pdf

Fundamental positives:

- The asset has a defined native-chain utility rather than being only a meme or pure governance token.
- EVM compatibility keeps tooling and infrastructure barriers lower.
- Sports and entertainment positioning provides a differentiated narrative cluster.

Fundamental risks:

- Chiliz Chain uses Proof-of-Staked Authority, which has a smaller validator set than highly decentralized L1s.
- The white paper describes an inflationary token model and indefinite total supply governed by protocol mechanics.
- The investment case depends on ecosystem and Fan Token/SportFi activity translating into durable CHZ demand.

## Long Ambush Thesis

Base thesis:

CHZ has recently sold off on the 7d horizon while current CEX proxy flow is neutral/outflow, funding is neutral, and the final scanner sees no active distribution risk. This combination creates a long ambush research setup: wait for price confirmation after leverage reset rather than chase a large green candle.

Confirmation triggers:

- 4h and 24h CEX-flow remain `CEX_OUTFLOW_OR_NEUTRAL`.
- Price reclaims or holds above the 1H Bollinger middle around 0.03449.
- Momentum confirmation improves with a controlled push toward 0.03536-0.03561.
- OI stabilizes or expands modestly while funding remains neutral.
- No new holder/entity concentration warning appears.

Invalidation triggers:

- Any 4h or 24h CEX-flow flip to `CEX_INFLOW_RISK`.
- Price loses the 24h low zone around 0.03343 without rapid recovery.
- Funding overheats while price stalls.
- OI keeps falling with weak price action.
- Holder identity becomes unresolved or top-holder distribution risk appears.

## Research Plan

Immediate next checks:

1. Rerun CEX-flow on CHZ alone with both auto and explorer modes to compare source sensitivity.
2. Refresh holder identity and holder-flow delta once the supporting scripts have sufficient API coverage.
3. Add CVD/order-flow proxy if available from OKX trades or a future data source.
4. Confirm depth and slippage at intended size before any execution review.
5. Re-run the full scan if CHZ invalidates; do not force a long if CEX-flow flips.

## Bottom Line

Selected result: `CHZ-USDT-SWAP`

Rating inside this framework: `LONG_AMBUSH_SCAN`, research watchlist.

Execution status: wait for confirmation.

Reason: CHZ is the only candidate in the expanded OKX small/mid scan that passes final accumulation, chain readiness, directional long, and qualified subset gates while peers are blocked by CEX inflow or data repair.
