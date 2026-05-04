# OKX AI Quant Lab — Phase 2 Summary

**Generated:** 2026-05-03

## Phase 2 Deliverables

### A. Demo Order Roundtrip
- `src/execution/order_types.ts` — OrderIntent, OrderExecutionResult, OrderStatusResult types
- `src/execution/client_order_id.ts` — Unique clOrdId generator (format: `okxql<date><random>`, max 32 chars)
- `src/execution/demo_order_roundtrip.ts` — propose / execute-demo / cancel-demo actions
- `src/execution/order_status.ts` — Query by clOrdId or ordId, cancel by clOrdId
- Demo execution requires explicit `--execute-demo` flag + `EXECUTE_DEMO_ORDER` confirmation phrase
- Only `limit` and `post_only` orders allowed — market orders rejected
- Cancel-after-submit mode for safe roundtrip verification

### B. Order Status & Cancel
- `queryOrderByClOrdId()` / `queryOrderByOrdId()` — Read-only order status
- `cancelOrderByClOrdId()` — Cancel by client order ID
- All status/cancel operations write to audit log

### C. Position Ledger
- `src/portfolio/position_ledger.ts` — Persistent position tracking in `data/portfolio/positions.json`
- Supports partial fills, average entry price calculation, realized PnL per trade
- `rebuildFromFills()` — Reconstruct positions from trade history
- `getUnrealizedPnl()` / `getTotalUnrealizedPnl()` — Mark-to-market valuation

### D. PnL Tracking
- `src/portfolio/pnl_tracker.ts` — Daily PnL statistics in `data/portfolio/daily_stats.json`
- Tracks: daily realized/unrealized PnL, drawdown, trade count, loss limit status
- `checkLossLimit()` — Enforces `maxDailyLossUSDT` from risk policy

### E. Enhanced Risk Guard
- 11 guard rules in priority order:
  1. Live mode always rejected
  2. Blocked instrument types (SWAP/FUTURES/OPTION)
  3. Instrument allowlist
  4. No market orders (limit/post_only only)
  5. Notional limit
  6. Daily trade count limit
  7. Daily loss limit (from PnL tracker)
  8. Human approval requirement with confirmation phrase

### F. Expanded Data Window
- Paginated fetch via `fetchPaginated()` — 100 candles per page, auto-iterate
- Successfully fetched 1000 candles per instrument/bar:
  - BTC-USDT: 1H, 4H, 1D
  - ETH-USDT: 1H, 4H, 1D
  - SOL-USDT: 1H, 4H, 1D
- Total: 9,000 candles across 9 combinations
- Deduplication by timestamp, ascending sort

### G. Parameter Sensitivity Analysis
- `src/research/parameter_sensitivity.ts` — Grid search across parameter combinations
- `src/research/run_sensitivity.ts` — Entry point with strategy-specific grids
- Reports: stability ranking, overfit warning, top-5 parameter sets
- Sample results (BTC-USDT 1H, 1000 candles):
  - MA Crossover: Best -3.18%, stability 0.624
  - RSI Mean Reversion: Best +13.92%, stability 0.223
  - Volatility Breakout: Best +10.55%, stability 0.000

### H. Strategy Admission
- `config/strategy_admission_policy.yaml` — Admission criteria
- `src/research/strategy_admission.ts` — Evaluates strategies against criteria
- Three levels: ADMITTED_TO_DEMO / RESEARCH_ONLY / REJECTED
- All 6 current strategy/instId combos classified as RESEARCH_ONLY or REJECTED
- Primary blockers: insufficient walk-forward windows (< 8), low trade counts (< 30)

### I. Reports Generated
1. `reports/backtest_report.md` — Updated with paginated data
2. `reports/parameter_sensitivity_report.md` — Grid search results
3. `reports/strategy_admission_report.md` — Admission evaluations
4. `reports/phase2_summary.md` — This document

## Test Results

```
Test Files:  5 passed (5)
Tests:       42 passed (42)
Coverage:
  - clOrdId uniqueness: PASS
  - Risk guard rejects live: PASS
  - Risk guard rejects market order: PASS
  - Risk guard rejects oversized order: PASS
  - Risk guard rejects unsupported instrument: PASS
  - Risk guard rejects swaps/futures: PASS
  - PnL loss limit enforcement: PASS
  - Position ledger partial fill: PASS
  - Position ledger PnL calculation: PASS
  - Strategy admission rejects insufficient data: PASS
```

## Safety Status

| Control | Status |
|---------|--------|
| Live trading disabled | ACTIVE |
| Market orders blocked | ACTIVE |
| SWAP/FUTURES/OPTION blocked | ACTIVE |
| Human approval required | ACTIVE |
| Dry-run by default | ACTIVE |
| --execute-demo flag required | ACTIVE |
| EXECUTE_DEMO_ORDER confirmation | ACTIVE |
| Audit logging (all actions) | ACTIVE |
| API keys never in project files | ACTIVE |

## TODO for User

To complete the demo order roundtrip, you must:

1. Configure OKX demo profile (if not already done):
   ```bash
   okx config init
   ```

2. Verify profile exists:
   ```bash
   grep '^\[profiles' ~/.okx/config.toml
   ```

3. The project expects profile name `okx-demo`. Set in `.env`:
   ```
   OKX_PROFILE=okx-demo
   ```

4. Run a demo order roundtrip (after profile configured):
   ```bash
   npm run demo:roundtrip
   ```

## Phase 3 Recommendations

1. **Expand walk-forward windows**: Need 8+ windows for proper admission evaluation
2. **Paper-trade RSI strategy**: Best backtest performer (+13.92% with optimal params)
3. **Add multi-timeframe signals**: Combine 1H/4H/1D signals
4. **Implement signal cooldown**: Prevent overtrading in choppy markets
5. **Add volatility regime filter**: Skip signals in low-volatility environments
6. **Build dashboard**: Real-time signal monitoring web UI
7. **Implement batch order testing**: Run multiple dry-run scenarios automatically
8. **Add order book depth analysis**: Slippage estimation from order book
