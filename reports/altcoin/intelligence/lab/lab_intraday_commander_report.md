# LAB 盘中情报参谋报告

生成: 2026-05-05 14:02:39
快照数: 30 | 事件数: 63

## 1. 综合研判

**ROLLOVER_WATCH**
LAB 当前处于 ROLLOVER_WATCH。趋势35/100，反转风险55/100。反转风险得分 55>趋势 35。趋势信号减弱。

## 2. 四分评分

| 维度 | 得分 |
|------|------|
| 趋势延续 | 35/100 |
| 反转风险 | 55/100 |
| 清算反弹 | 10/100 |
| 数据置信 | 80/100 |

## 3. 事件时间线

| 时间 | 类型 | 证据 | 置信度 |
|------|------|------|--------|
| 12:05:16 | PRICE_OI_BOTH_DOWN | price 2.35→2.34 OI -$1.7M | HIGH |
| 12:05:16 | RISK_SCORE_DOWNGRADE | 60→35 | HIGH |
| 12:20:16 | RISK_SCORE_DOWNGRADE | 35→20 | HIGH |
| 12:35:17 | OI_ACCELERATION | OI +$13.1M | HIGH |
| 12:50:17 | OI_ACCELERATION | OI +$12.8M | HIGH |
| 12:50:17 | RISK_SCORE_UPGRADE | 20→30 | HIGH |
| 14:02:37 | OI_ROLLOVER | OI -$16.9M | HIGH |
| 14:02:37 | LIQUIDATION_EXPANSION | liq $602K +$310K | LOW |
| 14:02:37 | PRICE_OI_BOTH_DOWN | price 2.56→2.43 OI -$16.9M | HIGH |
| 14:02:37 | RISK_SCORE_DOWNGRADE | 30→20 | HIGH |

## 4. 信号归因

| 信号 | 样本 | 先行/滞后 | 置信度 |
|------|------|----------|--------|
| LIQUIDATION_EXPANSION | 19 | LAGGING | LOW |
| FUNDING_EXTREME_UP | 13 | LAGGING | LOW |
| PRICE_OI_BOTH_DOWN | 6 | LAGGING | LOW |
| OI_ROLLOVER | 5 | LAGGING | LOW |
| FUNDING_COOLING | 5 | NOISE | LOW |
| RISK_SCORE_DOWNGRADE | 4 | LAGGING | LOW |
| OI_ACCELERATION | 4 | LAGGING | LOW |
| RISK_SCORE_UPGRADE | 3 | LAGGING | LOW |
| SQUEEZE_REBOUND | 3 | NOISE | LOW |
| LIQUIDATION_RESET | 1 | INSUFFICIENT_SAMPLE | LOW |

## 5. 情景推演

- 主情景: OI回落观察
- 替代情景: 趋势恢复
- 推翻条件: OI 回升且清算回落

## 6. 最强/最弱证据

- 最强: 反转风险得分 55>趋势 35
- 最弱: 趋势信号减弱; OI 开始回落
- 核心矛盾: 趋势得分 35 vs 反转风险 55，市场ROLLOVER_WATCH

## 7. 下次观察

清算何时突破 $1M——当前 $602K

## 8. 数据边界

- 快照数: 30（非严格5m间隔）
- 单币种: LAB
- 单日行情
- CoinGlass 4h粒度
- 样本偏差: 仅覆盖一次完整去杠杆周期

## 9. 声明

状态和证据不是执行指令。本报告仅为情报分析，不包含交易执行建议。