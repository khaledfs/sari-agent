## DEV_NOTES (full implementation snapshot)

This file captures everything implemented so far and how it was implemented, so work can resume quickly.

**Also read:** `docs/WORKING_INSTRUCTIONS.md` — standing rules, workflow, and conventions we follow in every session.

## 1) Project architecture and conventions

- Stack: **Next.js App Router + TypeScript + Mongoose + next-intl**
- This repo may use **Next.js conventions that differ from older docs**; when touching framework behavior, check `node_modules/next/dist/docs/` and heed deprecations (see `AGENTS.md` / `CLAUDE.md`).
- Structure used:
  - `src/app` for pages + API routes
  - `src/lib` for shared utilities (`db`, `jwt`, `validators`)
  - `src/models` for Mongoose models
  - `src/services` for business logic (routes stay thin)
  - `src/types` for shared TS types
  - `src/i18n` for locale config/messages
- Rule followed: keep business logic in services, not in route handlers.
- **Auth for API routes:** `src/lib/auth-user.ts` — `getAuthenticatedUserId()` reads **`authToken` httpOnly cookie**, verifies JWT — **never trust `userId` from query/body** for cart, orders, or similar.

## 2) i18n and RTL implementation

- Installed and configured `next-intl`.
- Locales: `en`, `he`, `ar`.
- Implemented:
  - `src/i18n/routing.ts`
  - `src/i18n/request.ts`
  - `middleware.ts` (locale routing)
  - message files:
    - `src/i18n/messages/en.json`
    - `src/i18n/messages/he.json`
    - `src/i18n/messages/ar.json`
- Locale layout:
  - `src/app/[locale]/layout.tsx`
  - Explicitly passes `locale` + `messages` into `NextIntlClientProvider`
  - Sets `dir="rtl"` for Hebrew/Arabic.
- Root route:
  - `src/app/page.tsx` redirects to `/en`.

## 3) Database and models

- Mongo singleton connection:
  - `src/lib/db.ts`
  - uses cached global connection for dev/hot-reload safety.
- User model:
  - `src/models/user.model.ts`
  - fields: `businessName`, `email`, `phoneNumber`, `password`, `role`, `isVerified`, `createdAt`
  - role enum `customer|admin`, default enforced to `customer`.
- Verification code model:
  - `src/models/verification-code.model.ts`
  - stores `{ phoneNumber, code, expiresAt }`
  - TTL index to expire codes automatically.
- Product model:
  - `src/models/product.model.ts`
  - fields: `name`, `sku` (unique index), `category`, `price (>0)`, `unit`, `packageSize`, `imageUrl`, `isActive` (default `true`), `createdAt`
  - SKU uniqueness enforced via schema index: `productSchema.index({ sku: 1 }, { unique: true })`
- Cart model:
  - `src/models/cart.model.ts`
  - one cart per user via unique index: `cartSchema.index({ userId: 1 }, { unique: true })`
  - fields: `userId`, `items[]`
    - `items[].productId` (ref `Product`)
    - `items[].quantity` (min `1`)
  - schema uses timestamps (`createdAt`, `updatedAt`)
- Order model:
  - `src/models/order.model.ts`
  - fields: `userId`, `items[]` (snapshot: `productId`, `name`, `price`, `quantity` min `1`), `total`, `status` (default `pending`), timestamps (`createdAt`, …)
  - item snapshots preserve history if products change later

## 4) Services and auth flow

- `src/services/sms.service.ts`
  - `SMS_MODE=development`: does not send real SMS, prints code to server log.
  - `SMS_MODE=sandbox|production`: uses Twilio credentials.
- `src/services/verification.service.ts`
  - generates 6-digit code
  - 5-minute expiration
  - validates/deletes on use.
- `src/services/auth.service.ts`
  - `registerCustomer()`:
    - validates required fields + email + strong password
    - enforces `role: "customer"`
    - hashes password via `bcryptjs`
    - stores user
    - generates verification code
    - sends/logs SMS based on `SMS_MODE`
  - `verifyCustomerPhone()`:
    - validates code + expiry
    - sets `isVerified=true`
  - `loginWithPassword()`:
    - accepts email or phone identifier
    - compares bcrypt password hash
    - blocks login when `isVerified=false`
    - signs JWT with `userId` and `role`.
- `src/services/cart.service.ts`
  - cart CRUD, validation (zod + active product checks), populated-style totals for API responses
  - cart line items persisted via `CartModel.updateOne` + `$set` (avoids Mongoose `DocumentArray` assign issues)
- `src/services/order.service.ts`
  - `createOrderFromCart(userId)` — snapshot from `getCartByUserId`, rejects empty cart, writes `Order`, then `clearCart`; **deletes the new order** if `clearCart` fails (no orphan order with uncleared cart)
  - `getOrdersByUser`, `getOrderById` (owner-only; same “not found” message for privacy)

## 5) API routes

- Register:
  - `POST /api/auth/register`
  - `src/app/api/auth/register/route.ts`
- Verify:
  - `POST /api/auth/verify`
  - `src/app/api/auth/verify/route.ts`
- Login:
  - `POST /api/auth/login`
  - `src/app/api/auth/login/route.ts`
  - returns `{ success: true, token }`
  - also writes `authToken` httpOnly cookie (7d).
- Session:
  - `GET /api/auth/session`
  - `src/app/api/auth/session/route.ts`
  - validates cookie token and returns authenticated state.
- Logout:
  - `POST /api/auth/logout`
  - `src/app/api/auth/logout/route.ts`
  - clears cookie.

### Products API

- `GET /api/products`
  - `src/app/api/products/route.ts`
  - returns active products: `{ success: true, data: [...] }`
- `POST /api/products`
  - `src/app/api/products/route.ts`
  - creates a product: `{ success: true, data: createdProduct }`
- `GET /api/products/[id]`
  - `src/app/api/products/[id]/route.ts`
- `PUT /api/products/[id]`
  - `src/app/api/products/[id]/route.ts`
- Seed (temporary for MVP testing):
  - `POST /api/products/seed`
  - `src/app/api/products/seed/route.ts`
  - inserts 5–10 mock products if missing.

### Cart API

- `GET /api/cart`
  - `src/app/api/cart/route.ts`
  - returns authenticated user cart with line totals + cart total
- `POST /api/cart`
  - `src/app/api/cart/route.ts`
  - adds product to cart (`{ productId, quantity }`)
  - if item exists, quantity is incremented
- `PUT /api/cart`
  - `src/app/api/cart/route.ts`
  - updates cart item quantity (`{ productId, quantity }`)
  - quantity `<= 0` removes item
- `DELETE /api/cart`
  - `src/app/api/cart/route.ts`
  - removes single item (`{ productId }`)
- `POST /api/cart/clear`
  - `src/app/api/cart/clear/route.ts`
  - clears items but keeps cart document
- Auth source for all cart routes:
  - `src/lib/auth-user.ts` (`getAuthenticatedUserId()`)
  - reads `authToken` cookie + verifies JWT
  - **does not trust userId from request payload**

### Orders API

- `GET /api/orders`
  - `src/app/api/orders/route.ts`
  - lists orders for authenticated user (newest first)
- `POST /api/orders`
  - `src/app/api/orders/route.ts`
  - creates order from current cart (`createOrderFromCart` in `src/services/order.service.ts`)
  - clears cart only after order is saved; rolls back order document if cart clear fails
- `GET /api/orders/[id]`
  - `src/app/api/orders/[id]/route.ts`
  - returns single order for owner only; otherwise `404` with `Order not found.`
- Auth: `getAuthenticatedUserId()` (cookie/JWT), no `userId` from client.

## 6) Frontend pages and behavior

- Register page:
  - `src/app/[locale]/register/page.tsx`
  - fields: `businessName`, `email`, `phoneNumber`, `password`, `confirmPassword`
  - phone defaults to `+972`
  - supports Israeli normalization on submit (`053...` -> `+97253...`)
  - validates confirm password (required + match)
  - runtime success check requires:
    - HTTP status 200
    - payload `{ success: true }`
  - stores `pendingVerificationPhoneNumber` in `localStorage`.
- Verify page:
  - `src/app/[locale]/verify/page.tsx`
  - field: `verificationCode` (6 digits)
  - reads phone number from query (`?phoneNumber=`) or from `localStorage`
  - posts to `/api/auth/verify`
  - runtime success check: status 200 + `success=true`.
- Login page:
  - `src/app/[locale]/login/page.tsx`
  - fields: identifier (email/phone), password
  - posts to `/api/auth/login`
  - saves returned token to `localStorage` (cookie remains main server session source)
  - auto redirects to dashboard on success.
- Dashboard page:
  - `src/app/[locale]/dashboard/page.tsx`
  - protected by `src/app/[locale]/dashboard/layout.tsx` (session gate before child routes render)
  - logout button clears session.
- Dashboard Products page:
  - `src/app/[locale]/dashboard/products/page.tsx`
  - fetches `/api/products` and renders a **mobile-first** list
  - displays `name`, `price`, `unit`, and `sku`
  - includes working “Add to cart” action (`POST /api/cart` with quantity `1`)
  - includes per-item loading state and short success feedback
  - includes link to `/{locale}/dashboard/cart`.
- Dashboard Cart page:
  - `src/app/[locale]/dashboard/cart/page.tsx`
  - fetches `/api/cart` for authenticated user cart
  - renders list with `name`, `sku`, unit price, quantity, and line total
  - renders cart total
  - supports:
    - increase/decrease quantity (`PUT /api/cart`)
    - remove item (`DELETE /api/cart`)
    - clear cart (`POST /api/cart/clear`)
    - place order (`POST /api/orders`) → redirect to `/{locale}/dashboard/orders`
  - includes empty state + error handling
  - UI kept simple, mobile-first, RTL-safe.
- Dashboard Orders list:
  - `src/app/[locale]/dashboard/orders/page.tsx`
  - `GET /api/orders`
  - links to each order detail
- Dashboard Order detail:
  - `src/app/[locale]/dashboard/orders/[id]/page.tsx`
  - `GET /api/orders/[id]`
- Session bootstrap:
  - `src/app/[locale]/SessionBootstrap.tsx`
  - injected in locale layout
  - on app start:
    - authenticated users are redirected to `/{locale}/dashboard` from home/login
    - **logged-out users hitting dashboard URLs are not redirected here** (avoids duplicate logic); see dashboard layout below.
- **Dashboard auth gate (no flash of protected content):**
  - `src/app/[locale]/dashboard/layout.tsx` (client)
  - calls `GET /api/auth/session` and **does not render child routes** (`cart`, `products`, `orders`, …) until authenticated
  - prevents a brief flash of e.g. cart UI before redirect to login (which happened when protection lived only in `useEffect` in `SessionBootstrap`)

## 7) Phone number logic (important)

- Registration expects Israel default and normalizes to E.164-like `+972...`.
- Login now supports both:
  - `+972532221028`
  - `0532221028`
- Implemented via:
  - `normalizeIsraeliPhoneNumber()` in `src/lib/validators.ts`
  - used in `loginWithPassword()`.

## 8) Environment variables

- Required:
  - `MONGODB_URI`
  - `JWT_SECRET`
- SMS mode:
  - `SMS_MODE=development|sandbox|production`
  - `TWILIO_SID`
  - `TWILIO_TOKEN`
  - `TWILIO_PHONE_NUMBER`
- Files:
  - `.env.example` includes all required keys
  - `.env.local` currently includes working dev values.

## 9) Runtime/debug notes observed during implementation

- Hydration mismatch warning (`fdprocessedid`) came from a browser extension modifying DOM before hydration, not app code.
- `Origin not allowed` runtime error came from extension script (`chrome-extension://...`), not Next.js code.
- After moving app folders, stale `.next` artifacts caused false type errors; clearing `.next` resolved it.
- Locale routes returning 200 but showing English was fixed by explicitly setting locale/messages in provider.

## 10) Validation and testing done

- Repeatedly validated with:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
- API runtime checks performed:
  - register success/failure
  - verify success/failure
  - login success/failure
  - session persistence with cookie
  - logout invalidates session.
- Products runtime checks performed:
  - `POST /api/products/seed` inserts mock products
  - `GET /api/products` returns active products
  - `GET /api/products/[id]` returns a single product
  - `PUT /api/products/[id]` updates product fields
  - `POST /api/products` creates a product
  - validation confirmed:
    - price must be `> 0`
    - duplicate SKU returns “SKU already exists.”
- Cart implementation validation performed:
  - service rules implemented in `src/services/cart.service.ts`:
    - create cart automatically when missing
    - validate `productId` and quantity via zod
    - ensure product exists and is active before add/update
    - merge quantity on duplicate add
    - update quantity or remove when `<= 0`
    - compute line totals and cart total in returned data
  - API behavior implemented:
    - unauthorized requests to cart endpoints return `401`
    - thin routes; business logic stays in service layer
  - frontend integration implemented:
    - add-to-cart from products page works against `/api/cart`
    - cart page supports quantity updates, remove, clear
    - cart data persists from MongoDB by authenticated user session
- Confirmed login works with both phone formats:
  - `+972...` and `05...`.
- Orders (service + API + UI) — see sections 3, 5, 6; smoke: place order from cart → order in list → open detail → other user / wrong id → `404` or no access.

### Note: dev warning fixed

- We saw a Mongoose warning about duplicate schema index on `Product.sku`.
- Fix applied: removed duplicate `unique: true` on the `sku` field and kept the single `productSchema.index({ sku: 1 }, { unique: true })`.
- Same pattern applied to cart unique-user index:
  - explicit cart index is kept on `userId`
  - avoided duplicate uniqueness declarations to prevent duplicate index warnings.

## 11) Cart i18n additions

- Added cart keys to all locale files:
  - `src/i18n/messages/en.json`
  - `src/i18n/messages/he.json`
  - `src/i18n/messages/ar.json`
- Added/updated keys include:
  - `cart.title`, `cart.empty`, `cart.total`, `cart.quantity`, `cart.remove`
  - `cart.added`, `cart.error`, `cart.loading`, `cart.goToCart`
  - `cart.sku`, `cart.unitPrice`, `cart.lineTotal`, `cart.increase`, `cart.decrease`, `cart.clearCart`, `cart.backToProducts`
- Products keys updated for add flow:
  - `products.actions.addToCart`
  - `products.actions.adding`
  - `products.messages.addError`

## 12) Orders i18n

- Namespace `orders` in `en.json`, `he.json`, `ar.json`
- Includes: `title`, `empty`, `total`, `status`, `createdAt`, `placeOrder`, `placingOrder`, `details`, `error`, `success`, `loading`, `backToCart`, `backToList`, `items`, `quantity`, `itemPrice`, `lineTotal`

## 13) Resume checklist for next session

1. `npm run dev`
2. Ensure `.env.local` has `MONGODB_URI`, `JWT_SECRET`, `SMS_MODE=development`
3. Smoke flow:
   - `/{locale}/register`
   - read code from terminal log
   - `/{locale}/verify`
   - `/{locale}/login`
   - `/{locale}/dashboard`
   - `/{locale}/dashboard/products`
     - if empty, run `POST /api/products/seed` once
     - click add-to-cart on an item
   - `/{locale}/dashboard/cart`
     - verify item appears
     - add same product again from products page and verify quantity increments
     - increase/decrease quantity from cart page
     - remove item
     - clear cart
   - refresh cart page and verify persistence
   - **place order** from cart → lands on `/{locale}/dashboard/orders` → cart empty when returning to cart
   - open order detail → line items + totals; wrong `id` or another user’s order → `404` / no leak
   - verify logged-out visit to `/{locale}/dashboard/*` shows **no flash** of protected page (loading shell, then login)
   - `GET /api/cart`, `GET /api/orders`, `GET /api/orders/[id]` without cookie → `401`
   - logout
4. Next feature work should continue from this architecture (service-first, i18n keys in 3 locales, RTL-safe UI, auth-from-cookie in server routes). After meaningful features or rule changes, update **this file** and **`docs/WORKING_INSTRUCTIONS.md`** as needed.

### Note: TypeScript and `.next`

- If `tsc` reports odd errors under `.next/dev/types`, run `npm run build` or remove a stale `.next` folder — `tsconfig` includes generated Next types.

