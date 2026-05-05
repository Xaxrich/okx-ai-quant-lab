# LAB 盘中情报参谋报告 v2
生成: 2026-05-05 14:02:40
快照: 30 | 聚类: 7 | 有效路径: 6

## 1. 综合研判
**DELEVERAGING_PRESSURE** (前: TREND_REACCELERATION)
清算从峰值回落后价格与OI同步恢复，市场从去杠杆进入重置后再加速。趋势10/100，反转65/100。funding仍偏高(8.9%)，不能视为健康趋势。

## 2. 四分评分 (重新校准)
| 维度 | 得分 | 说明 |
|------|------|------|
| 趋势延续 | 10/100 | 偏低 |
| 反转风险 | 65/100 | 偏高——关注OI和清算 |
| 清算反弹 | 15/100 | |
| 数据置信 | 65/100 | 单日单币，扣10分 |

## 3. 阶段迁移
TREND_REACCELERATION → DELEVERAGING_PRESSURE
最近关键事件: DELEVERAGING_COMPOSITE (14:02:37)

### Case Insight: LIQUIDATION_RESET_REBOUND
- 统计置信度: LOW
- 案例重要性: HIGH
- 本轮行情中解释清算压力消化与价格/OI恢复的关键转折样本——尽管统计样本不足(单日单币)，但其在状态迁移链中的位置决定了它对理解当前结构有重要参考价值

## 4. 事件聚类
| ID | 时间 | 主类型 | 事件数 | 微阶段 |
|----|------|--------|--------|--------|
| C01 | 11:50:16 | MIXED | 1 | EQUILIBRIUM |
| C02 | 11:54:15 | LIQUIDATION_EXPANSION | 1 | ROLLOVER_PRESSURE |
| C03 | 12:05:16 | LIQUIDATION_RESET_REBOUND | 4 | RESET_REBOUND |
| C04 | 12:20:16 | MIXED | 1 | EQUILIBRIUM |
| C05 | 12:35:17 | TREND_REACCELERATION | 1 | TREND_REACCELERATION |
| C06 | 12:50:17 | TREND_REACCELERATION | 2 | TREND_REACCELERATION |
| C07 | 14:02:37 | DELEVERAGING_COMPOSITE | 4 | DELEVERAGING_PRESSURE |

## 5. 组合信号归因
| 信号 | 样本 | 有效路径 | 统计置信 | 案例重要性 | 分类 |
|------|------|---------|---------|----------|------|
| MIXED | 2 | 2 | LOW | MEDIUM | NOISE |
| TREND_REACCELERATION | 2 | 2 | LOW | MEDIUM | LAGGING |
| LIQUIDATION_EXPANSION | 1 | 1 | LOW | MEDIUM | INSUFFICIENT_SAMPLE |
| LIQUIDATION_RESET_REBOUND | 1 | 1 | LOW | HIGH | INSUFFICIENT_SAMPLE |
| DELEVERAGING_COMPOSITE | 1 | 0 | undefined | MEDIUM | INSUFFICIENT_SAMPLE |

## 6. 证据与矛盾
- 最强: 清算从峰值 $2.1M 回落后，价格与OI同步恢复——上一轮去杠杆压力阶段性消化，市场进入重置后的再加速观察；但funding仍处高位(8.9%)，衍生品拥挤未完全解除
- 最弱: 反转风险没有继续强化：清算未重新放大，OI未连续转负；但funding仍高于正常区间，不能把当前恢复视为健康趋势
- 矛盾: 价格/OI正在恢复，但funding仍处高位——这说明市场从去杠杆后重新加速，但衍生品拥挤并未完全解除。

## 7. 推翻条件

1. OI连续2次转负且价格未能继续推进——推翻reset-reacceleration
2. funding再次急剧抬升(>15%)且OI继续堆积但价格停滞——推翻低反转风险
3. 清算重新放大至$1M+且持续——推翻压力已消化判断

## 8. 推送闸门
- 推送等级: PREVIEW_OK
- 决策等级: REVIEW_GRADE
可预览推送——标题需含Preview，明确标注单日单币边界

## 9. 边界
快照30条|聚类7个|有效路径6/7|单日单币统计置信度有限
本报告仅为情报分析，不包含交易执行建议。