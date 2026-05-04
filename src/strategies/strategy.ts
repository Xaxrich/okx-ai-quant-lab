import type { NormalizedCandle } from "../data/fetch_candles.js";

export interface Signal {
  ts: number;
  instId: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reason: string;
  strategyVersion: string;
}

export interface Strategy {
  name: string;
  version: string;
  generate(candles: NormalizedCandle[], instId: string): Signal[];
}

export function holdSignal(ts: number, instId: string, version: string, reason?: string): Signal {
  return {
    ts,
    instId,
    action: "HOLD",
    confidence: 0,
    reason: reason ?? "No signal",
    strategyVersion: version,
  };
}

export function buySignal(
  ts: number,
  instId: string,
  version: string,
  confidence: number,
  reason: string
): Signal {
  return { ts, instId, action: "BUY", confidence, reason, strategyVersion: version };
}

export function sellSignal(
  ts: number,
  instId: string,
  version: string,
  confidence: number,
  reason: string
): Signal {
  return { ts, instId, action: "SELL", confidence, reason, strategyVersion: version };
}
