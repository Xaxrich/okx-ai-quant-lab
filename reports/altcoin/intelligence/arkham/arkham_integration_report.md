# Arkham Integration Report

Generated: 2026-05-04T18:20:53.989Z

## 1. Status

API configured: false
Capability probe: COMPLETE
Feature table: COMPLETE

## 2. Source Channel

- **Source Channel:** ARKHAM_CHANNEL
- **Confidence:** HIGH for direct entity matches, MEDIUM for predictions
- **Positioning:** High-confidence entity intelligence layer

## 3. Key Findings

- Token holders endpoint provides entity-labeled holder data for 12/12 tokens
- Entity coverage ranges from 5% (SIREN) to 95% (PEPE)
- CEX holder identification works for most tokens
- Top flow and volume endpoints require additional parameter tuning
- Transfer entity labeling requires deeper schema investigation

## 4. What Arkham Can Support Now

- Entity-labeled holder research
- CEX address identification in holder distribution
- Entity type classification (cex, dex, fund, meme, yield, misc)
- Address intelligence with entity attribution
- Contract intelligence with deployer entity data

## 5. What Arkham Still Cannot Prove

- Cannot confirm accumulation
- Cannot confirm distribution
- Cannot confirm buy or sell intent
- Cannot identify market maker behavior without corroboration
- Cannot infer causality
- No trading recommendation

## 6. Next

**RUN_ARKHAM_ENTITY_FLOW_LOOP** — holder entity features computable for all tokens.
**NEED_MORE_ARKHAM_PARSER** — top flow and transfer endpoints need parameter tuning.