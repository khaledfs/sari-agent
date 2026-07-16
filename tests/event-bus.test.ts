import { describe, expect, it } from "vitest";

import {
  channelsForEvent,
  channelsForSubscriber,
  eventBus,
  publishRealtimeEvent,
  userChannel,
} from "@/services/event-bus.service";
import { REALTIME_SCHEMA_VERSION, type RealtimeEvent } from "@/types/realtime";

const at = "2026-07-16T10:00:00.000Z";
const v = REALTIME_SCHEMA_VERSION;

describe("channelsForEvent (routing)", () => {
  it("order.created goes to admin only", () => {
    expect(
      channelsForEvent({ type: "order.created", orderId: "o1", userId: "u1", total: 100, at, v })
    ).toEqual(["admin"]);
  });

  it("order.status_changed goes to admin + the owner's private channel", () => {
    expect(
      channelsForEvent({
        type: "order.status_changed",
        orderId: "o1",
        userId: "u1",
        status: "packed",
        previousStatus: "confirmed",
        at,
        v,
      })
    ).toEqual(["admin", "user:u1"]);
  });

  it.each(["product.updated", "inventory.updated"] as const)(
    "%s goes to the shared catalog channel only (no identities/prices)",
    (type) => {
      const event =
        type === "product.updated"
          ? ({ type, productId: "p1", at, v } as RealtimeEvent)
          : ({ type, productId: "p1", stock: 3, at, v } as RealtimeEvent);
      expect(channelsForEvent(event)).toEqual(["catalog"]);
    }
  );

  it.each(["account.restricted", "account.unrestricted", "ledger.entry_created"] as const)(
    "%s goes to admin + the affected user only",
    (type) => {
      const event =
        type === "ledger.entry_created"
          ? ({ type, userId: "u9", entryId: "e1", at, v } as RealtimeEvent)
          : ({ type, userId: "u9", at, v } as RealtimeEvent);
      expect(channelsForEvent(event)).toEqual(["admin", "user:u9"]);
    }
  );
});

describe("channelsForSubscriber (authorization)", () => {
  it("customer gets ONLY their own channel + catalog — never admin", () => {
    expect(channelsForSubscriber("customer", "u1")).toEqual(["user:u1", "catalog"]);
  });

  it("admin gets admin + catalog — no private user channels", () => {
    expect(channelsForSubscriber("admin", "a1")).toEqual(["admin", "catalog"]);
  });
});

describe("eventBus delivery", () => {
  it("a customer never receives another customer's events", () => {
    const mine: RealtimeEvent[] = [];
    const theirs: RealtimeEvent[] = [];
    const un1 = eventBus.subscribe(channelsForSubscriber("customer", "u1"), (e) => mine.push(e));
    const un2 = eventBus.subscribe(channelsForSubscriber("customer", "u2"), (e) => theirs.push(e));

    eventBus.publish({
      type: "order.status_changed",
      orderId: "o1",
      userId: "u1",
      status: "packed",
      previousStatus: "pending",
      at,
      v,
    });

    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(0);
    un1();
    un2();
  });

  it("admin receives order.created; customers do not", () => {
    const adminSeen: RealtimeEvent[] = [];
    const customerSeen: RealtimeEvent[] = [];
    const unAdmin = eventBus.subscribe(channelsForSubscriber("admin", "a1"), (e) => adminSeen.push(e));
    const unCust = eventBus.subscribe(channelsForSubscriber("customer", "u1"), (e) => customerSeen.push(e));

    eventBus.publish({ type: "order.created", orderId: "o1", userId: "u1", total: 50, at, v });

    expect(adminSeen).toHaveLength(1);
    expect(customerSeen).toHaveLength(0);
    unAdmin();
    unCust();
  });

  it("catalog events reach both roles through the shared channel", () => {
    const adminSeen: RealtimeEvent[] = [];
    const customerSeen: RealtimeEvent[] = [];
    const unAdmin = eventBus.subscribe(channelsForSubscriber("admin", "a1"), (e) => adminSeen.push(e));
    const unCust = eventBus.subscribe(channelsForSubscriber("customer", "u1"), (e) => customerSeen.push(e));

    eventBus.publish({ type: "product.updated", productId: "p1", at, v });

    expect(adminSeen).toHaveLength(1);
    expect(customerSeen).toHaveLength(1);
    unAdmin();
    unCust();
  });

  it("delivers at most once per listener even when two channels match", () => {
    const seen: RealtimeEvent[] = [];
    // Contrived subscriber on both admin and the user channel:
    const un = eventBus.subscribe(["admin", userChannel("u1")], (e) => seen.push(e));
    eventBus.publish({ type: "account.restricted", userId: "u1", at, v });
    expect(seen).toHaveLength(1);
    un();
  });

  it("unsubscribe stops delivery and empties the channel registry", () => {
    const seen: RealtimeEvent[] = [];
    const un = eventBus.subscribe([userChannel("uX")], (e) => seen.push(e));
    expect(eventBus.listenerCount(userChannel("uX"))).toBe(1);
    un();
    expect(eventBus.listenerCount(userChannel("uX"))).toBe(0);
    eventBus.publish({ type: "account.restricted", userId: "uX", at, v });
    expect(seen).toHaveLength(0);
  });

  it("one throwing listener never blocks delivery to the others", () => {
    const seen: RealtimeEvent[] = [];
    const unBad = eventBus.subscribe(["catalog"], () => {
      throw new Error("boom");
    });
    const unGood = eventBus.subscribe(["catalog"], (e) => seen.push(e));
    eventBus.publish({ type: "product.updated", productId: "p1", at, v });
    expect(seen).toHaveLength(1);
    unBad();
    unGood();
  });

  it("publishRealtimeEvent stamps timestamp + schema version", () => {
    const seen: RealtimeEvent[] = [];
    const un = eventBus.subscribe(["catalog"], (e) => seen.push(e));
    publishRealtimeEvent({ type: "product.updated", productId: "p2" });
    expect(seen).toHaveLength(1);
    expect(seen[0].v).toBe(REALTIME_SCHEMA_VERSION);
    expect(Number.isNaN(Date.parse(seen[0].at))).toBe(false);
    un();
  });
});
