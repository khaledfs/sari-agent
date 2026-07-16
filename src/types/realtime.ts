/**
 * Typed realtime events for the SSE layer (Work Order Issue 4).
 *
 * Payloads stay minimal — entity id + timestamp + schema version. Consumers
 * refetch through their own authorized endpoints, so per-customer pricing and
 * financial data never travel on a shared channel.
 */

/** Bump when an event payload shape changes so clients can ignore unknown versions. */
export const REALTIME_SCHEMA_VERSION = 1;

export type RealtimeEventType =
  | "order.created"
  | "order.status_changed"
  | "product.updated"
  | "inventory.updated"
  | "account.restricted"
  | "account.unrestricted"
  | "ledger.entry_created"
  | "message.created";

type BaseEvent = {
  /** ISO timestamp of the write that produced the event. */
  at: string;
  /** Schema version (REALTIME_SCHEMA_VERSION). */
  v: number;
};

export type OrderCreatedEvent = BaseEvent & {
  type: "order.created";
  orderId: string;
  userId: string;
  total: number;
};

export type OrderStatusChangedEvent = BaseEvent & {
  type: "order.status_changed";
  orderId: string;
  /** Owner of the order — used for channel routing; sent only to admin + owner. */
  userId: string;
  status: string;
  previousStatus: string;
};

export type ProductUpdatedEvent = BaseEvent & {
  type: "product.updated";
  productId: string;
};

export type InventoryUpdatedEvent = BaseEvent & {
  type: "inventory.updated";
  productId: string;
  stock: number | null;
};

export type AccountRestrictedEvent = BaseEvent & {
  type: "account.restricted";
  userId: string;
};

export type AccountUnrestrictedEvent = BaseEvent & {
  type: "account.unrestricted";
  userId: string;
};

export type LedgerEntryCreatedEvent = BaseEvent & {
  type: "ledger.entry_created";
  userId: string;
  entryId: string;
};

export type MessageCreatedEvent = BaseEvent & {
  type: "message.created";
  threadId: string;
  /** Both participants — used for channel routing (participants + admin only). */
  customerId: string;
  agentId: string;
};

export type RealtimeEvent =
  | OrderCreatedEvent
  | OrderStatusChangedEvent
  | ProductUpdatedEvent
  | InventoryUpdatedEvent
  | AccountRestrictedEvent
  | AccountUnrestrictedEvent
  | LedgerEntryCreatedEvent
  | MessageCreatedEvent;
