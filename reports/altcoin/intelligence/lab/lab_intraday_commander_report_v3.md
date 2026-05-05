# LAB 情报参谋 v3

生成: 2026-05-05 14:44:04

## 1. 综合研判
**RESET_EQUILIBRIUM**
RESET_EQUILIBRIUM。清算压力已释放，OI从峰值回落，资金费率仍偏高但回落至9.7%。

## 2. 五维评分
| 维度 | 得分 |
|------|------|
| 趋势延续 | 75/100 |
| 反转风险 | 0/100 |
| 重置再加速 | 45/100 |
| 流动脆弱性 | 30/100 |
| 数据置信 | 80/100 |

## 3. 组合信号
| ID | 名称 | 触发 | 置信度 | 分类 |
|----|------|------|--------|------|
| C1 | 衍生品拥挤热度 |  | MEDIUM | EARLY_CONFIRMATION |
| C2 | 资金峰值→OI峰值链 |  | LOW | LEADING_CANDIDATE |
| C3 | 去杠杆重置 |  | LOW | CONFIRMATION |
| C4 | 重置后重新加速 |  | LOW | EARLY_CONFIRMATION |
| C5 | 薄流动性+衍生品主导 |  | MEDIUM | STRUCTURAL_CONTEXT |
| C6 | DEX流向中性+价格波动 | ✓ | LOW | STRUCTURAL_CONTEXT |
| C7 | 清算压力 | ✓ | MEDIUM | LAGGING |
| C8 | 重置后均衡 | ✓ | MEDIUM | CONFIRMATION |

## 4. DEX微观结构
- 交易对: 12
- 流动性: $0.55M
- 24h量: $8.69M
- 换手率: 16x
- 买入占比: 49%
- 状态: DEX_BALANCED

## 5. 交易所OI
- 总OI: $395M
- HHI: 0.171
- 前3: 65%
- 1h: undefined所↑ undefined所↓

## 6. 证据链
OI从峰值$417M回落5%；DEX买卖均衡(49%买)——无单边情绪

## 7. 推翻条件
1. OI持续下降且不恢复——推翻reset-reacceleration
2. 清算重新放大至$1M+——推翻压力已消化
3. 资金费率重新突破10%且OI同步上升——推翻均衡

## 8. 边界
快照38条|单日单币|组合信号未经多周期回测
本报告仅为情报分析。