import { describe, expect, it } from "vitest";

import { deriveOrderStage } from "@/app/[locale]/(customer)/dashboard/orders/OrderTimeline";

describe("deriveOrderStage", () => {
  describe("canonical admin statuses", () => {
    it.each([
      ["pending", 0],
      ["confirmed", 1],
      ["packed", 2],
      ["out_for_delivery", 3],
      ["delivered", 4],
    ])("%s maps to stage index %i on the happy path", (status, index) => {
      expect(deriveOrderStage(status)).toEqual({ index, cancelled: false });
    });

    it("cancelled maps to a halted timeline", () => {
      expect(deriveOrderStage("cancelled")).toEqual({ index: 0, cancelled: true });
    });
  });

  describe("related free-form wording", () => {
    it.each([
      ["processing", 1],
      ["accepted", 1],
      ["ready", 2],
      ["prepared", 2],
      ["shipped", 3],
      ["in transit", 3],
      ["on the way", 3],
      ["completed", 4],
      ["done", 4],
    ])("%s lands on stage %i", (status, index) => {
      expect(deriveOrderStage(status)).toEqual({ index, cancelled: false });
    });

    it.each(["refunded", "rejected", "failed", "returned", "voided"])(
      "%s is treated as cancelled",
      (status) => {
        expect(deriveOrderStage(status).cancelled).toBe(true);
      }
    );
  });

  describe("out_for_delivery is not misread as delivered", () => {
    it("contains 'deliver' but stays at stage 3", () => {
      expect(deriveOrderStage("out_for_delivery").index).toBe(3);
    });
  });

  describe("fails soft on unknown input", () => {
    it.each(["", "   ", "banana", "status-42"])(
      "%j falls back to Placed (index 0, not cancelled)",
      (status) => {
        expect(deriveOrderStage(status)).toEqual({ index: 0, cancelled: false });
      }
    );

    it("is case-insensitive and trims", () => {
      expect(deriveOrderStage("  DELIVERED ")).toEqual({ index: 4, cancelled: false });
    });
  });
});
