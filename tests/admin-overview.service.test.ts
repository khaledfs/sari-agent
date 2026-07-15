import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));
vi.mock("@/lib/jwt", () => ({
  signAuthToken: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

import {
  isLowStock,
  isRevenueCountedStatus,
  lastEightWeekStarts,
  startOfDay,
  weekBucketIndex,
} from "@/services/admin-overview.service";

describe("isRevenueCountedStatus (status inclusion rules)", () => {
  it.each(["pending", "confirmed", "packed", "out_for_delivery", "delivered"])(
    "%s counts toward revenue",
    (status) => {
      expect(isRevenueCountedStatus(status)).toBe(true);
    }
  );

  it.each(["cancelled", "CANCELLED", "refunded", "rejected", "failed", "returned", "voided"])(
    "%s is excluded",
    (status) => {
      expect(isRevenueCountedStatus(status)).toBe(false);
    }
  );

  it("unknown statuses count (an order exists until cancelled)", () => {
    expect(isRevenueCountedStatus("weird_status")).toBe(true);
  });
});

describe("sparkline date bucketing", () => {
  it("produces 8 Monday week-starts, oldest first, ending with the current week", () => {
    // 2026-07-15 is a Wednesday; its week starts Monday 2026-07-13.
    const starts = lastEightWeekStarts(new Date("2026-07-15T12:34:56"));
    expect(starts).toHaveLength(8);
    for (const d of starts) {
      expect(d.getDay()).toBe(1); // Monday
      expect(d.getHours()).toBe(0);
    }
    expect(starts[7].getDate()).toBe(13);
    expect(starts[7].getMonth()).toBe(6); // July
    // Consecutive weeks, 7 days apart.
    for (let i = 1; i < starts.length; i += 1) {
      expect(starts[i].getTime() - starts[i - 1].getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it("handles a Sunday 'now' (week starts the previous Monday)", () => {
    // 2026-07-19 is a Sunday → current week start = Monday 2026-07-13.
    const starts = lastEightWeekStarts(new Date("2026-07-19T08:00:00"));
    expect(starts[7].getDate()).toBe(13);
  });

  it("weekBucketIndex maps dates into the right bucket", () => {
    const starts = lastEightWeekStarts(new Date("2026-07-15T12:00:00"));
    expect(weekBucketIndex(new Date("2026-07-15T09:00:00"), starts)).toBe(7); // current week
    expect(weekBucketIndex(new Date("2026-07-12T23:59:59"), starts)).toBe(6); // previous week
    expect(weekBucketIndex(starts[0], starts)).toBe(0); // exact boundary is inclusive
    expect(weekBucketIndex(new Date("2020-01-01T00:00:00"), starts)).toBe(-1); // out of range
  });

  it("startOfDay zeroes the time", () => {
    const d = startOfDay(new Date("2026-07-15T18:45:12"));
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    expect(d.getDate()).toBe(15);
  });
});

describe("isLowStock predicate", () => {
  it("null/undefined stock is never low (untracked)", () => {
    expect(isLowStock(null, 10)).toBe(false);
    expect(isLowStock(undefined, 10)).toBe(false);
  });

  it("tracked stock at/below threshold is low; above is not", () => {
    expect(isLowStock(0, 10)).toBe(true);
    expect(isLowStock(10, 10)).toBe(true);
    expect(isLowStock(11, 10)).toBe(false);
  });
});
