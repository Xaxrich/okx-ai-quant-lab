# OKX AI Quant Lab — Phase 1-4 系统复盘

> 这是一份写给"有产品背景、懂一点技术、不熟悉量化交易"的人的复盘文档。
> 不是流水账，不是成果汇报。目标是让你真正理解这轮工作背后的知识、路径、判断和下一步方向。

---

## 一、这轮任务到底在解决什么问题

### 一句话

**用工程方法把一个"我想研究山寨币为什么会暴涨暴跌"的模糊想法，变成一套有数据证据、有风险评估、有可复用规则的扫描系统。**

### 在整个项目中的位置

```
Phase 1-2:   搭建基础设施（行情、策略、回测、风控、审计）
Phase 2.5:   验证 OKX 真实 API 订单链路（但不交易）
Phase 3:     策略观察模式（自动跑策略但不执行）
Phase 4:     山寨币爆发研究 + 扫描器（本轮核心） ← 你在这里
```

### 为什么重要

因为你之前问的所有问题——"这个币为什么涨""怎么提前发现异常""怎么知道什么时候危险"——如果不经过这轮工作，答案只能是"看感觉"。这轮工作把"感觉"变成了：

1. **可复用的数据采集管道**（CoinGecko + CMC + Etherscan + DexScreener）
2. **可验证的指标计算**（供应悬挂、DEX 换手率、流动性集中度）
3. **有阈值的扫描规则**（不是"成交量很大"，而是"vol > 3x median AND price near 7d high"）
4. **诚实的局限性文档**（知道什么能做、什么不能做、什么数据缺失）

---

## 二、完整执行路径（按时间顺序）

### 阶段 1：案例研究（BSB/LAB Deep Research v2）

**为什么做**：不能一上来就扫描全网。需要先深入研究 1-2 个真实案例，理解"一个山寨币从爆发到崩盘到底经历了什么"。

**做了什么**：
- 从 CoinGecko 网页手动提取了 BSB 和 LAB 的每日价格/成交量/市值数据
- 计算了 130+ 个指标（供应变化、成交量分阶段分析、压缩突破检测）
- 发现 BSB 存在供应悬挂（CMC 流通 2.08 亿 vs 链上总量 10 亿 = 21%）
- 发现 LAB 的 DEX 换手率异常（事后验证这是用错公式的误判！）

**关键文件**：
- `reports/altcoin/deep_research_v2/BSB_LAB_deep_commonality_report.md`
- `reports/altcoin/deep_research_v2/supply_dilution_deep_dive.md`
- `reports/altcoin/deep_research_v2/volume_phase_deep_dive.md`

**遇到的关键问题**：
- CoinGecko **网页**数据和 CoinGecko **API** 数据不一致（市值差 46-107%）
- 这个发现直接导致 Phase 4.1 的数据对账工作

### 阶段 2：规则抽取与验证（Phase 4.0-4.1）

**为什么做**：案例研究得出了"BSB 和 LAB 可能有共性"的假设。但 N=2 不能当真。需要把假设变成可测试的规则，在更多 token 上验证。

**做了什么**：
- 设计了 8 条 scanner rules（供应异常、成交量极端、压缩突破等）
- 用 CoinGecko API 拉取 13 个 token 的 90 天数据
- 全部规则应用到 764 行特征数据上
- **结果：8 条规则中 6 条零触发**。BSB/LAB 的极端特征在更大样本中不存在

**关键文件**：
- `src/altcoin/scanner_validation/apply_scanner_rules.ts`
- `src/altcoin/scanner_validation/evaluate_rule_performance.ts`

**关键发现**：
- 只有 P1_EARLY_RELATIVE_STRENGTH（token 跑赢 BTC 但成交量温和）有辨别力
- P0 供应异常规则全部零触发——因为 API 的 market cap 数据和网页版不一样

### 阶段 3：数据对账与阈值校准（Phase 4.1-4.4）

**为什么做**：规则零触发不是规则错了，是数据源变了。需要弄清楚为什么同一 token 在不同数据源上表现不同。

**做了什么**：
- 逐日期对比了 BSB/LAB 的网页数据 vs API 数据（15 个日期，全部存在但市值差异大）
- 做阈值扫描（124 种参数组合）找到每条规则的最佳阈值
- 将 P0 供应规则从 30% 阈值降到 5%——仍然几乎零触发
- **发现 CoinGecko 免费 API 无法复现供应异常检测**

**关键文件**：
- `reports/altcoin/scanner_reconciliation_v1/BSB_LAB_data_reconciliation.md`
- `data/altcoin/scanner_reconciliation_v1/threshold_sweep_results.csv`

**最重要的设计决策**：
- 放弃用 CoinGecko API 检测供应异常（数据源不够精细）
- 转向 CMC + Etherscan 双源验证（这才是正确的供应悬挂检测方式）

### 阶段 4：多数据源集成（Phase 4.2-4.5）

**为什么做**：CoinGecko 单一数据源不够。需要拉通 CMC、Etherscan、DexScreener 三个独立数据源。

**做了什么**：
- 接入 CoinMarketCap API（获取流通供应 + CEX/DEX 分拆成交量）
- 接入 Etherscan V2 API（获取链上总供应量——ground truth）
- 接入 DexScreener API（获取 DEX 流动性、买卖笔数）
- **发现原来的 BSB DEX turnover 123x 是错的**

**为什么 123x 是错的**：
```
旧公式：CMC DEX 聚合成交量 / 单个 DEX pair 的流动性 = 123x
新公式：sum(所有 pair 成交量) / sum(所有 pair 流动性) = 0.2x

问题的根源：分子和分母来自不同数据源、不同聚合粒度。
CMC 的 DEX 成交量聚合了所有链的所有 pairs。
但流动性是单个 pair 的值。
两个数不能直接除。
```

**关键文件**：
- `src/altcoin/scanner_v02/aggregate_dex_pairs.ts`
- `reports/altcoin/scanner_v02/dex_scope_reconciliation_report.md`

### 阶段 5：扫描器主流程集成（Phase 4.5-4.7）

**为什么做**：有了多源数据，需要把评分逻辑和标签体系正式化。

**做了什么**：
- 拆分了数据质量评分（identity_quality vs feature_coverage）
- 修正标签体系（删除了误导性标签：OK、AVOID_HIGH_RISK）
- 新增 INSUFFICIENT_DEEP_DATA（区分"数据够了没触发"vs"缺数据所以没触发"）
- 把 DEX 聚合和 supply scope 接入主评分引擎

**关键设计决策**：
- `NO_CURRENT_FLAG` 只能用于 feature_coverage >= 0.7 的 token
- `INSUFFICIENT_DEEP_DATA` 用于有身份但缺深度的 token
- 原生资产（BTC/ETH/SOL）不要求 DEX 数据

### 阶段 6：扩展到 28 个 token（Phase 4.6-4.7）

**为什么做**：5 个 token 不够。需要在更大样本上验证规则是否有效。

**做了什么**：
- 从 5 个 token 扩展到 28 个（5 个类别：Meme/AI/DeFi/L1/Control）
- 批量解析 CMC ID（26/27 自动解析成功）
- 批量聚合 DEX pairs（24/28 获得数据）
- 批量拉取 supply scope（24/28 获得数据）

**遇到的阻塞**：CoinGecko 免费 API rate limit 导致 90d price features 卡在 71%

### 阶段 7：缓存引擎与增量更新（Phase 4.8-4.8.1）

**为什么做**：不能每次全量重拉。需要建立可持续的数据更新机制。

**做了什么**：
- 建立 cache manifest + 请求队列 + 优先级排序
- 支持 `--max-requests`、`--sleep-ms`、`--only-missing`、断点续跑
- CoinGecko 完全限流后仍能保持已有数据

---

## 三、核心知识点

### 第一层：必须掌握的基础概念

#### 1. Market Cap / Circulating Supply / Total Supply 的关系

```
market_cap = price × circulating_supply
implied_supply = market_cap / price
```

**为什么重要**：如果你看到价格涨了 73% 但市值只涨了 0.9%，说明流通供应发生了变化（或数据有延迟）。这个信号在 LAB 的案例中出现了——事后发生了 80% 的闪崩。

**在项目里的体现**：
- `src/altcoin/scanner_v02/data_quality_score.ts` 里的 `circulating_to_onchain_supply_ratio`
- BSB 的 21% 流通率是这个指标的直接产物

**自测**：如果一个 token 的 CMC circulating_supply 是 200M，Etherscan total_supply 是 1B，你能解释这意味着什么吗？什么情况下这个 ratio 会大于 1？

#### 2. DEX Liquidity / Volume / Turnover

```
liquidity = DEX pool 里锁定的资产价值
volume = 24h 内在该 pool 上发生的交易额
turnover = volume / liquidity
```

**为什么重要**：turnover 过高可能意味着：
- 高活跃度（正常）
- 刷量/洗盘交易（异常）
- 流动性脆弱（风险）

**在项目里的体现**：
- `src/altcoin/scanner_v02/aggregate_dex_pairs.ts` 计算 token 级别的 turnover
- LAB 的 26x turnover + 0.99 buy/sell ratio 无法区分上述三种情况

**自测**：如果 turnover = 100x，一个 pool 只有 $10K 流动性却有 $1M 日交易量，这可能意味着什么？你需要什么额外数据来区分可能性？

#### 3. Snapshot vs Time-Series

**Snapshot**：当前时刻的数据快照（今天流通率 21%、今天 DEX 流动性 $85K）
**Time-Series**：随时间变化的数据序列（流通率从 100% → 21% 是在哪天发生的？）

**为什么重要**：绝大多数有意义的信号都是时间序列。快照只能告诉你"当前状态"，不能告诉你"状态在恶化还是在改善"。

**在项目里的体现**：
- Scanner v02 被标记为 `LIMITED_SNAPSHOT_SCANNER`
- 供应变化、DEX 流动性变化、holder 数量变化——这些时间序列信号当前都不可用

---

### 第二层：本轮真正用到的关键机制

#### 4. 多源交叉验证

单一数据源不可信。需要至少两个独立来源互相验证。

**在项目里的体现**：
- CMC circulating_supply (207.75M) vs Etherscan total_supply (1B) vs CMC total_supply (1B)
- 三个数据源互相印证：流通率 21% 是可信的
- 如果只有一个源，不敢下这个结论

**原则**：如果两个独立来源给出同一个数字，置信度提升。如果只有一个源，必须降低置信度。

#### 5. Supply Overhang（供应悬挂）

持有量 = 已流通的量 + 尚未流通但可能解锁的量

**为什么重要**：如果一个 token 只有 21% 在流通，剩下 79% 可以随时进入市场（取决于解锁时间表）。这不是"一定会暴跌"，但这是"结构性的供给端风险"。

**在项目里的体现**：
- BSB 的 `supply_overhang_risk_score`
- `MULTICHAIN_PARTIAL` 降权（因为多链供应可能重复计算）

#### 6. Token 标签体系设计

标签必须是**研究性的**，不能是**建议性的**。

**禁止的标签**：
- OK（暗示安全）
- SAFE（暗示无风险）
- AVOID_HIGH_RISK（暗示"应该卖出"）

**允许的标签**：
- STRUCTURAL_RISK_HIGH（结构层面检测到风险因子）
- WATCH_RISK（需要关注）
- NO_CURRENT_FLAG（当前数据范围内无异常）
- INSUFFICIENT_DEEP_DATA（数据不够，无法判断——不是安全！）

---

### 第三层：未来深入时需要理解的高级问题

#### 7. 多链供应的去重问题

BSB 在 Ethereum、Base、BSC、Mantle、Solana 上都有合约。每条链上都有一个 totalSupply。

**问题**：这些 totalSupply 是独立的还是重复的？
- 如果是原生多链部署（每条链独立 mint）→ 总供应 = sum（各链 supply）
- 如果是跨链桥（同一条 supply 映射到多条链）→ 总供应 = 单链 supply
- 当前我们**不知道**是哪种情况

**当前处理**：标记为 `MULTICHAIN_PARTIAL`，置信度 `LOW_TO_MEDIUM`。这是诚实的做法。

#### 8. CoinGecko 网页 vs API 的数据差异

CoinGecko 网页的 market cap 和 API 的 market cap 可能不同——因为：
- 网页可能使用不同的流通供应计算方法
- API 的更新频率可能不同
- 网页的市值可能包含了不同的交易所价格源

**在项目里的体现**：
- BSB Apr 29 网页版 market cap: $180M，API 版: $97M（差 46%）
- 这就是为什么 P0 supply anomaly 规则在 API 数据上零触发

---

## 四、关键设计决策复盘

### 决策 1：放弃 CoinGecko 单源 → 多源交叉验证

**为什么**：CoinGecko 免费 API 的 market cap 精度不足以检测日级别的供应异常。

**代价**：需要维护 3-4 个 API 的集成代码，rate limit 管理更复杂。

**未来何时重构**：如果 CoinGecko 付费 API 或 CMC 历史端点可用，可以恢复供应异常检测为时间序列。

### 决策 2：DEX turnover 从单 pair → 全 token 聚合

**为什么**：CMC DEX vol / 单 pair liq 的 123x 是错误指标。数学上不成立。

**代价**：需要查询每个 token 的所有 DEX pairs（高 rate limit 消耗）。

**当前状态**：主流程已修正，旧公式已标记 deprecated。

### 决策 3：INSUFFICIENT_DEEP_DATA vs NO_CURRENT_FLAG

**为什么**：26 个 token 标注为 NO_CURRENT_FLAG，但其中 18 个只是因为缺数据。这会产生"系统说没异常"的错觉。

**修正**：缺深度数据 → INSUFFICIENT_DEEP_DATA。数据完整 + 无触发 → NO_CURRENT_FLAG。

**代价**：增加了一个标签类别，报告结构更复杂。

### 决策 4：Scanner 标记为 LIMITED_SNAPSHOT_SCANNER

**为什么**：诚实比好看重要。当前的扫描器只能做快照分析，不能做时间序列。

**不诚实做法**：说"我们已经有一个可以用的扫描器了"。

**诚实做法**：说"这是一个 LIMITED_SNAPSHOT_SCANNER，只能在当前时刻检测供应悬挂和 DEX 异常。不能检测趋势变化、不能做历史回放、不能确认因果关系。"

### 决策 5：暂时不扩到 50+ token

**为什么**：90d price features 只有 71% 覆盖率，硬扩 50 个 token 只会产生更多 INSUFFICIENT_DEEP_DATA。

**阻塞解除条件**：CoinGecko rate limit 问题解决后（分时拉取或付费 API），覆盖率到 80%+ 即可一键扩容。

---

## 五、失败、绕路和风险

### 问题 1：BSB DEX turnover 123x 的错误计算

**现象**：v2 报告里出现"BSB DEX turnover 123x"这数字看起来很吓人。

**原因**：分子（CMC DEX vol，聚合所有链所有 pairs）和分母（DexScreener 单 pair 流动性）来自不同口径。

**解决**：Phase 4.4 重写了 DEX aggregation，改为 token 级 sum(vol)/sum(liq)，BSB 正确值为 0.2x。

**下次规避**：数据来自不同源时，绝不直接做除法。先确认口径一致。

### 问题 2：CoinGecko API 的 supply anomaly 零触发

**现象**：8 条规则中 6 条零触发，包括 v2 研究里"最强"的供应异常规则。

**原因**：CoinGecko API 返回的 market cap 比网页版平滑得多。API 数据不适合做日级别异常检测。

**解决**：转而使用 CMC + Etherscan 双源验证供应悬挂。这是一个**更可靠的指标**（虽然灵敏度更低）。

**下次规避**：任何从案例研究提取的信号，必须先在 API 数据上验证。

### 问题 3：CoinGecko 免费 API rate limit

**现象**：CoinGecko 在 30s 内限制请求次数。拉 28 个 token 需要 14+ 分钟，且经常触发 rate limit。

**原因**：免费 API 有严格限流。

**解决**：建立缓存 + 请求队列 + 断点续跑。但不从根本上解决问题——缓存只能减少重复请求，不能加速首次拉取。

**长期方案**：考虑付费 API 或增加备用数据源。

### 问题 4：标签体系从"可以"变成"不可以"

**现象**：v0.1 用了 OK、AVOID_HIGH_RISK 等标签。

**原因**：下意识用了"建议性"表达。

**解决**：全部改为研究性标签（STRUCTURAL_RISK_HIGH、NO_CURRENT_FLAG、INSUFFICIENT_DEEP_DATA）。

**下次规避**：**任何面向用户的标签，必须在设计阶段就区分"研究信号"和"操作建议"。**

---

## 六、抽象成可复用方法

### 如果以后遇到"研究一个陌生市场、建立扫描规则"的类似任务

**第一步：案例研究，N=2~5**

- 挑选 2-5 个已经发生过的极端案例
- 手工收集你能获取到的所有数据
- 不要写代码，用 Excel/脚本手动探索
- 形成假设：哪些特征在案例中出现、哪些可能有用

**第二步：规则抽取与验证，N=10~30**

- 把假设变成可计算的规则（公式 + 阈值）
- 在一个更大的样本（含正负样本）上验证
- 如果规则零触发，不要改数据——要检查数据源是否可靠
- 如果规则在对照组中也大量触发，是误报

**第三步：数据源对账**

- 交叉验证数据源。两个独立来源给同一个数 → 置信度高
- 如果只有一个数据源，必须降置信度
- 数据源之间的差异本身就是信号

**第四步：扫描器设计**

- 标签必须是研究性的，不能是建议性的
- 区分"数据不够"和"数据够了没异常"
- 明确标注扫描器的限制（快照/时间序列/覆盖范围）

### 判断好坏的标准

- 好规则：正样本触发率高，对照组触发率低，有逻辑可解释
- 坏规则：触发率 0%（阈值太严）或触发率 50%（太宽）
- 好标签：描述"观测到的现象"，不描述"应该做什么"
- 好文档：诚实写下数据缺失和局限性

### 可以标准化成 checklist 的动作

- [ ] 是否从案例研究提取了假设？
- [ ] 是否在更大的样本上验证了假设？
- [ ] 是否交叉验证了数据源？
- [ ] 是否做了阈值扫描？
- [ ] 是否有对照组？
- [ ] 标签是否只是研究性的？
- [ ] 是否区分了快照和时间序列？
- [ ] 是否明确标注了数据缺失？
- [ ] 是否有缓存层避免重复请求？

### 需要人工判断的部分

- "这个特征是否有经济学意义"——不能自动化
- "这个阈值是否合理"——需要人工看分布
- "这个标签是否会产生误解"——需要人工检查
- "当前研究是否足够成熟到可以用于决策"——不能自动化

---

## 七、教学文档：如何理解"山寨币扫描器"

### 1. 扫描器是什么

扫描器是一个程序，每天早上自动检查 28 个 token 的数据，然后输出一份报告，告诉你哪些 token 当前存在需要关注的风险信号。

它**不是**：
- 交易信号（不是"应该买入"或"应该卖出"）
- 预测工具（不说"明天会涨"）
- 安全评估（不说"这个 token 是安全的"）

它**是**：
- 风险特征检测器（"这个 token 被检测到供应悬挂信号"）
- 数据完整性报告（"这 5 个 token 的数据不够，没法评估"）

### 2. 扫描器检查什么

| 检查项 | 是什么意思 | 例子 |
|--------|-----------|------|
| 供应悬挂 | CMC 流通供应 vs 链上总供应，比例小于 30% | BSB：21% 流通，792M 代币未流通 |
| DEX 流动性 | 去中心化交易所的池子里有多少钱 | BSB 的 DEX 只有 $85K 流动性 |
| DEX 换手率 | 24h 成交量 / 流动性，过高可能异常 | LAB：26x 换手率，但有买卖平衡 |
| DEX 买卖比 | 买单多还是卖单多 | BSB：0.55（卖单多），FLOKI：卖压 |

### 3. 标签是什么意思

```
STRUCTURAL_RISK_HIGH: "检测到结构性的供给端/流动性风险"
WATCH_RISK:          "检测到需要关注的风险信号"
WATCH:               "检测到轻微异常"
NO_CURRENT_FLAG:     "当前数据范围内未检测到异常"
INSUFFICIENT_DEEP_DATA: "数据不够，无法评估——不代表安全"
NEED_MORE_DATA:      "身份信息都缺，完全无法评估"
```

**关键理解**：`NO_CURRENT_FLAG` 不是"安全"，是"在当前数据范围内没有触发规则"。如果我们缺数据，就应该是 `INSUFFICIENT_DEEP_DATA`。

### 4. 当前 28 个 token 的状态

| Token | 标签 | 分数 | 为什么 |
|-------|------|:--:|------|
| BSB | WATCH_RISK | 34 | 供应 21% 流通 + DEX 流动性 $85K + 卖压 |
| LAB | WATCH_RISK | 25 | 供应 23% 流通 + DEX 换手 26x |
| FLOKI | WATCH | 10 | DEX 卖压 |
| 其余 20 | NO_CURRENT_FLAG | 0 | 数据范围内未检测到异常 |
| 5 个 | INSUFFICIENT_DEEP_DATA | — | 缺 90d 价格数据（CoinGecko 限流） |

### 5. 自测问题

1. BSB 的流通率是 21%。这意味着什么？为什么不能直接说"这 79% 会砸盘"？
2. LAB 的 DEX turnover 是 26x，buy/sell ratio 是 0.99。为什么 turnover 这么高但不给 WATCH_RISK？
3. BTC 显示 NO_CURRENT_FLAG。这是否意味着 BTC 没有风险？为什么？
4. 如果明天 CoinGecko 的数据更新了，POPCAT 从 INSUFFICIENT_DEEP_DATA 变成 NO_CURRENT_FLAG，这意味着 POPCAT "变安全了"还是"数据补齐了"？

---

## 八、下一阶段建议

### 最应该继续做的 3 件事

1. **补齐 90d price features（P0）**
   - 分时运行 `npm run scanner:v02:fetch-missing-price -- --max-requests 2 --sleep-ms 30000 --only-missing`
   - 每天 2-3 次，3-5 天即可补齐 28 个 token
   - 不需要改代码，只需要跑命令

2. **手动复核 BSB 的供应悬挂（P0）**
   - 查看 BSB 的 token unlock schedule（从 CoinGecko/CMC 或项目文档）
   - 确认 79% 未流通供应的组成（团队锁仓？国库？跨链桥？）
   - 这将决定 STRUCTURAL_RISK_HIGH 标签是否合理

3. **学习阅读 3 份关键报告**
   - `reports/altcoin/deep_research_v2/BSB_LAB_deep_commonality_report.md`
   - `reports/altcoin/scanner_v02/scanner_v02_qa_summary.md`
   - `reports/altcoin/scanner_v02/scanner_universe_report.md`
   - 理解报告结构 = 理解系统逻辑

### 暂时不建议做的 3 件事

1. **扩到 50+ token**：在 price features 覆盖率达到 80% 之前，扩样本只会增加 INSUFFICIENT_DEEP_DATA
2. **新增交易功能**：当前系统定位是研究工具，不是交易工具
3. **新增复杂规则**：当前 8 条规则只有 2 条存活。先让存活的规则在 28 个 token 上稳定运行，再考虑新增

### 最大的不确定性

**CoinGecko 免费 API 的可用性**。这是当前整个扫描器最脆弱的依赖。如果 CoinGecko 继续严格限流，90d price features 永远补不齐。

### 下一轮最小可验证任务

```
目标：把 INSUFFICIENT_DEEP_DATA 从 5 个降到 0 个
方法：分时运行 fetch-missing-price（每天 2-3 次）
验证：npm run scanner:v02 后 POPCAT/TURBO/FET/RNDR/VIRTUAL 不再是 INSUFFICIENT_DEEP_DATA
时间：3-5 天（每次运行间隔数小时避免 rate limit）
```

### 你应该重点学习的知识

1. **Supply dynamics**：流通供应、总供应、解锁时间表、跨链桥供应
2. **DEX mechanics**：流动性池、AMM、滑点、无常损失
3. **Risk labeling**：如何区分研究标签和操作标签
4. **Data source methodology**：CMC vs CoinGecko vs 链上数据的口径差异

### 如果要让项目质量明显提升，最关键的一个动作

**把"CoinGecko 单一依赖"变成"CoinGecko + CMC + 链上"三源冗余。**

当前架构已经支持这个方向（CMC 和 Etherscan 已接入），但还有很多 token 的 supply scope 是 CMC_ONLY 或 SINGLE_CHAIN_ONLY。每补一个 token 的多源验证，扫描器的可靠性就提升一分。
