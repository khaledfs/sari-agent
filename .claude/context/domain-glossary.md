# Domain glossary

The wholesale domain language of this app. All terms are derivable from the code (`src/models`, `src/services`); customer-specific data lives only in the local-only docs.

- **SARI** — the B2B wholesale business this app serves (baking/food-service supplies). Hebrew RTL is the primary language; catalog is synced from the public site.
- **Customer** — a business buyer (`user.role: "customer"`), identified by phone; shops the catalog, holds a cart, places orders, has a ledger.
- **Business type** — customer segment stored on `CustomerMemory.businessType`: `bakery | oriental_sweets | western_sweets | cafe | ice_cream`. Drives tier pricing, discount/promotion/banner audiences, and assistant advice.
- **Admin** — full console access (`role: "admin"`). Manages catalog, pricing, orders, customers, agents.
- **Field agent** — `role: "agent"`; a sales rep with a **book** of assigned customers (`user.assignedAgentId`, optional `routeLabel` = their route/line). Sees only their own customers' data through the scope resolver; collects cash/cheque payments.
- **Restricted customer** — `accountStatus: "restricted"`: an ordering hold (commercial, not a ban). Login and all reads stay open; cart mutations/order creation are blocked server-side (403 `ACCOUNT_RESTRICTED`).
- **Ledger** — per-customer account of debits/credits in **agorot** (integer minor units). Balance is computed, posted entries immutable, corrections are reversals.
- **Supplied quantity** — warehouse shortage handling: per order line, `suppliedQuantity` ≤ ordered `quantity`; totals/receipt/ledger reflect what was actually supplied, the ordered quantity stays as evidence.
- **Collection task** — created when an agent-paid order is approved; the assigned agent (or admin when unassigned) marks it collected, which posts the single ledger `payment` entry.
- **Payment methods** — `agent` (cash/cheque via collection task; always available) or `card` (provider seam behind `PAYMENTS_ENABLED`; success only via signed webhook).
- **Pricing precedence** — per-customer override > businessType tier price > base price, then the single best applicable discount (never stacks).
- **Promotions** — `gift` (buy X → free Y), `orderDiscount` (subtotal threshold → % / fixed off), `minOrderGift` (threshold → gift); composed on top of the priced cart, fail-soft.
- **Banners** — admin-managed announcement strip on the customer dashboard, audience-targeted (customer/businessType/global), max 3 by priority.
- **Assistant** — the AI chat: a catalog-grounded tool-calling agent behind `/api/assistant/message`; per-customer memory (`CustomerMemory`) personalizes advice. Distinct from **Messages**, the human customer↔agent chat.
- **Order statuses** — canonical vocabulary `pending | confirmed | packed | out_for_delivery | delivered | cancelled` (`ADMIN_ORDER_STATUSES` in `src/lib/order-status.ts`). `out_for_delivery` = dispatched; receipts unlock at dispatch.
