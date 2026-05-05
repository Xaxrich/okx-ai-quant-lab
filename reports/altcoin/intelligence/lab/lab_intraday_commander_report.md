# LAB 盘中情报参谋报告

生成: 2026-05-05 12:54:56
快照数: 28 | 事件数: 59

## 1. 综合研判

**TREND_CONTINUATION**
LAB 当前处于 TREND_CONTINUATION。趋势95/100，反转风险0/100。趋势延续得分 95>反转 0。反转风险证据较弱。

## 2. 四分评分

| 维度 | 得分 |
|------|------|
| 趋势延续 | 95/100 |
| 反转风险 | 0/100 |
| 清算反弹 | 10/100 |
| 数据置信 | 80/100 |

## 3. 事件时间线

| 时间 | 类型 | 证据 | 置信度 |
|------|------|------|--------|
| 11:50:16 | SQUEEZE_REBOUND | price +$0.02 liq $2097K | MEDIUM |
| 11:54:15 | LIQUIDATION_EXPANSION | liq $2097K | HIGH |
| 12:05:16 | FUNDING_COOLING | funding 14.5→8.9% | HIGH |
| 12:05:16 | LIQUIDATION_RESET | liq $2097→$24K | HIGH |
| 12:05:16 | PRICE_OI_BOTH_DOWN | price 2.35→2.34 OI -$1.7M | HIGH |
| 12:05:16 | RISK_SCORE_DOWNGRADE | 60→35 | HIGH |
| 12:20:16 | RISK_SCORE_DOWNGRADE | 35→20 | HIGH |
| 12:35:17 | OI_ACCELERATION | OI +$13.1M | HIGH |
| 12:50:17 | OI_ACCELERATION | OI +$12.8M | HIGH |
| 12:50:17 | RISK_SCORE_UPGRADE | 20→30 | HIGH |

## 4. 信号归因

| 信号 | 样本 | 先行/滞后 | 置信度 |
|------|------|----------|--------|
| LIQUIDATION_EXPANSION | 18 | LAGGING | LOW |
| FUNDING_EXTREME_UP | 13 | LAGGING | LOW |
| PRICE_OI_BOTH_DOWN | 5 | LAGGING | LOW |
| FUNDING_COOLING | 5 | NOISE | LOW |
| OI_ROLLOVER | 4 | LAGGING | LOW |
| OI_ACCELERATION | 4 | LAGGING | LOW |
| RISK_SCORE_UPGRADE | 3 | LAGGING | LOW |
| RISK_SCORE_DOWNGRADE | 3 | LAGGING | LOW |
| SQUEEZE_REBOUND | 3 | NOISE | LOW |
| LIQUIDATION_RESET | 1 | INSUFFICIENT_SAMPLE | LOW |

## 5. 情景推演

- 主情景: 趋势延续
- 替代情景: 反转风险
- 推翻条件: OI 转负且价格跌破支撑

## 6. 最强/最弱证据

- 最强: 趋势延续得分 95>反转 0; OI 仍在上升
- 最弱: 反转风险证据较弱
- 核心矛盾: 趋势得分 95 vs 反转风险 0，市场TREND_CONTINUATION

## 7. 下次观察

OI 何时转负——当前 +$12.8M | 清算何时突破 $1M——当前 $151K

## 8. 数据边界

- 快照数: 28（非严格5m间隔）
- 单币种: LAB
- 单日行情
- CoinGlass 4h粒度
- 样本偏差: 仅覆盖一次完整去杠杆周期

## 9. 声明

状态和证据不是执行指令。本报告仅为情报分析，不包含交易执行建议。