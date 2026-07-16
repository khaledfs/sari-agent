import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";

// admin-orders pulls requireAdmin (→ @/lib/jwt, env-validated at import) and
// @/lib/db (→ MONGODB_URI, env-validated at import). The helpers under test
// are pure; no DB is touched.
vi.mock("@/lib/jwt", () => ({
  signAuthToken: vi.fn(),
  verifyAuthToken: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));

import { buildStatusHistoryEntry, toAdminOrderDetail } from "@/lib/admin-orders";

const oid = () => new mongoose.Types.ObjectId();

function makeOrder(overrides: Record<string, unknown> = {}) {
  const productId = oid();
  return {
    _id: oid(),
    userId: oid(),
    items: [
      {
        productId,
        name: "קמח לבן 25 ק\"ג",
        price: 80,
        quantity: 3,
        priceBreakdown: { base: 100, override: 80, final: 80 },
      },
      {
        productId: oid(),
        name: "שוקולד מריר",
        price: 0,
        quantity: 1,
        isGift: true,
        promotionId: "promo-1",
      },
    ],
    total: 240,
    status: "pending",
    createdAt: new Date("2026-07-01T10:00:00Z"),
    updatedAt: new Date("2026-07-02T11:00:00Z"),
    notes: "אנא לספק בבוקר",
    appliedPromotionIds: ["promo-1"],
    statusHistory: [],
    ...overrides,
  };
}

describe("toAdminOrderDetail (DTO shape)", () => {
  it("maps snapshot items, computes line totals and subtotal from the snapshot", () => {
    const order = makeOrder();
    const dto = toAdminOrderDetail(order as never, null, null, new Map());

    expect(dto.items).toHaveLength(2);
    expect(dto.items[0].name).toBe("קמח לבן 25 ק\"ג");
    expect(dto.items[0].unitPrice).toBe(80);
    expect(dto.items[0].lineTotal).toBe(240);
    expect(dto.items[0].priceBreakdown).toEqual({ base: 100, override: 80, final: 80 });
    expect(dto.subtotal).toBe(240);
    expect(dto.total).toBe(240);
    expect(dto.notes).toBe("אנא לספק בבוקר");
  });

  it("marks gift lines and keeps them at ₪0", () => {
    const dto = toAdminOrderDetail(makeOrder() as never, null, null, new Map());
    expect(dto.items[1].isGift).toBe(true);
    expect(dto.items[1].unitPrice).toBe(0);
    expect(dto.items[1].lineTotal).toBe(0);
    expect(dto.items[1].promotionId).toBe("promo-1");
  });

  it("uses the stored snapshot, not the current product doc, for name/price", () => {
    const order = makeOrder();
    const liveProduct = {
      _id: order.items[0].productId,
      sku: "FLR-25",
      imageUrl: "https://sarihassan.com/x.jpg",
      unit: "שק",
      packageSize: "25kg",
      // A live price change must never leak into the historical order:
      price: 999,
      name: "שם חדש אחרי שינוי",
    };
    const dto = toAdminOrderDetail(
      order as never,
      null,
      null,
      new Map([[String(liveProduct._id), liveProduct as never]])
    );
    expect(dto.items[0].name).toBe("קמח לבן 25 ק\"ג");
    expect(dto.items[0].unitPrice).toBe(80);
    // Display metadata IS taken best-effort from the live doc:
    expect(dto.items[0].sku).toBe("FLR-25");
    expect(dto.items[0].imageUrl).toBe("https://sarihassan.com/x.jpg");
    expect(dto.items[0].unit).toBe("שק");
    expect(dto.items[0].packageSize).toBe("25kg");
  });

  it("never leaks sensitive user fields (password, role) into the customer block", () => {
    const user = {
      _id: oid(),
      businessName: "מאפיית הזהב",
      phoneNumber: "+972-52-0000000",
      email: "a@b.com",
      adminNotes: "customer VIP",
      password: "$2b$10$secret-hash",
      role: "customer",
    };
    const dto = toAdminOrderDetail(makeOrder() as never, user as never, "bakery", new Map());
    expect(dto.customer).toEqual({
      id: String(user._id),
      businessName: "מאפיית הזהב",
      phoneNumber: "+972-52-0000000",
      email: "a@b.com",
      businessType: "bakery",
      adminNotes: "customer VIP",
    });
    expect(JSON.stringify(dto)).not.toContain("secret-hash");
  });

  it("renders empty statusHistory gracefully (legacy orders)", () => {
    const dto = toAdminOrderDetail(makeOrder({ statusHistory: undefined }) as never, null, null, new Map());
    expect(dto.statusHistory).toEqual([]);
  });

  it("serializes statusHistory entries with actor and ISO time", () => {
    const dto = toAdminOrderDetail(
      makeOrder({
        statusHistory: [
          { status: "confirmed", changedAt: new Date("2026-07-02T08:00:00Z"), changedByUserId: "u1", changedByRole: "admin" },
          { status: "packed", changedAt: new Date("2026-07-02T09:00:00Z"), changedByUserId: "u1", changedByRole: "admin" },
        ],
      }) as never,
      null,
      null,
      new Map()
    );
    expect(dto.statusHistory).toHaveLength(2);
    expect(dto.statusHistory[0]).toEqual({
      status: "confirmed",
      changedAt: "2026-07-02T08:00:00.000Z",
      changedByUserId: "u1",
      changedByRole: "admin",
    });
    expect(dto.statusHistory[1].status).toBe("packed");
  });

  it("handles a missing customer (deleted user) without throwing", () => {
    const dto = toAdminOrderDetail(makeOrder() as never, null, null, new Map());
    expect(dto.customer).toBeNull();
  });
});

describe("buildStatusHistoryEntry", () => {
  it("records status, time and actor identity", () => {
    const at = new Date("2026-07-03T12:00:00Z");
    expect(buildStatusHistoryEntry("out_for_delivery", { userId: "admin-1", role: "admin" }, at)).toEqual({
      status: "out_for_delivery",
      changedAt: at,
      changedByUserId: "admin-1",
      changedByRole: "admin",
    });
  });
});
