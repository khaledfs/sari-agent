# Data model map

A MAP of the MongoDB collections and their load-bearing fields — not a schema reference. Source of truth: `src/models/*.ts`; implementation depth: `docs/DEV_NOTES.md` (local, git-ignored).

| Collection (model) | Key fields / notes |
|---|---|
| `users` (`user.model`) | role (`customer`/`admin`/`agent`), phone, businessName, `accountStatus` + `restrictedAt/Reason` (ordering hold; legacy `isActive` read-only compat), `assignedAgentId`, `routeLabel` (agents), `adminNotes` |
| `products` (`product.model`) | sku (sync upsert key; manual products use `MANUAL-*`), name, category, price, `tierPrices` (Map by businessType), `stock` (null = untracked), `lowStockThreshold`, isActive |
| `carts` (`cart.model`) | one per user; items[] (productId, quantity). Server-side only — never localStorage |
| `orders` (`order.model`) | items[] snapshots (name, price, quantity, `priceBreakdown`, `isGift`/`promotionId`, `suppliedQuantity`/`adjustmentNote`/`adjustmentHistory`), total, status (free-form string; canonical vocabulary in `order-status.ts`), `statusHistory[]` (actor audit), notes, `appliedPromotionIds`/`promotionDiscount`, adjustment stamps (`adjusted*`, `adjustmentRevision`), payment fields (`paymentMethod`, `paymentIntentId`, `stockCommittedAt`/`stockReturnedAt`) |
| `ledgerentries` (`ledger-entry.model`) | userId, type (`order_charge`/`payment`/`credit`/`refund`/`adjustment`/`opening_balance`), `debitMinor`/`creditMinor` (integers, exactly one non-zero), unique `idempotencyKey`, status (`posted`/`void`), createdBy actor. Immutable once posted |
| `discounts` (`discount.model`) | label, scope (`customer`/`businessType`/`global`) + targetId, type (`percent`/`fixed`), value, productIds[], date window, isActive |
| `priceoverrides` (`price-override.model`) | userId + productId (unique pair) → price |
| `promotions` (`promotion.model`) | kind (`gift`/`orderDiscount`/`minOrderGift`) with kind-specific fields, audience (same scope shape as discounts), date window |
| `banners` (`banner.model`) | title/body/imageUrl, ctaHref (internal path only — open-redirect guard), scope + targetId, priority, date window |
| `customermemories` (`customer-memory.model`) | one per user: businessType, AI `memorySummary`, `inferredPreferences`, conversationCount |
| `messagethreads` / `messages` (`message.model`) | thread per (customerId, agentId) unique pair; messages: senderUserId/Role, body, readAt (unread = other-side null readAt) |
| `collectiontasks` (`collection-task.model`) | one per order (unique orderId), agentId (null = admin-owned), amount (server-side), status; collect posts the ledger payment |

Realtime event/channel matrix and the event bus live in `src/types/realtime.ts` + `src/services/event-bus.service.ts`.
