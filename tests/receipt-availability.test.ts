import { describe, expect, it } from "vitest";

import { ADMIN_ORDER_STATUSES, isOrderCollectible, isReceiptAvailable } from "@/lib/order-status";

describe("isReceiptAvailable (Work Order Issue 1 rule)", () => {
  const expected: Record<string, boolean> = {
    pending: false,
    confirmed: false,
    packed: false,
    out_for_delivery: true, // dispatched-equivalent in this app
    delivered: true,
    cancelled: false, // never qualifies
  };

  it("covers every canonical status exactly", () => {
    expect(Object.keys(expected).sort()).toEqual([...ADMIN_ORDER_STATUSES].sort());
  });

  it.each(ADMIN_ORDER_STATUSES.map((s) => [s, expected[s]] as const))(
    "%s → %s",
    (status, available) => {
      expect(isReceiptAvailable(status)).toBe(available);
    }
  );

  it("is tolerant of casing/whitespace (free-form status field)", () => {
    expect(isReceiptAvailable(" OUT_FOR_DELIVERY ")).toBe(true);
    expect(isReceiptAvailable("Delivered")).toBe(true);
    expect(isReceiptAvailable(" PENDING ")).toBe(false);
  });

  it("unknown/empty statuses stay locked", () => {
    expect(isReceiptAvailable("")).toBe(false);
    expect(isReceiptAvailable("shipped")).toBe(false);
    expect(isReceiptAvailable(undefined as unknown as string)).toBe(false);
  });
});

describe("isOrderCollectible (agent-collection rule)", () => {
  const expected: Record<string, boolean> = {
    pending: false, // pre-approval → not yet collectible
    confirmed: true, // approved
    packed: true,
    out_for_delivery: true,
    delivered: true, // a delivered, uncollected order IS collectible
    cancelled: false, // never
  };

  it("covers every canonical status exactly", () => {
    expect(Object.keys(expected).sort()).toEqual([...ADMIN_ORDER_STATUSES].sort());
  });

  it.each(ADMIN_ORDER_STATUSES.map((s) => [s, expected[s]] as const))("%s → %s", (status, collectible) => {
    expect(isOrderCollectible(status)).toBe(collectible);
  });

  it("casing/whitespace tolerant; unknown/empty are not collectible", () => {
    expect(isOrderCollectible(" DELIVERED ")).toBe(true);
    expect(isOrderCollectible("Confirmed")).toBe(true);
    expect(isOrderCollectible("")).toBe(false);
    expect(isOrderCollectible("shipped")).toBe(false);
  });
});
