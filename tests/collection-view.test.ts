import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock("@/lib/jwt", () => ({ signAuthToken: vi.fn(), verifyAuthToken: vi.fn() }));

import { buildCollectionViewRows } from "@/services/collection-tasks.service";

const ORDER_A = "64a000000000000000000001";
const ORDER_B = "64a000000000000000000002";
const ORDER_C = "64a000000000000000000003";
const CUST_1 = "64b000000000000000000001";
const CUST_2 = "64b000000000000000000002";
const names = new Map([
  [CUST_1, "Bakery One"],
  [CUST_2, "Cafe Two"],
]);

describe("buildCollectionViewRows", () => {
  it("pending order (no task) is not-yet-collectible, amount from the live order total", () => {
    const rows = buildCollectionViewRows(
      [{ orderId: ORDER_A, total: 42.5, status: "pending", customerId: CUST_1, createdAt: "2026-07-01T00:00:00.000Z" }],
      [],
      names
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderId: ORDER_A,
      taskId: null,
      state: "pending",
      amountMinor: 4250,
      customerName: "Bakery One",
      orderStatus: "pending",
    });
  });

  it("confirmed order with an open task is collectible, amount from the task snapshot", () => {
    const rows = buildCollectionViewRows(
      [{ orderId: ORDER_A, total: 999, status: "confirmed", customerId: CUST_1, createdAt: "2026-07-01T00:00:00.000Z" }],
      [{ orderId: ORDER_A, taskId: "task-a", amountMinor: 88800, status: "open" }],
      names
    );
    expect(rows[0]).toMatchObject({ state: "collectible", taskId: "task-a", amountMinor: 88800 });
  });

  it("a DELIVERED order with NO task is collectible by status (the bug fix), live amount, taskId null", () => {
    const rows = buildCollectionViewRows(
      [{ orderId: ORDER_A, total: 1280, status: "delivered", customerId: CUST_1, createdAt: "2026-01-05T00:00:00.000Z" }],
      [], // task was never created (seed/smoke direct-insert)
      names
    );
    expect(rows[0]).toMatchObject({
      state: "collectible", // NOT "pending" — state follows the order status
      orderStatus: "delivered",
      taskId: null,
      amountMinor: 128000,
      createdAt: "2026-01-05T00:00:00.000Z", // ORDER date → meaningful age, not 0d
    });
  });

  it("state follows order status across confirmed/packed/out_for_delivery even without a task", () => {
    const rows = buildCollectionViewRows(
      ["confirmed", "packed", "out_for_delivery"].map((status, i) => ({
        orderId: [ORDER_A, ORDER_B, ORDER_C][i],
        total: 10,
        status,
        customerId: CUST_1,
        createdAt: "2026-07-01T00:00:00.000Z",
      })),
      [],
      names
    );
    expect(rows.map((r) => r.state)).toEqual(["collectible", "collectible", "collectible"]);
  });

  it("orders whose task is collected or cancelled are dropped", () => {
    const rows = buildCollectionViewRows(
      [
        { orderId: ORDER_A, total: 10, status: "delivered", customerId: CUST_1, createdAt: "2026-07-01T00:00:00.000Z" },
        { orderId: ORDER_B, total: 20, status: "delivered", customerId: CUST_2, createdAt: "2026-07-02T00:00:00.000Z" },
      ],
      [
        { orderId: ORDER_A, taskId: "task-a", amountMinor: 1000, status: "collected" },
        { orderId: ORDER_B, taskId: "task-b", amountMinor: 2000, status: "cancelled" },
      ],
      names
    );
    expect(rows).toEqual([]);
  });

  it("preserves the input order (oldest-first) and derives the order number", () => {
    const rows = buildCollectionViewRows(
      [
        { orderId: ORDER_A, total: 1, status: "pending", customerId: CUST_1, createdAt: "2026-07-01T00:00:00.000Z" },
        { orderId: ORDER_C, total: 2, status: "confirmed", customerId: CUST_2, createdAt: "2026-07-03T00:00:00.000Z" },
      ],
      [{ orderId: ORDER_C, taskId: "task-c", amountMinor: 200, status: "open" }],
      names
    );
    expect(rows.map((r) => r.orderId)).toEqual([ORDER_A, ORDER_C]);
    expect(rows[0].orderNumber).toBe(ORDER_A.slice(-8).toUpperCase());
    expect(rows[1].state).toBe("collectible");
  });
});
