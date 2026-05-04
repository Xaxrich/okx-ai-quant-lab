# Quant 101 for AI Engineer

> 作者背景：AI 工程师，量化小白。本文档用 AI 工程师的思维模型解释量化交易，每一个概念都映射到 `okx-ai-quant-lab` 项目中对应的代码模块。

---

## 1. What is Quant Trading

### 小白解释

量化交易 = 把交易想法变成可执行的程序。不靠直觉、不靠新闻、不靠「我觉得该涨了」。靠的是：**规则 → 数据 → 回测 → 风控 → 执行 → 审计**。

类比：你把一个交易策略想象成 ML pipeline：
- 训练数据 = 历史行情
- 模型 = 交易策略（规则，不是神经网络）
- 训练 = 回测
- 验证集 = walk-forward
- 部署 = demo executor
- 监控 = audit log

### 量化交易不是预测魔法

很多人以为量化 = "预测明天涨跌"。事实是：大多数量化策略只是**在特定市场条件下，用特定规则捕捉特定价格行为**，并用严格的资金管理控制亏损。

一个量化策略的收益可能只有 2-3 个点（2-3%），但关键不是赚多少，而是：
- 赚的时候赚多少（profit factor）
- 亏的时候亏多少（max drawdown）
- 每笔交易预期收益是正还是负（Sharpe）

### 在 okx-ai-quant-lab 里的对应

| 概念 | 模块 |
|------|------|
| 规则化 | `src/strategies/` — MA crossover, RSI reversion, volatility breakout |
| 数据化 | `src/data/` — fetch_candles, normalize, pagination |
| 程序化 | `src/backtest/engine.ts` — 自动模拟执行 |
| 风控化 | `src/risk/order_guard.ts` — 11 条风控规则 |

### 常见误区

> "量化就是 AI 预测股价"

量化 ≠ AI。很多成功的量化策略只是一个简单的 if-else 规则（比如 MA 金叉买入）。AI 只是工具箱里的一种方法。

---

## 2. Market Basics

### 2.1 Symbol / Instrument（交易对）

**小白解释**：和 REST API 里的 resource path 一样 — `BTC-USDT` 就是一个资源标识符，表示"用 USDT 买 BTC"。

- BTC-USDT：用 USDT 计价、交易 Bitcoin
- ETH-USDT：用 USDT 计价、交易 Ethereum
- SOL-USDT：同理

**在项目里**：`config/risk_policy.demo.yaml → allowedInstruments: [BTC-USDT, ETH-USDT]`

### 2.2 Spot（现货）

**小白解释**：一手交钱，一手交货。你用 USDT 买 0.001 个 BTC，你就真的拥有 0.001 个 BTC。就像你去超市用￥10 买一瓶水，水就是你的。

**在项目里**：当前系统**只允许 spot**。`tdMode: cash`。

**误区**：很多人以为交易就一定要做合约。Spot 是最基础、最安全的交易方式。

### 2.3 Futures / Swap / Options（合约/衍生品）

**小白解释**：你不是买资产本身，而是买一个"对赌协议"。
- Futures：赌某个日期 BTC 的价格
- Swap（永续合约）：没有到期日，每 8 小时收一次资金费率
- Options：赌 BTC 在某个日期是否超过某个价格，是权利不是义务

**当前系统状态：全部禁止。** `blockedInstrumentTypes: [SWAP, FUTURES, OPTION]`

**为什么禁止**：合约有杠杆（leverage），1 USDT 可以开 100 USDT 的仓位。赚得快，亏得更快。你现在是学习阶段，不需要碰这些。

### 2.4 Price（价格）

**小白解释**：当前市场上 1 个 BTC 值多少 USDT。这不是一个固定数字，而是**最后一笔成交价**（last price）。

- Bid（买一）：市场上最高出价 — "我愿意出 $78,000 买"
- Ask（卖一）：市场上最低要价 — "我 $78,001 就卖"
- Last：最近一笔成交价

**获取方式**：`okx market ticker BTC-USDT --json` → `last`

### 2.5 Candle / K-line（K 线 / 蜡烛图）

**小白解释**：K 线是把一段时间内的价格变化压缩成 4 个数字 + 2 个元数据：

```
一根 1 小时 K 线 = {
  open:   第一秒的价格
  high:   这一小时最高价
  low:    这一小时最低价
  close:  最后一秒的价格
  volume: 这一小时成交了多少 BTC
  ts:     这根 K 线的时间戳
}
```

如果把 1000 根 1 小时 K 线排在一起，就是 BTC 最近 1000 小时的价格历史。

**在项目里**：`data/processed/BTC-USDT_1H.csv` 就是 1000 行这样的数据。

**误区**：K 线图不是预测工具。它只记录过去，不保证未来。

### 2.6 Order Book（订单簿）

**小白解释**：像一个双列的排行榜：

```
左边（Asks — 卖单）       右边（Bids — 买单）
$78,010 — 0.5 BTC        0.3 BTC — $78,005
$78,015 — 1.2 BTC        1.5 BTC — $78,000
$78,020 — 3.0 BTC        2.0 BTC — $77,995
```

这就是市场深度（depth）。如果你下一个 2 BTC 的市价买单，你会吃掉 $78,010 的 0.5 BTC + $78,015 的 1.2 BTC + $78,020 的 0.3 BTC。你的平均成交价会比 best ask 差 — 这就是滑点（slippage）。

**获取方式**：`okx market orderbook BTC-USDT --json`

### 2.7 Volume（成交量）

**小白解释**：这段时间成交了多少。Volume 大 = 市场活跃 = 你的订单容易成交 = 滑点小。Volume 小 = 市场冷清 = 你的订单可能挂在墙上很久。

**在项目里**：K 线数据里的 `volume` 和 `volumeCcy`（volume in quote currency）。

### 2.8 Liquidity（流动性）

**小白解释**：市场的"水深不深"。流动性好 = 订单簿两边都很厚 = 大订单砸下来价格也不怎么动。流动性差 = 订单簿很薄 = 小订单也会推动价格 — 这就是滑点的来源。

类比：在一个有 100 个卖家的市场里买苹果 vs 在一个只有 2 个卖家的市场里买苹果。

### 2.9 Volatility（波动性）

**小白解释**：价格跳动的幅度。BTC 一天上下 2-3% 很正常，USDT 几乎不动。高波动 = 机会多也危险多。

**在项目里**：`src/indicators/atr.ts` — Average True Range，量化波动性的基础指标。

### 2.10 Spread（价差）

**小白解释**：best ask - best bid。如果 bid 是 $78,000，ask 是 $78,001，spread 就是 $1（0.001%）。Spread 越小，交易成本越低。

### 2.11 Maker / Taker

| 角色 | 行为 | 费用 |
|------|------|------|
| Maker | 挂限价单，增加订单簿深度 | 低（~0.08%） |
| Taker | 吃订单簿上已有的订单 | 高（~0.10%） |

**在项目里**：`post_only` 订单强制你做 maker（只增加深度，不吃单）。回测引擎默认 `feeBps=10`（0.10%）。

### 2.12 Fee（手续费）

**小白解释**：每笔交易交易所收取的费用。通常 maker 0.08%，taker 0.10%。看似很小，但如果频繁交易，手续费会吃掉大部分利润。

**在项目里**：`src/backtest/engine.ts` 里的 `feeBps` 参数 — 每一笔模拟交易都扣手续费。

### 2.13 Slippage（滑点）

**小白解释**：你期望的成交价 vs 实际成交价的差距。来源：
- 订单簿深度不够
- 市场波动太快
- 网络延迟

**在项目里**：`src/backtest/engine.ts` 里的 `slippageBps` 参数 — 默认 5bps（0.05%）。

---

## 3. Order Basics

### 3.1 Market Order（市价单）

**小白解释**：你说"我现在就要成交，不管价格"。系统会吃掉订单簿上最好的卖单，直到满足你的数量。

**当前系统：禁止。** 理由：市价单不可控 — 在低流动性市场，你可能会以奇怪的价格成交。

### 3.2 Limit Order（限价单）

**小白解释**：你说"我最多出这个价"。挂一张限价买单在订单簿上，等人来吃。如果价格一直不到你的限价，订单就挂着不成交。

**这是当前系统唯一允许的订单类型。**（还有 post_only，它是 limit 的子类型）

举例：
```
当前价格：$78,000
你挂 limit buy @ $7,800  →  挂在订单簿上，不会成交（价格太远）
你挂 limit buy @ $77,900 →  挂在订单簿上，可能成交（接近市价）
```

### 3.3 Post-Only（只做 Maker）

**小白解释**：limit order 的一种变体。如果你的订单会立即成交（变成 taker），系统会拒绝它。强制你只做 maker。

**为什么用**：Maker 手续费更低，而且你是在"增加流动性"。

### 3.4 Order Size / Notional

**小白解释**：
- Size（sz）= 你要买多少 base currency（比如 0.001 BTC）
- Notional（名义价值）= sz × px = 这笔订单值多少 USDT

**在项目里**：`maxOrderNotionalUSDT: $50` — 每笔订单最多 $50。

### 3.5 Fill / Partial Fill（成交 / 部分成交）

**小白解释**：
- Fill = 你的订单完全成交了（你买了 0.001 BTC，订单簿上正好有人卖了 0.001 BTC 给你）
- Partial Fill = 只成交了一部分（你挂 0.001 BTC 买单，只成交了 0.0003 BTC，还有 0.0007 BTC 挂在墙上）

**在项目里**：`src/portfolio/position_ledger.ts` 的 `applyFill()` 方法处理部分成交。

### 3.6 Cancel（撤单）

**小白解释**：把还没成交的订单从订单簿上拿下来。只有 open/live/partially_filled 状态的订单可以撤。

**在项目里**：`src/execution/order_status.ts → cancelOrderByClOrdId()`

### 3.7 clOrdId vs ordId

| ID | 谁生成的 | 用途 |
|----|---------|------|
| clOrdId | 你（客户端） | 你给订单的编号，方便你自己追踪 |
| ordId | OKX（交易所） | 交易所给订单的编号，全局唯一 |

**在项目里**：`src/execution/client_order_id.ts → generateClOrdId()` 生成 `okxql20260503a1b2c3d4e5f6` 格式的 ID。

**为什么需要 clOrdId**：你发订单时可能网络断了，不知道是否提交成功。用同一个 clOrdId 重试，交易所会告诉你"这个订单已经存在了"而不是重复下单。

---

## 4. Strategy Basics

### 4.1 策略 = 一个规则函数

```typescript
// 策略的本质
function strategy(candles: Candle[]): Signal[] {
  // 读取价格数据
  // 计算指标
  // 判断条件
  // 输出 BUY / SELL / HOLD
}
```

**策略不直接下单**。它只输出信号（Signal）。下单是 executor 的事。

**在项目里**：`src/strategies/strategy.ts` 定义了 Signal 接口。

### 4.2 Signal（信号）结构

```typescript
{
  ts: 1777795441336,       // 信号时间
  instId: "BTC-USDT",      // 交易对
  action: "BUY",           // BUY | SELL | HOLD
  confidence: 0.6,         // 置信度 0-1
  reason: "RSI crossed below 30",  // 为什么产生信号
  strategyVersion: "1.0.0" // 策略版本
}
```

### 4.3 Three Baseline Strategies

#### MA Crossover（均线交叉）

**思路**：快线和慢线交叉 = 趋势改变。
- 快线（9 小时均线）上穿慢线（21 小时均线）→ BUY
- 快线下穿慢线 → SELL

**类比 ML**：类似两个不同窗口大小的 moving average filter。当短窗口的输出超过长窗口的输出，可能意味着趋势改变。

**代码**：`src/strategies/ma_cross.ts`

**回测表现**：-1.12%（1H BTC）— 在近期市场中表现不佳。

#### RSI Mean Reversion（RSI 均值回归）

**思路**：极端值会回归。RSI 是 0-100 的指标：
- RSI < 30：超卖 → BUY（赌它会涨回来）
- RSI > 70：超买 → SELL（赌它会跌回去）

**类比 ML**：类似 anomaly detection。当价格偏离正常范围太多，它倾向于回归正常。

**代码**：`src/strategies/rsi_reversion.ts`

**回测表现**：+5-7%（ETH 1H/4H）— 当前最佳 baseline。

#### Volatility Breakout（波动突破）

**思路**：如果价格突破了一个基于近期波动幅度的通道，说明有大的方向性运动。

**代码**：`src/strategies/volatility_breakout.ts`

**回测表现**：0 trades — 近期市场波动不足以触发信号。

### 4.4 Entry / Exit / Position Sizing

| 概念 | 解释 | 在代码里 |
|------|------|---------|
| Entry | 什么时候买 | `action: "BUY"` 信号 |
| Exit | 什么时候卖 | `action: "SELL"` 信号 |
| Position Sizing | 买多少 | `positionSizePct: 1.0`（全仓） |
| Stop Loss | 亏到多少强制卖 | Volatility breakout 有 ATR-based stop |
| Take Profit | 赚到多少止盈 | 当前 baseline 未实现 |
| No-trade | 什么条件不下单 | `action: "HOLD"` |

### 4.5 常见误区

> "RSI<30 就一定会涨"

不。RSI<30 只是历史统计上倾向于回归，但可以继续跌。这就是为什么需要 stop loss。

> "回测赚钱的策略就可以上线"

不。看第 6 章：过拟合。

---

## 5. Backtesting Basics

### 5.1 回测是什么

**小白解释**：把策略拿到历史数据上跑一遍，看它"如果当时在跑"会怎么样。

类比 ML：回测 = 在训练集上 evaluation。但回测比 ML evaluation 更危险，因为你可以无意识地按结果调参数（data leakage）。

### 5.2 回测不是证明

在历史数据上赚钱 ≠ 策略好。可能的原因：
1. 你按历史数据调了参数（过拟合）
2. 历史只有一段行情（比如全是牛市）
3. 没有考虑手续费和滑点
4. 你的策略捕捉到的是噪音而不是信号

### 5.3 回测引擎做了什么

**在项目里**：`src/backtest/engine.ts`

```
for each candle:
  if signal = BUY:
    开仓（扣除 slippage）
  if signal = SELL and 有仓位:
    平仓（扣除 slippage + fee）
    记录这笔交易的 PnL
  更新 equity curve
```

### 5.4 关键指标（Metrics）

**在项目里**：`src/backtest/metrics.ts`

| 指标 | 小白解释 | 什么算好 |
|------|---------|---------|
| Total Return | 总共赚了/亏了多少 % | > 0 |
| Annualized Return | 换算成年化收益率 | > risk-free rate (~2%) |
| Max Drawdown | 从最高点到最低点跌了多少 % | < 20% |
| Sharpe Ratio | 每单位风险换来的收益 | > 1.0 算不错 |
| Win Rate | 赚钱的交易比例 | > 50%（但不关键，见下文） |
| Profit Factor | 总盈利 / 总亏损 | > 1.5 |
| Avg Trade Return | 每笔平均收益 % | > 0 |
| Max Consecutive Losses | 最多连续亏几次 | 越小越好 |
| Trade Count | 交易次数 | 太少说明策略几乎不触发 |

**Win Rate 不是最重要的**。一个 30% 胜率的策略可能是盈利的（如果赢的时候赢 5%，亏的时候只亏 1%）。一个 90% 胜率的策略可能是亏损的（如果每次只赚 0.1%，但偶尔一次大亏就爆仓）。

---

## 6. Overfitting（过拟合）

### 6.1 用 ML 类比

你训练了一个模型，在训练集上 accuracy 99%，测试集上 51%。这就是过拟合。

量化策略完全一样：
- 你在 2023 年数据上把参数调到完美
- 2024 年实盘一跑，亏成狗

### 6.2 In-Sample vs Out-of-Sample

| ML 概念 | 量化概念 | 在项目里 |
|---------|---------|---------|
| Training set | In-sample (train window) | `trainWindow: 180 candles` |
| Validation set | Out-of-sample (test window) | `testWindow: 60 candles` |
| Cross-validation | Walk-forward | `src/backtest/walk_forward.ts` |
| Hyperparameter tuning | Parameter optimization | 只能在 train window 上做 |

### 6.3 Walk-Forward

**在项目里**：`src/backtest/walk_forward.ts`

```
Window 1: [train: candles 0-180] → 调参 → [test: candles 180-240]
Window 2: [train: candles 60-240] → 调参 → [test: candles 240-300]
Window 3: ...
```

**关键规则**：参数优化只能发生在 train window。Test window 只评估，不许调参。这个规则对应 ML 里"不许在测试集上调超参"。

### 6.4 Parameter Sensitivity

**在项目里**：`src/research/parameter_sensitivity.ts`

如果 best params 的 return 是平均值的好几倍 → 很可能是过拟合。

**经验法则**：如果 best params 返回 13% 而 grid average 是 -2%，这个"13%"很可能是运气而不是策略好。

### 6.5 Why "Best Parameter" is Suspicious

举例：你的 MA crossover 有 fastPeriod 和 slowPeriod 两个参数。你测试了 4×4=16 种组合。16 种里总有一个"最好"的 — 但这是 selection bias。如果你把 16 种组合都在 test window 上跑一遍然后选最好的，这就是 data leakage。

### 6.6 Strategy Admission 为什么拒绝策略是好事

**在项目里**：`config/strategy_admission_policy.yaml`

当前所有策略都被 REJECTED 或 RESEARCH_ONLY。这不是坏事。这说明：
- 系统在**保护你**，不让你用未经充分验证的策略下单
- 这些 baseline 策略确实需要更多数据和更严格的验证
- 准入标准存在的意义就是**防止你用噪音当信号**

---

## 7. Risk Management

### 7.1 风控 = 规则引擎

**在项目里**：`src/risk/order_guard.ts`

风控不是"我觉得现在不适合交易"。风控是一个**硬规则引擎**。每条规则都是二元的 — 要么通过，要么拒绝。

### 7.2 风控规则优先级

```
1. Live trading 检查     → 如果 live 且未启用 → 直接拒绝
2. 合约类型检查           → 如果是 SWAP/FUTURES/OPTION → 直接拒绝
3. Instrument 白名单      → 如果不在 [BTC-USDT, ETH-USDT] → 直接拒绝
4. 订单类型检查           → 如果是 market order → 直接拒绝
5. Notional 检查          → 如果超过 $50 → 直接拒绝
6. 每日交易次数           → 如果今天已经 10 次 → 直接拒绝
7. 每日亏损限额           → 如果今天亏超过 $20 → 直接拒绝
8. 人工审批              → 需要输入 EXECUTE_DEMO_ORDER
```

### 7.3 每一条规则的 WHY

- **maxOrderNotionalUSDT: $50**：单笔订单不超过 $50。即使策略发疯，最多亏 $50。
- **maxDailyLossUSDT: $20**：一天最多亏 $20。亏到上限，今天不做了。
- **maxDailyTrades: 10**：一天最多 10 次。防止策略高频刷手续费。
- **allowedInstruments**：只允许指定的交易对。防止策略偶然交易到不熟悉的币种。
- **blockedInstrumentTypes**：禁止合约。这是安全底线。
- **requireHumanApproval: true**：每一笔订单都需要人工确认。AI 不能自己决定"该下单了"。
- **dryRunByDefault: true**：即使人工审批通过，默认也只是 dry-run。

### 7.4 Dry Run vs Demo vs Live

| 模式 | 真实 API 调用 | 真实资金 | 当前状态 |
|------|:---:|:---:|:---:|
| Dry Run | 否 | 否 | **默认** |
| Demo Execute | 是（demo 环境） | 否（模拟资金） | 需 --execute-demo |
| Live | 是 | 是（真实资金） | **永久禁用** |

---

## 8. Execution System

### 8.1 完整订单流

```
Strategy.generate()        →  Signal { action: "BUY", ... }
        ↓
demo_roundtrip.ts         →  OrderIntent { intentId, instId, sz, px, ... }
        ↓
risk guard                →  GuardResult { approved / rejected / pending }
        ↓
human confirmation        →  "EXECUTE_DEMO_ORDER"
        ↓
okx spot place            →  clOrdId + ordId
        ↓
query order status        →  state, fillSz, avgPx
        ↓
cancel order              →  cancelled / failed
        ↓
query order status        →  final state
        ↓
position ledger update    →  qty, avgEntryPrice, realizedPnl
        ↓
audit log                 →  JSONL entry (15 fields)
```

**在项目里**：`src/execution/demo_roundtrip.ts`

### 8.2 Order Intent（订单意图）

不是订单本身，而是"我想下一个什么样的订单"的结构化描述。必须先通过风控才能执行。

### 8.3 Position Ledger（仓位账本）

**在项目里**：`src/portfolio/position_ledger.ts`

持久化文件：`data/portfolio/positions.json`

```
{
  "instId": "BTC-USDT",
  "qty": 0.001,            // 持有 0.001 BTC
  "avgEntryPrice": 78000,  // 平均入场价 $78,000
  "realizedPnlUSDT": 0,    // 已实现盈亏
  "updatedAt": "2026-05-03T08:00:00Z"
}
```

每次成交（fill）后更新。部分成交只更新已成交部分。撤单不更新。

### 8.4 PnL Tracker（盈亏追踪）

**在项目里**：`src/portfolio/pnl_tracker.ts`

- dailyRealizedPnlUSDT：今天已经赚/亏了多少（已平仓部分）
- dailyUnrealizedPnlUSDT：当前持仓浮盈/浮亏
- tradeCountToday：今天交易次数
- lossLimitHit：是否触发亏损限额

### 8.5 Audit Log（审计日志）

**在项目里**：`src/audit/logger.ts`

每次操作写一行 JSONL：`logs/audit_20260503.jsonl`

包含：timestamp, action, input, riskDecision, command, result, error

**任何涉及资金的行动都必须有审计日志。没有例外。**

---

## 9. MCP and Skills in This System

### 9.1 三层架构

```
┌──────────────────────────────────┐
│  AI Agent (Claude Code)          │  ← 你在这里
├──────────────────────────────────┤
│  Skills (SKILL.md)               │  ← 操作说明书
│  "怎么查行情" "怎么下单" "怎么撤单"  │
├──────────────────────────────────┤
│  MCP (okx-trade-mcp)             │  ← 工具连接层 (read-only)
│  market_get_ticker()             │
│  market_get_candles()            │
├──────────────────────────────────┤
│  OKX CLI (okx)                   │  ← 命令行执行
│  okx market ticker BTC-USDT      │
├──────────────────────────────────┤
│  OKX API                         │  ← 交易所接口
└──────────────────────────────────┘
```

### 9.2 Skills = 操作说明书

Skills 是 Markdown 文件，告诉 AI agent 在什么情况下应该做什么。**Skills 不能直接下单** — 它们教 agent 如何调用 CLI。

位置：`E:\quant\okx-agent-skills\skills\`

### 9.3 MCP = 工具连接层

MCP（Model Context Protocol）是连接 AI agent 和外部工具的协议。OKX 的 MCP server 把 CLI 命令包装成 function calls，让 AI agent 可以调用。

**当前 MCP 配置**：`okx-trade-mcp --profile okx-demo --read-only --modules market`

只能读行情，不能下单。

### 9.4 为什么不能让 AI 自由下单

1. AI 不知道你的真实风险承受能力
2. AI 可能在理解错误的上下文中执行操作
3. AI 可能被 prompt injection 诱导执行危险操作
4. API 调用失败时 AI 可能重试导致重复下单
5. 市场极端波动时 AI 不具备实时判断能力

**所以**：所有下单必须经过 risk guard → human approval → audit log。这是硬规则。

---

## 10. Current Project Stage

### 10.1 已完成

| Phase | 内容 | 状态 |
|-------|------|:--:|
| Phase 1 | 基础行情、指标、策略、回测、walk-forward、dry-run | Done |
| Phase 2 | 9,000 candles、parameter sensitivity、strategy admission、risk guard、position ledger、PnL tracker | Done |
| Phase 2.5 | Demo preflight、enhanced roundtrip、22 new tests、audit log enhancement | Done |

### 10.2 当前状态

```
测试: 64/64 passing (6 suites)
数据: 9,000 candles (BTC/ETH/SOL × 1H/4H/1D)
策略: 3 baseline (all REJECTED or RESEARCH_ONLY)
风控: 11 rules active
执行: dry-run only (needs --execute-demo for real demo)
实盘: 永久禁用
```

### 10.3 下一步

- 执行一次真实 demo roundtrip（需要你主动触发 `npm run demo:roundtrip -- --execute-demo EXECUTE_DEMO_ORDER`）
- 扩充 walk-forward 窗口到 8+ 以通过 strategy admission
- 将 RSI strategy 信号接入 demo roundtrip

---

## 11. Learning Checklist

### 基础概念

- [ ] 我理解 K 线是什么（open/high/low/close/volume）
- [ ] 我理解 ticker 和 candle 的区别
- [ ] 我理解 order book 和 bid/ask
- [ ] 我理解 liquidity 和 slippage 的关系
- [ ] 我理解 maker 和 taker 的区别

### 订单

- [ ] 我理解 market order 和 limit order 的区别
- [ ] 我理解为什么当前系统禁止 market order
- [ ] 我理解 clOrdId 是干什么的
- [ ] 我理解 partial fill 是什么

### 策略

- [ ] 我理解策略只输出信号，不下单
- [ ] 我理解 MA crossover 的原理
- [ ] 我理解 RSI mean reversion 的原理
- [ ] 我理解一个策略的 win rate 不是最重要的指标

### 回测

- [ ] 我理解回测是在历史数据上模拟
- [ ] 我理解回测赚钱 ≠ 策略好
- [ ] 我理解 in-sample vs out-of-sample
- [ ] 我理解为什么 walk-forward 需要在 train window 上调参

### 过拟合

- [ ] 我理解参数调优和 ML 超参搜索是同一个问题
- [ ] 我理解为什么 best parameter is suspicious
- [ ] 我理解 strategy admission 拒绝策略不是坏事

### 风控

- [ ] 我理解风险控制是硬规则，不是建议
- [ ] 我理解为什么 dry-run 是默认行为
- [ ] 我理解为什么需要人工审批
- [ ] 我理解 demo vs live 的区别

### 系统

- [ ] 我理解订单流的每一步
- [ ] 我理解 audit log 为什么是必须的
- [ ] 我理解 MCP/Skills/CLI 的三层架构
- [ ] 我理解为什么不让 AI 自己下单

### 实际操作

- [ ] 我跑过 `npm run demo:preflight`
- [ ] 我跑过 `npm run demo:roundtrip`（dry run）
- [ ] 我读过 `config/risk_policy.demo.yaml`
- [ ] 我读过一次 audit log 输出
- [ ] 我理解如何执行 demo roundtrip 的真实 API 测试

---

## Appendix: Quick Reference

### 关键文件速查

| 想看什么 | 文件 |
|---------|------|
| 策略代码 | `src/strategies/ma_cross.ts` |
| 回测引擎 | `src/backtest/engine.ts` |
| 风控规则 | `src/risk/order_guard.ts` |
| 风控参数 | `config/risk_policy.demo.yaml` |
| 策略准入标准 | `config/strategy_admission_policy.yaml` |
| 仓位账本 | `src/portfolio/position_ledger.ts` |
| 盈亏追踪 | `src/portfolio/pnl_tracker.ts` |
| 审计日志 | `src/audit/logger.ts` |
| 订单流 | `src/execution/demo_roundtrip.ts` |
| Skills 文档 | `E:\quant\okx-agent-skills\skills\` |
| MCP/Skills 参考 | `docs/okx-skills-mcp-reference.md` |

### 术语速查

| 英文 | 中文 | 一句话 |
|------|------|--------|
| Spot | 现货 | 一手交钱一手交货 |
| Limit Order | 限价单 | "我最多出这个价" |
| Market Order | 市价单 | "我现在就要"（当前禁止） |
| Slippage | 滑点 | 期望价 vs 实际价的差距 |
| Drawdown | 回撤 | 从最高点跌了多少 |
| Sharpe | 夏普比率 | 每单位风险换多少收益 |
| Walk-Forward | 滚动优化 | 时间序列的 cross-validation |
| Overfitting | 过拟合 | 历史表现好、未来表现差 |
| clOrdId | 客户端订单ID | 你给订单的编号 |
| Notional | 名义价值 | sz × px |
