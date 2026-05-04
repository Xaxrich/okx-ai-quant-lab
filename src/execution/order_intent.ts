export interface OrderIntent {
  ts: number;
  instId: string;
  side: "buy" | "sell";
  sz: string;
  px?: string;
  ordType: "market" | "limit" | "post_only";
  notionalUSDT: number;
  strategyName: string;
  signalReason: string;
}

export function createOrderIntent(params: {
  ts: number;
  instId: string;
  side: "buy" | "sell";
  sz: string;
  px?: string;
  ordType: "market" | "limit" | "post_only";
  notionalUSDT: number;
  strategyName: string;
  signalReason: string;
}): OrderIntent {
  return { ...params };
}

export function orderIntentToDisplay(intent: OrderIntent): string {
  const lines = [
    "═══════════════════════════════════════",
    "  ORDER INTENT",
    "═══════════════════════════════════════",
    `  Timestamp:     ${new Date(intent.ts).toISOString()}`,
    `  Instrument:    ${intent.instId}`,
    `  Side:          ${intent.side.toUpperCase()}`,
    `  Order Type:    ${intent.ordType.toUpperCase()}`,
    `  Size:          ${intent.sz}`,
    intent.px ? `  Price:         ${intent.px}` : "  Price:         MARKET",
    `  Notional:      $${intent.notionalUSDT.toFixed(2)}`,
    `  Strategy:      ${intent.strategyName}`,
    `  Reason:        ${intent.signalReason}`,
    "═══════════════════════════════════════",
  ];
  return lines.join("\n");
}
