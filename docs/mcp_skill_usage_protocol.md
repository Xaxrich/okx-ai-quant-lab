# MCP / Skills Usage Protocol

## 1. What MCP / Skills CAN Do

### OKX MCP / Skills
- Query instruments (spot/swap/futures availability)
- Query market data (ticker, candles, orderbook)
- Query funding rate and history
- Query open interest
- Endpoint probing and capability testing
- API documentation reference
- CLI debugging

### CoinGecko MCP / Skills
- Token identity resolution (symbol → CoinGecko ID)
- API documentation lookup
- Market data queries (price, market cap, volume)
- Onchain pool discovery
- Pool OHLCV probing
- Derivatives ticker lookup
- Capability probes

## 2. What MCP / Skills CANNOT Do

### FORBIDDEN (OKX)
- Place orders (spot, swap, futures, options)
- Cancel orders
- Open/close positions
- Transfer funds
- Withdraw
- Set leverage
- Use any trading module
- Output trading recommendations

### FORBIDDEN (any MCP)
- Serve as the sole data source for research conclusions
- Replace reproducible TypeScript pipeline results
- Act as the production data pipeline
- Execute without audit trail

## 3. Formal Data Source Principle

All formal research must land in:
- Local JSON files
- CSV feature tables
- JSONL time-series
- Cache files with manifest
- Reproducible reports

MCP is auxiliary exploration only.
Final metric computation must be rerunnable via TypeScript pipeline.

## 4. Recommended MCP Configuration

OKX MCP: market-only, read-only, no trading module, no withdrawal, no transfer, no live execution.

CoinGecko MCP: data query only, no API key exposure, no production pipeline dependency.

## 5. Decisions That Require Pipeline Confirmation

If MCP returns a result that would change a research conclusion:
1. Mark as MCP_OBSERVATION (not verified)
2. Re-run via TypeScript pipeline
3. Compare results
4. Only accept pipeline result as formal evidence
