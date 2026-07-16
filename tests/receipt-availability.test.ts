import { describe, expect, it } from "vitest";

import { ADMIN_ORDER_STATUSES, isReceiptAvailable } from "@/lib/order-status";

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
