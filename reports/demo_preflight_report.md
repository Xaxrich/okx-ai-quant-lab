# Demo Preflight Report

Generated: 2026-05-03T08:03:59.311Z

**Result: PASS** (21 passed, 0 failed, 0 warnings)

## Checks

| # | Name | Result | Detail |
|---|------|--------|--------|
| 1 | OKX CLI available | PASS | CLI responds |
| 2 | Market ticker BTC-USDT | PASS | BTC = $78385.5 |
| 3 | ~/.okx/config.toml exists | PASS | Found |
| 4 | Profile 'okx-demo' | PASS | Found |
| 5 | Demo balance readable | PASS | USDT avail = 0 |
| 6 | Risk policy exists | PASS | config/risk_policy.demo.yaml |
| 7 | Risk policy mode | PASS | mode=demo |
| 8 | allowLiveTrading = false | PASS | allowLiveTrading=false |
| 9 | maxOrderNotionalUSDT | PASS | $50 |
| 10 | allowedInstruments | PASS | BTC-USDT, ETH-USDT |
| 11 | blockedInstrumentTypes | PASS | SWAP, FUTURES, OPTION |
| 12 | requireHumanApproval = true | PASS | requireHumanApproval=true |
| 13 | dryRunByDefault = true | PASS | dryRunByDefault=true |
| 14 | LIVE_TRADING_ENABLED != true | PASS | LIVE_TRADING_ENABLED=(unset, default false) |
| 15 | Market order blocked | PASS | Market orders rejected by risk guard (ordType must be limit/post_only) |
| 16 | SWAP blocked | PASS | SWAP instruments rejected by blockedInstrumentTypes |
| 17 | FUTURES blocked | PASS | FUTURES instruments rejected by blockedInstrumentTypes |
| 18 | OPTION blocked | PASS | OPTION instruments rejected by blockedInstrumentTypes |
| 19 | MCP registered | PASS | okx-trade-mcp --profile okx-demo --read-only --modules market |
| 20 | MCP read-only | PASS | Spot trade module not loaded in MCP (market only) |
| 21 | MCP demo profile | PASS | Using okx-demo profile |

## Safety Gate Status

| Gate | Status |
|------|--------|
| Live trading | BLOCKED |
| Market orders | BLOCKED |
| SWAP/FUTURES/OPTION | BLOCKED |
| Withdraw/Transfer | NOT IN SCOPE |
| API keys in project | NEVER |
| Audit log | ACTIVE |