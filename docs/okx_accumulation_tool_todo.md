# OKX Altcoin Accumulation Tool Todo

Last updated: 2026-05-26

## Goal

Build a research-only scanner for OKX-listed USDT swap altcoins that may be in pre-breakout accumulation. The scanner should combine:

- CoinGecko: spot market, category, CoinGecko ID, contract, DEX pool, holders/trades where available.
- CoinGlass: OKX futures OI, funding, liquidation, taker/CVD/crowding where available.
- Arkham: CEX flow, entity labels, holder/entity quality, project/VC/MM distribution risk.
- OKX public market data: tradability, spread, candles, funding, open interest, listing age.

The first deliverable is an evidence-ranked watchlist, not an auto-trading system.

## Current Framework Verdict

The framework is directionally sound: it already separates market context, derivatives, chain readiness, CEX flow, holder identity, and final accumulation scoring. The strongest design choice is that `WAIT_CONFIRMATION` and `READY_TO_WATCH` now require supported CEX flow instead of treating missing flow as neutral.

The weak points before serious chain spend are operational, not conceptual:

- Latest CSV/report outputs can drift by run batch; a scan runner must verify that `*_latest.csv` and `*_latest.md` describe the same snapshot before using them.
- The chain gate is still too generous for paid/deep scans: `READY_FOR_CHAIN_SCAN` should mean "eligible for light scan", not "spend deep entity-flow budget now".
- BSC-heavy candidates are not clean until BSCScan is configured or the route is explicitly Moralis-only; current failures show up as `HTTP_401`/`BSCSCAN_NOT_CONFIGURED`.
- Holder identity is correctly conservative, but many candidates stop at `HIGH_CONCENTRATION_UNRESOLVED`; the next useful work is targeted identity repair, not broader scanning.
- Arkham should become the preferred identity/CEX-flow source when coverage exists; Moralis/Etherscan should be fallback transfer plumbing.

## Chain Scan Start Standard

Use three gates: `GO_LIGHT_SCAN`, `PROMOTE_DEEP_SCAN`, and `BLOCK`.

`GO_LIGHT_SCAN` means we can spend small on-chain request budget:

- API health: `MORALIS=OK`; `ARKHAM=OK` if the candidate needs entity labels; `ETHERSCAN_V2=OK`; `BSCSCAN=OK` or the candidate is not BSC.
- Candidate quality: OKX live USDT swap, non-major by default, `opportunity_score >= 40`, `tradability_score >= 40`, `fragility_score <= 60`.
- Metadata: normalized chain is supported, contract address exists, CoinGecko ID or registry mapping exists, and scanner label is not `INSUFFICIENT_DEEP_DATA`/`NEED_MORE_DATA`.
- Budget: run P0 first, then P1 only after P0 has no actionable repair blockers.

`PROMOTE_DEEP_SCAN` means the candidate can enter entity-flow/holder/CEX interpretation:

- CEX flow windows 1h/4h/24h are present; 4h and 24h are not `NO_DATA`, `PARTIAL_WINDOW`, or `LOW_COVERAGE`.
- Entity or CEX-flow label coverage is at least `0.25`; use `0.50` for high-confidence long interpretation.
- Holder identity is not `HIGH_CONCENTRATION_UNRESOLVED`, unless holder delta shows a clear accumulation proxy and no CEX distribution.
- No persistent 4h/24h `CEX_INFLOW_RISK`.
- Latest accumulation scan has `cex_flow_gate=SUPPORTED` for any `WAIT_CONFIRMATION` or `READY_TO_WATCH` promotion.

`BLOCK` means do not scan deeper; repair first:

- Missing contract, unsupported chain, stale/mismatched latest outputs, or API route not configured.
- Top holder concentration unresolved without a resolving label.
- BSC candidate while BSCScan is missing and Moralis route has not been explicitly validated.
- CEX 24h inflow risk, project/VC/MM/top-holder transfer into CEX, or label coverage below `0.25`.

## P0 - Stabilize The Foundation

- [x] Verify current repo compiles and tests pass.
- [x] Verify API smoke checks without exposing secrets.
- [x] Add one shared dotenv/environment loader.
- [x] Replace duplicated ad-hoc dotenv loaders in new or high-traffic modules.
- [x] Add a single command for OKX accumulation scanning.
- [x] Add a one-command accumulation cycle runner.
- [x] Add a latest-output consistency audit: CSV snapshot, report timestamp, and runner report must match before downstream use.
- [x] Rename/clarify `READY_FOR_CHAIN_SCAN` semantics to light-scan eligibility in reports.
- [ ] Keep all outputs research-only and explicitly non-execution.
- [ ] Keep secrets out of reports, logs, and git-tracked outputs.

## P1 - Dynamic OKX Contract Universe

- [x] Build a dynamic OKX live `*-USDT-SWAP` universe.
- [x] Exclude BTC, ETH, stablecoins, non-crypto instruments, inactive instruments.
- [x] Collect OKX ticker, funding, open interest, candles, and spread.
- [x] Compute tradability gates: spread, quote volume, OI, candle coverage.
- [x] Persist `okx_contract_universe_latest.csv`.

## P2 - CoinGecko Enrichment

- [x] Map OKX symbols to CoinGecko IDs using registry/cache first, API fallback second.
- [x] Pull market cap, FDV, spot volume, 1h/24h/7d changes.
- [x] Pull categories and trending status where available.
- [x] Map token contracts and chains for onchain scans.
- [ ] Pull top DEX pools and OHLCV/trades for mapped contracts.
- [ ] Add holder chart/top-holder features where plan access allows.

## P3 - CoinGlass Derivatives Evidence

- [x] Replace hardcoded CoinGlass token list with dynamic OKX universe input.
- [x] Prefer OKX exchange-specific OI/funding/crowding when endpoint coverage allows.
- [x] Add OI delta features: 1h, 4h, 24h, 7d.
- [x] Add funding warmth/crowding features.
- [x] Add taker buy/sell or CVD features.
- [ ] Add liquidation heatmap/max-pain proximity where available.
- [ ] Cache raw API responses and parsed feature rows with timestamps.

## P4 - Arkham/Onchain Evidence

- [ ] Use Arkham first for entity labels and CEX/entity flow when token coverage exists.
- [ ] Use existing Moralis/Etherscan fallback for EVM transfer windows.
- [x] Add a `GO_LIGHT_SCAN`/`PROMOTE_DEEP_SCAN`/`BLOCK` readiness field to chain outputs.
- [ ] Add hard blockers: project/VC/MM/top-holder transfer into CEX.
- [ ] Add positive evidence: CEX net outflow, high-quality entity accumulation, holder growth.
- [ ] Build an identity-repair queue for `HIGH_CONCENTRATION_UNRESOLVED` candidates before spending more deep-scan budget.
- [x] Add coverage/freshness fields so missing onchain data never looks like a clean signal.
- [x] Gate `WAIT_CONFIRMATION` and `READY_TO_WATCH` on supported CEX flow.
- [ ] Configure or intentionally bypass BSCScan for BSC-heavy candidates.

## P5 - Accumulation Scoring

- [x] Convert current detector into OKX-contract-specific scores:
  - [x] `accumulation_score`
  - [x] `risk_score`
  - [x] `execution_score`
  - [x] `confidence`
- [x] Separate "watch", "wait for confirmation", "distribution risk", and "no edge".
- [x] Add hard risk overrides before ranking.
- [x] Output explanations, missing evidence, and invalidation conditions.
- [x] Add `--target-cap=small-mid` to focus the final watchlist on small/mid-cap altcoins.

## P6 - Validation

- [ ] Save point-in-time scan snapshots every run, including candidate gate, readiness, directional scan, and accumulation final outputs.
- [ ] Add stale-output detection when latest artifacts are older than the current cycle.
- [ ] Resolve 1d/3d/7d forward returns later.
- [ ] Track max drawdown before target.
- [ ] Evaluate Top5/Top10 precision, average return, excess return, and false positives.
- [ ] Keep a false-positive ledger with reasons.
- [ ] Tune thresholds only on prior snapshots, never on unresolved future data.

## P7 - Operator Output

- [x] Generate a concise Markdown report.
- [x] Generate CSV/JSON output for automation.
- [x] Include CEX-flow gate and target-cap metadata in accumulation outputs.
- [ ] Push only high-quality watchlist rows to Feishu.
- [ ] Include thesis, risks, confirmation trigger, invalidation, and data gaps.
- [ ] Keep execution disabled until separate risk approval work is done.

## P8 - Later Execution Research

- [ ] Add OKX demo contract preflight only after scanner validation improves.
- [ ] Add position sizing simulation using ATR/spread/liquidity.
- [ ] Add max-risk-per-idea and portfolio heat controls.
- [ ] Keep live trading gated by explicit risk policy and human approval.
