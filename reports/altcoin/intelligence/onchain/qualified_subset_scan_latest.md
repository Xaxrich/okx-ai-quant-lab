# Qualified Subset Chain Scan

Generated: 2026-05-29T09:14:29.604Z

Scope: READY_FOR_DEEP_SCAN long candidates plus RISK_MONITOR_CEX_FLOW short-side research candidates with non-repair directional buckets.

## Long Qualified

| token | side | bucket | gate | confidence | opp | frag | trad | short_exec | blockers | reason | next_action | invalidation |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| CHZ | LONG | LONG_AMBUSH_SCAN | SCAN_ALLOWED | HIGH | 54 | 0 | 77 | NOT_SHORT_CANDIDATE |  | ready gate passed and long ambush bucket is active | deepen entity-flow, liquidity, and invalidation checks before any execution decision | invalidate long if 4h/24h CEX proxy inflow turns positive or holder identity becomes unresolved |

## Short Qualified

| token | side | bucket | gate | confidence | opp | frag | trad | short_exec | blockers | reason | next_action | invalidation |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| ENA | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 3 | 50 | 67 | SHORT_EXEC_READY | COINGLASS_OI_INCOMPLETE | short setup passed directionally but execution gate is not clean | keep on short watchlist; do not approve short execution | invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong |
| WLD | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 50 | 93 | SHORT_EXEC_READY | COINGLASS_OI_INCOMPLETE | short setup passed directionally but execution gate is not clean | keep on short watchlist; do not approve short execution | invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong |
| H | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 56 | 85 | SHORT_WATCH_ONLY | COINGLASS_OI_INCOMPLETE | short setup passed directionally but execution gate is not clean | keep on short watchlist; do not approve short execution | invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong |
| BSB | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 100 | 85 | SHORT_WATCH_ONLY | COINGLASS_AGAINST_SHORT | short setup passed directionally but execution gate is not clean | keep on short watchlist; do not approve short execution | invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong |
| INJ | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 50 | 77 | SHORT_WATCH_ONLY | COINGLASS_AGAINST_SHORT | short setup passed directionally but execution gate is not clean | keep on short watchlist; do not approve short execution | invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong |
| LIT | SHORT | SHORT_SETUP_SCAN | SCAN_ALLOWED | MEDIUM | 0 | 56 | 77 | SHORT_EXEC_READY |  | short setup passed directional and execution gates | send to pre-trade risk review | invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong |
| SAHARA | SHORT | SHORT_SETUP_SCAN | SCAN_ALLOWED | MEDIUM | 0 | 50 | 67 | SHORT_EXEC_READY |  | short setup passed directional and execution gates | send to pre-trade risk review | invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong |
| RAVE | SHORT | SHORT_SETUP_SCAN | SCAN_ALLOWED | MEDIUM | 0 | 50 | 67 | SHORT_EXEC_READY |  | short setup passed directional and execution gates | send to pre-trade risk review | invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong |
| AI | SHORT | SHORT_SETUP_SCAN | WATCH_ONLY | MEDIUM | 0 | 100 | 67 | SHORT_WATCH_ONLY | COINGLASS_AGAINST_SHORT | short setup passed directionally but execution gate is not clean | keep on short watchlist; do not approve short execution | invalidate short if CEX proxy flow flips neutral/outflow and opportunity/tradability remain strong |

## Excluded Repair / No Direction

| token | side | bucket | gate | confidence | opp | frag | trad | short_exec | blockers | reason | next_action | invalidation |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| LAB | NONE | EXCLUDED_DATA_REPAIR | REPAIR_ONLY | LOW | 48 | 38 | 93 | NOT_SHORT_CANDIDATE |  | readiness gate is not clean | repair coverage, labels, or holder identity before directional scanning | re-run scan-cycle after data repair or fresh onchain sample |
| BILL | NONE | EXCLUDED_DATA_REPAIR | REPAIR_ONLY | LOW | 31 | 6 | 75 | NOT_SHORT_CANDIDATE |  | readiness gate is not clean | repair coverage, labels, or holder identity before directional scanning | re-run scan-cycle after data repair or fresh onchain sample |
| OP | NONE | EXCLUDED_DATA_REPAIR | REPAIR_ONLY | LOW | 25 | 8 | 49 | NOT_SHORT_CANDIDATE |  | readiness gate is not clean | repair coverage, labels, or holder identity before directional scanning | re-run scan-cycle after data repair or fresh onchain sample |
| ALLO | NONE | EXCLUDED_DATA_REPAIR | REPAIR_ONLY | LOW | 19 | 76 | 85 | NOT_SHORT_CANDIDATE |  | readiness gate is not clean | repair coverage, labels, or holder identity before directional scanning | re-run scan-cycle after data repair or fresh onchain sample |
| ARB | NONE | EXCLUDED_DATA_REPAIR | REPAIR_ONLY | LOW | 11 | 50 | 77 | NOT_SHORT_CANDIDATE |  | readiness gate is not clean | repair coverage, labels, or holder identity before directional scanning | re-run scan-cycle after data repair or fresh onchain sample |
| UB | NONE | EXCLUDED_DATA_REPAIR | REPAIR_ONLY | LOW | 10 | 46 | 85 | NOT_SHORT_CANDIDATE |  | readiness gate is not clean | repair coverage, labels, or holder identity before directional scanning | re-run scan-cycle after data repair or fresh onchain sample |
| BEAT | NONE | EXCLUDED_DATA_REPAIR | REPAIR_ONLY | LOW | 8 | 8 | 85 | NOT_SHORT_CANDIDATE |  | readiness gate is not clean | repair coverage, labels, or holder identity before directional scanning | re-run scan-cycle after data repair or fresh onchain sample |
| EDEN | NONE | EXCLUDED_DATA_REPAIR | REPAIR_ONLY | LOW | 5 | 20 | 67 | NOT_SHORT_CANDIDATE |  | readiness gate is not clean | repair coverage, labels, or holder identity before directional scanning | re-run scan-cycle after data repair or fresh onchain sample |
| RIVER | NONE | EXCLUDED_DATA_REPAIR | REPAIR_ONLY | LOW | 2 | 24 | 67 | NOT_SHORT_CANDIDATE |  | readiness gate is not clean | repair coverage, labels, or holder identity before directional scanning | re-run scan-cycle after data repair or fresh onchain sample |

## Guardrails

- This report is a scan scope, not an order ticket.
- DATA_REPAIR rows are deliberately excluded from opportunity output.
- SHORT_SETUP rows still require the short execution gate before pre-trade review.