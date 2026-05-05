# Arkham Control Transfer Diagnosis Report

Generated: 2026-05-05T06:30:01.658Z

## 1. Executive Summary

**NOT_READY_FOR_OPEN_DISCOVERY**
Calendar-matched: READY=0 PARTIAL=0 EMPTY=56 FUTURE=16
Pseudo-event: EMPTY
Control parsed transfers: 0

## 2. Probe Matrix Findings

All parameter combinations (contract_sec, contract_ms, pricing_id_sec, pricing_id_ms) return data for all control tokens.
The transfer endpoint is NOT the root cause — time unit and token identifier type both work.

## 3. Root Cause

Phase 6.4G re-extracted P0 + controls in a single loop.
P0 extraction consumes ~108 API calls (3 tokens × 6 segments × 2 dirs × 3 pages).
Control token extraction then hits rate limits or takes too long.

FIX: Reuse existing Phase 6.4F P0 data. Extract only control tokens.
Also fix: segment_start/end blank, future windows not separated.

## 4. Control Extraction Results

Calendar-matched: 0 READY, 0 PARTIAL, 56 EMPTY, 16 FUTURE
Pseudo-event: NO DATA

## 5. What Was Wrong in 6.4G

- P0 + controls extracted together → rate limiting emptied control segments
- segment_start/end fields were blank in feature table
- Future windows not distinguished from real empty windows
- Summary overstated structural difference when validation was insufficient

## 6. Current Status

**NOT_READY_FOR_OPEN_DISCOVERY**

## 7. Paid Decision

**CANCEL_ARKHAM_KEEP_LOCAL_ASSETS** or **EXTEND_TRIAL_OR_NEGOTIATE**
- Transfer entity features are the strongest Arkham capability
- But top_flow still broken, control validation still limited
- Do NOT pay $1,500 without top_flow resolution

## 8. What We Cannot Know

- Cannot confirm accumulation/distribution
- Cannot confirm buy/sell intent
- Cannot infer causality
- No trading recommendation