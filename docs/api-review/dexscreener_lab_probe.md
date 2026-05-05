# DexScreener LAB Probe

Date: 2026-05-05
Status: AVAILABLE (free API, no key required)

## Endpoint
`GET https://api.dexscreener.com/latest/dex/search?q=LAB`

## Results
- 30 DEX pairs across BSC, Solana, Osmosis
- Main pool: BSC Uniswap V3 ($7.1M/24h volume)
- BSC aggregate: $8.53M/24h volume, 49.2% buy ratio
- Liquidity: $0.23M (extremely thin — 37x daily turnover)

## Key Metrics Available
- 24h buy count, sell count → real-time DEX sentiment
- 24h volume, liquidity → market depth
- Price USD, price change (5m, 1h, 6h, 24h)
- Pair age, DEX type, chain
- No API key required, no rate limit concerns for 15-min polling

## Integration Value
- Buy/sell ratio provides DEX-side sentiment independent of derivatives
- Thin liquidity = high slippage risk (only $0.23M liquidity for $8.5M daily volume)
- Can detect DEX sentiment shifts before they appear in CEX data
