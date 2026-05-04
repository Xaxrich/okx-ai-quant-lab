# Supply Scope Reconciliation Report

Generated: 2026-05-04T06:42:40.453Z

## BSB Multi-Chain Supply Assessment

### Known Chains
| Chain | Contract | Explorer | Fetch Status | On-chain Supply |
|-------|----------|----------|:---:|:---:|
| ethereum | 0xDB6Ba5D5... | etherscan | OK | 1000M |
| base | 0x0dc28efb... | basescan | API_NOT_CONFIGURED | NOT FETCHED |
| bsc | 0x595deaad... | bscscan | API_NOT_CONFIGURED | NOT FETCHED |
| mantle | 0xe5c330ad... | mantlescan | MISSING_CONTRACT | NOT FETCHED |

### Key Findings

- Ethereum on-chain total supply: 1000M
- CMC circulating supply: 208M
- **CMC circulating / Ethereum on-chain: 21%**
- CMC total_supply: 1000M
- **CMC circulating / CMC total: 21%**

### Does supply overhang still exist?

**Yes — with reduced confidence.**

- Ethereum on-chain supply (1B) matches CMC total_supply (1B). This agreement between independent sources suggests 1B is the canonical total supply.
- CMC circulating supply (207.75M) represents ~20.8% of total.
- ~792M tokens (79.2%) are not currently circulating.

### Confidence: LOW_TO_MEDIUM

Reasons for reduced confidence:
- Base chain supply NOT verified (API key/config needed)
- BSC chain supply NOT verified
- Cannot confirm whether multi-chain supplies overlap (bridged tokens)
- No unlock schedule data — cannot determine if/when non-circulating tokens enter circulation
- Single-chain scope dominant (Ethereum) but token is multi-chain

### What CANNOT be concluded
- Cannot conclude that 792M tokens will enter circulation
- Cannot conclude that supply dilution is imminent
- Cannot conclude that current holders are at risk of dilution
- Cannot distinguish between locked/vested/treasury/bridged non-circulating supply