# LAB 指标体系研究报告

生成: 2026-05-05 14:20:14

## 1. API 能力盘点

| API | 已用指标 | 未用但可用的指标 | 潜在价值 |
|-----|---------|----------------|---------|
| CoinGecko | price, volume, mcap, 24h return | DEX pool OHLCV, pool volume, pool liquidity | 高——DEX活动常领先CEX |
| CoinGlass | OI, funding, liquidation | **交易所OI分布**, OI变化%分时, OI集中度 | **极高**——知道OI在哪个交易所最关键 |
| OKX | OI, funding | trading statistics, 多空持仓比 | 中——LAB不在OKX主战场 |
| Moralis | transfer count, entity labels | **transfer velocity**, holder变化, whale movement | 高——链上活动领先价格 |
| CMC | supply, FDV | 持仓分布, 交易所流量 | 中 |
| DexScreener | liquidity | **buy/sell count**, **txn count**, pair age | 高——实时DEX情绪 |

## 2. 交易所OI分布（首次获取）

总OI: $385.9M | 交易所数: 12
前3集中度: 65%

| 排名 | 交易所 | OI | 占比 | 1h变化 | 24h变化 |
|------|--------|-----|------|--------|--------|
| 1 | KuCoin | $100.7M | 26.1% | -7.77% | 53.87% |
| 2 | Bitget | $92.3M | 23.9% | -9.32% | 49.06% |
| 3 | Binance | $57.8M | 15.0% | -10.15% | 45.04% |
| 4 | BingX | $40.6M | 10.5% | 2.4% | 2.75% |
| 5 | Bybit | $30.4M | 7.9% | -8.58% | 59.52% |
| 6 | Aster | $20.8M | 5.4% | -7.48% | 155.58% |
| 7 | Gate | $16.3M | 4.2% | -9% | 43.92% |
| 8 | OKX | $15.4M | 4.0% | -10.79% | 34.44% |
| 9 | MEXC | $7.3M | 1.9% | 6.66% | 181.65% |
| 10 | Bitunix | $4.0M | 1.0% | -19.26% | 104.41% |
| 11 | LBank | $0.2M | 0.1% | 51.13% | 20.51% |
| 12 | HTX | $0.1M | 0.0% | -30.15% | 40.77% |

**关键发现: LAB主战场不在OKX(仅4.0%)，而在KuCoin+Bitget+Binance(65%)**

## 3. 可新增的高价值指标

### 立即可用（已有数据，只需计算）
1. **交易所OI集中度** (Herfindahl指数)——OI越集中，越容易单边踩踏
2. **OI变化加速度** (二阶导数)——OI增速本身在加速还是减速
3. **资金费率-OI背离度**——OI上升但资金下降=健康；OI上升+资金上升=拥挤
4. **清算方向比** (上行清算/下行清算)——哪一方在被强制平仓
5. **价格-OI效率比**——每$1M OI变化推动多少价格变化

### 需接入新端点
6. **多空持仓比** (L/S ratio)——如CoinGlass端点可用
7. **DEX实时买卖比** (DexScreener buy/sell count)
8. **链上转账速度** (Moralis transfer velocity)

## 4. 与价格的相关性（基于快照数据）

样本: 32 条快照
OI-价格: r=0.97
资金费率-价格: r=0.17
清算-价格: r=-0.30

注意: 快照数据非等间隔，相关性仅供参考。需要更长时间序列做统计验证。

## 5. 建议优先级

1. **立即接入交易所OI分布**——每15分钟获取，追踪OI在哪个交易所流动
2. **计算OI集中度**——作为新的风险维度加入commander评分
3. **计算资金-OI背离度**——当前最有区分力的复合指标
4. **测试CoinGlass L/S ratio端点**——确认HOBBYIST plan是否支持
5. **接入DexScreener实时数据**——补充DEX侧情绪

本报告仅为研究参考，不构成交易建议。