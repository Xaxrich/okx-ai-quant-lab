# LAB 盘中情报参谋报告 v2
生成: 2026-05-05 13:07:04
快照: 29 | 聚类: 8 | 有效路径: 8

## 1. 综合研判
**RANGE_EQUILIBRIUM** (前: TREND_REACCELERATION)
RANGE_EQUILIBRIUM。趋势60/100，反转风险15/100。趋势(60)>反转(15)——价格和OI仍在上升。RANGE_EQUILIBRIUM: 趋势60 vs 反转15。资金费率仍偏高，不能视为健康趋势。最近关键事件: TREND_REACCELERATION。12:50:17

## 2. 四分评分 (重新校准)
| 维度 | 得分 | 说明 |
|------|------|------|
| 趋势延续 | 60/100 | 适中 |
| 反转风险 | 15/100 | 偏低 |
| 清算反弹 | 30/100 | |
| 数据置信 | 80/100 | 单日单币，扣10分 |

## 3. 阶段迁移
TREND_REACCELERATION → RANGE_EQUILIBRIUM
最近关键事件: TREND_REACCELERATION (12:50:17)

## 4. 事件聚类
| ID | 时间 | 主类型 | 事件数 | 微阶段 |
|----|------|--------|--------|--------|
| C01 | 11:35:18 | MIXED | 1 | EQUILIBRIUM |
| C02 | 11:39:16 | FUNDING_COOLING | 2 | ROLLOVER_PRESSURE |
| C03 | 11:50:16 | LIQUIDATION_EXPANSION | 2 | ROLLOVER_PRESSURE |
| C04 | 11:54:15 | LIQUIDATION_EXPANSION | 1 | ROLLOVER_PRESSURE |
| C05 | 12:05:16 | LIQUIDATION_RESET_REBOUND | 4 | RESET_REBOUND |
| C06 | 12:20:16 | MIXED | 1 | EQUILIBRIUM |
| C07 | 12:35:17 | TREND_REACCELERATION | 1 | TREND_REACCELERATION |
| C08 | 12:50:17 | TREND_REACCELERATION | 2 | TREND_REACCELERATION |

## 5. 组合信号归因
| 信号 | 样本 | 有效路径 | 分类 | 置信度 |
|------|------|---------|------|--------|
| MIXED | 2 | 2 | NOISE | LOW |
| LIQUIDATION_EXPANSION | 2 | 2 | NOISE | LOW |
| TREND_REACCELERATION | 2 | 2 | NOISE | LOW |
| FUNDING_COOLING | 1 | 1 | INSUFFICIENT_SAMPLE | LOW |
| LIQUIDATION_RESET_REBOUND | 1 | 1 | INSUFFICIENT_SAMPLE | LOW |

## 6. 证据与矛盾
- 最强: 趋势(60)>反转(15)——价格和OI仍在上升；清算从峰值 $2.1M 回落至 $0.29M
- 最弱: 反转风险证据不足——但资金费率仍偏高
- 矛盾: RANGE_EQUILIBRIUM: 趋势60 vs 反转15。资金费率仍偏高，不能视为健康趋势。最近关键事件: TREND_REACCELERATION。12:50:17

## 7. 情景推演
- 主情景: RANGE_EQUILIBRIUM
- 替代: 趋势恢复
- 推翻: OI 重新上升且清算回落

## 8. 边界
快照29条|聚类8个|有效路径8/8|单日单币 | 等级: REVIEW_GRADE
本报告仅为情报分析，不包含交易执行建议。