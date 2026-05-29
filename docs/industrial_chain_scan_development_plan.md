# Industrial Chain Scan Development Plan

Updated: 2026-05-29

Scope: design and implementation roadmap for a more precise, more reasonable OKX altcoin chain-sweep framework. This is research infrastructure planning, not trading permission.

## 1. Final Target

Build an industrial-grade chain scan system that returns fewer false positives, clearer abstentions, and better-ranked research candidates.

The target output must not be a single flat list. It must return a tiered result set:

| output tier | meaning | allowed action |
| --- | --- | --- |
| `RESEARCH_CANDIDATE` | Worth monitoring or researching. | Analyst review only. |
| `DEEP_REVIEW_CANDIDATE` | Cross-source evidence is strong enough for full chain/entity review. | Deep research workflow. |
| `EXECUTION_REVIEW_CANDIDATE` | Fresh rerun, coverage, entity, contradiction, liquidity, and derivatives gates are clean. | Pre-trade risk review only. |
| `WATCH_ONLY` | Directional signal exists but blockers remain. | Monitor, do not execute. |
| `REPAIR_ONLY` | Data coverage is insufficient or broken. | Repair source coverage first. |
| `REJECTED` | Evidence contradicts the thesis or risk is too high. | No action. |

Current baseline from the latest verified scan:

- Research candidates: 10
- Deep-review candidates: 4 (`CHZ`, `SAHARA`, `RAVE`, `LIT`)
- Execution-review candidates: unknown until fresh single-token rerun; expected range `0-3`
- Watch-only/risk monitors: 6 (`ENA`, `WLD`, `H`, `BSB`, `INJ`, `AI`)

## 2. Design Principles

1. Coverage before alpha.
   - No candidate can be upgraded if required data sources are missing, stale, or partial.

2. Entity graph before token signal.
   - CEX-flow and whale-flow are not reliable unless address/entity attribution is explicit and confidence-scored.

3. Freshness before execution.
   - Any candidate entering execution review must rerun the token-specific pipeline immediately before review.

4. Contradictions are first-class signals.
   - More APIs should not vote blindly. Conflicting evidence should lower confidence or force watch-only.

5. Abstention is valid output.
   - Industrial systems should return `REPAIR_ONLY`, `WATCH_ONLY`, or `REJECTED` rather than forcing a bullish/bearish answer.

6. Reproducibility is mandatory.
   - Every output row needs source endpoint, request params, timestamp, raw payload hash, normalized feature version, and decision version.

## 3. Target Architecture

```text
Provider APIs
  -> source registry and health probes
  -> raw immutable snapshots
  -> normalized warehouse
  -> entity graph and conflict resolver
  -> feature store
  -> gate engine
  -> calibrated result classifier
  -> reports, alerts, and analyst review queue
```

### 3.1 Provider ingestion layer

Responsibilities:

- Define every provider, endpoint, quota, auth model, retry policy, freshness SLA, and failure mode.
- Store raw responses before normalization.
- Add `source_id`, `endpoint`, `requested_at`, `response_at`, `params_hash`, `raw_payload_hash`, `status`, and `error_code`.

Initial providers:

| provider | current role | industrial target |
| --- | --- | --- |
| OKX | Price, swap universe, OI, funding, liquidity. | Add trading statistics, depth/slippage, symbol lifecycle, and execution sanity. |
| CoinGlass | OI/funding and short blockers. | Add crowding, long/short ratio, liquidation, CVD, and exchange OI split when available. |
| CoinGecko | Market context and onchain DEX metadata. | Add cached pool trades, token holder chart, top holders, and pool OHLCV lineage. |
| DexScreener | DEX venue and tradability context. | Add boost/order risk, liquidity venue concentration, and spoof/liquidity churn filters. |
| Moralis | Token transfers and CEX-flow windows. | Add holder balance time series and holder-delta features. |
| Arkham | Entity attribution and CEX-flow validation. | Add top flow, counterparties, entity confidence, and source/destination flow classes. |
| Etherscan/BscScan | EVM fallback and holder/transfer repair. | Configure BscScan; use as fallback with lower attribution confidence. |
| Dune | Cross-check normalized transfer/DEX tables. | Add SQL-based reconciliation for token transfers and DEX trades. |
| Nansen-like source | Smart money and profitable wallet labels. | Add smart money netflow, DEX trades, holder activity if access exists. |
| Glassnode/Coin Metrics | Aggregate on-chain and market metrics. | Add macro/asset regime filters where asset coverage exists. |

### 3.2 Raw data and lineage layer

Add a raw snapshot convention:

```text
data/altcoin/intelligence/raw/{provider}/{endpoint}/{date}/{request_hash}.json
```

Add a compact lineage CSV/JSONL:

```text
data/altcoin/intelligence/lineage/source_observations_latest.csv
```

Minimum fields:

```text
run_id, token, provider, endpoint, params_hash, raw_payload_hash,
requested_at, response_at, freshness_seconds, status, rows, error_code,
normalized_table, feature_version
```

Acceptance criteria:

- No promoted candidate can lack lineage for required sources.
- Any missing source is represented explicitly as `MISSING`, `STALE`, `RATE_LIMITED`, or `NOT_CONFIGURED`.

### 3.3 Entity graph layer

Add a canonical entity model:

```text
entity_id, address, chain, provider_label, canonical_label,
entity_type, confidence, source_provider, first_seen, last_verified,
expiry_at, evidence_hash, conflict_status
```

Provider priority:

1. Arkham high-confidence entity attribution.
2. Direct exchange/custody published addresses.
3. Moralis entity-lite labels.
4. Etherscan/BscScan labels.
5. Dune/community curated labels.
6. Heuristic cluster labels.

Conflict policy:

- If high-confidence providers disagree, downgrade entity confidence and require analyst review.
- If only weak labels exist, allow research but block execution review.
- If CEX-flow depends on weak labels, cap the candidate at `WATCH_ONLY`.

### 3.4 Feature store

Feature groups:

| group | examples |
| --- | --- |
| Market | 1h/24h/7d price, volume, spread, depth, slippage, market cap. |
| Derivatives | OI change, funding, exchange OI split, liquidation, CVD, long/short ratio. |
| CEX-flow | 1h/4h/24h net CEX value, label coverage, entity confidence, deposit/withdrawal asymmetry. |
| Holder | holder count delta, top holder concentration, whale balance delta, fresh wallet share. |
| DEX microstructure | pool trades, trade count, median trade size, buy/sell imbalance, liquidity churn. |
| Smart money | smart money netflow, realized PnL cohort, profitable wallet accumulation/distribution. |
| Regime | BTC/ETH trend, alt beta, market-wide OI/funding regime, stablecoin liquidity. |
| Quality | freshness score, coverage score, provider conflict score, duplicate-transfer score. |

Feature versioning:

```text
feature_version = provider_schema_version + normalizer_version + gate_version
```

### 3.5 Gate engine

The gate order must be fixed:

1. Coverage gate.
2. Freshness gate.
3. Entity confidence gate.
4. Direction gate.
5. Contradiction gate.
6. Liquidity/execution gate.
7. Historical calibration gate.
8. Final result tier.

Core gates:

```text
coverage_score >= 0.75 for DEEP_REVIEW_CANDIDATE
coverage_score >= 0.90 for EXECUTION_REVIEW_CANDIDATE
entity_confidence >= 0.60 for DEEP_REVIEW_CANDIDATE
entity_confidence >= 0.80 for EXECUTION_REVIEW_CANDIDATE
temporal_alignment_score >= 0.80
contradiction_score <= 0.25
fresh_single_token_rerun_required = true for EXECUTION_REVIEW_CANDIDATE
```

Suggested reliability score:

```text
reliability =
  coverage_score * 0.22
+ entity_confidence * 0.22
+ temporal_alignment_score * 0.16
+ feature_consensus_score * 0.14
+ historical_calibration_score * 0.14
+ execution_quality_score * 0.12
- contradiction_score * 0.30
- fragility_penalty * 0.20
```

Final grades:

| grade | score | interpretation |
| --- | ---: | --- |
| A | >= 0.82 | Deep-review quality; may enter execution review only after fresh rerun. |
| B | >= 0.68 | Deep-review candidate but not execution-ready. |
| C | >= 0.52 | Research candidate or watch-only. |
| D | >= 0.35 | Risk monitor only. |
| F | < 0.35 | Rejected or repair-only. |

## 4. Development Phases

### Phase 0: Stabilize current research output

Duration: 2-4 days.

Deliverables:

- Freeze the current 10-result report as baseline.
- Add result-tier vocabulary to methodology docs.
- Add fresh single-token rerun checklist.
- Add coverage/freshness fields to qualified subset output.
- Keep `WATCH_ONLY` non-executable.

Acceptance criteria:

- Running the existing pipeline still returns the 10 baseline research candidates.
- The report separates research, deep-review, execution-review, watch-only, repair-only.

### Phase 1: Data lineage and source registry

Duration: 1 week.

Implementation tickets:

- Add `src/altcoin/intelligence/sources/source_registry.ts`.
- Add `src/altcoin/intelligence/sources/source_observation.ts`.
- Add `src/altcoin/intelligence/sources/raw_snapshot_writer.ts`.
- Add `data/altcoin/intelligence/lineage/source_observations_latest.csv`.
- Add tests for source status mapping and raw hash stability.

Acceptance criteria:

- Every provider call used by scan output records lineage.
- Reports show missing/stale/rate-limited providers instead of hiding them.

### Phase 2: Repair P0 source gaps

Duration: 1-2 weeks.

P0 gaps from current audit:

- `cg_pool_trades`: fetcher exists, no reusable cache.
- `cg_holder_chart`: fetcher exists, no reusable cache.
- `moralis_holders`: fetcher exists, no holder time series.
- `BscScan`: not configured.

Implementation tickets:

- Add CoinGecko pool trades cache and features.
- Add CoinGecko holder chart/top-holder cache and features.
- Add Moralis holder snapshot and holder-delta features.
- Add BscScan config and fallback chain gate.
- Add duplicate-transfer guard across Moralis/Etherscan/BscScan/Arkham.

Acceptance criteria:

- `LAB`, `UB`, `BEAT`, and `EDEN` are no longer excluded only because BSC is unconfigured.
- Holder deltas become a real feature, not just readiness metadata.

### Phase 3: Entity graph and conflict resolver

Duration: 2 weeks.

Implementation tickets:

- Add `src/altcoin/intelligence/entity/entity_registry.ts`.
- Add `src/altcoin/intelligence/entity/provider_conflict_resolver.ts`.
- Add canonical entity taxonomy: `cex`, `dex`, `custody`, `market_maker`, `fund`, `bridge`, `contract`, `unknown`.
- Add label confidence and expiry.
- Add analyst-review queue for conflicts.

Acceptance criteria:

- CEX-flow rows include `entity_confidence`, `label_source_count`, and `conflict_status`.
- Any conflicting high-impact label blocks execution review.

### Phase 4: Industrial result classifier

Duration: 1 week.

Implementation tickets:

- Add `src/altcoin/intelligence/onchain/industrial_result_classifier.ts`.
- Add reliability formula and result tier output.
- Add contradiction types:
  - CEX inflow vs long thesis.
  - Funding/OI against short thesis.
  - Holder concentration against accumulation thesis.
  - DEX microstructure against absorption thesis.
- Add `reports/altcoin/intelligence/onchain/industrial_chain_scan_latest.md`.

Acceptance criteria:

- Current baseline should classify roughly as:
  - `CHZ`: `DEEP_REVIEW_CANDIDATE`
  - `SAHARA`, `RAVE`, `LIT`: `DEEP_REVIEW_CANDIDATE`
  - `ENA`, `WLD`, `H`, `BSB`, `INJ`, `AI`: `WATCH_ONLY`

### Phase 5: Historical calibration and false-positive audit

Duration: 2-3 weeks.

Implementation tickets:

- Extend point-in-time label ledger.
- Add top-k replay for new reliability score.
- Add regime-aware calibration buckets.
- Add false-positive report by token, source, gate, and market regime.
- Add shadow-mode output before changing live thresholds.

Acceptance criteria:

- Every grade threshold has historical precision/recall or top-k hit-rate evidence.
- Reports include expected false-positive risk by tier.

### Phase 6: Orchestration and operator workflow

Duration: 1-2 weeks.

Implementation tickets:

- Add `npm run intelligence:onchain:industrial-cycle`.
- Add single-token fresh rerun command.
- Add `run_id` across all outputs.
- Add health summary and source SLA report.
- Add alert/report generation for only changed candidates.

Acceptance criteria:

- One command can reproduce the full industrial scan.
- A separate command can rerun one token for execution review.
- Every promoted candidate has a full audit trail.

### Phase 7: External enrichment

Duration: ongoing.

Optional integrations:

- Nansen-style smart money netflow and DEX trades.
- Dune Spellbook transfer/DEX reconciliation.
- Glassnode or Coin Metrics macro/aggregate metrics.
- Additional exchange flow providers if available.

Acceptance criteria:

- External enrichments must improve historical calibration or reduce false positives.
- Any enrichment that adds noise without improving calibration stays out of execution gates.

## 5. Development Backlog

Priority order:

1. Add source registry and lineage writer.
2. Add result-tier fields to qualified subset output.
3. Configure BscScan or alternative BSC source.
4. Cache CoinGecko pool trades.
5. Cache CoinGecko holder chart/top holders.
6. Add Moralis holder time-series.
7. Add entity conflict resolver.
8. Add industrial result classifier.
9. Add historical calibration for reliability score.
10. Add industrial-cycle runner and single-token rerun command.

## 6. Result Contract

Industrial output row:

```text
run_id
token
instrument_id
chain
contract_address
side
result_tier
reliability_grade
reliability_score
coverage_score
entity_confidence
temporal_alignment_score
feature_consensus_score
contradiction_score
execution_quality_score
fragility_score
primary_thesis
blockers
required_rerun
invalidation
lineage_hash
decision_version
generated_at
```

Report sections:

1. Executive answer.
2. Result tier counts.
3. Top deep-review candidates.
4. Watch-only/risk monitors.
5. Repair-only candidates.
6. Source coverage and missing APIs.
7. Provider conflicts.
8. Freshness and lineage summary.
9. Historical calibration summary.
10. Operator checklist.

## 7. Current More-Precise Result To Return

Using the current verified scan evidence, the more reasonable result is:

| token | side | current gate | industrial tier now | next action |
| --- | --- | --- | --- | --- |
| CHZ | LONG | SCAN_ALLOWED | DEEP_REVIEW_CANDIDATE | Fresh rerun CEX-flow, Arkham entity/top-flow, holder concentration, OI/funding. |
| SAHARA | SHORT | SCAN_ALLOWED | DEEP_REVIEW_CANDIDATE | Verify CEX inflow source, holder/entity attribution, derivatives crowding. |
| RAVE | SHORT | SCAN_ALLOWED | DEEP_REVIEW_CANDIDATE | Verify liquidity, holder concentration, and CEX-flow persistence. |
| LIT | SHORT | SCAN_ALLOWED | DEEP_REVIEW_CANDIDATE | Fresh rerun because 24h CEX window is not strongly inflow. |
| WLD | SHORT | WATCH_ONLY | WATCH_ONLY | Clear `COINGLASS_OI_INCOMPLETE` before any upgrade. |
| ENA | SHORT | WATCH_ONLY | WATCH_ONLY | Clear OI/funding and entity confirmation first. |
| H | SHORT | WATCH_ONLY | WATCH_ONLY | Resolve whether inflow is distribution or trend continuation. |
| INJ | SHORT | WATCH_ONLY | WATCH_ONLY | Do not override `COINGLASS_AGAINST_SHORT` without strong fresh evidence. |
| AI | SHORT | WATCH_ONLY | WATCH_ONLY | Risk monitor only; funding/fragility blocks execution. |
| BSB | SHORT | WATCH_ONLY | WATCH_ONLY | Risk monitor only; extreme fragility and against-short blocker. |

Industrial answer:

```text
Return 10 research candidates.
Promote only 4 to deep review: CHZ, SAHARA, RAVE, LIT.
Promote 0 to execution review until fresh single-token reruns pass all gates.
Keep ENA, WLD, H, BSB, INJ, AI as watch-only risk monitors.
```

## 8. Verification Matrix

| requirement | proof |
| --- | --- |
| More precise scanning | Tiered result contract and reliability score. |
| More reasonable outputs | Explicit abstention states and blocker preservation. |
| Industrial framework | Source registry, raw snapshots, entity graph, feature store, gate engine, calibration, orchestration. |
| API completeness | Provider matrix and P0/P1 source repair phases. |
| Return results | Current 10 candidates are reclassified into industrial tiers. |
| Reproducibility | Lineage layer and `run_id` requirement. |

## 9. Public Design References

- Chainalysis KYT describes scaled transaction ingestion, clustering heuristics, alert thresholds, typologies, and risk rules: https://www.chainalysis.com/product/kyt/
- TRM BLOCKINT API provides wallet and blockchain intelligence through an API for enriched workflows: https://www.trmlabs.com/blockchain-intelligence-platform/blockint-api
- Elliptic screening emphasizes wallet/transaction risk scoring and operationalized risk procedures: https://www.elliptic.co/solutions/screening
- Nansen API exposes address/entity, token, Smart Money, holder, exchange-flow, and DEX-trade analytics: https://docs.nansen.ai/about/endpoints-overview
- Glassnode exposes contextualized on-chain and financial metrics through a unified API: https://docs.glassnode.com/welcome-to-glassnode
- Dune Spellbook/curated tables show raw, decoded, curated, and lineage-aware analytics engineering patterns: https://dune.com/blog/understanding-tables-raw-decoded-curated-spellbook-views-uploads
- Coin Metrics Network Data Pro positions trusted network and market data for institutional research: https://coinmetrics.io/network-data-pro/
