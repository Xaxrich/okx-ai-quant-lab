# CoinGecko AI Integration Boundary

## 1. Three Integration Methods — Three Different Purposes

| Method | Purpose | Used In | NOT Used For |
|--------|---------|---------|-------------|
| **SKILL** | API knowledge injection, code generation | Claude Code writing TypeScript pipelines | Runtime scoring, data persistence |
| **MCP** | Real-time spot queries, token ID resolution, anomaly复核 | Ad-hoc research, debugging | Batch history, formal scanner reports |
| **Pro API** | Historical data, batch pipeline, cache/queue | `fetch_missing_price_features.ts`, `batch_fetch_universe_data.ts` | Real-time queries, interactive use |

## 2. SKILL Usage

The CoinGecko SKILL teaches Claude Code:
- Which endpoints exist and their parameters
- How to construct correct API calls
- SDK best practices for TypeScript

**SKILL informs code generation.** It does NOT execute data queries at runtime.

Example flow:
```
User: "Add historical volume to the scanner"
Claude Code: reads SKILL → learns /coins/{id}/market_chart endpoint
Claude Code: writes TypeScript using Pro API + local cache
```

## 3. MCP Usage

The CoinGecko MCP server provides interactive access for:

- **Token identity resolution**: "What's the CoinGecko ID for this contract?"
- **Spot checks**: "Show me PEPE's current price and 24h volume"
- **Anomaly复核**: "BSB showed a supply anomaly on Apr 29. Does CoinGecko MCP show the same market cap?"
- **Quick research**: "List all tokens on Solana with market cap > $100M"

**MCP does NOT feed into the formal scanner pipeline.** Scanner results must come from the local cache + API pipeline to ensure reproducibility.

## 4. Pro API Usage (Primary Data Pipeline)

All batch data flows through the Pro API → local cache pipeline:

```
CoinGecko Pro API
    ↓ (fetch_missing_price_features.ts)
Local cache (data/altcoin/scanner_v02/cache/price_features/)
    ↓ (score_universe.ts)
Scanner features (data/altcoin/scanner_v02/features/)
    ↓
Scanner report (reports/altcoin/scanner_v02/)
```

**Why not use MCP for batch?**
- MCP results are not cached locally
- MCP calls cannot be replayed for audit
- MCP rate limits are not designed for batch workloads
- MCP adds an unnecessary abstraction layer for pipeline code

## 5. Decision Rules

| Scenario | Use |
|----------|-----|
| Writing pipeline code | SKILL |
| Checking a token's current price | MCP |
| Pulling 90d history for 28 tokens | Pro API |
| Generating daily scanner report | Local cache + Pro API |
| Investigating an anomaly | MCP + Pro API cross-verification |
| Resolving a token's CoinGecko ID | MCP |
| Building features for backtesting | Pro API → local cache |

## 6. API Key Management

- `COINGECKO_PRO_API_KEY` → `.env` (gitignored)
- `COINGECKO_DEMO_API_KEY` → `.env` (gitignored)
- Keys NEVER in source code, reports, or logs
- `coingecko_auth.ts` reads from `process.env` only
- Security check verifies no keys leak into commits
