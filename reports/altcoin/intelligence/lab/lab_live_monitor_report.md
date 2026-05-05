# LAB 高位风险监控报告

生成时间: 2026-05-05 09:20:10
数据质量: 核心1.00 / 扩展0.30 / 综合1.00

## 1. 综合研判

**主状态: 🔴 LAB_LIQUIDATION_RISK**（置信度: HIGH）

次状态: LAB_FUNDING_OVERHEATED、LAB_DERIVATIVES_CROWDING_PROXY、LAB_BREAKOUT_CONFIRMATION

## 2. 市场快照

- 价格: $2.600000
- 市值: $197,542,746
- 24h 成交量: $90,877,138
- 1h: 5.3% | 24h: 52.2% | 7d: 280.9%
- 换手率: 46.0%
- 流通量: 76,546,099.142
- FDV: $2,580,702,973

## 3. 衍生品（CoinGlass）

- 聚合 OI: $413,635,196.66
- OI/市值: 2.09 ⚠️极端
- OI 4h: +$60,029,066.66
- OI 24h: +$121,534,213.66 (42%) ⚠️极端
- OI z-score: 1.84

- 资金费率: 16.59%（原始值: 0.1659，单位: CONFIRMED_DECIMAL）
- 资金费率 z-score: -0.02
- 资金费率连续正向: 12 期 ⚠️极端
- 资金费率绝对值极端: 是 (≥5%)

- 清算 4h: $789,896.53 (上行 $131,964.76 / 下行 $657,931.77)
- 清算 24h: $4,427,764.072
- 清算 4h 不平衡: -0.67
- 清算 4h/OI: 0.1910% | 清算 24h/OI: 1.0705%

## 4. OKX 对照

- OKX OI 单位: USD_DIRECT
- OKX OI USD: $18,121,955.698
- OKX 占全球 OI: 4.4%
- OKX 资金费率: 0.0012 (0.12%)

## 5. DEX 上下文

- DEX 数据不可用

## 6. 风险状态证据

| 状态 | 等级 | 证据 | 置信度 | 限制 |
|------|------|------|--------|------|
| LAB_LIQUIDATION_RISK | 主状态 | Liq 24h=$4427764；OI 24h ratio=42% | HIGH | Liquidation proxy — not confirmed forced close direction |
| LAB_FUNDING_OVERHEATED | 次状态 | Funding=16.59% (raw=0.1659)；Streak=12；OI/MCap=2.09 | HIGH | Funding overheated = risk indicator, not reversal signal |
| LAB_DERIVATIVES_CROWDING_PROXY | 次状态 | OI/MCap=2.09；OI 24h ratio=42%；OKX ratio=4.4% | HIGH | OI crowding = structural context, not directional signal |
| LAB_BREAKOUT_CONFIRMATION | 次状态 | Price 24h=52.2%；Vol/MCap=46%；OI rising=true | HIGH | Breakout confirmation = research context, not entry signal |

## 7. 人工复核清单

- [ ] 多交易所 OI 同步: ⚠️极端 (+42%)
- [ ] 资金费率极端: ⚠️是 (16.6%)
- [ ] 清算放大: ⚠️是 ($4.4M)
- [ ] 价格推进效率下降: 不明确
- [ ] OI 开始下降: 否（仍在上升）
- [ ] 出现去杠杆: 否
- [ ] OKX 确认: 是
- [ ] DEX 确认: 否
- [ ] 数据完整: 是

## 8. 无法确认的事项

- 无法确认吸筹
- 无法确认出货
- 无法确认方向性入场
- 无法推断买卖意图
- 不构成交易建议