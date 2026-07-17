import { describe, expect, it } from "vitest";

import { ADMIN_ORDER_STATUSES } from "@/lib/order-status";
import {
  ADJUSTABLE_STATUSES,
  adjustmentDelta,
  assertValidSupplied,
  isOrderAdjustable,
  recomputeOrderTotal,
  stockShortage,
  suppliedQty,
  suppliedSubtotal,
  thresholdWarnings,
  type AdjustableLine,
} from "@/lib/order-adjustment";

describe("supplied-quantity adjustment rules (warehouse shortage)", () => {
  describe("assertValidSupplied — decrease-only, 0..ordered", () => {
    it("rejects supplying MORE than ordered (that's a new order, not an adjustment)", () => {
      expect(() => assertValidSupplied(10, 11)).toThrow(/exceed the ordered quantity/);
    });
    it("rejects negatives and non-integers", () => {
      expect(() => assertValidSupplied(10, -1)).toThrow(/non-negative whole number/);
      expect(() => assertValidSupplied(10, 2.5)).toThrow(/non-negative whole number/);
    });
    it("allows 0 (line not supplied at all) up to the ordered quantity", () => {
      expect(() => assertValidSupplied(10, 0)).not.toThrow();
      expect(() => assertValidSupplied(10, 9)).not.toThrow();
      expect(() => assertValidSupplied(10, 10)).not.toThrow();
    });
  });

  describe("suppliedQty — defaults to ordered", () => {
    it("uses ordered when supplied is absent", () => {
      expect(suppliedQty({ quantity: 10 })).toBe(10);
      expect(suppliedQty({ quantity: 10, suppliedQuantity: undefined })).toBe(10);
    });
    it("uses supplied when present (including 0 — a kept, un-supplied line)", () => {
      expect(suppliedQty({ quantity: 10, suppliedQuantity: 0 })).toBe(0);
      expect(suppliedQty({ quantity: 10, suppliedQuantity: 9 })).toBe(9);
    });
  });

  describe("recomputeOrderTotal — from supplied at the SNAPSHOT price", () => {
    const lines: AdjustableLine[] = [
      { price: 100, quantity: 10 }, // supplied defaults to 10
      { price: 50, quantity: 4, suppliedQuantity: 2 },
    ];
    it("uses supplied quantities, never recomputing the unit price", () => {
      // 100*10 + 50*2 = 1100
      expect(suppliedSubtotal(lines)).toBe(1100);
      expect(recomputeOrderTotal(lines)).toBe(1100);
    });
    it("supplied=0 removes that line's value but never deletes it from the math", () => {
      const withZero: AdjustableLine[] = [{ price: 100, quantity: 10, suppliedQuantity: 0 }];
      expect(recomputeOrderTotal(withZero)).toBe(0);
    });
    it("keeps the promotion discount (a shortage never revokes it) and never goes negative", () => {
      expect(recomputeOrderTotal(lines, 200)).toBe(900);
      expect(recomputeOrderTotal([{ price: 10, quantity: 1, suppliedQuantity: 0 }], 50)).toBe(0);
    });
    it("ignores gift lines' price (they are ₪0)", () => {
      const withGift: AdjustableLine[] = [
        { price: 100, quantity: 2 },
        { price: 0, quantity: 1, isGift: true },
      ];
      expect(recomputeOrderTotal(withGift)).toBe(200);
    });
  });

  describe("ledger delta — exact, idempotent on repeat, correct across two adjustments", () => {
    // Order: 10 units @ ₪100 = ₪1000 charged.
    const price = 100;
    const ordered = 10;
    const total0 = recomputeOrderTotal([{ price, quantity: ordered }]); // 1000

    it("first adjustment 10→9 credits exactly one unit", () => {
      const total1 = recomputeOrderTotal([{ price, quantity: ordered, suppliedQuantity: 9 }]);
      expect(total1).toBe(900);
      expect(adjustmentDelta(total0, total1)).toBe(100);
    });

    it("re-applying the SAME supplied value yields a zero delta (idempotent)", () => {
      const total1 = recomputeOrderTotal([{ price, quantity: ordered, suppliedQuantity: 9 }]);
      expect(adjustmentDelta(total1, total1)).toBe(0);
    });

    it("second adjustment 9→8 credits one more unit; balance stays exact", () => {
      const total1 = recomputeOrderTotal([{ price, quantity: ordered, suppliedQuantity: 9 }]); // 900
      const total2 = recomputeOrderTotal([{ price, quantity: ordered, suppliedQuantity: 8 }]); // 800
      expect(adjustmentDelta(total1, total2)).toBe(100);
      // charge 1000 − credit 100 − credit 100 = 800 = 8 units supplied.
      expect(total0 - adjustmentDelta(total0, total1) - adjustmentDelta(total1, total2)).toBe(800);
    });
  });

  describe("time window — adjust only before dispatch", () => {
    it("adjustable statuses are exactly the pre-dispatch ones", () => {
      expect([...ADJUSTABLE_STATUSES]).toEqual(["pending", "confirmed", "packed"]);
    });
    it("blocks dispatched/delivered/cancelled", () => {
      expect(isOrderAdjustable("pending")).toBe(true);
      expect(isOrderAdjustable("confirmed")).toBe(true);
      expect(isOrderAdjustable("packed")).toBe(true);
      expect(isOrderAdjustable("out_for_delivery")).toBe(false);
      expect(isOrderAdjustable("delivered")).toBe(false);
      expect(isOrderAdjustable("cancelled")).toBe(false);
    });
    it("every canonical status is classified (no gap vs the status list)", () => {
      for (const s of ADMIN_ORDER_STATUSES) {
        expect(typeof isOrderAdjustable(s)).toBe("boolean");
      }
    });
    it("tolerates casing/whitespace", () => {
      expect(isOrderAdjustable(" PACKED ")).toBe(true);
      expect(isOrderAdjustable("Out_For_Delivery")).toBe(false);
    });
  });

  describe("threshold warnings (advisory only — the adjustment still proceeds)", () => {
    it("flags dropping below free delivery", () => {
      expect(thresholdWarnings(600, 400, false).belowFreeDelivery).toBe(true);
      expect(thresholdWarnings(600, 550, false).belowFreeDelivery).toBe(false);
    });
    it("flags a promotion at risk only when one was earned", () => {
      expect(thresholdWarnings(600, 500, true).promotionAtRisk).toBe(true);
      expect(thresholdWarnings(600, 500, false).promotionAtRisk).toBe(false);
    });
  });

  describe("committed-vs-stock shortage math", () => {
    it("is the positive overage only", () => {
      expect(stockShortage(110, 100)).toBe(10);
      expect(stockShortage(100, 100)).toBe(0);
      expect(stockShortage(90, 100)).toBe(0);
    });
  });
});
