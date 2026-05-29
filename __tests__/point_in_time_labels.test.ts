import { describe, expect, it } from "vitest";
import {
  computeForwardLabel,
  nearestAtOrAfter,
  nearestAtOrBefore,
  parseCoingeckoPriceCache,
  type PricePoint,
} from "../src/altcoin/intelligence/validation/point_in_time_labels.js";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

function point(days: number, price: number): PricePoint {
  return { ts: T0 + days * DAY, price };
}

describe("point-in-time price cache parsing", () => {
  it("keeps valid CoinGecko prices sorted by timestamp", () => {
    const raw = JSON.stringify({
      prices: [
        [T0 + 2 * DAY, "130"],
        ["bad", 1],
        [T0, "100"],
        [T0 + DAY, 0],
      ],
    });

    expect(parseCoingeckoPriceCache(raw)).toEqual([point(0, 100), point(2, 130)]);
  });
});

describe("point-in-time nearest price lookup", () => {
  const points = [point(0, 100), point(1, 110), point(3, 130)];

  it("finds the latest price at or before the observation timestamp", () => {
    expect(nearestAtOrBefore(points, T0 + 2 * DAY)?.price).toBe(110);
  });

  it("rejects stale observation prices beyond max lag", () => {
    expect(nearestAtOrBefore(points, T0 + 2 * DAY, 12 * 60 * 60 * 1000)).toBeNull();
  });

  it("finds the first price at or after the horizon timestamp", () => {
    expect(nearestAtOrAfter(points, T0 + 2 * DAY)?.price).toBe(130);
  });
});

describe("forward return labels", () => {
  it("labels +50% moves as UP_50", () => {
    const label = computeForwardLabel([point(0, 100), point(1, 151)], T0, 1);
    expect(label.status).toBe("OK");
    expect(label.label).toBe("UP_50");
    expect(label.forwardReturn).toBeCloseTo(0.51);
  });

  it("labels +20% moves as UP_20", () => {
    const label = computeForwardLabel([point(0, 100), point(1, 125)], T0, 1);
    expect(label.label).toBe("UP_20");
  });

  it("labels -20% moves as DOWN_20 and keeps drawdown/runup", () => {
    const label = computeForwardLabel([point(0, 100), point(0.5, 115), point(1, 75)], T0, 1);
    expect(label.label).toBe("DOWN_20");
    expect(label.maxRunup).toBeCloseTo(0.15);
    expect(label.maxDrawdown).toBeCloseTo(-0.25);
  });

  it("labels small moves as FLAT", () => {
    const label = computeForwardLabel([point(0, 100), point(1, 105)], T0, 1);
    expect(label.label).toBe("FLAT");
  });

  it("marks unresolved future windows as pending", () => {
    const label = computeForwardLabel([point(0, 100)], T0, 7);
    expect(label.status).toBe("NO_FUTURE_PRICE");
    expect(label.label).toBe("PENDING");
  });
});
