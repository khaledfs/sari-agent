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
- Customer account model (business layer, separate from `User` auth document):
  - `src/models/customer-account.model.ts`
  - one document per user: unique index on `userId`
  - fields: `businessName`, `phoneNumber`, `email`, `balance` (default `0`), `totalDebt` (default `0`), `lastPaymentDate`, timestamps
  - no business logic in schema

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
- `src/services/account.service.ts`
  - `getAccountByUser(userId)` — load `CustomerAccount` or **create** from `User` with mock `totalDebt` / `lastPaymentDate` for MVP
  - `getMockPaymentsByUser(userId)` — in-memory mock payment rows (`date`, `amount`), ready to replace with real source; route maps account + payments to JSON shape
- `src/services/product-import.service.ts`
  - dev/demo importer: fetches and parses `sarihassan.com` category listing HTML (server-side `fetch` + `cheerio`)
  - extracts `name`, `sku` (from `data-product_sku`), `price`, `imageUrl`, and infers `unit`/`packageSize` from the product name when possible
  - upserts into MongoDB by `sku`, skipping incomplete/invalid rows instead of failing the full import
- `src/services/financial.service.ts`
  - `getMockInvoicesByUser(userId)` — mock invoices (`id`, `invoiceNumber`, `date`, `dueDate`, `amount`, `status`: paid | unpaid | overdue); replace with real billing later

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
- Import from live site (dev/demo only):
  - `POST /api/products/import-from-site`
  - `src/app/api/products/import-from-site/route.ts`
  - scrapes a controlled list of `sarihassan.com` category pages (currently only `flours`, 1 page) and upserts into `Product` by `sku`
  - returns `{ created, updated, skipped }` summary; route is disabled in `NODE_ENV=production` and requires an authenticated cookie session

**MVP / production gap — product write APIs:** `POST /api/products`, `PUT /api/products/[id]`, and `POST /api/products/seed` do **not** call `getAuthenticatedUserId()` or any role check. Any caller can create/update products or trigger seed. **`GET /api/products`** returns only **`isActive: true`** products from MongoDB (real data once seeded or created). **`GET /api/products/[id]`** returns the document if the id exists (including inactive) — useful for admin-style use later, but currently unauthenticated.

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

### Account API (business profile / mock summary)

- `GET /api/account`
  - `src/app/api/account/route.ts`
  - returns `{ success, data: { profile, summary, payments } }` for authenticated user only
  - calls `getAccountByUser` + `getMockPaymentsByUser` from `src/services/account.service.ts` (response shape assembled in route)
  - unauthenticated → `401`

### Account invoices (mock financial V2)

- `GET /api/account/invoices`
  - `src/app/api/account/invoices/route.ts`
  - `{ success, data: { invoices } }` from `getMockInvoicesByUser` in `src/services/financial.service.ts`
  - unauthenticated → `401`

## 6) Frontend pages and behavior

- Register page:
  - `src/app/[locale]/(customer)/register/page.tsx`
  - fields: `businessName`, `email`, `phoneNumber`, `password`, `confirmPassword`
  - phone defaults to `+972`
  - supports Israeli normalization on submit (`053...` -> `+97253...`)
  - validates confirm password (required + match)
  - runtime success check requires:
    - HTTP status 200
    - payload `{ success: true }`
  - stores `pendingVerificationPhoneNumber` in `localStorage`.
- Verify page:
  - `src/app/[locale]/(customer)/verify/page.tsx`
  - field: `verificationCode` (6 digits)
  - reads phone number from query (`?phoneNumber=`) or from `localStorage`
  - posts to `/api/auth/verify`
  - runtime success check: status 200 + `success=true`.
- Login page:
  - `src/app/[locale]/(customer)/login/page.tsx`
  - fields: identifier (email/phone), password
  - posts to `/api/auth/login`
  - **Server session:** login route sets **`authToken` httpOnly cookie** (7d); all protected APIs use `getAuthenticatedUserId()` from that cookie.
  - **Client:** also saves the same JWT to `localStorage` under `authToken` (optional/redundant for current MVP — **fetch calls do not attach this header**; cookie is the real auth source). Logout on the dashboard hub clears `localStorage` and `POST /api/auth/logout` clears the cookie.
  - auto redirects to dashboard on success.
  - **Auth page branding + shared styling:** login/register/verify use `<main className="auth-shell">` + `<div className="auth-card">` and display the brand logo via `next/image` (`/logo.png`). The centered card, gradient background, and form spacing/styles come from `src/app/globals.css` (the `.auth-shell`, `.auth-card`, `.auth-logo`, `.auth-title`, `.auth-subtitle`, `.auth-form`, etc. rules).
- Dashboard page:
  - `src/app/[locale]/(customer)/dashboard/page.tsx`
  - protected by `src/app/[locale]/(customer)/dashboard/layout.tsx` (session gate before child routes render)
  - logout button clears session.
- Dashboard Products page:
  - `src/app/[locale]/(customer)/dashboard/products/page.tsx`
  - fetches `/api/products` and renders a **mobile-first** list
  - displays products as **image cards** (2-column grid): **big image**, then `name`, `price/unit`, and `sku`
  - includes working “Add to cart” action (`POST /api/cart` with quantity `1`)
  - includes per-item loading state and short success feedback
  - includes link to `/{locale}/dashboard/cart`.
- Dashboard Cart page:
  - `src/app/[locale]/(customer)/dashboard/cart/page.tsx`
  - fetches `/api/cart` for authenticated user cart
  - renders list with `name`, `sku`, unit price, quantity, line total (and product thumbnail when `imageUrl` exists)
  - renders cart total
  - supports:
    - increase/decrease quantity (`PUT /api/cart`)
    - **keyboard quantity edit** via a compact inline field between `-` and `+` (commit on blur/Enter); implemented to behave consistently on iPhone (uses `type=\"text\"` + `inputMode=\"numeric\"` to avoid iOS number-input layout issues)
    - remove item (`DELETE /api/cart`)
    - clear cart (`POST /api/cart/clear`)
    - place order (`POST /api/orders`) → redirect to `/{locale}/dashboard/orders`
  - includes empty state + error handling
  - UI kept simple, mobile-first, RTL-safe.
- Dashboard Orders list:
  - `src/app/[locale]/(customer)/dashboard/orders/page.tsx`
  - `GET /api/orders`
  - links to each order detail
- Dashboard Order detail:
  - `src/app/[locale]/(customer)/dashboard/orders/[id]/page.tsx`
  - `GET /api/orders/[id]`
- Dashboard Profile / business account (MVP single screen):
  - `src/app/[locale]/(customer)/dashboard/profile/page.tsx`
  - `GET /api/account` — business profile, account summary (balance, debt, last payment), mock payments list
- Dashboard Invoices (mock list):
  - `src/app/[locale]/(customer)/dashboard/invoices/page.tsx`
  - `GET /api/account/invoices`
- **Dashboard navigation:**
  - `src/components/dashboard-nav.tsx` — top link row (Home, Products, Cart, Orders, Profile, Invoices), shown on all dashboard routes via `src/app/[locale]/(customer)/dashboard/layout.tsx`
  - Dashboard home (`/dashboard`) — hub grid + logout; login redirects to `/{locale}/dashboard` explicitly
  - `src/app/[locale]/dashboard/layout.tsx` also renders the brand logo (`/logo.png`) above the nav tabs.
- **Dashboard styling (shared UI):**
  - `src/app/[locale]/(customer)/dashboard/dashboard-ui.css` — plain CSS design tokens and `ds-*` classes (shell, typography, cards, nav tabs, hub grid, buttons, invoice/order badges). Imported only from `dashboard/layout.tsx`.
  - Uses **logical properties** (`margin-inline`, `padding-inline`, etc.) for RTL.
  - `.ds-dash-shell` sets **readable text color**, **white background**, and **`color-scheme: light`** on the dashboard subtree so content stays legible when the OS uses dark mode and the root `body` applies a light foreground color.
- Session bootstrap:
  - `src/app/[locale]/SessionBootstrap.tsx`
  - injected in locale layout
  - on app start:
    - authenticated users are redirected to `/{locale}/dashboard` from home/login
    - **logged-out users hitting dashboard URLs are not redirected here** (avoids duplicate logic); see dashboard layout below.
- **Dashboard auth gate (no flash of protected content):**
  - `src/app/[locale]/(customer)/dashboard/layout.tsx` (client)
  - calls `GET /api/auth/session` and **does not render child routes** (`cart`, `products`, `orders`, `profile`, …) until authenticated
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

## 13) Account i18n

- Namespace `account` in `en.json`, `he.json`, `ar.json` — profile, summary, payments, loading/error/noPayments

## 14) Invoices i18n

- Namespace `invoices` in `en.json`, `he.json`, `ar.json` — title, paid/unpaid/overdue labels, date/dueDate/amount, loading/empty/error, navigation strings as needed

## 15) Admin login and admin pages

### Folder organization

Customer and admin pages are separated using Next.js **route groups** and regular folders:

```
src/app/[locale]/
├── layout.tsx, page.tsx, SessionBootstrap.tsx   ← shared
├── (customer)/                                  ← route group (no URL prefix)
│   ├── login/, register/, verify/
│   └── dashboard/ (layout, page, cart, orders, products, profile, invoices)
└── admin/                                       ← regular folder (/admin/* URLs)
    ├── login/page.tsx
    └── dashboard/
        ├── layout.tsx, loading.tsx, admin-auth-context.tsx, page.tsx
        ├── overview/page.tsx
        ├── customers/page.tsx
        ├── orders/page.tsx
        └── products/page.tsx
```

- `(customer)` uses parentheses so customer URLs stay as `/login`, `/dashboard` (no `/customer/` prefix).
- `admin/` is a regular folder so URLs are `/admin/login`, `/admin/dashboard`, etc.

### Shared login form component

- `src/components/login-form.tsx` — reusable login UI used by both customer and admin login pages.
- Accepts props: `translationNamespace`, `apiEndpoint`, `dashboardPath`, `sessionCheck`, `footer`.
- Customer login page (`src/app/[locale]/(customer)/login/page.tsx`) passes `"login"` namespace, `/api/auth/login`, `/dashboard`, and a register link footer.
- Admin login page (`src/app/[locale]/admin/login/page.tsx`) passes `"adminLogin"` namespace, `/api/auth/admin/login`, `/admin/dashboard`, and a stricter session check that verifies `role === "admin"`.

### Admin auth service

- `src/services/auth.service.ts` — added `loginAdmin()` function.
  - Same flow as `loginWithPassword()` (identifier lookup, bcrypt compare), but **rejects non-admin users** with "Access denied." instead of checking `isVerified`.
- `src/lib/auth-user.ts` — added `requireAdmin()` helper.
  - Reads `authToken` cookie, verifies JWT, checks `payload.role === "admin"`.
  - Used by admin API routes as a guard.

### Admin API routes

- `POST /api/auth/admin/login` (`src/app/api/auth/admin/login/route.ts`)
  - Calls `loginAdmin()`, sets `authToken` cookie (same cookie as customer login).
- `POST /api/auth/admin/seed` (`src/app/api/auth/admin/seed/route.ts`)
  - **Dev-only** endpoint (disabled in production).
  - Creates an admin user with defaults: `admin@sari.com` / `Admin1234`, `role: "admin"`, `isVerified: true`.
  - Skips if admin already exists.
- `GET /api/admin/customers` (`src/app/api/admin/customers/route.ts`)
  - Protected by `requireAdmin()`.
  - Returns all users with `role: "customer"` (excludes password), sorted newest first.

### Admin dashboard

- **Layout** (`src/app/[locale]/admin/dashboard/layout.tsx`) — client component.
  - Wraps children in `AdminAuthProvider` (context-based session check).
  - Header with logo, "Admin" badge, logout button.
  - Centered content area with max-width.
- **Auth context** (`admin-auth-context.tsx`) — session check runs once when layout mounts. Navigating between sub-pages does not re-check auth (context persists).
- **Loading** (`loading.tsx`) — spinner shown instantly during route transitions via React Suspense.
- **Dashboard home** (`page.tsx`) — server component. 2-column card grid linking to overview, customers, orders, products. Each card has icon, title, description.
- **Sub-pages** (overview, orders, products) — server components with `getTranslations({ locale, namespace })` for correct i18n. Show "under construction" placeholder + back link.
- **Customers page** — client component. Fetches `GET /api/admin/customers` and renders a table with business name, email, phone, verified badge (green/grey), join date. Includes loading spinner, error, and empty states.

### Admin i18n

- Added namespaces `adminLogin` and `adminDashboard` to all three locale files (`en.json`, `he.json`, `ar.json`).
- `adminLogin`: title, subtitle, fields, placeholders, actions, messages, errors.
- `adminDashboard`: title, badge, logout, loading, hub (title, subtitle, card labels + descriptions, backToDashboard, comingSoon), customers table (column headers, verified/notVerified labels, loading/empty/error).

### SessionBootstrap update

- `src/app/[locale]/SessionBootstrap.tsx` — now role-aware.
  - Admin users at `/admin/login` or home → redirected to `/admin/dashboard`.
  - Customer users at `/login` or home → redirected to `/dashboard`.

### Admin dashboard card styles

- Added to `src/app/globals.css`:
  - `.admin-card-grid`, `.admin-card` (hover lift + gold border), `.admin-card-icon`, `.admin-card-title`, `.admin-card-desc`
  - `.admin-table-wrap`, `.admin-table` (th/td/hover), `.admin-badge`, `.admin-badge-success`, `.admin-badge-muted`
  - `.admin-spinner` (brand-colored spinning border)
  - `.admin-back-link`

## 16) AI cart command MVP (OpenAI parser, service-first)

### What was added

- New backend-only MVP command endpoint:
  - `POST /api/assistant/cart-command`
  - Body: `{ "message": "..." }`
- OpenAI is used **only** to parse one free-text command into structured data.
- Product matching is deterministic and local (MongoDB active products only, no AI matching).
- Cart mutations reuse existing cart service methods (`addToCart`, `updateCartItem`, `removeCartItem`).

### New files

- `src/lib/openai.ts`
  - Shared OpenAI client loader using `OPENAI_API_KEY`.
  - Throws clear error when key is missing.
- `src/types/assistant.ts`
  - Shared parsed-command type/schema:
    - `action: "add" | "update" | "remove"`
    - `productQuery: string`
    - `quantity: number | null`
- `src/services/assistant-parser.service.ts`
  - Calls OpenAI with temperature `0` and strict parser prompt.
  - Validates and normalizes response via zod.
- `src/services/product-matching.service.ts`
  - Matches one product query against active products.
  - Deterministic scoring (exact SKU/name, contains, token overlap).
- `src/services/assistant-command.service.ts`
  - Orchestrates parse -> match -> cart action.
  - Returns structured action result with parsed command and matched product summary.
- `src/app/api/assistant/cart-command/route.ts`
  - Thin authenticated route (cookie/JWT via `getAuthenticatedUserId`).
  - No `userId` trust from payload.

### Env variable

- Added to `.env.example`:
  - `OPENAI_API_KEY=`

### Supported commands in this MVP

- One command per message.
- One product per message.
- Actions: `add`, `update`, `remove`.
- Quantity:
  - `add`: defaults to `1` if missing.
  - `update`: required and must be `> 0`.
  - `remove`: quantity ignored / normalized to `null`.

### Current limitations

- No multi-command parsing.
- No voice input.
- No recommendations.
- No conversational memory.
- No advanced mixed-language disambiguation beyond strict parser + deterministic matcher.

## 17) Post-pull updates (ledger + admin + perf)

These notes capture updates pulled from remote (`origin/khaled`, fast-forward to `06335bb`), so current behavior matches the latest branch state.

### Customer finance UX shifted from "Invoices" page to "Ledger" page

- New customer page:
  - `src/app/[locale]/(customer)/dashboard/ledger/page.tsx`
  - Loads `GET /api/account/ledger` and renders:
    - account summary
    - payments
    - checks
    - invoices
  - Uses locale-aware date/currency formatting and existing dashboard card/badge styles.
- Legacy invoices route now redirects:
  - `src/app/[locale]/(customer)/dashboard/invoices/page.tsx`
  - Redirect target: `/{locale}/dashboard/ledger`

### New ledger API route

- Added:
  - `src/app/api/account/ledger/route.ts`
- Auth:
  - Uses `getAuthenticatedUserId()` (cookie/JWT), returns `401` when unauthenticated.
- Response data:
  - summary from `getAccountByUser`
  - payments from `getMockPaymentsByUser`
  - checks + invoices from `financial.service`

### Financial service expansion

- `src/services/financial.service.ts` now includes mock checks:
  - types: `CheckStatus`, `MockCheck`
  - helper: `getMockChecksByUser(userId)`
- Existing invoice mock logic remains and is reused by ledger route.

### Dashboard navigation and home updates

- `src/components/dashboard-nav.tsx`
  - nav key switched from `invoices` to `ledger`
  - route switched to `/{locale}/dashboard/ledger`
- `src/app/[locale]/(customer)/dashboard/page.tsx`
  - dashboard hub card switched from invoices icon/link to ledger icon/link.

### Customer dashboard layout runtime improvements

- `src/app/[locale]/(customer)/dashboard/layout.tsx`
  - added route prefetching after authenticated phase (`products`, `cart`, `orders`, `profile`, `ledger`).
  - keeps existing auth gate behavior.
- Added route-level loading UI:
  - `src/app/[locale]/(customer)/dashboard/loading.tsx`
  - uses spinner while dashboard segment transitions.

### Admin customers flow hardening / service-first cleanup

- New shared admin helper:
  - `src/lib/admin-customers.ts`
  - enforces admin auth via `requireAdmin()`
  - centralizes customer list loading/mapping.
- `src/app/api/admin/customers/route.ts`
  - now calls `listAdminCustomers()`
  - keeps thin-route pattern and returns `401` for auth/role errors.
- `src/app/[locale]/admin/dashboard/customers/page.tsx`
  - now server-side via `listAdminCustomers()` + `getTranslations`
  - redirects unauthorized users to `/{locale}/admin/login`.

### Data/model and indexing update

- `src/models/product.model.ts`
  - added compound index:
    - `{ isActive: 1, category: 1, createdAt: -1 }`
  - intent: speed customer catalog queries by active/category/newest.

### i18n updates

- Message files updated:
  - `src/i18n/messages/en.json`
  - `src/i18n/messages/he.json`
  - `src/i18n/messages/ar.json`
- Includes ledger labels and dashboard nav/hub text changes from invoices -> ledger.

## 18) Smart ordering + explicit favorites + ML prep (customer)

- **Smart ordering (unchanged intent):** `src/services/smart-ordering.service.ts`
  - `getRecentProductsByUser`, `getFrequentProductsByUser` — order-history–derived only; **not** favorites.
  - `reorderOrderToCart` — owner-scoped reorder into cart.
- **Explicit favorites (user-marked only, not inferred):**
  - Model `src/models/user-favorite-product.model.ts` — `{ userId, productId }`, unique compound index `(userId, productId)`, refs `User` / `Product`.
  - Service `src/services/favorites.service.ts` — `getFavoriteProductsByUser` (active products only, skips missing/inactive), `addFavoriteProduct`, `removeFavoriteProduct`, `isFavoriteProduct`.
  - API `GET|POST|DELETE /api/favorites` — JSON body `{ productId }` for POST/DELETE; cookie auth; `401` if unauthenticated. **Removed** `GET /api/smart-ordering/favorites` (no score-based “favorites”).
- **Customer segmentation (schema only for now):** `src/models/customer-account.model.ts` optional `businessType` (enum), `specialization` (string), `sizeBand` (enum). Intended for cohorting / future features; registration does not collect them yet. Future ML-related fields (e.g. `priceSensitivityBand`, `orderFrequencyProfile`, `preferredPackSizes`) can live on `CustomerAccount` or a dedicated analytics doc when signals exist — see `src/types/business-segmentation.ts` comment.
- **ML feature scaffold (no training):** `src/services/recommendation-features.service.ts` — `buildRecommendationUserProductFeatures(userId, productId, referenceAt?)` returns typed `RecommendationUserProductFeatures` (`src/types/recommendation.ts`): history, category affinity, `isExplicitFavorite`, business profile, product metadata.
- **Dataset scaffold (no export / no Python):** `src/services/recommendation-dataset.service.ts` — `buildRecommendationExamplesForUser(userId)` builds in-memory `RecommendationTrainingExample[]` (positives = purchased lines per order; negatives = small deterministic same-category catalog sample not in order). For offline training / warehouse later.
- **UI:** `/{locale}/dashboard/products` — unified search; Recent / Frequent from smart-ordering APIs; **Favorites** from `GET /api/favorites` with Save/Remove controls (explicit only).
- **i18n:** `smartOrdering.*` includes favorite save/remove strings.
- **Limitations:** no model training or serving; feature builder uses **current** product categories for historical order lines when resolving category affinity; negatives are a tiny heuristic sample, not full candidate pools.

## 19) Recommendation ML baseline (Logistic Regression, offline)

- **Training target:** `label` in `RecommendationTrainingExample` = product **ordered in that order context** (from `recommendation-dataset.service`). `isExplicitFavorite` is **only an input feature**, not the label.
- **Flat features:** `src/lib/recommendation-feature-flat.ts` — `BASELINE_MODEL_FEATURE_KEYS` + `flattenRecommendationFeaturesForBaselineModel` / `baselineFeatureVector`. **Must match** `flatten_features()` in `scripts/train_logistic_recommendation.py`.
- **Export (admin-only):** `POST /api/admin/recommendations/export-dataset` optional body `{ "maxUsers": 50 }`. Uses `requireAdmin()`, writes:
  - `artifacts/recommendation-data/dataset.jsonl` — one JSON `RecommendationTrainingExample` per line
  - `artifacts/recommendation-data/feature_keys.json` — baseline column order for Python
- **Python:** `pip install -r requirements-ml.txt` then `npm run ml:train` or `python scripts/train_logistic_recommendation.py`. Writes `artifacts/recommendation-logreg/model.pkl`, `linear_head.json` (coef + intercept + names), `metrics.json` (ROC AUC, PR AUC, precision, recall, F1, precision@5 heuristic).
- **Inference (Node):** `src/services/recommendation-model.service.ts` — loads `linear_head.json`, scores **Candidate Generation V2** pool; `GET /api/recommendations?limit=12` (customer cookie auth). If artifact missing or score mismatch → deterministic fallback over the same candidate pool.
- **Limitations:** no LightGBM/XGBoost yet; no production model registry; linear head must stay aligned with export keys; small-data stratify may fall back; category expansion is shallow; artifacts gitignored — deploy pipeline must ship `linear_head.json` separately if needed.

### 19.1) Hardening pass (schema safety + validation split)

- Added shared schema contract: `src/lib/recommendation-schema.ts` (`RECOMMENDATION_SCHEMA_VERSION`, metadata builder).
- Dataset export now writes schema-aware files:
  - `artifacts/recommendation-data/feature_keys.json` as metadata object (`schemaVersion`, `featureKeys`, `featureCount`, `generatedAt`)
  - `artifacts/recommendation-data/metadata.json` with export counts + timestamp
- Python trainer (`scripts/train_logistic_recommendation.py`) now:
  - validates `feature_keys.json` schema version before training
  - uses **time-based split** (oldest train, newest validation), with safe random fallback only when required
  - writes schema metadata into `linear_head.json` (`schemaVersion`, `trainedAt`, `feature_count`)
  - writes richer `metrics.json` (`splitMethod`, class balance, time ranges, top positive/negative coefficients, fallback notes)
- Node inference (`src/services/recommendation-model.service.ts`) now validates artifact structure + schema/version + feature order/count and exposes status metadata.
  - On mismatch/invalid artifact it logs a warning and serves deterministic fallback only.
- Admin-only status route: `GET /api/admin/recommendations/status` for model load/debug visibility (mode, reason, schema, trainedAt, featureCount).

### 19.2) Candidate Generation V2 + Hard Negatives V1

- New service: `src/services/recommendation-candidates.service.ts`.
  - Builds deterministic deduped active-product pool with source attribution from:
    - `recent`
    - `frequent`
    - `favorite` (explicit only)
    - `category_affinity`
    - `co_purchase` (same-order co-occurrence with recent/frequent/favorite seeds)
    - `segment_popular` (similar customer profile: businessType + optional specialization/sizeBand boost)
    - `exploration` (small newest-active deterministic slice)
  - Returns `RecommendationCandidatePool` + `countsBySource`.
- Inference now uses candidate pool V2 before model scoring; deterministic fallback also uses candidate pool ordering.
- Dataset hard negatives upgraded in `src/services/recommendation-dataset.service.ts`:
  - For each order, negatives are selected deterministically from realistic buckets in this priority:
    1. same-category alternatives
    2. co_purchase candidates
    3. segment_popular candidates
    4. frequent/favorite candidates
    5. generic candidates
  - Target negatives per order: `max(4, positives*2)` capped at `18`.
- Admin debug route: `GET /api/admin/recommendations/candidates?userId=...&limit=...` returns candidate rows, source counts, and pool size.

## 20) Resume checklist for next session

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
   - `/{locale}/dashboard/profile` → `GET /api/account` shows profile + summary + mock payments; first visit creates `CustomerAccount` if missing
   - `/{locale}/dashboard/ledger` → `GET /api/account/ledger` returns summary + mock payments + mock checks + mock invoices
   - verify logged-out visit to `/{locale}/dashboard/*` shows **no flash** of protected page (loading shell, then login)
   - `GET /api/cart`, `GET /api/orders`, `GET /api/orders/[id]` without cookie → `401`
   - logout
   - **Admin flow:**
     - seed admin user: `POST /api/auth/admin/seed` (dev only)
     - `/{locale}/admin/login` → login with `admin@sari.com` / `Admin1234`
     - `/{locale}/admin/dashboard` → card grid renders in correct locale
     - click each card → sub-page loads, back link works
     - `/{locale}/admin/dashboard/customers` → table shows customer list from DB
     - verify non-admin user cannot access admin login (`POST /api/auth/admin/login` → "Access denied.")
     - verify `GET /api/admin/customers` without admin cookie → `401`
     - admin logout → redirected to `/admin/login`
4. Next feature work should continue from this architecture (service-first, i18n keys in 3 locales, RTL-safe UI, auth-from-cookie in server routes). After meaningful features or rule changes, update **this file** and **`docs/WORKING_INSTRUCTIONS.md`** as needed.

### Note: TypeScript and `.next`

- If `tsc` reports odd errors under `.next/dev/types`, run `npm run build` or remove a stale `.next` folder — `tsconfig` includes generated Next types.

