# OKX Agent Skills & MCP Tools — Complete Reference

> Generated: 2026-05-03 | OKX CLI v1.3.2 | Agent Skills v1.3.2

---

## I. Quick Install & Verify

```bash
# Both packages already installed globally
npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli

# Verify
okx --version                    # 1.3.2
okx market ticker BTC-USDT --json  # Public data (no auth needed)
```

Agent skills repo: `E:\quant\okx-agent-skills\` (cloned from github.com/okx/agent-skills)

---

## II. Agent Skills — Trigger Reference

Each skill is a self-contained SKILL.md that teaches AI agents how to use OKX CLI for a specific domain. **Invoke with `/skill-name`** or the agent auto-routes based on trigger keywords.

### Skills Inventory

| Skill | Auth | Triggers (zh/en) |
|-------|:----:|------------------|
| **okx-cex-auth** | Auth | 登录, 授权, 认证, 连接账户, login, authenticate, session expired |
| **okx-cex-market** | No | 行情, 价格, K线, 深度, 资金费率, 持仓量, 技术指标(70+), ticker, candles, RSI, MACD, orderbook |
| **okx-cex-trade** | Yes | 下单, 买入, 卖出, 撤单, 止盈止损, 期权, 事件合约, buy BTC, place order, set TP/SL |
| **okx-cex-portfolio** | Yes | 余额, 持仓, 盈亏, 转账, 总资产, balance, positions, PnL, transfer funds |
| **okx-cex-bot** | Yes | 网格交易, 马丁格尔, DCA, grid bot, martingale, 现货马丁, 合约马丁 |
| **okx-cex-earn** | Yes | 赚币, 理财, 质押, 双币赢, 闪赚, Simple Earn, staking, Dual Investment |
| **okx-cex-smartmoney** | Yes | 聪明钱, 牛人榜, 交易员, 多空比, leaderboard, smart money, long/short ratio |
| **okx-sentiment-tracker** | Yes | 新闻, 情绪, 市场动态, crypto news, sentiment, fear and greed, trending |
| **okx-cex-skill-mp** | Yes | 技能市场, 安装技能, skill marketplace, install skill, browse skills |

### Skill Files Location

```
E:\quant\okx-agent-skills\skills\
  okx-cex-auth/SKILL.md
  okx-cex-market/SKILL.md
  okx-cex-trade/SKILL.md
  okx-cex-portfolio/SKILL.md
  okx-cex-bot/SKILL.md
  okx-cex-earn/SKILL.md
  okx-cex-smartmoney/SKILL.md
  okx-sentiment-tracker/SKILL.md
  okx-cex-skill-mp/SKILL.md
```

### How Skills Route

Each SKILL.md has YAML frontmatter with `description` containing trigger keywords. The AI agent reads these descriptions and auto-routes user requests to the correct skill. **No manual skill loading needed** — just place skills in the agent's skill directory and they're auto-discovered.

---

## III. MCP Tools — Complete Catalog

MCP (Model Context Protocol) tools provide programmatic access to OKX. They can be used directly or through AI agents.

### MCP Server Startup

```bash
# Market data only (no API key needed)
okx-trade-mcp --modules market

# Demo trading, all features
okx-trade-mcp --profile demo --modules all

# Live read-only monitoring
okx-trade-mcp --profile live --read-only

# Selective modules
okx-trade-mcp --profile demo --modules market,spot
```

### Module Map

| Module | Auth | Tools Count | Category |
|--------|:----:|:-----------:|----------|
| `market` | No | 13 | Market data |
| `spot` | Trade | 11 | Spot trading |
| `swap` | Trade | 12 | Perpetual swaps |
| `futures` | Trade | 7 | Delivery futures |
| `option` | Trade | 10 | Options + Greeks |
| `account` | Read | 13 | Account management |
| `bot.grid` | Trade | 5 | Grid bots |
| `bot.dca` | Trade | 5 | DCA bots |
| `earn.savings` | Trade | — | Simple Earn |
| `earn.onchain` | Trade | — | On-chain staking |
| `earn.dcd` | Trade | — | Dual Investment |
| `earn.autoearn` | Trade | — | AutoEarn |
| `earn.flash` | Trade | — | Flash Earn |
| `event` | — | — | Events |
| `news` | — | — | News |
| `smartmoney` | Trade | — | Smart Money |
| `skills` | Trade | — | Skills marketplace |
| `all` | — | — | All modules |

### market (Read-only, no auth)

```yaml
market_get_ticker:          # Single ticker (last, bid/ask, 24h vol)
market_get_tickers:         # All tickers by type (SPOT/SWAP/FUTURES/OPTION)
market_get_orderbook:       # Order book depth
market_get_candles:         # Candlesticks (last 300)
market_get_history_candles: # Historical candles (2+ days ago, up to 3 months)
market_get_index_ticker:    # Index ticker (BTC-USD)
market_get_index_candles:   # Index candlesticks
market_get_price_limit:     # Contract price limits
market_get_funding_rate:    # Current funding rate
market_get_funding_rate_history:  # Historical funding rates
market_get_mark_price:      # Derivative mark prices
market_get_open_interest:   # Open interest
market_get_trades:          # Recent trades
```

### spot (Needs trade permission)

```yaml
spot_place_order:         # Place order (market, limit, post_only, FOK, IOC)
spot_cancel_order:        # Cancel open order
spot_amend_order:         # Amend price or quantity
spot_batch_place_orders:  # Batch place (up to 20)
spot_batch_cancel_orders: # Batch cancel
spot_get_order:           # Single order details
spot_get_open_orders:     # Current open orders
spot_get_order_history:   # Order history (last 7 days)
spot_get_order_history_archive:  # Archive (7+ days, up to 3 months)
spot_get_fills:           # Recent fills
spot_get_fills_archive:   # Archive fills (1+ hour ago)
```

### swap (Needs trade permission)

```yaml
swap_place_order:         # Place swap order
swap_cancel_order:        # Cancel open order
swap_amend_order:         # Amend price/qty
swap_batch_place_orders:  # Batch (up to 20)
swap_batch_cancel_orders: # Batch cancel
swap_close_position:      # One-click close position
swap_get_order:           # Single order details
swap_get_open_orders:     # Current open orders
swap_get_order_history:   # Order history (last 7 days)
swap_get_positions:       # Current positions
swap_get_fills:           # Recent fills
swap_set_leverage:        # Set leverage
swap_get_leverage:        # Query leverage
```

### futures (Needs trade permission)

```yaml
futures_place_order:   # Place futures order
futures_cancel_order:  # Cancel
futures_amend_order:   # Amend
futures_get_order:     # Single order
futures_get_open_orders:# Open orders
futures_get_order_history: # History
futures_get_positions: # Current positions
futures_get_fills:     # Recent fills
```

### option (Needs trade permission)

```yaml
option_place_order:    # Place option order (buy/sell call/put)
option_cancel_order:   # Cancel
option_batch_cancel:   # Batch cancel (up to 20)
option_amend_order:    # Amend
option_get_order:      # Single order
option_get_orders:     # Query open or historical
option_get_positions:  # Current positions (incl. Greeks)
option_get_fills:      # Fill records
option_get_instruments:# Option chain
option_get_greeks:     # IV + Greeks (delta, gamma, theta, vega)
```

### account (Needs read permission)

```yaml
account_get_balance:          # Trading account balance
account_get_asset_balance:    # Funding account balance
account_get_positions:        # All current positions
account_get_positions_history:# Historical positions
account_get_bills:            # Bills (last 7 days)
account_get_bills_archive:    # Bills (7+ days, up to 3 months)
account_get_fee_rates:        # Trading fee rates
account_get_config:           # Account config
account_set_position_mode:    # Toggle long/short or net mode
account_get_max_size:         # Max order size
account_get_max_withdrawal:   # Max withdrawable
account_get_leverage:         # Query leverage
account_set_leverage:         # Set leverage
account_get_audit_log:        # Local tool call audit log
```

### bot.grid / bot.dca (Needs trade permission)

```yaml
# Grid
grid_get_orders:        # List running/historical bots
grid_get_order_details: # Specific bot details
grid_get_sub_orders:    # Bot sub-orders
grid_create_order:      # Create grid bot (spot/contract/Moon Grid)
grid_stop_order:        # Stop a running bot

# DCA
dca_create_order:       # Create DCA (Martingale) bot
dca_stop_order:         # Stop DCA strategy
dca_get_orders:         # List DCA strategies
dca_get_order_details:  # Single DCA details
dca_get_sub_orders:     # DCA sub-orders
```

### Security Features

| Feature | Description |
|---------|------------|
| `--demo` | Simulated trading (injects `x-simulated-trading: 1`) |
| `--read-only` | Query-only, no write operations |
| Auto-permission check | Disables trade tools if API key lacks trade permission |
| `[CAUTION]` labels | All fund-related tools flagged |
| Rate limiting | Built-in throttling |

---

## IV. Skills ↔ MCP Sync Map

Skills teach agents **what to do** (natural language → okx CLI). MCP tools provide **programmatic access** (function calls).

| Skill | Primary MCP Module | Notes |
|-------|-------------------|-------|
| okx-cex-market | `market` | Identical — both read-only, no auth |
| okx-cex-trade | `spot` + `swap` + `futures` + `option` | Skills teach CLI; MCP offers finer-grained tool separation |
| okx-cex-portfolio | `account` | Skills also cover transfers (MCP account module) |
| okx-cex-bot | `bot.grid` + `bot.dca` | Direct mapping |
| okx-cex-earn | `earn.*` | Savings, onchain, dcd, autoearn, flash |
| okx-cex-smartmoney | `smartmoney` | Leaderboard, signals |
| okx-sentiment-tracker | `news` | News + sentiment |
| okx-cex-auth | — | MCP auth handled via `--profile` flag |
| okx-cex-skill-mp | `skills` | Marketplace discovery |

---

## V. Quick Usage Patterns

### Pattern 1: Public Market Data (No Auth)

```bash
# CLI
okx market ticker BTC-USDT --json
okx market candles BTC-USDT --bar 1H --limit 100 --json

# MCP tool (when connected)
market_get_ticker(instId="BTC-USDT")
market_get_candles(instId="BTC-USDT", bar="1H", limit=100)
```

### Pattern 2: Demo Account Check (Auth Required)

```bash
# CLI
okx account balance --profile okx-demo --json

# MCP tool (when connected)
account_get_balance(ccy="USDT")
```

### Pattern 3: Demo Order (Auth + Trade Permission)

```bash
# CLI — safe limit order far from market
okx spot place BTC-USDT --side buy --sz 0.00001 --ordType limit --px 1000 \
  --tdMode cash --profile okx-demo --clOrdId okxql20260503a1b2c3d4e5f6

# Cancel immediately
okx trade cancel BTC-USDT --clOrdId okxql20260503a1b2c3d4e5f6 --profile okx-demo
```

### Pattern 4: Technical Indicators (No Auth, via Skill)

When the okx-cex-market skill is active, the agent can compute 70+ indicators:
- RSI, MACD, EMA, SMA, Bollinger Bands, KDJ, SuperTrend
- AHR999 (BTC valuation), BTC Rainbow Chart
- Open Interest change scanner

### Pattern 5: Setup MCP for Claude Code

```bash
# Register MCP server with Claude Code
okx-trade-mcp setup --client claude-code

# Or start manually for testing
okx-trade-mcp --profile okx-demo --modules market --read-only
```

---

## VI. Safety Matrix

| Action | Skills Allowed | MCP Allowed | Project okx-ai-quant-lab |
|--------|:---:|:---:|:---:|
| Read market data | Yes | Yes | Yes |
| Read account balance | Yes | Yes (demo) | Yes (read-only) |
| Place demo limit order | Yes | Yes (demo) | `--execute-demo` only |
| Place market order | Allowed by skill | Allowed by MCP | **BLOCKED** by risk guard |
| Live trading | Allowed by skill | Allowed by MCP | **BLOCKED** `LIVE_TRADING_ENABLED=false` |
| SWAP/FUTURES/OPTION | Allowed by skill | Allowed by MCP | **BLOCKED** by risk policy |
| Withdraw | N/A | N/A | **BLOCKED** — not in scope |

---

## VII. Current Environment Status

| Component | Status | Detail |
|-----------|--------|--------|
| `okx` CLI | Installed | v1.3.2 |
| `okx-trade-mcp` | Installed | v1.3.2 |
| Agent Skills | Installed | `E:\quant\okx-agent-skills\skills\` (9 skills) |
| OKX Config | Configured | `~/.okx/config.toml` — profile `okx-demo` |
| Market Data (no auth) | Working | BTC-USDT = $78,383 |
| Demo Balance | Working | Read-only verified |
| MCP for Claude Code | Not registered | Run `okx-trade-mcp setup --client claude-code` |

---

## VIII. Cheatsheet

```bash
# ── Environment ──
okx --version                              # CLI version
okx-trade-mcp --help                        # MCP options
ls ~/.okx/config.toml                       # Config exists?

# ── Market (no auth) ──
okx market ticker BTC-USDT --json           # Latest price
okx market candles BTC-USDT --bar 1H --limit 100 --json  # Candles
okx market orderbook BTC-USDT --json        # Order book

# ── Account (needs auth) ──
okx account balance --profile okx-demo --json   # Balances
okx account positions --profile okx-demo --json # Positions

# ── Demo Order (needs auth + trade) ──
okx spot place BTC-USDT --side buy --sz 0.00001 --ordType limit --px 1000 \
  --tdMode cash --profile okx-demo

# ── Order Management ──
okx spot orders BTC-USDT --profile okx-demo --json          # Open orders
okx trade cancel BTC-USDT --clOrdId <id> --profile okx-demo # Cancel
okx trade order BTC-USDT --clOrdId <id> --profile okx-demo  # Status

# ── MCP Server ──
okx-trade-mcp --profile okx-demo --modules market --read-only  # Start MCP
okx-trade-mcp setup --client claude-code                        # Register with Claude Code
```
