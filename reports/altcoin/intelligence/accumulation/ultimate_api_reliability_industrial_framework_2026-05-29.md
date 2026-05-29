# 穷尽 API 后的可靠性结论与工业级扫链框架

Generated: 2026-05-29

Scope: OKX altcoin chain-sweep research. This is research infrastructure analysis, not an order ticket or financial advice.

## 1. 直接结论

穷尽调用所有 API 可以增加可靠性，但增加的是“覆盖可靠性”和“误报过滤能力”，不是线性增加“预测正确率”。

更精确地说：

- 对 `CHZ` 这类 long ambush 候选，全量 API 的最大价值是确认 CEX-flow 是否真的不是伪信号、holder/entity 是否健康、是否存在未识别的大户/交易所/做市商流入。
- 对 `LIT/SAHARA/RAVE` 这类 short scan-allowed 候选，全量 API 的最大价值是确认 CEX inflow 是否来自真实可卖压地址、是否被 smart money/whale/market maker 吸收，以及 derivatives crowding 是否已经反身性过热。
- 对 `ENA/WLD/H/BSB/INJ/AI` 这类 watch-only 候选，全量 API 的最大价值通常是“继续阻断或降级”，不是强行升级。尤其 `COINGLASS_OI_INCOMPLETE` 和 `COINGLASS_AGAINST_SHORT` 这两类 blocker 不应被用其它 API 绕过。

终极判断：

> 全量 API 会让最终答案更稳，但大概率会把“10 个适合研究的结果”收敛成“4 个可进入深度复核的结果 + 6 个观察/排除候选”，而不是把 10 个都升级成高置信交易机会。

## 2. 当前框架相对工业级框架的定位

当前框架已经具备工业级雏形：

- 多源市场数据：OKX price/OI/funding/liquidity。
- 衍生品风控：CoinGlass derivatives and short-exec blockers。
- 链上流向：Moralis/Etherscan-style transfers and CEX-flow windows。
- 实体标签：Arkham/Moralis entity labels。
- DEX/市场上下文：CoinGecko/DexScreener。
- 明确 gate：`SCAN_ALLOWED`, `WATCH_ONLY`, `REPAIR_ONLY`。
- 明确拒判：BSC/Optimism/low coverage rows 不强行给结论。

但距离顶级扫链公司的工业级形态，还缺 5 个关键层：

1. Entity graph first, token signal second.
   - 顶级系统先建立 address/entity/cluster/counterparty graph，再做 token-level signal。
   - 我们当前还有不少 token-first 逻辑，entity graph 不够强。

2. Confidence-scored attribution.
   - 标签不能只是 `CEX` 或 `unknown`，还应有 confidence、source、last_verified_at、expiry。
   - Arkham/Chainalysis/TRM/Elliptic 都强调 attribution confidence 或可验证来源。

3. Full lineage and point-in-time reproducibility.
   - 每个信号要保存 source endpoint、request params、timestamp、raw payload hash、normalized feature version。
   - 现在报告有结果和局部 CSV，但还不是完整可重放数据血缘。

4. Cross-provider conflict resolver.
   - 同一地址/实体在 Arkham/Moralis/Etherscan/Dune/CoinGecko/Nansen-like labels 之间冲突时，必须有优先级和降级规则。
   - 不能用“更多 API 投票”替代 source-of-truth hierarchy。

5. Calibration and false-positive audit.
   - 每个 gate 应经过 point-in-time backtest、shadow mode、false-positive review。
   - 没有校准的全量 API 会增加噪音，甚至降低可靠性。

## 3. 顶级扫链公司的公开工业框架抽象

基于 Chainalysis、TRM、Elliptic、Nansen、Glassnode、Dune、Coin Metrics 的公开资料，可抽象为以下工业级架构：

### 3.1 Data ingestion layer

- Full node/RPC/indexer。
- Trace/log/event decoding。
- Exchange, bridge, DEX, custody, stablecoin, derivatives feeds。
- Historical and live streaming ingestion。
- Raw data immutability and replay。

### 3.2 Identity and entity graph layer

- Ground-truth attribution。
- OSINT and direct ecosystem evidence。
- Address clustering heuristics。
- Entity pages / wallet ownership / label taxonomy。
- Counterparties, source/destination of funds, relationship graph。
- Confidence score and analyst review queue。

### 3.3 Normalization and feature layer

- Token decimals and contract identity。
- Cross-chain canonical entity IDs。
- USD pricing and quote normalization。
- Holder concentration, holder deltas, top flows。
- Exchange inflow/outflow windows。
- Smart money / profitable wallet / whale / fresh wallet flows。
- DEX trade microstructure。
- Derivatives OI/funding/liquidation/crowding。

### 3.4 Decision and risk layer

- Coverage gate first。
- Direction gate second。
- Execution/liquidity gate third。
- Contradiction gate fourth。
- Human-review gate for high-impact actions。
- Clear invalidation rules and abstention states。

### 3.5 QA, calibration, and observability

- Point-in-time labels。
- Historical replay and top-k backtests。
- Data freshness SLA。
- API error/rate-limit accounting。
- False-positive and false-negative review。
- Model calibration by market regime。
- Audit trail for every promoted candidate。

## 4. 为什么“所有 API 都调用”不能直接等于“更准”

全量 API 的正面作用：

- 提高 coverage，减少 `NO_DATA`。
- 用实体标签减少 CEX-flow 误判。
- 用 holder/time-series 判断是真吸筹、派发，还是交易所内部整理。
- 用 derivatives/crowding 阻断拥挤方向。
- 用 DEX microstructure 验证是否有真实成交吸收。

全量 API 的负面风险：

- 时间戳不一致：1h transfer、24h CEX-flow、7d OI 混用会制造假因果。
- 标签冲突：不同平台对同一地址归属不一致。
- API 重复计数：同一 transfer 通过 Moralis/Etherscan/Arkham 被重复当成多条证据。
- 幸存者偏差：只分析成功返回的链和 token。
- 端点语义错配：compliance risk score 不等于 alpha signal。
- Rate-limit retry 造成样本不完整。

所以工业级答案不是 `call_all_apis=true`，而是：

```text
call_all_relevant_apis
  -> normalize_with_lineage
  -> resolve_entity_conflicts
  -> require_temporal_alignment
  -> calibrate_by_historical_false_positive_rate
  -> allow_abstention
```

## 5. 对当前 10 个结果的更精确分层

| tier | token | direction | current gate | ultimate API effect | final research stance |
| --- | --- | --- | --- | --- | --- |
| A- | CHZ | LONG | SCAN_ALLOWED | Full API can improve confidence if holder/entity and CEX labels remain clean. It cannot remove need for price/OI confirmation. | Best long-side research candidate; still wait-confirmation, not execution. |
| B | SAHARA | SHORT | SCAN_ALLOWED | Persistent CEX inflow + OI expansion makes it the cleanest short candidate, but needs holder/entity source attribution. | Best short-side deep-review candidate. |
| B- | RAVE | SHORT | SCAN_ALLOWED | Inflow and no blockers are useful; small/liquidity profile needs stricter slippage and holder concentration checks. | Valid short research, sizing-sensitive. |
| B- | LIT | SHORT | SCAN_ALLOWED | Execution gate is clean, but 24h CEX window is not strongly inflow; full API may downgrade if 1h/4h pressure is transient. | Valid short research only after fresh single-token rerun. |
| C+ | WLD | SHORT | WATCH_ONLY | Tradability is strong, but OI evidence is incomplete; full API may upgrade only if derivatives confirmation clears. | Watch-only. |
| C | ENA | SHORT | WATCH_ONLY | CEX inflow is meaningful, but OI incomplete; needs fresh derivatives and entity confirmation. | Watch-only. |
| C | H | SHORT | WATCH_ONLY | Strong inflow and tradability, but short-exec not clean. Full API likely decides whether this is distribution or trend continuation. | Watch-only. |
| C- | INJ | SHORT | WATCH_ONLY | Coinglass against-short blocker matters; full API should not override it without very strong flow reversal evidence. | Watch-only / likely demote under strict mode. |
| D+ | AI | SHORT | WATCH_ONLY | High fragility and adverse execution context; full API mostly protects against chasing an already stressed short. | Risk monitor, not executable. |
| D | BSB | SHORT | WATCH_ONLY | Extreme fragility and against-short blocker; full API likely reduces false-positive risk by keeping it out. | Risk monitor only. |

## 6. What would change after a true all-API industrial pass

The result count should be split into three counts, not reported as one number:

- Research candidates: 10
- Deep-review candidates: 4 (`CHZ`, `SAHARA`, `RAVE`, `LIT`)
- Execution-review candidates after fresh rerun: likely 0-3, depending on live refresh

This is more precise than the current 10-result report because it separates:

- “worth researching”
- “worth deep chain/entity review”
- “worth pre-trade execution review”

## 7. Required API additions before calling the conclusion industrial-grade

P0 additions:

1. Configure BscScan or another BSC transfer/holder source.
2. Turn Moralis holders into holder time-series features.
3. Cache CoinGecko Onchain pool trades and holder charts.
4. Use Arkham counterparties/top-flow endpoints for `CHZ`, `SAHARA`, `RAVE`, `LIT`.
5. Add source timestamp and raw payload hash to every output row.
6. Add a conflict resolver for Arkham/Moralis/Etherscan labels.
7. Add fresh single-token rerun requirement before any execution review.

P1 additions:

1. Add Nansen-like smart money and PnL labels if API access is available.
2. Add Dune/Spellbook query cross-checks for token transfers and DEX trades.
3. Add Glassnode/Coin Metrics style aggregate network and exchange metrics where asset coverage exists.
4. Add derivatives crowding endpoints beyond OI/funding where provider coverage allows.

## 8. Final answer

穷尽调用所有 API 后，答案会更可靠，但主要表现为：

- 更少误报。
- 更少被误升级的 short。
- 更明确的数据缺口和拒判。
- 更严格的执行前门槛。

它不会把当前 10 个结果都变成更强信号。工业级框架下，当前最稳的答案应写成：

> 当前系统找到 10 个研究候选；其中 `CHZ` 是唯一 long-side deep-review candidate，`SAHARA/RAVE/LIT` 是 short-side deep-review candidates；其它 6 个只能作为 watch-only risk monitors。若执行真正的全 API 工业级复核，可靠性会提升，但候选数量大概率从“10 个研究结果”收敛为“4 个深度复核结果”，最终可执行数量仍需 fresh rerun 决定。

## 9. Public reference map

- Chainalysis blockchain intelligence: https://www.chainalysis.com/blockchain-intelligence/
- Chainalysis KYT: https://www.chainalysis.com/product/kyt/
- Chainalysis blockchain analytics limitations: https://www.chainalysis.com/glossary/blockchain-analytics/
- TRM wallet screening: https://www.trmlabs.com/blockchain-intelligence-platform/wallet-screening
- TRM BLOCKINT API: https://www.trmlabs.com/blockchain-intelligence-platform/blockint-api
- Elliptic screening: https://www.elliptic.co/solutions/screening
- Arkham API docs: https://intel.arkm.com/api/docs
- Nansen API overview: https://docs.nansen.ai/api/overview
- Glassnode API docs: https://docs.glassnode.com/basic-api/api
- Dune Spellbook: https://dune.com/blog/spellbook
- Dune table lineage: https://dune.com/blog/understanding-tables-raw-decoded-curated-spellbook-views-uploads
- Coin Metrics / Talos Network Data Pro: https://www.talos.com/our-solutions/data/network-data-pro
