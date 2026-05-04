# V2 Claim Correction — From Case Study to Validated Rules

**Date:** 2026-05-04

---

## 1. implied supply jump 不能直接称为"供应稀释证明"

### 修正前（v2 中的不精确表述）

"BSB Apr 29：supply dilution +110%"
"LAB May 1：supply anomaly"

### 修正后

**正确术语：`implied circulating supply anomaly`**

```
implied_supply = market_cap / price
```

当 `implied_supply` 出现异常跳变（>30% in 1 day），只能说明：

> **price 与 market cap 口径出现不一致，或流通供应估算发生变化。**

它可能来自（无优先级排序）：
1. 真实 token unlock 事件
2. 团队/基金会转账导致新增流通
3. CoinGecko/CMC 主动修正流通供应口径
4. Market cap 数据更新延迟（price 已更新但 market cap 仍未更新）
5. 交易所价格不同步（CoinGecko 的 price 是加权平均，market cap 可能从不同来源）
6. 数据供应商错误

### Scanner 输出修正

```
✅ 正确: SUPPLY_ANOMALY_DETECTED
❌ 错误: SUPPLY_DILUTION_CONFIRMED
```

**确认真实供应稀释需要多源交叉验证：**
- 链上 total supply 未变但 implied supply 跳升 → 数据口径变化
- 链上 total supply 确实增加 + implied supply 跳升 → 真实 unlock/mint
- 链上 total supply 增加 + CEX inflow 增加 + top holder 减持 → 综合确认派发

**在没有链上数据的情况下，只能输出 SUPPLY_ANOMALY_DETECTED。**

---

## 2. BSB/LAB 的共性不能泛化

### 修正

| 事实 | 含义 |
|------|------|
| N=2 | 统计上无意义 — 不能计算 p-value、置信区间、效应量 |
| BSB 是事件驱动（收购新闻） | 其模式不能泛化到有机突破 |
| LAB 是压缩突破后异常崩盘 | 其模式可能代表一类"有机启动→异常终止"的代币 |
| 两者都发生在 2026 年 4-5 月 | 不能排除宏观周期效应 |
| 两者都是新币（<6 个月） | 老币可能完全不同 |
| 两者都有 Binance Alpha 标签 | 不能排除交易所效应 |

### 当前只能做的

- 提取候选信号（hypothesis generation）
- 在更大样本上验证（hypothesis testing）
- 不能宣称"找到了普遍规律"
- 不能宣称"可用于预测"

---

## 3. P0 规则主要是风险规则，不是早期买入规则

### 规则重新分类

| v2 规则 | 旧分类 | 正确分类 | 含义 |
|---------|--------|---------|------|
| P0_SUPPLY_ANOMALY_01 | P0 Risk | **Distribution / Supply Risk Signal** | 供应异常检测 — 高位风险预警 |
| P0_PRICE_CAP_DIVERGENCE_01 | P0 Risk | **Distribution / Supply Risk Signal** | 价格/市值背离 — 数据异常预警 |
| P0_EXTREME_VOLUME_HIGH_01 | P0 Risk | **Distribution / Supply Risk Signal** | 高位极端成交量 — 换手风险预警 |
| P0_EFFORT_RESULT_01 | P0 Risk | **Distribution / Supply Risk Signal** | 高量低效 — 上涨衰竭预警 |
| P0_CRASH_VOLUME_01 | P0 Risk | **Lagging Confirmation Signal** | 暴跌确认 — 事后信号，不领先 |
| P1_COMPRESSION_01 | P1 Early | **Early Setup Signal** | 压缩 — 可能领先但不预测方向 |
| P1_QUIET_BREAKOUT_01 | P1 Early | **Early Setup Signal** | 安静突破 — T0 确认，需要跟量 |
| P1_EARLY_RELATIVE_STRENGTH_01 | P1 Early | **Markup Confirmation Signal** | 相对强度 — 趋势确认 |
| P2_EVENT_DRIVEN_01 | P2 Context | **Noise / Context Signal** | 事件驱动 — 分类标签 |

### 四类信号

```
Early Setup Signal:          压缩、安静突破、早期相对强弱
                              → 领先但不预测方向，不能直接入场
                              
Markup Confirmation Signal:  成交量确认、趋势共振
                              → T0 信号，确认趋势但不能预测顶部

Distribution / Supply Risk:  供应异常、高位极端量、效率衰减
                              → 高位风险预警，帮助避免追高

Noise / Context:             事件驱动标签、赛道标签、数据质量
                              → 不能单独用，只提供上下文
```

---

## 4. v2 中需要降级的具体表述

| v2 表述 | 问题 | 修正 |
|---------|------|------|
| "Supply dilution — mathematical proof" | 过度自信 — 数学只证明 supply proxy 变了，不能证明 dilution | "Supply anomaly detected — implied supply proxy changed >30%. Cross-verification required." |
| "This is the single strongest risk signal" | 只有 N=2，不能宣称"最强" | "In the BSB/LAB sample (N=2), supply anomaly appeared near both peaks. Requires larger sample validation." |
| "Volume peaks at distribution, not accumulation" | 来自 N=5 样本，大部分是 post-ATH 数据 | "In our limited sample, the highest volume days occurred during crashes/distribution. Hypothesis only." |
| "Compression is a reliable pre-signal" | 只有 LAB 有清晰压缩 | "LAB showed compression before breakout. BSB did not. Reliability unknown — needs control group testing." |
| P0/P1/P2 priority labels | 暗示确定性和优先级 | 保留分类但加注 "TENTATIVE — based on N=2" |

---

## 5. Phase 4 的数据获取约束

Phase 4 只能使用以下免费数据源：
- CoinGecko 免费 API（price, market_cap, volume）
- CoinGecko 可获取的公开历史数据

以下数据当前不可用：
- Etherscan/BscScan holder 数据（403）
- DexScreener liquidity（403）
- 社媒时间序列
- 多交易所 OHLCV
- 衍生品 OI/Funding

**所有依赖缺失数据的规则，必须标记 DISABLED_MISSING_DATA。**

---

## 6. Phase 4 验证后的有效结论范围

验证后可以说的：
- "规则 X 在 N 个正样本中触发了 M 次，平均提前 Y 天"
- "规则 X 在 N 个负样本中误报了 K 次，误报率 Z%"
- "规则 X 在当前样本中表现出 [领先/同步/滞后] 特征"
- "规则 X 需要在 [更大样本/更多数据源] 上进一步验证"

验证后不能说的：
- "规则 X 可以预测山寨币爆发"
- "规则 X 可以帮助你抓住下一个百倍币"
- "规则 X 的准确率是 Z%"
- "按规则 X 可以放心买入"
