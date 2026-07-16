import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));

import { computeRunningBalances, entrySides, toMinorUnits } from "@/services/ledger.service";
import type { LedgerEntryType } from "@/models/ledger-entry.model";

const oid = () => new mongoose.Types.ObjectId();

function entry(
  overrides: Partial<{
    _id: mongoose.Types.ObjectId;
    type: LedgerEntryType;
    debitMinor: number;
    creditMinor: number;
    status: "posted" | "void";
    createdAt: Date;
  }> = {}
) {
  return {
    _id: oid(),
    type: "order_charge" as LedgerEntryType,
    description: "x",
    debitMinor: 0,
    creditMinor: 0,
    currency: "ILS",
    status: "posted" as const,
    createdAt: new Date("2026-07-01T10:00:00Z"),
    ...overrides,
  };
}

describe("toMinorUnits (major ₪ → agorot, no float drift)", () => {
  it.each([
    [0.01, 1],
    [1, 100],
    [12.34, 1234],
    [150, 15000],
    [19.99, 1999],
    [0.1, 10],
    [1234.56, 123456],
  ])("%f ₪ → %d agorot", (major, minor) => {
    expect(toMinorUnits(major)).toBe(minor);
  });

  it("rejects non-finite amounts", () => {
    expect(() => toMinorUnits(Number.NaN)).toThrow();
    expect(() => toMinorUnits(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("entrySides (sign convention per type)", () => {
  it.each(["order_charge", "adjustment", "opening_balance"] as const)(
    "%s posts as DEBIT (increases what the customer owes)",
    (type) => {
      expect(entrySides(type, 500)).toEqual({ debitMinor: 500, creditMinor: 0 });
    }
  );

  it.each(["payment", "credit", "refund"] as const)("%s posts as CREDIT (reduces it)", (type) => {
    expect(entrySides(type, 500)).toEqual({ debitMinor: 0, creditMinor: 500 });
  });

  it.each([0, -100, 12.5])("rejects non-positive/non-integer minor amounts (%s)", (amount) => {
    expect(() => entrySides("payment", amount as number)).toThrow();
  });
});

describe("computeRunningBalances (deterministic, integer arithmetic)", () => {
  it("mixed entry set: balance = Σdebit − Σcredit chronologically, no drift", () => {
    const rows = [
      entry({ type: "order_charge", debitMinor: 15000, createdAt: new Date("2026-07-01T10:00:00Z") }),
      entry({ type: "payment", creditMinor: 5000, createdAt: new Date("2026-07-02T10:00:00Z") }),
      entry({ type: "adjustment", debitMinor: 199, createdAt: new Date("2026-07-03T10:00:00Z") }),
      entry({ type: "credit", creditMinor: 99, createdAt: new Date("2026-07-04T10:00:00Z") }),
      entry({ type: "refund", creditMinor: 10100, createdAt: new Date("2026-07-05T10:00:00Z") }),
    ];
    const out = computeRunningBalances(rows);
    expect(out.map((e) => e.balanceAfterMinor)).toEqual([15000, 10000, 10199, 10100, 0]);
    // Integer all the way — the classic 0.1+0.2 drift cannot exist:
    expect(out.every((e) => Number.isInteger(e.balanceAfterMinor))).toBe(true);
  });

  it("void entries never move the balance but keep their position", () => {
    const rows = [
      entry({ debitMinor: 1000, createdAt: new Date("2026-07-01T10:00:00Z") }),
      entry({ debitMinor: 777, status: "void", createdAt: new Date("2026-07-02T10:00:00Z") }),
      entry({ type: "payment", creditMinor: 400, createdAt: new Date("2026-07-03T10:00:00Z") }),
    ];
    const out = computeRunningBalances(rows);
    expect(out.map((e) => e.balanceAfterMinor)).toEqual([1000, 1000, 600]);
  });

  it("same-timestamp entries break ties by id — order is deterministic", () => {
    const t = new Date("2026-07-01T10:00:00Z");
    const a = entry({ _id: new mongoose.Types.ObjectId("6a0000000000000000000001"), debitMinor: 100, createdAt: t });
    const b = entry({ _id: new mongoose.Types.ObjectId("6a0000000000000000000002"), debitMinor: 200, createdAt: t });
    const forward = computeRunningBalances([a, b]);
    const reversed = computeRunningBalances([b, a]);
    expect(forward.map((e) => String(e._id))).toEqual(reversed.map((e) => String(e._id)));
    expect(forward.map((e) => e.balanceAfterMinor)).toEqual([100, 300]);
  });

  it("pagination determinism: slicing any window off the full computation is stable", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      entry({ debitMinor: (i + 1) * 100, createdAt: new Date(Date.UTC(2026, 6, i + 1)) })
    );
    const full = computeRunningBalances(rows);
    const pageOne = full.slice(0, 5);
    const again = computeRunningBalances(rows).slice(0, 5);
    expect(pageOne.map((e) => e.balanceAfterMinor)).toEqual(again.map((e) => e.balanceAfterMinor));
    expect(full[9].balanceAfterMinor).toBe(5500);
  });
});
