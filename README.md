# OKX AI Quant Lab + Altcoin Breakout Intelligence System

Local-first, risk-first, audit-first quantitative trading research lab + multi-source altcoin breakout intelligence system.

## Current Status (2026-05-04)

The project now has three layers:

1. **OKX Quant Research Lab** — trading infrastructure, backtesting, risk engine, audit logging
2. **Altcoin Scanner v02** — 28-token universe scoring with supply/DEX/price features
3. **Altcoin Intelligence Research Layers** — derivatives OI/funding analysis, DEX pool discovery, phase classification (research-only)

## Data Sources

| Source | Purpose | Status |
|--------|---------|:---:|
| CoinGecko Pro | Price/mcap/volume 90d history, Onchain DEX pools | Active |
| CoinMarketCap | Supply cross-verification, CEX/DEX volume split | Active |
| DexScreener | DEX pairs, liquidity, buy/sell txns | Active |
| OKX Trading Statistics | OI history, funding rate history | Active |
| Etherscan V2 | Token transfers, on-chain total supply | Partial (holderlist requires Pro) |

## What This System Cannot Do

- Cannot confirm accumulation or distribution (no holder time-series)
- Cannot confirm derivatives positioning (no long/short ratio or taker volume)
- Cannot output trading recommendations (BUY/SELL/LONG/SHORT forbidden)
- Cannot auto-execute trades (live trading permanently disabled)
- OI/funding/DEX activity are proxy signals, not facts

## Quick Commands

```bash
npm run scanner:v02                  # Run universe scanner
npm run scanner:v02:build-registry    # Build token metadata registry
npm run scanner:v02:fetch-price       # Fetch missing price features
npm run intelligence:derivatives:features  # Run OI lead-lag analysis
npm run intelligence:coingecko:pools  # CoinGecko pool discovery
npm run okx:demo:preflight           # OKX demo environment check
npm test                              # Run 101 tests
npm run security:check-secrets        # Scan for API key leaks
```

## Architecture

```
okx-ai-quant-lab/
  src/
    connectors/     # OKX CLI wrapper (no keys in logs)
    data/           # Fetch & normalize candles
    indicators/     # SMA, EMA, RSI, MACD, Bollinger, ATR
    strategies/     # Signal-only strategies (no orders)
    backtest/       # Backtest engine + walk-forward
    risk/           # Risk policy + order guard
    execution/      # Order intent + demo/live executors
    audit/          # JSONL audit logger
    reports/        # Markdown report generator
  config/           # Risk policies (demo & live)
  logs/             # Audit logs (gitignored)
  reports/          # Generated reports
```

## Quick Start

### 1. Install OKX Agent TradeKit

```bash
npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli
```

Verify:

```bash
okx --version
okx market ticker BTC-USDT --json
```

### 2. Configure OKX Credentials

Create `~/.okx/config.toml` with your demo profile. The project reads credentials from there automatically — never put keys in `.env` or project files.

```toml
[demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
```

### 3. Install Project Dependencies

```bash
cd okx-ai-quant-lab
npm install
```

### 4. Environment Setup

```bash
cp .env.example .env
# Edit .env if needed — defaults are safe for demo mode
```

Default environment variables:
- `LIVE_TRADING_ENABLED=false` — Live trading is disabled
- `RISK_POLICY=config/risk_policy.demo.yaml` — Uses demo risk limits
- `OKX_PROFILE=demo` — Uses OKX demo credentials

## Usage

### Fetch Market Data

```bash
npm run fetch:data
# or
bash scripts/fetch_data.sh
```

Fetches BTC-USDT and ETH-USDT candles at 1H, 4H, 1D. Output:
- `data/raw/{instId}_{bar}.json` — Raw JSON from OKX
- `data/processed/{instId}_{bar}.csv` — Normalized CSV

### Run Backtest

```bash
npm run backtest
# or
bash scripts/run_backtest.sh
```

Runs all 3 baseline strategies against all instruments and bars. Output:
- Console summary with key metrics
- `reports/backtest_report.md`

### Run Walk-Forward Validation

```bash
npm run walk-forward
# or
bash scripts/run_walk_forward.sh
```

Train/test split validation. Parameters optimized only on train windows.
Output: `reports/walk_forward_report.md`

### Dry Run Order Intent

```bash
npm run dry-run-order
# or
bash scripts/dry_run_order.sh
```

Generates sample order intents and runs them through the risk engine.
**No actual orders are placed.** Output: audit log in `logs/audit_*.jsonl`

### Run Tests

```bash
npm test
npm run check       # TypeScript type checking
```

## Baseline Strategies

| Strategy | Description | Key Parameters |
|----------|------------|----------------|
| MA Crossover | Buy when fast MA crosses above slow MA | fastPeriod=9, slowPeriod=21 |
| RSI Mean Reversion | Buy oversold, sell overbought | period=14, oversold=30, overbought=70 |
| Volatility Breakout | Buy on ATR-based breakout | lookback=20, atrPeriod=14, atrMultiplier=2 |

All strategies output signals only. They never place orders directly.

## Risk Policy

### Demo Mode (default)

- Mode: `demo`
- Live trading: **disabled** (`allowLiveTrading: false`)
- Max order: $50 USDT
- Max daily loss: $20 USDT
- Max daily trades: 10
- Allowed: BTC-USDT, ETH-USDT (spot only)
- Blocked: SWAP, FUTURES, OPTION
- Human approval: required
- Dry-run: default

### Live Mode (not yet operational)

- Mode: `live`
- Live trading: **disabled** (`allowLiveTrading: false`)
- Max order: $10 USDT
- Max daily loss: $10 USDT
- Max daily trades: 3
- Same instrument restrictions as demo

## Order Execution Flow

```
Strategy Signal → Order Intent → Risk Policy Check → Audit Log
                                                      ↓
                                              ┌─ Approved? ─┐
                                              ↓              ↓
                                        Dry Run /       Rejected
                                        Pending         (logged)
                                        Approval
```

1. Strategy generates signal
2. Signal becomes `order_intent.json`
3. Risk engine validates:
   - Mode check (live must be explicitly enabled)
   - Instrument allowlist
   - Blocked instrument types (SWAP/FUTURES/OPTION)
   - Notional limit
   - Daily loss limit
   - Daily trade count
   - Human approval requirement
4. All steps logged to audit trail

## Safety Boundaries

### Allowed
- Market data queries (read-only)
- Demo trading profile
- Backtesting and research
- Dry-run order simulation
- Walk-forward validation

### Prohibited
- Live trading (controlled by `LIVE_TRADING_ENABLED=false`)
- Withdraw operations
- Transfers
- Leverage, margin, options, futures, swaps
- Direct order placement without risk check
- Storing API keys in project files
- Bypassing the risk engine

### Security Rules
1. **Never** paste API keys into chat or `.env` files
2. **Never** commit secrets to git
3. Credentials belong **only** in `~/.okx/config.toml`
4. All commands sanitized before logging (keys redacted)
5. All orders must pass through `order_guard.ts`
6. All executions must be audit-logged

## Reports

After running backtests and walk-forward validation, reports are generated at:
- `reports/backtest_report.md`
- `reports/walk_forward_report.md`

## Audit Trail

Every execution produces a JSONL audit log at `logs/audit_YYYYMMDD.jsonl`:

```json
{"timestamp":"...","action":"risk_check","input":{...},"riskDecision":"rejected: ..."}
{"timestamp":"...","action":"order_intent","input":{...},"riskDecision":"dry_run"}
```

## Troubleshooting

### OKX CLI not found
```bash
npm install -g @okx_ai/okx-trade-cli
```

### Market data fails
Ensure `~/.okx/config.toml` exists with a `[demo]` profile and valid credentials.

### "Live trading is disabled" error
This is by design. The live executor is a stub that always refuses. To enable live trading, you must configure all safety controls explicitly.

## License

Research project — not financial advice.
