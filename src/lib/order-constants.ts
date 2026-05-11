export const ORDER_STATUSES = ["pending", "processing", "fulfilled", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
