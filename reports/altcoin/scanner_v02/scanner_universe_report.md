# Scanner Universe Report

Generated: 2026-05-04T09:41:44.889Z
Tokens: 28

## 1. Summary
| Label | Count |
|-------|:---:|
| STRUCTURAL_RISK_HIGH | 0 |
| WATCH_RISK_HIGH | 0 |
| WATCH_RISK | 2 |
| WATCH | 1 |
| NEED_MORE_DATA | 0 |
| INSUFFICIENT_DEEP_DATA | 8 |
| NO_CURRENT_FLAG | 17 |
| RESEARCH_ONLY | 0 |

## 2. Results by Label

### WATCH_RISK (2)

- **BSB** (current_focus): score=34, dq=1. Supply overhang: circ/total 21%. Scope: MULTICHAIN_PARTIAL.
- **LAB** (current_focus): score=25, dq=1. Supply overhang: circ/total 23%. Scope: SINGLE_CHAIN_ONLY.

### WATCH (1)

- **FLOKI** (meme): score=10, dq=1. DEX_SELL_PRESSURE

### INSUFFICIENT_DEEP_DATA (8)

- **POPCAT** (meme): score=15, dq=0.41. Feature coverage insufficient (15%). Missing: price_features_90d, dex_aggregation, supply_scope, buy_sell_txns.
- **TURBO** (meme): score=15, dq=0.41. Feature coverage insufficient (15%). Missing: price_features_90d, dex_aggregation, supply_scope, buy_sell_txns.
- **FET** (ai): score=15, dq=0.64. Feature coverage insufficient (40%). Missing: price_features_90d, dex_aggregation, buy_sell_txns.
- **RNDR** (ai): score=10, dq=0.51. Feature coverage insufficient (35%). Missing: price_features_90d, supply_scope, cmc_supply_fields.
- **VIRTUAL** (ai): score=15, dq=0.41. Feature coverage insufficient (15%). Missing: price_features_90d, dex_aggregation, supply_scope, buy_sell_txns.
- **ARB** (control): score=0, dq=0.76. Feature coverage insufficient (60%). Missing: supply_scope, cmc_supply_fields.
- **OP** (control): score=0, dq=0.76. Feature coverage insufficient (60%). Missing: supply_scope, cmc_supply_fields.
- **PEOPLE** (control): score=0, dq=0.76. Feature coverage insufficient (60%). Missing: supply_scope, cmc_supply_fields.

### NO_CURRENT_FLAG (17)

- **PEPE** (meme): score=0, dq=1. No flags triggered.
- **WIF** (meme): score=0, dq=0.85. No flags triggered.
- **BONK** (meme): score=0, dq=1. No flags triggered.
- **DOGE** (meme): score=0, dq=0.92. No flags triggered.
- **SHIB** (meme): score=0, dq=1. No flags triggered.
- **TAO** (ai): score=0, dq=0.77. No flags triggered.
- **PENDLE** (defi): score=0, dq=0.85. No flags triggered.
- **ONDO** (defi): score=0, dq=0.85. No flags triggered.
- **ENA** (defi): score=0, dq=0.85. No flags triggered.
- **JUP** (defi): score=0, dq=0.85. No flags triggered.
- **PYTH** (defi): score=0, dq=0.85. No flags triggered.
- **SEI** (l1): score=0, dq=0.77. No flags triggered.
- **SUI** (l1): score=0, dq=0.77. No flags triggered.
- **TIA** (l1): score=0, dq=0.77. No flags triggered.
- **BTC** (control): score=0, dq=0.92. No flags triggered.
- **ETH** (control): score=0, dq=0.92. No flags triggered.
- **SOL** (control): score=0, dq=0.92. No flags triggered.

## 3. Results by Category

- **current_focus** (2): avg score=30, avg dq=1.00
- **meme** (8): avg score=5, avg dq=0.82
- **ai** (4): avg score=10, avg dq=0.58
- **defi** (5): avg score=0, avg dq=0.85
- **l1** (3): avg score=0, avg dq=0.77
- **control** (6): avg score=0, avg dq=0.84

## 4. Data Quality Matrix

| Token | CG ID | CMC ID | Contract | DEX Pairs | Supply | DQ Score |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| BSB | ✅ | ✅ | ✅ | ✅ | ✅ | 1 |
| LAB | ✅ | ✅ | ✅ | ✅ | ✅ | 1 |
| PEPE | ✅ | ✅ | ✅ | ✅ | ✅ | 1 |
| WIF | ✅ | ✅ | ✅ | ✅ | ✅ | 0.85 |
| BONK | ✅ | ✅ | ✅ | ✅ | ✅ | 1 |
| FLOKI | ✅ | ✅ | ✅ | ✅ | ✅ | 1 |
| DOGE | ✅ | ✅ | ❌ | ❌ | ✅ | 0.92 |
| SHIB | ✅ | ✅ | ✅ | ✅ | ✅ | 1 |
| POPCAT | ✅ | ✅ | ❌ | ❌ | ✅ | 0.41 |
| TURBO | ✅ | ✅ | ❌ | ❌ | ✅ | 0.41 |
| FET | ✅ | ✅ | ✅ | ❌ | ✅ | 0.64 |
| RNDR | ✅ | ❌ | ✅ | ✅ | ❌ | 0.51 |
| TAO | ✅ | ✅ | ❌ | ❌ | ✅ | 0.77 |
| VIRTUAL | ✅ | ✅ | ❌ | ❌ | ✅ | 0.41 |
| PENDLE | ✅ | ✅ | ✅ | ✅ | ✅ | 0.85 |
| ONDO | ✅ | ✅ | ✅ | ✅ | ✅ | 0.85 |
| ENA | ✅ | ✅ | ✅ | ✅ | ✅ | 0.85 |
| JUP | ✅ | ✅ | ✅ | ✅ | ✅ | 0.85 |
| PYTH | ✅ | ✅ | ✅ | ✅ | ✅ | 0.85 |
| SEI | ✅ | ✅ | ❌ | ❌ | ✅ | 0.77 |
| SUI | ✅ | ✅ | ❌ | ❌ | ✅ | 0.77 |
| TIA | ✅ | ✅ | ❌ | ❌ | ✅ | 0.77 |
| BTC | ✅ | ✅ | ❌ | ❌ | ✅ | 0.92 |
| ETH | ✅ | ✅ | ❌ | ❌ | ✅ | 0.92 |
| SOL | ✅ | ✅ | ❌ | ❌ | ✅ | 0.92 |
| ARB | ✅ | ✅ | ✅ | ✅ | ✅ | 0.76 |
| OP | ✅ | ✅ | ✅ | ✅ | ✅ | 0.76 |
| PEOPLE | ✅ | ✅ | ✅ | ✅ | ✅ | 0.76 |

## 6. Derivatives Research Layer (READ-ONLY)

**This section does NOT affect the main score or label. Derivatives signals are research-only.**

| Token | OI Days | Research Label | Confidence | Key Evidence |
|-------|:---:|------|:---:|------|
| BSB | 2026-04-25 | DERIVATIVES_OVERHEATED_LATE | LOW | OI confirm=0d overheat=3d |
| LAB | 2026-04-23 | DERIVATIVES_CONFIRMATION_ONLY | LOW | OI confirm=0d overheat=0d |
| PEPE | 2026-01-03 | NO_DERIVATIVES_SIGNAL | LOW | OI confirm=0d overheat=0d |
| WIF | 2026-01-05 | NO_DERIVATIVES_SIGNAL | LOW | OI confirm=0d overheat=0d |
| BONK | 2026-07-15 | NO_DERIVATIVES_SIGNAL | LOW | OI confirm=0d overheat=0d |
| FLOKI | 2026-03-01 | DERIVATIVES_OVERHEATED_LATE | LOW | OI confirm=-9d overheat=4d |

**Interpretation guide:**
- OI_CONFIRMATION_ONLY = OI rose with price, confirming trend
- DERIVATIVES_OVERHEATED_LATE = OI/funding extreme near peak — risk proxy
- NO_DERIVATIVES_SIGNAL = no significant OI anomaly detected
- These signals do NOT confirm 'whale positioning' or 'smart money accumulation'
- OKX is a single exchange. Multi-exchange OI may differ.
- No long/short or taker volume data available for direction confirmation.


## 5. Scanner Status

**LIMITED_SNAPSHOT_SCANNER**

- 28 tokens scored. DEX: 28. Supply: 28.
- No historical DEX/supply tracking. No on-chain holder data. No social data.

## 7. Disclaimer

RESEARCH ONLY. No trading recommendations. Labels are risk indicators, not predictions.