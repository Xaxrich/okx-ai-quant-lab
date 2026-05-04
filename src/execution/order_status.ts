import { okxJson } from "../connectors/okx_cli.js";
import { AuditLogger } from "../audit/logger.js";
import type { OrderStatusResult, OrderState } from "./order_types.js";

const audit = new AuditLogger();

export async function queryOrderByClOrdId(
  clOrdId: string,
  instId: string,
  profile: string = "okx-demo"
): Promise<OrderStatusResult | null> {
  const args = ["trade", "order", instId, "--clOrdId", clOrdId, "--profile", profile];
  const result = await okxJson(args);

  if (!result.ok) {
    audit.logSystem("order_status_query_clOrdId", { clOrdId }, null, result.stderr);
    return null;
  }

  const data = result.data as Record<string, string>[];
  if (!Array.isArray(data) || data.length === 0) return null;

  const order = data[0];
  const statusResult: OrderStatusResult = {
    ordId: order.ordId ?? "",
    clOrdId: order.clOrdId ?? clOrdId,
    instId: order.instId ?? instId,
    state: (order.state ?? "live") as OrderState,
    sz: order.sz ?? "0",
    fillSz: order.fillSz ?? "0",
    avgPx: order.avgPx ?? "0",
    fee: order.fee ?? "0",
    feeCcy: order.feeCcy ?? "",
    pnl: order.pnl ?? "0",
    createTime: order.cTime ?? "",
    updateTime: order.uTime ?? "",
  };

  audit.logSystem("order_status_result", { clOrdId }, statusResult);
  return statusResult;
}

export async function queryOrderByOrdId(
  ordId: string,
  instId: string,
  profile: string = "okx-demo"
): Promise<OrderStatusResult | null> {
  const args = ["trade", "order", instId, "--ordId", ordId, "--profile", profile];
  const result = await okxJson(args);

  if (!result.ok) {
    audit.logSystem("order_status_query_ordId", { ordId }, null, result.stderr);
    return null;
  }

  const data = result.data as Record<string, string>[];
  if (!Array.isArray(data) || data.length === 0) return null;

  const order = data[0];
  const statusResult: OrderStatusResult = {
    ordId: order.ordId ?? ordId,
    clOrdId: order.clOrdId ?? "",
    instId: order.instId ?? instId,
    state: (order.state ?? "live") as OrderState,
    sz: order.sz ?? "0",
    fillSz: order.fillSz ?? "0",
    avgPx: order.avgPx ?? "0",
    fee: order.fee ?? "0",
    feeCcy: order.feeCcy ?? "",
    pnl: order.pnl ?? "0",
    createTime: order.cTime ?? "",
    updateTime: order.uTime ?? "",
  };

  audit.logSystem("order_status_result", { ordId }, statusResult);
  return statusResult;
}

export async function cancelOrderByClOrdId(
  clOrdId: string,
  instId: string,
  profile: string = "okx-demo"
): Promise<{ cancelled: boolean; ordId?: string; error?: string }> {
  const args = ["trade", "cancel", instId, "--clOrdId", clOrdId, "--profile", profile];
  const result = await okxJson(args);

  if (!result.ok) {
    audit.logSystem("order_cancel_clOrdId", { clOrdId, instId }, null, result.stderr);
    return { cancelled: false, error: result.stderr };
  }

  const data = result.data as { ordId?: string }[];
  const ordId = Array.isArray(data) && data.length > 0 ? data[0].ordId : undefined;

  audit.logSystem("order_cancel_result", { clOrdId, instId }, { ordId });
  return { cancelled: true, ordId };
}

export function formatOrderStatus(s: OrderStatusResult): string {
  return [
    `Order: ${s.ordId}`,
    `  State:    ${s.state}`,
    `  Size:     ${s.sz}`,
    `  Filled:   ${s.fillSz}`,
    `  Avg Px:   ${s.avgPx}`,
    `  Fee:      ${s.fee} ${s.feeCcy}`,
    `  PnL:      ${s.pnl}`,
    `  Created:  ${new Date(parseInt(s.createTime)).toISOString()}`,
  ].join("\n");
}
