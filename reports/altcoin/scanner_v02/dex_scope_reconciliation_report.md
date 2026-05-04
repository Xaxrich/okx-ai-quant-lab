# DEX Scope Reconciliation Report

Generated: 2026-05-04T06:42:38.417Z

## Token-Level DEX Summary

| Token | Pairs | Chains | Total Liq | Total Vol 24h | Token Turnover | Primary Turnover | Buy/Sell | Liq Concentration |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| BSB | 8 | 1 | $0.08M | $0.01M | 0.2x | 0.0x | 0.52 | 59% |
| LAB | 10 | 1 | $0.50M | $12.97M | 26.0x | 0.0x | 0.99 | 61% |
| PEPE | 30 | 2 | $30.88M | $0.74M | 0.0x | 0.0x | 0.83 | 91% |
| WIF | 30 | 1 | $5.32M | $0.82M | 0.2x | 0.0x | 0.90 | 92% |
| BONK | 30 | 1 | $2.41M | $1.40M | 0.6x | 0.0x | 0.77 | 37% |

## BSB: The $50K / 123x Turnover Question

- **Original finding (v2):** DEX liquidity $50K, turnover 123x
- **After pair aggregation:** 8 pairs found, total liquidity $0.08M
- Primary pair liquidity: $50K (59% of total)
- **Token-level turnover: 0.2x** (using sum(vol)/sum(liq) — correct methodology)
- Primary pair turnover: 0.0x (using primary vol / primary liq)

**Was the 123x turnover correct?**
No. Token-level turnover is 0.2x — significantly lower than 123x. The original 123x used CMC DEX volume / single pair liquidity, which inflated the ratio.
Total DEX liquidity is $85K — higher than the $50K single-pair estimate.

## Methodology Changes

| Metric | Old (v0.1/v2) | New (v02) |
|--------|:---|:---|
| DEX liquidity | Single top pair | Sum of all discovered pairs |
| DEX volume | CMC DEX volume (aggregated by CMC) | Sum of all pair volumes from DexScreener |
| DEX turnover | CMC vol / single pair liq (INVALID) | total_volume / total_liquidity (valid) |
| Buy/sell ratio | Single pair | Token-level aggregation |