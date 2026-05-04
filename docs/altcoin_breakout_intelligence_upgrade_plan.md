# Altcoin Breakout Intelligence System — Upgrade Plan

## 1. Current System Capabilities (Scanner v02)

| Capability | Status | Data Used |
|-----------|:---:|------|
| Price/volume snapshot analysis | WORKING | CoinGecko Pro |
| Supply overhang detection | WORKING | CMC + Etherscan |
| DEX liquidity + turnover snapshot | WORKING | DexScreener |
| Buy/sell ratio snapshot | WORKING | DexScreener |
| Early relative strength | WORKING | CoinGecko |
| 90d price-volume time series | WORKING | CoinGecko Pro |
| 28-token universe scanning | WORKING | Multi-source |
| Phase labeling | NOT YET | — |
| Holder concentration tracking | NOT YET | — |
| Transfer/CEX flow monitoring | NOT YET | — |
| DEX liquidity history | NOT YET | — |
| Signal validation / event study | NOT YET | — |

## 2. What the System Cannot Do

- **吸筹判断**: No holder concentration trending data — price compression alone is ambiguous
- **出货判断**: No transfer-to-CEX data — volume spikes could be buying or selling
- **大户减持**: No top-holder balance history — cannot track whale behavior
- **DEX流动性历史**: Only current snapshot — cannot see if liquidity was withdrawn
- **解锁压力**: No unlock schedule data — supply overhang ratio is static
- **社媒叙事时序**: No social data — cannot distinguish leading vs lagging narrative

## 3. Why These Gaps Exist

| Missing Ability | Root Cause |
|:---|:---|
| Holder tracking | No Etherscan/BscScan API pipeline for holder list + balance history |
| Transfer monitoring | No ERC20 transfer event pipeline + no CEX address label table |
| DEX history | All DEX data is current-snapshot only (DexScreener free tier) |
| Unlock schedule | No automated unlock data source configured |
| Event study | No control group comparison infrastructure |

## 4. New Data Layers Required

| Layer | Data | API Source | Priority |
|:---|:---|:---|:---:|
| Holder Time-Series | holder count, top N concentration, whale balance | Etherscan V2 (multi-chain) | P0 |
| Transfer Flow | ERC20 transfers, large transfers, CEX proxy flow | Etherscan V2 | P0 |
| DEX Liquidity History | daily liquidity snapshots, LP changes | DexScreener + GeckoTerminal | P1 |
| Entity Labels | CEX/DEX/team/vesting/bridge addresses | Manual + Arkham + Etherscan labels | P1 |
| Unlock Schedule | token unlock dates and amounts | CoinGecko/CMC + manual | P2 |
| Social Time-Series | mention counts, sentiment proxy | Not configured | P3 |

## 5. What Each Layer Solves

| Layer | Enables |
|:---|:---|
| Holder Time-Series | Distinguish accumulation (top holders stable/rising + holder count growing) from distribution (top holders declining + retail growth spike) |
| Transfer Flow | Detect CEX inflow spikes (distribution proxy) and CEX outflow (accumulation proxy) |
| DEX Liquidity History | Track LP additions (pre-breakout) and withdrawals (pre-crash) |
| Entity Labels | Identify WHERE tokens are flowing (to exchange = selling pressure, to new wallets = possible accumulation) |
| Unlock Schedule | Distinguish "supply overhang will unlock tomorrow" from "supply overhang is vesting over 4 years" |
| Social Time-Series | Determine if social heat leads or lags price (leading = organic, lagging = FOMO) |

## 6. What Remains Proxy (Not Fact)

Even with all layers, the following are proxy signals, not established facts:

- "Accumulation" = proxy. Cannot confirm intent behind address behavior.
- "Distribution" = proxy. Transfers to CEX could be for market-making, not selling.
- "CEX inflow" = proxy. Address labels are incomplete — many CEX addresses unknown.
- "Whale accumulation" = proxy. A wallet accumulating could be a CEX cold wallet.
- "Bot activity" = proxy. High turnover with balanced buy/sell could be arbitrage, not wash trading.

### Labeling Rules

| Signal Type | Correct Phrasing | Incorrect Phrasing |
|:---|:---|:---|
| Top holders declining | "Holder distribution shows distribution-risk proxy" | "Whales are dumping" |
| CEX inflow spike | "Transfer flow shows elevated CEX inflow — distribution risk" | "Team is selling to retail" |
| Low DEX liquidity | "Liquidity fragility detected" | "This token is unsafe" |
| Supply ratio < 30% | "Supply overhang — unlock schedule needs verification" | "79% of tokens will dump" |
