# Candidate Structure Validation Report

Generated: 2026-05-04T08:48:41.682Z

## Summary

| Structure | Classification | Decision | Pos Rate | Ctrl Rate | Avg Lead | Fwd DD 7d | Triggers |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| VOLUME_COMPRESSION | LAGGING | NEED_MORE_DATA | 2.2% | 2.9% | 31.5d | 6.4% | 45 |
| QUIET_BREAKOUT | SYNCHRONOUS | KEEP_AS_CONFIRMATION | 1.1% | 0.4% | 0.7d | 8.3% | 9 |
| VOLUME_EXPANSION | INSUFFICIENT_DATA | NEED_MORE_DATA | 0.0% | 0.0% | 0.0d | 0.0% | 0 |
| EFFICIENCY_DECAY | INSUFFICIENT_DATA | NEED_MORE_DATA | 0.0% | 0.0% | 0.0d | 0.0% | 0 |
| SUPPLY_OVERHANG | INSUFFICIENT_DATA | NEED_MORE_DATA | 0.0% | 0.0% | 0.0d | 0.0% | 0 |
| DEX_LIQUIDITY_FRAGILITY | NOISE | REJECT_HIGH_FALSE_POSITIVE | 11.6% | 54.5% | -5.5d | 6.0% | 764 |

## What We Still Cannot Know

- Cannot confirm real accumulation (no holder time-series)
- Cannot confirm real distribution (no transfer-to-CEX data)
- Cannot assess derivatives positioning (no OI/funding data)
- All findings are correlations, not causal proof
- N=6 positive samples — statistically insufficient