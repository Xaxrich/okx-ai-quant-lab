# Altcoin Scanner Report v2 — Multi-Source

Generated: 2026-05-04T05:43:48.789Z

## Data Sources (All Active)

| Source | Status | Data Provided |
|--------|--------|--------------|
| CoinMarketCap API | ACTIVE | Price, market cap, circulating supply, CEX/DEX volume split |
| DexScreener API | ACTIVE | DEX liquidity, 24h buy/sell counts, pair data |
| Etherscan V2 API | ACTIVE | On-chain total supply (ground truth) |
| CoinGecko API | ACTIVE | Historical price/volume/mcap time series |

## Supply Structure Analysis

| Token | Price (CMC) | MCap (CMC) | Circ. Supply | Total Supply (Chain) | Circ. Ratio | Risk |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| BONK | $0.000000 | $0M | N/A | N/A | N/A | RESEARCH_ONLY |
| BSB | $1.107735 | $230132037M | 208M | 1000M | 21% | WATCH_RISK |
| LAB | $0.000000 | $0M | N/A | N/A | N/A | RESEARCH_ONLY |
| PEPE | $0.000000 | $0M | N/A | 420689900M | N/A | RESEARCH_ONLY |
| WIF | $0.000000 | $0M | N/A | N/A | N/A | RESEARCH_ONLY |

## DEX Activity

| Token | DEX Liq | DEX Vol 24h | Buys | Sells | Buy/Sell | CEX/DEX Ratio |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| BONK | $0.4M | N/A | 3201 | 3585 | 0.89 | N/A |
| BSB | $0.0M | $6.1M | N/A | 1 | 0.00 | 8.6x |
| LAB | $0.1M | N/A | 37090 | 38781 | 0.96 | N/A |
| PEPE | $28.4M | N/A | 106 | 124 | 0.85 | N/A |
| WIF | $4.9M | N/A | 1923 | 1835 | 1.05 | N/A |

## Scanner Results

### WATCH_RISK
- **BSB** (score: 90)
  - Low circulating ratio: 21% of total supply circulating. Large unlock risk.
  - DEX sell pressure: buy/sell ratio 0.00.
  - Low DEX liquidity: $50K. Easy to manipulate.
  - Extreme DEX turnover: 123.0x liquidity in 24h.

## Supply Anomaly Detection: RESTORED

With CMC circulating supply + Etherscan on-chain total supply, we can now monitor:
- **Circulating ratio** = CMC circulating / Etherscan total
- Low ratio (<30%) = large unlock risk = supply anomaly WARNING
- This replaces the CoinGecko-only `implied_supply` proxy that was disabled in v0.1

## Disclaimer
RESEARCH ONLY. No trading advice. No BUY/SELL recommendations.