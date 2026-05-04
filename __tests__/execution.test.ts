import { describe, it, expect } from "vitest";
import { createOrderIntent, orderIntentToDisplay } from "../src/execution/order_intent.js";

describe("Order Intent", () => {
  it("creates an order intent with all fields", () => {
    const intent = createOrderIntent({
      ts: 1700000000000,
      instId: "BTC-USDT",
      side: "buy",
      sz: "0.001",
      ordType: "market",
      notionalUSDT: 50,
      strategyName: "MA Crossover",
      signalReason: "Test signal",
    });

    expect(intent.instId).toBe("BTC-USDT");
    expect(intent.side).toBe("buy");
    expect(intent.notionalUSDT).toBe(50);
  });

  it("generates display string", () => {
    const intent = createOrderIntent({
      ts: 1700000000000,
      instId: "ETH-USDT",
      side: "sell",
      sz: "0.01",
      ordType: "limit",
      px: "3500",
      notionalUSDT: 35,
      strategyName: "RSI Reversion",
      signalReason: "Overbought",
    });

    const display = orderIntentToDisplay(intent);
    expect(display).toContain("ETH-USDT");
    expect(display).toContain("SELL");
    expect(display).toContain("3500");
  });
});
