export interface OrderIntent {
  intentId: string;
  createdAt: string;
  profile: string;
  mode: "demo" | "live";
  instId: string;
  tdMode: "cash";
  side: "buy" | "sell";
  ordType: "limit" | "post_only";
  px: string;
  sz: string;
  notionalUSDT: number;
  strategyName: string;
  strategyVersion: string;
  signalId: string;
  reason: string;
  requireHumanApproval: boolean;
  dryRun: boolean;
  metadata: Record<string, unknown>;
}

export type OrderState = "live" | "partially_filled" | "filled" | "cancelled";

export interface OrderExecutionResult {
  intentId: string;
  clOrdId: string;
  ordId: string;
  status: OrderState;
  submittedAt: string;
  exchangeResponse: unknown;
  error?: string;
}

export interface OrderStatusResult {
  ordId: string;
  clOrdId: string;
  instId: string;
  state: OrderState;
  sz: string;
  fillSz: string;
  avgPx: string;
  fee: string;
  feeCcy: string;
  pnl: string;
  createTime: string;
  updateTime: string;
}
