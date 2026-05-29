# OKX Contract Chain Sweep Framework Methodology

Updated: 2026-05-29

This document defines the current research-only implementation framework, scoring standards, and the latest iteration made during the CHZ scan pass. It is intended for another quant researcher or agent to continue the work without guessing the decision logic.

## Objective

Find OKX-listed USDT swap contracts where market structure and on-chain transfer evidence support a long ambush research setup. The framework does not place orders and does not authorize trading. Outputs such as `WAIT_CONFIRMATION`, `LONG_AMBUSH`, and `SCAN_ALLOWED` are research states.

## Current Pipeline

1. OKX universe scan

Command:

```bash
npm run intelligence:accumulation:okx-scan -- --limit=40 --min-volume-usd=1000000 --min-oi-usd=500000 --target-cap=small-mid
```

Implementation:

- `src/altcoin/intelligence/accumulation/okx_accumulation_scan.ts`
- Pulls OKX USDT swap candidates, excludes majors/stables, overlays CoinGecko context, and ranks small/mid cap contracts.
- Output: `data/altcoin/intelligence/accumulation/okx_accumulation_watchlist_latest.csv`
- Report: `reports/altcoin/intelligence/accumulation/okx_accumulation_scan_latest.md`

2. Accumulation chain candidates

Command:

```bash
npm run intelligence:accumulation:chain-candidates -- --limit=120 --min-accumulation=15 --min-execution=40 --max-risk=45 --write-chain-candidates
```

Implementation:

- `src/altcoin/intelligence/accumulation/accumulation_chain_candidates.ts`
- Promotes final scan rows into chain-scannable candidates when symbol, contract, chain, accumulation score, execution score, and risk pass the configured gate.

3. Chain scan gate

Command:

```bash
npm run validation:chain-gate -- --input=data/altcoin/intelligence/validation/accumulation_chain_candidates_latest.csv --min-opportunity=15 --min-tradability=40 --max-fragility=45
```

Implementation:

- `src/altcoin/intelligence/validation/chain_scan_gate.ts`
- Normalizes chain names, checks contract availability, confirms data-source availability, and writes the live chain candidate set.

4. CEX proxy flow windows

Command:

```bash
npm run intelligence:onchain:cex-flow -- --tokens=CHZ,ARB,INJ,SAHARA,H,OP --pages=80 --windows=1,4,24 --target-window-hours=24
```

Implementation:

- `src/altcoin/intelligence/onchain/cex_flow_window_scan.ts`
- Uses Moralis token transfers when available and falls back to explorer transfers plus local address labels.
- Decision labels are `CEX_OUTFLOW_OR_NEUTRAL`, `CEX_INFLOW_RISK`, `LOW_COVERAGE`, `PARTIAL_WINDOW`, or `NO_DATA`.

5. Readiness

Command:

```bash
npm run intelligence:onchain:readiness
```

Implementation:

- `src/altcoin/intelligence/onchain/scan_readiness.ts`
- Blocks low label coverage, incomplete windows, unresolved holder concentration, and persistent CEX inflow.
- Promotes only clean candidates to `READY_FOR_DEEP_SCAN`.

6. Directional scan

Command:

```bash
npm run intelligence:onchain:directional
```

Implementation:

- `src/altcoin/intelligence/onchain/directional_chain_scan.ts`
- Produces `LONG_AMBUSH`, `LONG_WATCH`, `SHORT_SETUP`, `SHORT_WATCH`, `NO_TRADE`, or `DATA_REPAIR`.

7. Qualified subset

Command:

```bash
npm run intelligence:onchain:qualified-subset
```

Implementation:

- `src/altcoin/intelligence/onchain/qualified_subset_scan.ts`
- Allows only `READY_FOR_DEEP_SCAN` candidates with a non-repair directional bucket into the opportunity subset.

8. Final scan refresh

Run the OKX accumulation scan again after on-chain windows so the final watchlist can absorb current CEX-flow evidence.

## Scoring Standards

### Accumulation pattern score

Implementation:

- `src/altcoin/intelligence/accumulation/accumulation_pattern.ts`

Main groups:

- Price compression
- DEX absorption context
- Holder quality
- CEX/entity flow quality
- Derivatives quality
- Scanner context

Weighted score:

```text
compression * 0.18
+ absorption * 0.24
+ holderQuality * 0.12
+ flowQuality * 0.22
+ derivativesQuality * 0.16
+ scannerContext * 0.08
- riskPenalty * 0.45
- missingDataPenalty
```

Important labels:

- `STRONG_ACCUMULATION`: total score >= 70 and risk < 25
- `EARLY_ACCUMULATION`: total score >= 55 and risk < 35
- `WATCH_ACCUMULATION`: weaker but still cross-source accumulation context
- `DISTRIBUTION_RISK`: risk >= 45 or flow quality collapses
- `INSUFFICIENT_DATA`: fewer than three evidence groups

### Final OKX state

Implementation:

- `src/altcoin/intelligence/accumulation/okx_accumulation_scan.ts`

State rules:

- `DISTRIBUTION_RISK`: CEX-flow gate blocked, distribution label, or risk >= 70.
- `MARKET_DATA_GAP`: OKX data quality < 0.45.
- `NO_EDGE`: CEX-flow is not supported or accumulation is too weak.
- `WAIT_CONFIRMATION`: CEX-flow supported, accumulation >= 45, execution >= 40, risk < 55.
- `READY_TO_WATCH`: CEX-flow supported, accumulation >= 65, execution >= 55, risk < 35, confidence not low.

Execution score:

- Spread <= 8 bps earns the strongest spread score.
- 24h volume >= $10M earns a medium liquidity score; >= $50M earns the strongest volume score.
- OI >= $5M earns a base execution score; >= $20M and >= $100M improve it.
- Data quality contributes up to 15 points.

CEX-flow gate:

- Any `CEX_INFLOW_RISK` in 1h, 4h, or 24h blocks.
- 4h and 24h must both be `CEX_OUTFLOW_OR_NEUTRAL`.
- Entity/label coverage must be >= 25% unless unavailable.

### On-chain readiness

Implementation:

- `src/altcoin/intelligence/onchain/scan_readiness.ts`

Promote to `READY_FOR_DEEP_SCAN` only if:

- Entity coverage >= 25%.
- CEX windows are complete and not `NO_DATA`.
- No medium/long-window CEX inflow risk.
- Holder identity is not unresolved, unless holder delta is accumulation-like.
- Opportunity >= 40, tradability >= 40, fragility <= 60.

### Directional long ambush

Implementation:

- `src/altcoin/intelligence/onchain/directional_chain_scan.ts`

`LONG_AMBUSH` requires:

- Readiness is `READY_FOR_DEEP_SCAN`.
- Opportunity >= 40.
- Tradability >= 60.
- Fragility <= 35.
- No CEX inflow in 1h/4h/24h.
- Holder identity not blocked.

`HIGH` confidence requires `LONG_AMBUSH` and entity coverage >= 50%.

## Latest Methodology Iteration

The CEX-flow scanner previously preserved old rows in `cex_flow_window_scan_latest.csv` when a token subset was scanned. That made the latest file useful for continuity but risky for research reporting because unrelated stale tokens could appear beside the current candidate set.

Change made:

- `latest` now defaults to only the current run's tokens.
- Old behavior is available only with `--merge-existing=true`.
- `--source=explorer` remains available for forced explorer-only cross-checks.

Reason:

- A report should read `latest` as the latest run, not a rolling union of unrelated candidates.
- Readiness, directional, and qualified-subset stages should consume a clean candidate-aligned CEX-flow file.

## Ten-Result Directional Research Mode

The original strict pipeline is long-accumulation first. It is intentionally conservative and can produce only one or two results when the market has few clean long setups. For broader research mandates, the framework now supports a directional research mode:

Command:

```bash
npm run intelligence:accumulation:chain-candidates -- --limit=40 --min-accumulation=15 --min-execution=40 --max-risk=100 --research-scan --write-chain-candidates
npm run validation:chain-gate -- --input=data/altcoin/intelligence/validation/accumulation_chain_candidates_latest.csv --min-opportunity=0 --min-tradability=40 --max-fragility=100
```

Rules:

- Long candidates still need `READY_FOR_DEEP_SCAN` before they can enter `LONG_AMBUSH_SCAN` or `LONG_WATCH_SCAN`.
- Short candidates are allowed into the qualified subset when readiness is `RISK_MONITOR_CEX_FLOW` and directional output is `SHORT_SETUP` or `SHORT_WATCH`.
- `SHORT_EXEC_READY` plus no blockers upgrades the execution gate to `SCAN_ALLOWED`.
- If short execution has blockers, the row remains included but is capped at `WATCH_ONLY`.
- `DATA_REPAIR`, `NO_DATA`, and low-confidence rows remain excluded.

Reason:

- CEX inflow risk is negative for long accumulation, but it can be useful short-side research evidence.
- A 10-result report should not force 10 long candidates when the chain data only supports one long setup.
- Separating `SCAN_ALLOWED` from `WATCH_ONLY` preserves risk discipline.

## Latest Verified Scan Result

Scan date: 2026-05-29

Expanded candidate run:

- OKX scan universe selected: 215
- Reviewed small/mid rows: 30
- Research chain-ready candidates: 19
- Qualified directional candidates: 10
- Qualified long candidates: 1
- Qualified short candidates: 9

Candidate outcomes:

- `CHZ`: included, `LONG`, `LONG_AMBUSH_SCAN`, `SCAN_ALLOWED`, confidence `HIGH`.
- `LIT`, `SAHARA`, `RAVE`: included, `SHORT`, `SHORT_SETUP_SCAN`, `SCAN_ALLOWED`.
- `ENA`, `WLD`, `H`, `BSB`, `INJ`, `AI`: included, `SHORT`, `SHORT_SETUP_SCAN`, `WATCH_ONLY`.
- `ARB`, `OP`, `LAB`, `UB`, `BEAT`, `EDEN`, `RIVER`: excluded for data repair, no data, or low-confidence coverage.
- `ALLO`, `BILL`: clean transfer flow but no active directional bucket; excluded.

Conclusion:

The framework currently finds 10 suitable directional research results: one long ambush candidate and nine short setup candidates. `CHZ-USDT-SWAP` remains the only current long-side ambush result. The short-side set is led by `LIT`, `SAHARA`, and `RAVE` as `SCAN_ALLOWED`; the rest are watch-only until execution blockers clear.
