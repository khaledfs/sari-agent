import { REALTIME_SCHEMA_VERSION, type RealtimeEvent } from "@/types/realtime";

/**
 * In-process realtime event bus (Work Order Issue 4).
 *
 * Single-process pub/sub: the app runs as ONE Node process, so a module-level
 * singleton (cached on globalThis exactly like the mongoose connection, so dev
 * hot-reload never duplicates it) is a correct event bus — no Redis, no paid
 * provider. If the deployment ever scales to multiple workers/instances, this
 * layer must move to MongoDB change streams or an external pub/sub (documented
 * in DEV_NOTES → Deployment).
 *
 * Publishing happens ONLY from the service layer after a successful write —
 * never from route handlers, never before a transaction commits.
 */

export type RealtimeListener = (event: RealtimeEvent) => void;

/** Channel names are derived server-side only — never accepted from a client. */
export type Channel = "admin" | "catalog" | `user:${string}`;

export function userChannel(userId: string): Channel {
  return `user:${userId}`;
}

/**
 * Which channels an event is delivered to (pure — unit-tested).
 * Financial/identity-bearing events go to the admin channel and the owning
 * user's private channel only; the shared catalog channel carries ids alone.
 */
export function channelsForEvent(event: RealtimeEvent): Channel[] {
  switch (event.type) {
    case "order.created":
      return ["admin"];
    case "order.status_changed":
      return ["admin", userChannel(event.userId)];
    case "product.updated":
    case "inventory.updated":
      return ["catalog"];
    case "account.restricted":
    case "account.unrestricted":
      return ["admin", userChannel(event.userId)];
    case "ledger.entry_created":
      return ["admin", userChannel(event.userId)];
  }
}

/**
 * Which channels a subscriber is entitled to (pure — unit-tested).
 * Derived from the server-verified session role, never from client input:
 * customers get their own private channel + the public catalog channel;
 * admins get the admin channel + the catalog channel.
 */
export function channelsForSubscriber(role: "customer" | "admin", userId: string): Channel[] {
  return role === "admin" ? ["admin", "catalog"] : [userChannel(userId), "catalog"];
}

class EventBus {
  private listenersByChannel = new Map<Channel, Set<RealtimeListener>>();

  /** Registers one listener on a set of channels; returns the cleanup function. */
  subscribe(channels: Channel[], listener: RealtimeListener): () => void {
    for (const channel of channels) {
      let set = this.listenersByChannel.get(channel);
      if (!set) {
        set = new Set();
        this.listenersByChannel.set(channel, set);
      }
      set.add(listener);
    }
    return () => {
      for (const channel of channels) {
        const set = this.listenersByChannel.get(channel);
        if (!set) continue;
        set.delete(listener);
        if (set.size === 0) {
          this.listenersByChannel.delete(channel);
        }
      }
    };
  }

  /**
   * Delivers the event to every listener on the event's channels, each
   * listener at most once (a subscriber on two matching channels still gets
   * one delivery). Listener errors are isolated — one broken SSE connection
   * must never prevent delivery to the others.
   */
  publish(event: RealtimeEvent): void {
    const delivered = new Set<RealtimeListener>();
    for (const channel of channelsForEvent(event)) {
      const set = this.listenersByChannel.get(channel);
      if (!set) continue;
      for (const listener of set) {
        if (delivered.has(listener)) continue;
        delivered.add(listener);
        try {
          listener(event);
        } catch {
          // Listener cleanup races with delivery (aborted SSE connections);
          // isolating the failure is the correct behavior, not a swallowed error.
        }
      }
    }
  }

  /** Test hook: number of listeners on a channel. */
  listenerCount(channel: Channel): number {
    return this.listenersByChannel.get(channel)?.size ?? 0;
  }
}

const globalWithBus = globalThis as typeof globalThis & {
  sariEventBus?: EventBus;
};

/** The process-wide bus (hot-reload safe via globalThis, like connectDB). */
export const eventBus: EventBus = globalWithBus.sariEventBus ?? new EventBus();
if (!globalWithBus.sariEventBus) {
  globalWithBus.sariEventBus = eventBus;
}

/** Omit distributed over a union — keeps each event variant's own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Service-layer publish helper: stamps timestamp + schema version. Callers
 * pass the domain payload only. Must be called AFTER the write succeeds.
 */
export function publishRealtimeEvent(event: DistributiveOmit<RealtimeEvent, "at" | "v">): void {
  eventBus.publish({
    ...event,
    at: new Date().toISOString(),
    v: REALTIME_SCHEMA_VERSION,
  } as RealtimeEvent);
}
