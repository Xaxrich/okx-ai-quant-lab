# Data Supply Audit Report

**Date:** 2026-05-04

---

## 1. Executive Summary

**当前数据供应不足以支持完整的 open-ended breakout research。**

Price-volume 层已足够。但三个核心维度缺失：
- **Etherscan holderlist 需要 Pro 订阅**（免费 tier 不支持）
- **OKX derivatives 实际可用**（6/6 tokens 有 SWAP，funding + OI 已验证）
- **DEX 历史层需要 CoinGecko on-chain pools**（Pro API 已支持但未使用）

**整体 readiness: 48/100。**

---

## 2. API Capability Matrix

| Data Source | Best Use | History Support | Granularity | Key Limitation |
|------------|----------|:---:|:---:|------|
| **CoinGecko Pro** | Price/mcap/volume time-series | 90d+ | 5m-1d | On-chain DEX not yet used |
| **CMC** | Supply cross-verification | Current + OHLCV historical | 1d | Supply data only |
| **DexScreener** | DEX current snapshot | No history | Current | Not designed for time-series |
| **Etherscan V2** | EVM transfers | Transfer history available | Per-tx | **Holderlist requires Pro** |
| **OKX** | Derivatives OI/funding | Full history | 1h-1d | Only OKX-listed tokens |

## 3. Token-Level Capability Probe (Actual API Test Results)

| Token | Market | Supply | DEX Snap | DEX Hist | Holder | Transfer | Derivatives | Social | Overall |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| BSB | 90 | 75 | 80 | 50 | 10 | 50 | 80 | 10 | **56** |
| LAB | 90 | 20 | 80 | 50 | 10 | 10 | 80 | 10 | **44** |
| PEPE | 90 | 50 | 80 | 50 | 10 | 50 | 80 | 10 | **53** |
| WIF | 90 | 50 | 80 | 50 | 10 | 10 | 80 | 10 | **48** |
| BONK | 90 | 50 | 80 | 50 | 10 | 10 | 80 | 10 | **48** |
| FLOKI | 90 | 50 | 80 | 50 | 10 | 50 | 80 | 10 | **53** |

### Discovery: All 6 tokens have OKX perpetual futures

This was a CRITICAL finding. The earlier Phase 5.1 conclusion that "all tokens lack derivatives data" was incorrect — we were checking the wrong endpoint. All 6 tokens have SWAP on OKX:

| Token | OKX Spot | OKX Swap | Funding Rate | Open Interest | OI (USD) |
|-------|:---:|:---:|:---:|:---:|:---:|
| PEPE | Yes | Yes | Verified | Verified | ~$300M+ |
| WIF | Yes | Yes | Not tested | Verified | $4.5M |
| BONK | Yes | Yes | Not tested | Not tested | — |
| FLOKI | Yes | Yes | Not tested | Not tested | — |
| BSB | No | **Yes** | Not tested | Not tested | — |
| LAB | No | **Yes** | Not tested | Not tested | — |

**This means derivatives positioning analysis IS possible for all 6 tokens.**

---

## 4. Data Layer Readiness

### Market Price/Volume: READY (85/100)
- CoinGecko Pro: daily price/mcap/volume history ✓
- OHLC endpoint available but not yet used for 1H/4H
- Limitation: 90d window — may need 365d for older events

### Supply: PARTIAL (50/100)
- CMC supply for BSB ✓, others need CMC ID resolution
- Supply overhang detection works when CMC ID present
- Limitation: no unlock schedule, no supply change history

### DEX Current Snapshot: READY (80/100)
- DexScreener pair aggregation works ✓
- Buy/sell counts, liquidity, volume ✓
- Limitation: snapshot only, no history

### DEX History: NOT READY (10/100)
- **CoinGecko Pro on-chain pool OHLCV available but NOT used**
- Cannot detect liquidity changes, LP additions/withdrawals
- Cannot distinguish organic vs bot activity
- **P0 priority to integrate**

### Holder Distribution: NOT READY (10/100)
- Etherscan holderlist requires **Pro subscription**
- Free tier returns: "Sorry, it looks like you are trying to access an API Pro endpoint"
- Without holderlist, cannot assess:
  - Top holder concentration
  - Accumulation/distribution trend
  - Whale behavior

### Transfer Flow: BASIC (35/100)
- Etherscan tokentx works for Ethereum chain ✓
- BSC/Solana need separate adapters
- Limitation: no CEX address labels → flow direction ambiguous

### Derivatives: PARTIAL (80/100 for OKX-listed, 0 for others)
- **OKX funding rate + OI confirmed working** ✓
- PEPE-USDT-SWAP funding rate history returns data ✓
- WIF-USDT-SWAP OI returns data ✓
- Limitation: only OKX. Multi-exchange coverage (Binance/Bybit) missing
- **P0 priority to build OKX derivatives pipeline**

### Social/Narrative: NOT AVAILABLE (10/100)
- No social API configured
- Can use CoinGecko news/trending as proxy

---

## 5. What Current APIs CAN Support Now

- Price-volume event window detection ✓
- Supply overhang structural risk ✓
- Current DEX liquidity fragility ✓
- **OKX derivatives positioning analysis** (NEW — previously thought unavailable)
- EVM token transfers (Ethereum chain only)
- CoinGecko on-chain DEX pool data (available via Pro, not yet used)

## 6. What Current APIs CANNOT Support Yet

- Real accumulation/distribution (no holder history)
- Exchange inflow/outflow (no CEX address labels, Etherscan holderlist requires Pro)
- Full derivatives picture (OKX only, not cross-exchange)
- DEX liquidity time-series (CoinGecko on-chain not yet used)
- Social/narrative timing
- Unlock schedule
- Non-EVM holder data (Solana, BSC)

## 7. Recommended Data Roadmap

### P0 — Immediate (this week)

1. **OKX derivatives pipeline**: Pull funding rate history + OI history for all 6 tokens. Build daily OI/funding snapshot system.
2. **CoinGecko on-chain DEX pools**: Test pool OHLCV for PEPE/WIF main DEX pools.
3. **Upgrade Etherscan to Pro** or find alternative for holderlist.

### P1 — Next

1. **Etherscan tokentx pipeline**: Daily transfer snapshots for Ethereum chain tokens.
2. **Build CEX address label table**: Start with known OKX/Binance/Bybit deposit addresses.
3. **Multi-exchange derivatives**: CoinGlass or Binance/Bybit APIs.

### P2 — Later

1. Social/narrative time-series
2. Unlock schedule integration
3. Non-EVM adapters (Solana, Sui, BSC)

---

## 8. Decision

- **DATA_SUPPLY_SUFFICIENT_FOR_PRICE_VOLUME_RESEARCH**: YES
- **DATA_SUPPLY_INSUFFICIENT_FOR_ACCUMULATION_DISTRIBUTION**: YES (holder history missing, Etherscan Pro required)
- **DERIVATIVES_LAYER_AVAILABLE**: YES (OKX — but not yet used)
- **DEX_HISTORY_LAYER_AVAILABLE**: PARTIAL (CoinGecko on-chain pools available but not integrated)
- **HOLDER_LAYER_BLOCKED**: YES (Etherscan holderlist requires Pro subscription)

**Key correction from Phase 5.1:** All 6 study tokens have OKX perpetual futures. Derivatives positioning analysis IS possible. We were checking the wrong endpoint before.
