/**
 * Integration smoke checks against a RUNNING dev/prod server.
 *
 * Usage:
 *   npm run smoke                       # against http://localhost:3000
 *   BASE_URL=http://localhost:3001 npm run smoke
 *
 * Deliberately avoids OpenAI-dependent endpoints (cost + flakiness).
 * Prints PASS/FAIL per check and exits non-zero on any failure.
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// Seeded demo customer (scripts/seed-customers.js) — safe to log in as.
const SMOKE_CUSTOMER_PHONE = process.env.SMOKE_CUSTOMER_PHONE || "+972-52-3841176";
const SMOKE_CUSTOMER_PASSWORD = process.env.SMOKE_CUSTOMER_PASSWORD || "Customer1234";

let passed = 0;
let failed = 0;

function report(name, ok, detail = "") {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (ok) passed += 1;
  else failed += 1;
}

/** Extracts "name=value" for a cookie from Set-Cookie response headers. */
function extractCookie(response, name) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return cookie.split(";")[0];
    }
  }
  return null;
}

async function checkPageStatus(path) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { redirect: "follow" });
    report(`GET ${path} -> 200`, res.status === 200, `got ${res.status}`);
  } catch (err) {
    report(`GET ${path} -> 200`, false, String(err));
  }
}

async function loginSeededCustomer() {
  const name = "POST /api/auth/login (seeded customer) -> success + cookie";
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: SMOKE_CUSTOMER_PHONE,
        password: SMOKE_CUSTOMER_PASSWORD,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const cookie = extractCookie(res, "authToken");
    const ok = res.status === 200 && body.success === true && Boolean(cookie);
    report(name, ok, ok ? "" : `status ${res.status}, success=${body.success}, cookie=${Boolean(cookie)}`);
    return cookie;
  } catch (err) {
    report(name, false, String(err));
    return null;
  }
}

async function checkCartWithCookie(cookie) {
  const name = "GET /api/cart (authed) -> { success: true }";
  if (!cookie) {
    report(name, false, "skipped: no auth cookie from login");
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/api/cart`, { headers: { Cookie: cookie } });
    const body = await res.json().catch(() => ({}));
    report(name, res.status === 200 && body.success === true, `status ${res.status}, success=${body.success}`);
  } catch (err) {
    report(name, false, String(err));
  }
}

async function checkAdminOrdersUnauthenticated() {
  const name = "GET /api/admin/orders (unauthenticated) -> 401";
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders`);
    report(name, res.status === 401, `got ${res.status}`);
  } catch (err) {
    report(name, false, String(err));
  }
}

// ---------- payment feature (checkout options + collections scope) ----------

async function checkPaymentOptions(cookie) {
  const name = "GET /api/payments/options (authed) -> { cardEnabled, agentName }";
  if (!cookie) {
    report(name, false, "skipped: no auth cookie from login");
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/api/payments/options`, { headers: { Cookie: cookie } });
    const body = await res.json().catch(() => ({}));
    const ok =
      res.status === 200 &&
      body.success === true &&
      typeof body.data?.cardEnabled === "boolean" &&
      (body.data?.agentName === null || typeof body.data?.agentName === "string");
    report(name, ok, `status ${res.status}, cardEnabled=${body.data?.cardEnabled}`);
  } catch (err) {
    report(name, false, String(err));
  }
}

async function checkCollectionsUnauthenticated() {
  const name = "GET /api/admin/collections (unauthenticated) -> 401";
  try {
    const res = await fetch(`${BASE_URL}/api/admin/collections`);
    report(name, res.status === 401, `got ${res.status}`);
  } catch (err) {
    report(name, false, String(err));
  }
}

// ---------- admin section (Phase 1) ----------

/** Reads ADMIN_EMAIL / ADMIN_PASSWORD from env, falling back to .env.local. */
async function getAdminCredentials() {
  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    try {
      const { readFileSync } = await import("node:fs");
      const lines = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/);
      for (const line of lines) {
        const m = /^\s*(ADMIN_EMAIL|ADMIN_PASSWORD)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (m[1] === "ADMIN_EMAIL" && !email) email = val;
        if (m[1] === "ADMIN_PASSWORD" && !password) password = val;
      }
    } catch {
      // no .env.local — fall through to the skip warning
    }
  }
  return email && password ? { email, password } : null;
}

async function loginAdmin(credentials) {
  const name = "POST /api/auth/admin/login -> success + cookie";
  try {
    const res = await fetch(`${BASE_URL}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: credentials.email, password: credentials.password }),
    });
    const body = await res.json().catch(() => ({}));
    const cookie = extractCookie(res, "authToken");
    const ok = res.status === 200 && body.success === true && Boolean(cookie);
    report(name, ok, ok ? "" : `status ${res.status}, success=${body.success}`);
    return cookie;
  } catch (err) {
    report(name, false, String(err));
    return null;
  }
}

/** Returns the admin auth cookie for later sections (or null when skipped). */
async function adminProductsSection() {
  const credentials = await getAdminCredentials();
  if (!credentials) {
    console.log(
      "WARN  admin section skipped — set ADMIN_EMAIL and ADMIN_PASSWORD (env or .env.local) to enable it"
    );
    return null;
  }

  const cookie = await loginAdmin(credentials);
  if (!cookie) return null;

  // Paginated list, never more than 50 items.
  let firstProduct = null;
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products?page=1`, { headers: { Cookie: cookie } });
    const body = await res.json().catch(() => ({}));
    const items = body?.data?.items;
    const ok = res.status === 200 && body.success === true && Array.isArray(items) && items.length <= 50;
    report(
      "GET /api/admin/products?page=1 -> 200 + <=50 items",
      ok,
      `status ${res.status}, items=${Array.isArray(items) ? items.length : "n/a"}, total=${body?.data?.total}`
    );
    firstProduct = items?.[0] ?? null;
  } catch (err) {
    report("GET /api/admin/products?page=1 -> 200 + <=50 items", false, String(err));
  }

  // PATCH price, read back, then PATCH it back.
  if (firstProduct) {
    const name = "PATCH /api/admin/products/[id] price -> readback -> restore";
    const originalPrice = firstProduct.price;
    const testPrice = Math.round((originalPrice + 0.5) * 100) / 100;
    try {
      const patchRes = await fetch(`${BASE_URL}/api/admin/products/${firstProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ price: testPrice }),
      });
      const patchBody = await patchRes.json().catch(() => ({}));

      const readRes = await fetch(
        `${BASE_URL}/api/admin/products?search=${encodeURIComponent(firstProduct.sku)}`,
        { headers: { Cookie: cookie } }
      );
      const readBody = await readRes.json().catch(() => ({}));
      const readback = readBody?.data?.items?.find((p) => p.id === firstProduct.id);

      const restoreRes = await fetch(`${BASE_URL}/api/admin/products/${firstProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ price: originalPrice }),
      });
      const restoreBody = await restoreRes.json().catch(() => ({}));

      const ok =
        patchRes.status === 200 &&
        patchBody?.data?.price === testPrice &&
        readback?.price === testPrice &&
        restoreRes.status === 200 &&
        restoreBody?.data?.price === originalPrice;
      report(
        name,
        ok,
        `patched=${patchBody?.data?.price}, readback=${readback?.price}, restored=${restoreBody?.data?.price}`
      );
    } catch (err) {
      report(name, false, String(err));
    }
  } else {
    report("PATCH /api/admin/products/[id] price -> readback -> restore", false, "no product to test with");
  }

  // Unauthenticated PATCH must be rejected.
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products/000000000000000000000000`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: 1 }),
    });
    report("PATCH /api/admin/products (unauthenticated) -> 401", res.status === 401, `got ${res.status}`);
  } catch (err) {
    report("PATCH /api/admin/products (unauthenticated) -> 401", false, String(err));
  }

  return cookie;
}

// ---------- pricing engine section (Phase 2) ----------

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

/**
 * End-to-end pricing flow as the seeded bakery customer:
 * base price with no rules → businessType discount drops the list price →
 * order snapshot carries the breakdown → deactivating restores the base price.
 * Uses a "SMOKE pricing" labelled discount and clears the seed customer's cart.
 */
async function pricingEngineSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  pricing section skipped — needs both customer and admin logins");
    return;
  }
  const SMOKE_LABEL = "SMOKE pricing (auto)";

  // Cleanup: deactivate leftovers from previous runs so base-price asserts hold.
  try {
    const { body } = await jsonFetch("/api/admin/discounts", { headers: { Cookie: adminCookie } });
    for (const d of body?.data ?? []) {
      if (d.label === SMOKE_LABEL && d.isActive) {
        await jsonFetch(`/api/admin/discounts/${d.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ isActive: false }),
        });
      }
    }
  } catch {
    // continue; asserts below will surface real problems
  }

  // 1. With no pricing data the computed price equals the base price.
  let product = null;
  try {
    const { res, body } = await jsonFetch("/api/products", { headers: { Cookie: customerCookie } });
    const list = Array.isArray(body?.data) ? body.data : [];
    product = list.find((p) => typeof p.basePrice === "number" && p.basePrice > 1 && !p.priceBreakdown?.discountApplied) ?? null;
    const ok = res.status === 200 && Boolean(product) && product.price === product.basePrice;
    report(
      "pricing: list price === base with no rules",
      ok,
      product ? `price=${product.price}, base=${product.basePrice}` : "no product without rules found"
    );
  } catch (err) {
    report("pricing: list price === base with no rules", false, String(err));
  }
  if (!product) return;

  // 2. Cart regression: cleared cart + 1 unit === base price exactly.
  try {
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
    const { body: addBody } = await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: product._id, quantity: 1 }),
    });
    const total = addBody?.data?.cartTotal;
    report(
      "pricing: cart total with no rules === base price",
      total === product.basePrice,
      `cartTotal=${total}, base=${product.basePrice}`
    );
  } catch (err) {
    report("pricing: cart total with no rules === base price", false, String(err));
  }

  // 3. Create a bakery businessType 10% discount limited to this product.
  let discountId = null;
  try {
    const { res, body } = await jsonFetch("/api/admin/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        label: SMOKE_LABEL,
        scope: "businessType",
        targetId: "bakery",
        type: "percent",
        value: 10,
        productIds: [product._id],
      }),
    });
    discountId = body?.data?.id ?? null;
    report("pricing: admin creates businessType discount", res.status === 200 && Boolean(discountId), body?.message ?? "");
  } catch (err) {
    report("pricing: admin creates businessType discount", false, String(err));
  }

  const expectedDiscounted = Math.round(product.basePrice * 0.9 * 100) / 100;

  // 4. Customer list price drops accordingly.
  try {
    const { body } = await jsonFetch("/api/products", { headers: { Cookie: customerCookie } });
    const now = (body?.data ?? []).find((p) => p._id === product._id);
    report(
      "pricing: customer list price drops by the discount",
      now?.price === expectedDiscounted && now?.priceBreakdown?.discountApplied?.value === 10,
      `price=${now?.price}, expected=${expectedDiscounted}`
    );
  } catch (err) {
    report("pricing: customer list price drops by the discount", false, String(err));
  }

  // 5. Place the order; the line snapshot must carry the breakdown.
  try {
    const { res, body } = await jsonFetch("/api/orders", { method: "POST", headers: { Cookie: customerCookie } });
    const line = body?.data?.items?.[0];
    const ok =
      res.status === 200 &&
      line?.price === expectedDiscounted &&
      line?.priceBreakdown?.base === product.basePrice &&
      line?.priceBreakdown?.discountApplied?.value === 10 &&
      line?.priceBreakdown?.final === expectedDiscounted;
    report(
      "pricing: order line snapshots computed price + breakdown",
      ok,
      `linePrice=${line?.price}, breakdown=${JSON.stringify(line?.priceBreakdown ?? null)}`
    );
  } catch (err) {
    report("pricing: order line snapshots computed price + breakdown", false, String(err));
  }

  // 6. Deactivate the discount; the price must be restored to base.
  try {
    if (discountId) {
      await jsonFetch(`/api/admin/discounts/${discountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ isActive: false }),
      });
    }
    const { body } = await jsonFetch("/api/products", { headers: { Cookie: customerCookie } });
    const now = (body?.data ?? []).find((p) => p._id === product._id);
    report(
      "pricing: deactivating the discount restores the base price",
      now?.price === product.basePrice,
      `price=${now?.price}, base=${product.basePrice}`
    );
  } catch (err) {
    report("pricing: deactivating the discount restores the base price", false, String(err));
  }

  // 7. Unauthenticated admin pricing endpoints are rejected.
  try {
    const [a, b] = await Promise.all([
      fetch(`${BASE_URL}/api/admin/discounts`),
      fetch(`${BASE_URL}/api/admin/products/${product._id}/pricing`),
    ]);
    report(
      "pricing: unauthenticated admin pricing endpoints -> 401",
      a.status === 401 && b.status === 401,
      `discounts=${a.status}, productPricing=${b.status}`
    );
  } catch (err) {
    report("pricing: unauthenticated admin pricing endpoints -> 401", false, String(err));
  }
}

// ---------- promotions section (Phase 3) ----------

/**
 * End-to-end promotions flow: global minOrderGift → cart under threshold shows
 * no gift → past threshold the ₪0 gift line appears → the placed order carries
 * the gift line + promotionId → deactivating removes the gift from new carts.
 */
async function promotionsSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  promotions section skipped — needs both customer and admin logins");
    return;
  }
  const SMOKE_LABEL = "SMOKE promo (auto)";

  // Cleanup leftovers from previous runs.
  try {
    const { body } = await jsonFetch("/api/admin/promotions", { headers: { Cookie: adminCookie } });
    for (const p of body?.data ?? []) {
      if (p.label === SMOKE_LABEL && p.isActive) {
        await jsonFetch(`/api/admin/promotions/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ isActive: false }),
        });
      }
    }
  } catch {
    // asserts below surface real problems
  }

  // Pick a paid product (for cart lines) and a gift product (different one).
  let paid = null;
  let gift = null;
  try {
    const { body } = await jsonFetch("/api/admin/products?page=1", { headers: { Cookie: adminCookie } });
    const items = body?.data?.items ?? [];
    paid = items.find((p) => p.price >= 20 && p.isActive) ?? null;
    gift = items.find((p) => p.isActive && p.id !== paid?.id) ?? null;
  } catch {
    // reported below
  }
  if (!paid || !gift) {
    report("promo: found products for the flow", false, "could not pick paid+gift products");
    return;
  }

  const threshold = Math.round(paid.price * 3 * 100) / 100; // reachable with qty 3

  // Create a global minOrderGift promotion.
  let promotionId = null;
  try {
    const { res, body } = await jsonFetch("/api/admin/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        label: SMOKE_LABEL,
        kind: "minOrderGift",
        scope: "global",
        threshold,
        giftProductId: gift.id,
        giftQty: 1,
      }),
    });
    promotionId = body?.data?.id ?? null;
    report("promo: admin creates global minOrderGift", res.status === 200 && Boolean(promotionId), body?.message ?? "");
  } catch (err) {
    report("promo: admin creates global minOrderGift", false, String(err));
  }
  if (!promotionId) return;

  // Under threshold: no gift, but a progress hint.
  try {
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
    const { body } = await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: paid.id, quantity: 1 }),
    });
    const promos = body?.data?.promotions;
    const noGift = !(promos?.gifts ?? []).some((g) => g.promotionId === promotionId);
    const hasHint = promos?.nearestHint?.promotionId === promotionId;
    report("promo: under threshold -> no gift, progress hint present", noGift && hasHint, JSON.stringify(promos ?? null));
  } catch (err) {
    report("promo: under threshold -> no gift, progress hint present", false, String(err));
  }

  // Past threshold: ₪0 gift line appears.
  try {
    const { body } = await jsonFetch("/api/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: paid.id, quantity: 3 }),
    });
    const giftLine = (body?.data?.promotions?.gifts ?? []).find((g) => g.promotionId === promotionId);
    report(
      "promo: past threshold -> gift line appears",
      giftLine?.productId === gift.id && giftLine?.qty === 1,
      JSON.stringify(body?.data?.promotions?.gifts ?? [])
    );
  } catch (err) {
    report("promo: past threshold -> gift line appears", false, String(err));
  }

  // Place the order: gift line at price 0 + promotionId + appliedPromotionIds.
  try {
    const { res, body } = await jsonFetch("/api/orders", { method: "POST", headers: { Cookie: customerCookie } });
    const items = body?.data?.items ?? [];
    const giftLine = items.find((i) => i.isGift === true && i.promotionId === promotionId);
    const ok =
      res.status === 200 &&
      giftLine?.price === 0 &&
      giftLine?.quantity === 1 &&
      (body?.data?.appliedPromotionIds ?? []).includes(promotionId);
    report(
      "promo: order contains ₪0 gift line + promotionId",
      ok,
      `gift=${JSON.stringify(giftLine ?? null)}, applied=${JSON.stringify(body?.data?.appliedPromotionIds ?? [])}`
    );
  } catch (err) {
    report("promo: order contains ₪0 gift line + promotionId", false, String(err));
  }

  // Deactivate: a new qualifying cart shows no gift.
  try {
    await jsonFetch(`/api/admin/promotions/${promotionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ isActive: false }),
    });
    const { body } = await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: paid.id, quantity: 3 }),
    });
    const stillThere = (body?.data?.promotions?.gifts ?? []).some((g) => g.promotionId === promotionId);
    report("promo: deactivated -> gift gone from new cart", !stillThere, "");
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
  } catch (err) {
    report("promo: deactivated -> gift gone from new cart", false, String(err));
  }

  // ---- gift-tier multiplication: a "buy 10 -> 1 free" promo repeats per full 10 ----
  let tierPromoId = null;
  try {
    const { body: created } = await jsonFetch("/api/admin/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        label: SMOKE_LABEL,
        kind: "gift",
        scope: "global",
        buyProductId: paid.id,
        buyMinQty: 10,
        giftProductId: gift.id,
        giftQty: 1,
        maxTiers: 5,
      }),
    });
    tierPromoId = created?.data?.id ?? null;

    // Cart 20 of the trigger -> floor(20 / 10) = 2 gift units.
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
    const { body: cart } = await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: paid.id, quantity: 20 }),
    });
    const cartGift = (cart?.data?.promotions?.gifts ?? []).find((g) => g.promotionId === tierPromoId);
    report(
      "promo(tier): buy 20 on a 10->1 promo -> 2 gift units in the cart",
      cartGift?.productId === gift.id && cartGift?.qty === 2,
      JSON.stringify(cart?.data?.promotions?.gifts ?? [])
    );

    // Place the order -> the gift line carries the multiplied quantity (2), price 0.
    const { body: order } = await jsonFetch("/api/orders", { method: "POST", headers: { Cookie: customerCookie } });
    const orderGift = (order?.data?.items ?? []).find((i) => i.isGift === true && i.promotionId === tierPromoId);
    report(
      "promo(tier): placed order carries the multiplied gift quantity (2)",
      orderGift?.price === 0 && orderGift?.quantity === 2,
      `gift=${JSON.stringify(orderGift ?? null)}`
    );
  } catch (err) {
    report("promo(tier): buy 20 on a 10->1 promo -> 2 gift units in the cart", false, String(err));
  } finally {
    if (tierPromoId) {
      await jsonFetch(`/api/admin/promotions/${tierPromoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ isActive: false }),
      });
    }
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
  }
}

// ---------- banners section (Phase 4) ----------

/**
 * Banner flow: global banner visible to the seeded customer → deactivate →
 * gone. businessType-targeted banner (bakery) visible to the seeded bakery
 * customer; a cafe-targeted one is not.
 */
async function bannersSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  banners section skipped — needs both customer and admin logins");
    return;
  }
  const SMOKE_LABEL = "SMOKE banner (auto)";

  // Cleanup leftovers from previous runs.
  try {
    const { body } = await jsonFetch("/api/admin/banners", { headers: { Cookie: adminCookie } });
    for (const b of body?.data ?? []) {
      if (b.title.startsWith(SMOKE_LABEL) && b.isActive) {
        await jsonFetch(`/api/admin/banners/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ isActive: false }),
        });
      }
    }
  } catch {
    // asserts below surface real problems
  }

  async function createBanner(payload) {
    const { body } = await jsonFetch("/api/admin/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify(payload),
    });
    return body?.data?.id ?? null;
  }

  async function customerBannerIds() {
    const { body } = await jsonFetch("/api/banners", { headers: { Cookie: customerCookie } });
    return (body?.data ?? []).map((b) => b.id);
  }

  let globalId = null;
  let bakeryId = null;
  let cafeId = null;
  try {
    globalId = await createBanner({ title: `${SMOKE_LABEL} global`, scope: "global", priority: 99 });
    bakeryId = await createBanner({ title: `${SMOKE_LABEL} bakery`, scope: "businessType", targetId: "bakery", priority: 98 });
    cafeId = await createBanner({ title: `${SMOKE_LABEL} cafe`, scope: "businessType", targetId: "cafe", priority: 97 });
    report("banner: admin creates global + businessType banners", Boolean(globalId && bakeryId && cafeId), "");
  } catch (err) {
    report("banner: admin creates global + businessType banners", false, String(err));
    return;
  }

  try {
    const ids = await customerBannerIds();
    const ok = ids.includes(globalId) && ids.includes(bakeryId) && !ids.includes(cafeId) && ids.length <= 3;
    report(
      "banner: seeded bakery customer sees global + bakery, NOT cafe, max 3",
      ok,
      `visible=${JSON.stringify(ids)}`
    );
  } catch (err) {
    report("banner: seeded bakery customer sees global + bakery, NOT cafe, max 3", false, String(err));
  }

  // Image field round-trips to the customer feed (Task B: hero-sized banner).
  // The customer feed is capped at max-3-by-priority, so this probe MUST sort
  // above every other banner (the global/bakery/cafe ones above, and any
  // pre-existing seeded banners) to be deterministically present regardless of
  // what else is active. Use a sentinel priority far higher than any real one.
  const IMAGE_PROBE_PRIORITY = 1_000_000;
  let imageBannerId = null;
  try {
    imageBannerId = await createBanner({
      title: `${SMOKE_LABEL} image`,
      scope: "global",
      priority: IMAGE_PROBE_PRIORITY,
      imageUrl: "https://sarihassan.com/wp-content/uploads/banner-test.jpg",
    });
    const { body } = await jsonFetch("/api/banners", { headers: { Cookie: customerCookie } });
    const row = (body?.data ?? []).find((b) => b.id === imageBannerId);
    report(
      "banner: imageUrl round-trips to the customer feed",
      typeof row?.imageUrl === "string" && row.imageUrl.includes("banner-test.jpg"),
      `imageUrl=${row?.imageUrl}`
    );
    await jsonFetch(`/api/admin/banners/${imageBannerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ isActive: false }),
    });
  } catch (err) {
    report("banner: imageUrl round-trips to the customer feed", false, String(err));
  }

  // ctaHref validation: external URL rejected.
  try {
    const { res } = await jsonFetch("/api/admin/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ title: `${SMOKE_LABEL} evil`, scope: "global", ctaHref: "https://evil.example" }),
    });
    report("banner: external ctaHref rejected (400)", res.status === 400, `got ${res.status}`);
  } catch (err) {
    report("banner: external ctaHref rejected (400)", false, String(err));
  }

  // Deactivate all; customer no longer sees them.
  try {
    for (const id of [globalId, bakeryId, cafeId]) {
      await jsonFetch(`/api/admin/banners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ isActive: false }),
      });
    }
    const ids = await customerBannerIds();
    const gone = !ids.includes(globalId) && !ids.includes(bakeryId);
    report("banner: deactivated -> gone from customer feed", gone, `visible=${JSON.stringify(ids)}`);
  } catch (err) {
    report("banner: deactivated -> gone from customer feed", false, String(err));
  }

  // Unauthenticated: customer endpoint 401, admin endpoint 401.
  try {
    const [a, b] = await Promise.all([fetch(`${BASE_URL}/api/banners`), fetch(`${BASE_URL}/api/admin/banners`)]);
    report("banner: unauthenticated endpoints -> 401", a.status === 401 && b.status === 401, `customer=${a.status}, admin=${b.status}`);
  } catch (err) {
    report("banner: unauthenticated endpoints -> 401", false, String(err));
  }
}

// ---------- overview section (Phase 5) ----------

async function overviewSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  overview section skipped — needs both customer and admin logins");
    return;
  }

  async function readOverview() {
    const { res, body } = await jsonFetch("/api/admin/overview", { headers: { Cookie: adminCookie } });
    return { res, data: body?.data };
  }

  // Shape assertions.
  let before = null;
  try {
    const { res, data } = await readOverview();
    const shapeOk =
      res.status === 200 &&
      typeof data?.revenue?.today?.revenue === "number" &&
      typeof data?.revenue?.last7d?.orderCount === "number" &&
      typeof data?.revenue?.last30d?.revenue === "number" &&
      Array.isArray(data?.topProducts) &&
      data.topProducts.length <= 10 &&
      Array.isArray(data?.ordersByStatus) &&
      Array.isArray(data?.lowStock) &&
      data.lowStock.length <= 10 &&
      Array.isArray(data?.newestCustomers) &&
      data.newestCustomers.length <= 5 &&
      Array.isArray(data?.weeklyRevenue) &&
      data.weeklyRevenue.length === 8 &&
      data.weeklyRevenue.every((w) => typeof w.revenue === "number");
    report("overview: GET -> 200 + shape (numbers, capped arrays, 8 weeks)", shapeOk, `status ${res.status}`);
    before = data;
  } catch (err) {
    report("overview: GET -> 200 + shape (numbers, capped arrays, 8 weeks)", false, String(err));
  }

  // Revenue consistency: place an order, 'today' revenue grows by its total.
  try {
    const { body: productsBody } = await jsonFetch("/api/products", { headers: { Cookie: customerCookie } });
    const product = (productsBody?.data ?? []).find((p) => p.price > 1);
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
    await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: product._id, quantity: 1 }),
    });
    const { body: orderBody } = await jsonFetch("/api/orders", { method: "POST", headers: { Cookie: customerCookie } });
    const orderTotal = orderBody?.data?.total;
    const { data: after } = await readOverview();
    const delta = Math.round(((after?.revenue?.today?.revenue ?? 0) - (before?.revenue?.today?.revenue ?? 0)) * 100) / 100;
    report(
      "overview: today revenue grows by a fresh order's total",
      typeof orderTotal === "number" && delta === orderTotal,
      `delta=${delta}, orderTotal=${orderTotal}`
    );
  } catch (err) {
    report("overview: today revenue grows by a fresh order's total", false, String(err));
  }

  // Unauthenticated -> 401.
  try {
    const res = await fetch(`${BASE_URL}/api/admin/overview`);
    report("overview: unauthenticated -> 401", res.status === 401, `got ${res.status}`);
  } catch (err) {
    report("overview: unauthenticated -> 401", false, String(err));
  }
}

// ---------- admin order details section (Issue 2) ----------

async function adminOrderDetailSection(adminCookie) {
  if (!adminCookie) {
    console.log("WARN  admin order detail section skipped — needs admin login");
    return;
  }

  // Pick an order with items from the list.
  let orderId = null;
  let listTotal = null;
  try {
    const { body } = await jsonFetch("/api/admin/orders", { headers: { Cookie: adminCookie } });
    const withItems = (body?.data ?? []).find((o) => o.itemCount > 0);
    orderId = withItems?.id ?? null;
    listTotal = withItems?.total ?? null;
  } catch {
    // reported below
  }
  if (!orderId) {
    report("order-detail: found an order with items", false, "no orders with items");
    return;
  }

  // Detail returns non-empty snapshot items and a total matching the list row.
  try {
    const { res, body } = await jsonFetch(`/api/admin/orders/${orderId}`, { headers: { Cookie: adminCookie } });
    const d = body?.data;
    const ok =
      res.status === 200 &&
      Array.isArray(d?.items) &&
      d.items.length > 0 &&
      d.items.every((i) => typeof i.name === "string" && i.name.length > 0 && typeof i.unitPrice === "number") &&
      typeof d?.subtotal === "number" &&
      d?.total === listTotal &&
      Array.isArray(d?.statusHistory);
    report(
      "order-detail: GET -> 200 + non-empty items + total matches list",
      ok,
      `status ${res.status}, items=${d?.items?.length}, total=${d?.total} vs ${listTotal}`
    );
  } catch (err) {
    report("order-detail: GET -> 200 + non-empty items + total matches list", false, String(err));
  }

  // A status change appends a history entry with the admin actor; restore after.
  try {
    const { body: beforeBody } = await jsonFetch(`/api/admin/orders/${orderId}`, { headers: { Cookie: adminCookie } });
    const before = beforeBody?.data;
    const originalStatus = before?.status;
    const historyBefore = before?.statusHistory?.length ?? 0;

    const bounceStatus = originalStatus === "confirmed" ? "pending" : "confirmed";
    await jsonFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: bounceStatus }),
    });
    await jsonFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: originalStatus }),
    });

    const { body: afterBody } = await jsonFetch(`/api/admin/orders/${orderId}`, { headers: { Cookie: adminCookie } });
    const after = afterBody?.data;
    const appended = (after?.statusHistory?.length ?? 0) - historyBefore;
    const last = after?.statusHistory?.[after.statusHistory.length - 1];
    const ok =
      appended === 2 &&
      after?.status === originalStatus &&
      last?.status === originalStatus &&
      last?.changedByRole === "admin" &&
      typeof last?.changedAt === "string";
    report(
      "order-detail: two status changes -> two history entries w/ actor (status restored)",
      ok,
      `appended=${appended}, lastRole=${last?.changedByRole}`
    );
  } catch (err) {
    report("order-detail: two status changes -> two history entries w/ actor (status restored)", false, String(err));
  }

  // Unauthenticated detail -> 401.
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${orderId}`);
    report("order-detail: unauthenticated -> 401", res.status === 401, `got ${res.status}`);
  } catch (err) {
    report("order-detail: unauthenticated -> 401", false, String(err));
  }
}

// ---------- realtime SSE section (Issue 4) ----------

async function realtimeSection(customerCookie) {
  // Unauthenticated -> 401 (json error, not a stream).
  try {
    const res = await fetch(`${BASE_URL}/api/events`);
    report("sse: unauthenticated -> 401", res.status === 401, `got ${res.status}`);
  } catch (err) {
    report("sse: unauthenticated -> 401", false, String(err));
  }

  if (!customerCookie) {
    console.log("WARN  sse authed check skipped — needs customer login");
    return;
  }

  // Authed -> text/event-stream and at least one frame (connected comment or
  // heartbeat) inside 30s; the read is timeout-bounded and the stream closed.
  const name = "sse: authed -> event-stream + heartbeat within 30s";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${BASE_URL}/api/events`, {
      headers: { Cookie: customerCookie },
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (res.status !== 200 || !contentType.includes("text/event-stream")) {
      report(name, false, `status ${res.status}, content-type ${contentType}`);
      return;
    }
    const reader = res.body.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value ?? new Uint8Array());
    const ok = text.includes(": connected") || text.includes(": ping") || text.includes("event:");
    report(name, ok, `first frame: ${JSON.stringify(text.slice(0, 60))}`);
    await reader.cancel().catch(() => {});
  } catch (err) {
    report(name, false, String(err));
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

// ---------- restricted-customer section (Issue 3) ----------

async function restrictedCustomerSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  restricted section skipped — needs both customer and admin logins");
    return;
  }

  // Resolve the seeded customer's id via the admin CRM.
  let customerId = null;
  try {
    const { body } = await jsonFetch(
      `/api/admin/customers?search=${encodeURIComponent(SMOKE_CUSTOMER_PHONE)}`,
      { headers: { Cookie: adminCookie } }
    );
    customerId = body?.data?.items?.[0]?.id ?? null;
  } catch {
    // reported below
  }
  if (!customerId) {
    report("restricted: resolve seeded customer id", false, "not found via CRM search");
    return;
  }

  // Pick a product for cart attempts.
  let productId = null;
  try {
    const { body } = await jsonFetch("/api/products", { headers: { Cookie: customerCookie } });
    productId = (body?.data ?? [])[0]?._id ?? null;
  } catch {
    // reported below
  }

  async function setStatus(status) {
    const { res } = await jsonFetch(`/api/admin/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ accountStatus: status, ...(status === "restricted" ? { restrictedReason: "SMOKE (auto)" } : {}) }),
    });
    return res.status === 200;
  }

  try {
    // RESTRICT.
    const restricted = await setStatus("restricted");
    report("restricted: admin sets accountStatus=restricted", restricted, "");

    // Cart mutation -> 403 ACCOUNT_RESTRICTED.
    const { res: cartRes, body: cartBody } = await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    report(
      "restricted: cart POST -> 403 ACCOUNT_RESTRICTED",
      cartRes.status === 403 && cartBody?.code === "ACCOUNT_RESTRICTED",
      `status ${cartRes.status}, code=${cartBody?.code}`
    );

    // Order creation -> 403 ACCOUNT_RESTRICTED.
    const { res: orderRes, body: orderBody } = await jsonFetch("/api/orders", {
      method: "POST",
      headers: { Cookie: customerCookie },
    });
    report(
      "restricted: order POST -> 403 ACCOUNT_RESTRICTED",
      orderRes.status === 403 && orderBody?.code === "ACCOUNT_RESTRICTED",
      `status ${orderRes.status}, code=${orderBody?.code}`
    );

    // Reads stay open: orders list, cart read, ledger.
    const [ordersRead, cartRead, ledgerRead] = await Promise.all([
      jsonFetch("/api/orders", { headers: { Cookie: customerCookie } }),
      jsonFetch("/api/cart", { headers: { Cookie: customerCookie } }),
      jsonFetch("/api/account/ledger", { headers: { Cookie: customerCookie } }),
    ]);
    report(
      "restricted: orders GET / cart GET / ledger GET stay 200",
      ordersRead.res.status === 200 && cartRead.res.status === 200 && ledgerRead.res.status === 200,
      `orders=${ordersRead.res.status}, cart=${cartRead.res.status}, ledger=${ledgerRead.res.status}`
    );

    // Login is NOT blocked while restricted.
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: SMOKE_CUSTOMER_PHONE, password: SMOKE_CUSTOMER_PASSWORD }),
    });
    report("restricted: login still succeeds (no login block)", loginRes.status === 200, `got ${loginRes.status}`);

    // UN-RESTRICT and verify cart works again; then restore cart state.
    const unrestricted = await setStatus("active");
    const { res: cartRes2 } = await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    await jsonFetch("/api/cart", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId }),
    });
    report(
      "restricted: un-restrict -> cart POST 200 (state restored)",
      unrestricted && cartRes2.status === 200,
      `patch=${unrestricted}, cart=${cartRes2.status}`
    );
  } catch (err) {
    report("restricted: section crashed", false, String(err));
    // Best-effort restore so a crash never leaves the seed customer locked.
    try {
      await setStatus("active");
    } catch {
      /* manual cleanup needed */
    }
  }
}

// ---------- receipt gating section (Issue 1) ----------

async function receiptSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  receipt section skipped — needs both customer and admin logins");
    return;
  }

  // Pick one of the seeded customer's orders.
  let orderId = null;
  let originalStatus = null;
  try {
    const { body } = await jsonFetch("/api/orders", { headers: { Cookie: customerCookie } });
    const order = (body?.data ?? [])[0];
    orderId = order?.id ?? null;
    originalStatus = order?.status ?? null;
  } catch {
    // reported below
  }
  if (!orderId) {
    report("receipt: found a customer order", false, "no orders for seeded customer");
    return;
  }

  async function setStatus(status) {
    const { res } = await jsonFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status }),
    });
    return res.status === 200;
  }

  try {
    // Force a pre-dispatch state.
    await setStatus("pending");
    const { res: lockedRes, body: lockedBody } = await jsonFetch(`/api/orders/${orderId}/receipt`, {
      headers: { Cookie: customerCookie },
    });
    report(
      "receipt: pre-dispatch -> 403 RECEIPT_NOT_AVAILABLE",
      lockedRes.status === 403 && lockedBody?.code === "RECEIPT_NOT_AVAILABLE",
      `status ${lockedRes.status}, code=${lockedBody?.code}`
    );

    // Cancelled never qualifies.
    await setStatus("cancelled");
    const { res: cancelledRes, body: cancelledBody } = await jsonFetch(`/api/orders/${orderId}/receipt`, {
      headers: { Cookie: customerCookie },
    });
    report(
      "receipt: cancelled -> 403 RECEIPT_NOT_AVAILABLE",
      cancelledRes.status === 403 && cancelledBody?.code === "RECEIPT_NOT_AVAILABLE",
      `status ${cancelledRes.status}, code=${cancelledBody?.code}`
    );

    // Unauthenticated -> 401.
    const unauthRes = await fetch(`${BASE_URL}/api/orders/${orderId}/receipt`);
    report("receipt: unauthenticated -> 401", unauthRes.status === 401, `got ${unauthRes.status}`);

    // Another customer -> 404 (no existence leak).
    let otherCookie = null;
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "+972-53-4906138", password: SMOKE_CUSTOMER_PASSWORD }),
      });
      otherCookie = extractCookie(res, "authToken");
    } catch {
      // reported below
    }
    if (otherCookie) {
      const { res: otherRes } = await jsonFetch(`/api/orders/${orderId}/receipt`, {
        headers: { Cookie: otherCookie },
      });
      report("receipt: another customer -> 404", otherRes.status === 404, `got ${otherRes.status}`);
    } else {
      report("receipt: another customer -> 404", false, "second seeded customer login failed");
    }

    // Dispatch -> owner gets the receipt data.
    await setStatus("out_for_delivery");
    const { res: openRes, body: openBody } = await jsonFetch(`/api/orders/${orderId}/receipt`, {
      headers: { Cookie: customerCookie },
    });
    report(
      "receipt: dispatched -> 200 + order snapshot",
      openRes.status === 200 && openBody?.data?.order?.id === orderId && Array.isArray(openBody?.data?.order?.items),
      `status ${openRes.status}`
    );

    // A RESTRICTED customer still gets receipts of dispatched orders (Issue 3 interplay).
    let customerId = null;
    try {
      const { body } = await jsonFetch(
        `/api/admin/customers?search=${encodeURIComponent(SMOKE_CUSTOMER_PHONE)}`,
        { headers: { Cookie: adminCookie } }
      );
      customerId = body?.data?.items?.[0]?.id ?? null;
    } catch {
      // reported below
    }
    if (customerId) {
      await jsonFetch(`/api/admin/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ accountStatus: "restricted" }),
      });
      const { res: restrictedReceiptRes } = await jsonFetch(`/api/orders/${orderId}/receipt`, {
        headers: { Cookie: customerCookie },
      });
      await jsonFetch(`/api/admin/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ accountStatus: "active" }),
      });
      report(
        "receipt: restricted customer still gets a dispatched receipt",
        restrictedReceiptRes.status === 200,
        `got ${restrictedReceiptRes.status}`
      );
    } else {
      report("receipt: restricted customer still gets a dispatched receipt", false, "customer id not resolved");
    }

    // Admin keeps access (assumed policy).
    const { res: adminReceiptRes } = await jsonFetch(`/api/orders/${orderId}/receipt`, {
      headers: { Cookie: adminCookie },
    });
    report("receipt: admin keeps access", adminReceiptRes.status === 200, `got ${adminReceiptRes.status}`);
  } finally {
    // Restore the order's original status.
    if (originalStatus) await setStatus(originalStatus);
  }
}

// ---------- ledger section (Issue 8) ----------

async function ledgerSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  ledger section skipped — needs both customer and admin logins");
    return;
  }

  async function readLedger() {
    const { res, body } = await jsonFetch("/api/account/ledger", { headers: { Cookie: customerCookie } });
    return { res, data: body?.data };
  }

  // Shape.
  let before = null;
  try {
    const { res, data } = await readLedger();
    const ok =
      res.status === 200 &&
      Array.isArray(data?.entries) &&
      typeof data?.summary?.currentBalanceMinor === "number" &&
      Number.isInteger(data.summary.currentBalanceMinor) &&
      data?.summary?.currency === "ILS" &&
      data.entries.every(
        (e) => Number.isInteger(e.debitMinor) && Number.isInteger(e.creditMinor) && Number.isInteger(e.balanceAfterMinor)
      );
    report("ledger: GET -> 200 + integer minor-unit shape", ok, `status ${res.status}, entries=${data?.entries?.length}`);
    before = data;
  } catch (err) {
    report("ledger: GET -> 200 + integer minor-unit shape", false, String(err));
  }

  // Unauthenticated -> 401.
  try {
    const res = await fetch(`${BASE_URL}/api/account/ledger`);
    report("ledger: unauthenticated -> 401", res.status === 401, `got ${res.status}`);
  } catch (err) {
    report("ledger: unauthenticated -> 401", false, String(err));
  }

  // Admin ledger endpoint rejects customer tokens (scope enforcement).
  let customerId = null;
  try {
    const { body } = await jsonFetch(
      `/api/admin/customers?search=${encodeURIComponent(SMOKE_CUSTOMER_PHONE)}`,
      { headers: { Cookie: adminCookie } }
    );
    customerId = body?.data?.items?.[0]?.id ?? null;
    const { res } = await jsonFetch(`/api/admin/customers/${customerId}/ledger`, {
      headers: { Cookie: customerCookie },
    });
    report("ledger: admin endpoint with customer token -> 401", res.status === 401, `got ${res.status}`);
  } catch (err) {
    report("ledger: admin endpoint with customer token -> 401", false, String(err));
  }

  // Order placement posts an order_charge for exactly the order total.
  let orderId = null;
  let orderTotalMinor = null;
  try {
    const { body: productsBody } = await jsonFetch("/api/products", { headers: { Cookie: customerCookie } });
    const product = (productsBody?.data ?? []).find((p) => p.price > 1);
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
    await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: product._id, quantity: 1 }),
    });
    const { body: orderBody } = await jsonFetch("/api/orders", { method: "POST", headers: { Cookie: customerCookie } });
    orderId = orderBody?.data?.id ?? null;
    orderTotalMinor = Math.round((orderBody?.data?.total ?? 0) * 100);

    const { data: after } = await readLedger();
    const delta = (after?.summary?.currentBalanceMinor ?? 0) - (before?.summary?.currentBalanceMinor ?? 0);
    const chargeEntry = (after?.entries ?? []).find((e) => e.type === "order_charge" && e.orderId === orderId);
    report(
      "ledger: new order -> order_charge for exactly the order total",
      delta === orderTotalMinor && chargeEntry?.debitMinor === orderTotalMinor,
      `delta=${delta}, expected=${orderTotalMinor}, entry=${Boolean(chargeEntry)}`
    );
  } catch (err) {
    report("ledger: new order -> order_charge for exactly the order total", false, String(err));
  }

  // Admin records a payment -> balance decreases by the amount.
  try {
    const paymentAmount = 7.5; // ₪
    const { res } = await jsonFetch(`/api/admin/customers/${customerId}/ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ type: "payment", amount: paymentAmount, description: "SMOKE payment (auto)" }),
    });
    const { data: after } = await readLedger();
    const paymentEntry = (after?.entries ?? []).find((e) => e.description === "SMOKE payment (auto)");
    report(
      "ledger: admin payment -> credit posted with correct sign",
      res.status === 200 && paymentEntry?.creditMinor === 750 && paymentEntry?.debitMinor === 0,
      `status ${res.status}, credit=${paymentEntry?.creditMinor}`
    );
  } catch (err) {
    report("ledger: admin payment -> credit posted with correct sign", false, String(err));
  }

  // Cancelling the order posts a compensating reversal; balance returns.
  try {
    const { data: beforeCancel } = await readLedger();
    await jsonFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const { data: after } = await readLedger();
    const reversal = (after?.entries ?? []).find((e) => e.type === "refund" && e.orderId === orderId);
    const delta = (after?.summary?.currentBalanceMinor ?? 0) - (beforeCancel?.summary?.currentBalanceMinor ?? 0);
    const original = (after?.entries ?? []).find((e) => e.type === "order_charge" && e.orderId === orderId);
    report(
      "ledger: cancel -> reversal appears, balance returns, original untouched",
      reversal?.creditMinor === orderTotalMinor && delta === -orderTotalMinor && original?.debitMinor === orderTotalMinor,
      `reversal=${reversal?.creditMinor}, delta=${delta}`
    );
  } catch (err) {
    report("ledger: cancel -> reversal appears, balance returns, original untouched", false, String(err));
  }

  // Double-cancel is idempotent (unique order_reversal key).
  try {
    await jsonFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "pending" }),
    });
    await jsonFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const { data: after } = await readLedger();
    const reversals = (after?.entries ?? []).filter((e) => e.type === "refund" && e.orderId === orderId);
    report("ledger: re-cancel does not duplicate the reversal (idempotency)", reversals.length === 1, `count=${reversals.length}`);
  } catch (err) {
    report("ledger: re-cancel does not duplicate the reversal (idempotency)", false, String(err));
  }
}

// ---------- locale section (Issue 5) ----------

async function localeSection() {
  // The NEXT_LOCALE cookie steers the root redirect (SSR and cookie agree).
  const name = "locale: NEXT_LOCALE cookie steers the root redirect";
  try {
    const res = await fetch(`${BASE_URL}/`, {
      redirect: "manual",
      headers: { Cookie: "NEXT_LOCALE=he" },
    });
    const location = res.headers.get("location") ?? "";
    const ok = res.status >= 300 && res.status < 400 && /\/he(\/|$)/.test(location);
    report(name, ok, `status ${res.status}, location=${location}`);
  } catch (err) {
    report(name, false, String(err));
  }
}

// ---------- AI assistant section (Issue 6) — env-gated: SMOKE_AI=1 ----------
// Hits OpenAI (cost + latency + slight nondeterminism), so it only runs when
// explicitly requested. Assertions stay structural, never on exact AI wording.

async function aiAssistantSection(customerCookie, adminCookie) {
  if (process.env.SMOKE_AI !== "1") {
    console.log("WARN  AI assistant section skipped — set SMOKE_AI=1 to enable (calls OpenAI)");
    return;
  }
  if (!customerCookie) {
    console.log("WARN  AI assistant section skipped — needs customer login");
    return;
  }

  async function askAssistant(message) {
    const { res, body } = await jsonFetch("/api/assistant/message", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ message, locale: "he" }),
    });
    return { res, data: body?.data };
  }

  // Advice question -> 200 with a real non-empty answer.
  try {
    const { res, data } = await askAssistant("איזה קמח מתאים ללחם כפרי?");
    report(
      "ai: advice question -> 200 + non-empty answer",
      res.status === 200 && typeof data?.message === "string" && data.message.length > 20,
      `status ${res.status}, len=${data?.message?.length}`
    );
  } catch (err) {
    report("ai: advice question -> 200 + non-empty answer", false, String(err));
  }

  // Cart-add through the assistant actually changes the cart.
  try {
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
    const { res, data } = await askAssistant("תוסיף 2 סוכר לבן שק");
    const { body: cartBody } = await jsonFetch("/api/cart", { headers: { Cookie: customerCookie } });
    const items = cartBody?.data?.items ?? [];
    report(
      "ai: assistant cart-add actually changes the cart",
      res.status === 200 && data?.actionResult === "added" && items.length > 0,
      `actionResult=${data?.actionResult}, cartItems=${items.length}`
    );
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
  } catch (err) {
    report("ai: assistant cart-add actually changes the cart", false, String(err));
  }

  // Streaming path (Task C): SSE stream completes with a final event whose
  // text equals the concatenated deltas; the legacy JSON checks above prove
  // the old contract still works.
  try {
    const res = await fetch(`${BASE_URL}/api/assistant/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ message: "מהו קמח מלא?", locale: "he", stream: true }),
    });
    const contentType = res.headers.get("content-type") ?? "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let deltas = "";
    let finalText = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === "delta") deltas += ev.text;
        if (ev.type === "final") finalText = ev.data?.message ?? "";
      }
    }
    report(
      "ai: streaming -> event-stream completes, deltas == final text",
      res.status === 200 && contentType.includes("text/event-stream") && typeof finalText === "string" && deltas.trim() === finalText.trim(),
      `status ${res.status}, deltas=${deltas.length} chars, final=${finalText?.length ?? "none"}`
    );
  } catch (err) {
    report("ai: streaming -> event-stream completes, deltas == final text", false, String(err));
  }

  // Restricted: cart refused (no mutation), advice still 200.
  if (adminCookie) {
    let customerId = null;
    try {
      const { body } = await jsonFetch(
        `/api/admin/customers?search=${encodeURIComponent(SMOKE_CUSTOMER_PHONE)}`,
        { headers: { Cookie: adminCookie } }
      );
      customerId = body?.data?.items?.[0]?.id ?? null;
      await jsonFetch(`/api/admin/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ accountStatus: "restricted" }),
      });

      const { res, data } = await askAssistant("תוסיף 1 קמח לבן");
      const { body: cartBody } = await jsonFetch("/api/cart", { headers: { Cookie: customerCookie } });
      const items = cartBody?.data?.items ?? [];
      report(
        "ai: restricted customer -> polite refusal, cart untouched, still 200",
        res.status === 200 && data?.actionResult !== "added" && items.length === 0,
        `status ${res.status}, actionResult=${data?.actionResult}, cartItems=${items.length}`
      );
    } catch (err) {
      report("ai: restricted customer -> polite refusal, cart untouched, still 200", false, String(err));
    } finally {
      if (customerId) {
        await jsonFetch(`/api/admin/customers/${customerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ accountStatus: "active" }),
        });
      }
    }
  }
}

// ---------- field-agent scoping + messaging section (Work Order 2, Task D) ----------

async function agentSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  agent section skipped — needs both customer and admin logins");
    return;
  }
  const AGENT_PHONE = "+972-50-7199999";
  const AGENT_PASSWORD = "Agent1234A";
  const OTHER_PHONE = "+972-53-4906138";

  async function findCustomerId(phone) {
    const { body } = await jsonFetch(`/api/admin/customers?search=${encodeURIComponent(phone)}`, {
      headers: { Cookie: adminCookie },
    });
    return body?.data?.items?.[0]?.id ?? null;
  }

  const myCustomerId = await findCustomerId(SMOKE_CUSTOMER_PHONE);
  const otherCustomerId = await findCustomerId(OTHER_PHONE);
  if (!myCustomerId || !otherCustomerId) {
    report("agent: resolve seeded customers", false, "seeded customers missing");
    return;
  }

  // 1. Admin creates (or reuses) the smoke agent.
  let agentId = null;
  try {
    const { body } = await jsonFetch("/api/admin/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        businessName: "SMOKE agent (auto)",
        email: "smoke.agent@seed.sari.local",
        phoneNumber: AGENT_PHONE,
        password: AGENT_PASSWORD,
        routeLabel: "SMOKE route",
      }),
    });
    agentId = body?.data?.id ?? null;
    if (!agentId) {
      const { body: listBody } = await jsonFetch("/api/admin/agents", { headers: { Cookie: adminCookie } });
      agentId = (listBody?.data ?? []).find((a) => a.phoneNumber === AGENT_PHONE)?.id ?? null;
    }
    report("agent: admin creates/reuses an agent", Boolean(agentId), `agentId=${agentId}`);
  } catch (err) {
    report("agent: admin creates/reuses an agent", false, String(err));
    return;
  }

  // Remember original assignment to restore later.
  const originalAssignment = null; // seeded customers start unassigned (verified by seed-agents --dry)

  try {
    // 2. Assign ONE customer to the agent (admin-only PATCH).
    const { res: assignRes } = await jsonFetch(`/api/admin/customers/${myCustomerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ assignedAgentId: agentId }),
    });
    report("agent: admin assigns a customer", assignRes.status === 200, `got ${assignRes.status}`);

    // 3. Agent logs in through the console login.
    const agentLogin = await fetch(`${BASE_URL}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: AGENT_PHONE, password: AGENT_PASSWORD }),
    });
    const agentCookie = extractCookie(agentLogin, "authToken");
    report("agent: console login works for agents", agentLogin.status === 200 && Boolean(agentCookie), `got ${agentLogin.status}`);
    if (!agentCookie) return;

    // 4. Agent sees EXACTLY their customer(s).
    const { body: custBody } = await jsonFetch("/api/admin/customers", { headers: { Cookie: agentCookie } });
    const ids = (custBody?.data?.items ?? []).map((c) => c.id);
    report(
      "agent: customer list is scoped to their book",
      ids.length === 1 && ids[0] === myCustomerId,
      `ids=${JSON.stringify(ids)}`
    );

    // 5. Orders list scoped; agent can update their customer's order status.
    const { body: ordersBody } = await jsonFetch("/api/admin/orders", { headers: { Cookie: agentCookie } });
    const orders = ordersBody?.data ?? [];
    const foreign = orders.filter((o) => o.customer && o.customer.id !== myCustomerId);
    report("agent: orders list contains only their customers' orders", foreign.length === 0, `foreign=${foreign.length}`);
    if (orders.length > 0) {
      const target = orders[0];
      const bounce = target.status === "confirmed" ? "pending" : "confirmed";
      const { res: up1 } = await jsonFetch(`/api/admin/orders/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: agentCookie },
        body: JSON.stringify({ status: bounce }),
      });
      await jsonFetch(`/api/admin/orders/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: agentCookie },
        body: JSON.stringify({ status: target.status }),
      });
      report("agent: can update own customer's order status (restored)", up1.status === 200, `got ${up1.status}`);
    }

    // 5b. Agent collections view + admin agent-performance overview (this feature).
    try {
      const { body: prodBody } = await jsonFetch("/api/admin/products?page=1", { headers: { Cookie: adminCookie } });
      const collProduct = (prodBody?.data?.items ?? []).find((p) => p.isActive && p.price > 1) ?? null;
      if (collProduct) {
        await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
        await jsonFetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: customerCookie },
          body: JSON.stringify({ productId: collProduct.id, quantity: 2 }),
        });
        const { body: ord } = await jsonFetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: customerCookie },
          body: JSON.stringify({ paymentMethod: "agent" }),
        });
        const collOrderId = ord?.data?.id ?? null;
        const collTotalMinor = Math.round((ord?.data?.total ?? 0) * 100);

        // Pending agent order -> the agent sees it as not-yet-collectible (no task yet).
        const { body: pendView } = await jsonFetch("/api/admin/collections", { headers: { Cookie: agentCookie } });
        const pendRow = (pendView?.data ?? []).find((r) => r.orderId === collOrderId);
        report(
          "agent(collections): pending agent order is not-yet-collectible",
          pendRow?.state === "pending" && pendRow?.taskId === null,
          `state=${pendRow?.state}, task=${pendRow?.taskId}`
        );

        // Confirm -> collectible row for the AGENT with the server amount.
        await jsonFetch(`/api/admin/orders/${collOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ status: "confirmed" }),
        });
        const { body: collView } = await jsonFetch("/api/admin/collections", { headers: { Cookie: agentCookie } });
        const collRow = (collView?.data ?? []).find((r) => r.orderId === collOrderId);
        report(
          "agent(collections): confirmed -> collectible row scoped to the agent",
          collRow?.state === "collectible" && collRow?.amountMinor === collTotalMinor && Boolean(collRow?.taskId),
          `state=${collRow?.state}, amt=${collRow?.amountMinor} vs ${collTotalMinor}`
        );

        // Badge count (agent-scoped) reflects the open task.
        const { body: countBody } = await jsonFetch("/api/admin/collections/count", { headers: { Cookie: agentCookie } });
        report(
          "agent(collections): badge count includes the open task",
          (countBody?.data?.collectible ?? 0) >= 1,
          `count=${countBody?.data?.collectible}`
        );

        // Admin overview carries the agent-performance table; the agent's does NOT.
        const { body: adminOv } = await jsonFetch("/api/admin/overview", { headers: { Cookie: adminCookie } });
        const perf = (adminOv?.data?.agentPerformance ?? []).find((a) => a.agentId === agentId);
        report(
          "overview(admin): agent-performance row present (customers + outstanding)",
          Boolean(perf) && perf.customerCount >= 1 && perf.outstandingMinor >= collTotalMinor,
          `row=${JSON.stringify(perf ?? null)}`
        );
        const { body: agentOv } = await jsonFetch("/api/admin/overview", { headers: { Cookie: agentCookie } });
        report(
          "overview(agent): agent-performance is admin-only (empty for agents)",
          (agentOv?.data?.agentPerformance ?? []).length === 0,
          `len=${agentOv?.data?.agentPerformance?.length}`
        );

        // Cleanup: cancel the order (charge + reversal net to 0; task -> cancelled).
        await jsonFetch(`/api/admin/orders/${collOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ status: "cancelled" }),
        });
        await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
      }
    } catch (err) {
      report("agent(collections): view + performance flow", false, String(err));
    }

    // 6. Cross-scope access -> 404 (no existence leak).
    const { res: crossRes } = await jsonFetch(`/api/admin/customers/${otherCustomerId}`, {
      headers: { Cookie: agentCookie },
    });
    report("agent: another agent's customer -> 404", crossRes.status === 404, `got ${crossRes.status}`);

    // 7. Admin-only surfaces -> 403 FORBIDDEN_SCOPE.
    const { res: prodRes, body: prodBody } = await jsonFetch(`/api/admin/products/000000000000000000000000`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: agentCookie },
      body: JSON.stringify({ price: 1 }),
    });
    const { res: discRes, body: discBody } = await jsonFetch("/api/admin/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: agentCookie },
      body: JSON.stringify({ label: "SMOKE agent global", scope: "global", type: "percent", value: 10 }),
    });
    report(
      "agent: product edit + global discount -> 403 FORBIDDEN_SCOPE",
      prodRes.status === 403 && prodBody?.code === "FORBIDDEN_SCOPE" && discRes.status === 403 && discBody?.code === "FORBIDDEN_SCOPE",
      `product=${prodRes.status}/${prodBody?.code}, discount=${discRes.status}/${discBody?.code}`
    );

    // 8. Reports scoped: agent's orders report only covers their customers.
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { body: reportBody } = await jsonFetch("/api/admin/reports/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: agentCookie },
      body: JSON.stringify({ from, to: now.toISOString() }),
    });
    const reportRows = reportBody?.data ?? [];
    const strangers = reportRows.filter((r) => r.phone && r.phone !== SMOKE_CUSTOMER_PHONE);
    report("agent: reports cover only their customers", strangers.length === 0, `strangers=${strangers.length}`);

    // 9. Agent records a payment on their customer's ledger (actor recorded).
    const { res: payRes } = await jsonFetch(`/api/admin/customers/${myCustomerId}/ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: agentCookie },
      body: JSON.stringify({ type: "payment", amount: 1.5, description: "SMOKE agent payment (auto)" }),
    });
    const { body: ledgerBody } = await jsonFetch(`/api/admin/customers/${myCustomerId}/ledger`, {
      headers: { Cookie: agentCookie },
    });
    const paymentEntry = (ledgerBody?.data?.entries ?? []).find((e) => e.description === "SMOKE agent payment (auto)");
    report(
      "agent: ledger payment posted with the agent as actor",
      payRes.status === 200 && paymentEntry?.createdByRole === "agent",
      `status ${payRes.status}, actorRole=${paymentEntry?.createdByRole}`
    );

    // 10. Messaging round trip — while the customer is RESTRICTED.
    await jsonFetch(`/api/admin/customers/${myCustomerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ accountStatus: "restricted" }),
    });
    const { res: msgRes } = await jsonFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ body: "SMOKE: בקשה מהסוכן (auto)" }),
    });
    report("agent: RESTRICTED customer can still message", msgRes.status === 200, `got ${msgRes.status}`);
    await jsonFetch(`/api/admin/customers/${myCustomerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ accountStatus: "active" }),
    });

    // Agent sees the thread with an unread badge and replies.
    const { body: threadsBody } = await jsonFetch("/api/admin/messages", { headers: { Cookie: agentCookie } });
    const thread = (threadsBody?.data ?? []).find((th) => th.customerId === myCustomerId);
    report("agent: thread visible with unread indicator", Boolean(thread) && thread.unreadCount > 0, `unread=${thread?.unreadCount}`);
    if (thread) {
      const { res: replyRes } = await jsonFetch(`/api/admin/messages/${thread.threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: agentCookie },
        body: JSON.stringify({ body: "SMOKE: תשובת הסוכן (auto)" }),
      });
      const { body: custThread } = await jsonFetch("/api/messages", { headers: { Cookie: customerCookie } });
      const sawReply = (custThread?.data?.messages ?? []).some((m) => m.body.includes("תשובת הסוכן"));
      report("agent: reply reaches the customer", replyRes.status === 200 && sawReply, `reply=${replyRes.status}, seen=${sawReply}`);

      // Admin reads the whole thread.
      const { res: adminReadRes, body: adminReadBody } = await jsonFetch(`/api/admin/messages/${thread.threadId}`, {
        headers: { Cookie: adminCookie },
      });
      report(
        "agent: admin can read the entire thread",
        adminReadRes.status === 200 && (adminReadBody?.data?.messages ?? []).length >= 2,
        `status ${adminReadRes.status}, messages=${adminReadBody?.data?.messages?.length}`
      );
    }
  } finally {
    // Restore: unassign the customer (seeded state = unassigned).
    await jsonFetch(`/api/admin/customers/${myCustomerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ assignedAgentId: originalAssignment }),
    });
  }
}

// ---------- supplied-quantity adjustment section (warehouse shortage) ----------

async function adjustmentSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  adjustment section skipped — needs both customer and admin logins");
    return;
  }

  async function ledgerBalance() {
    const { body } = await jsonFetch("/api/account/ledger", { headers: { Cookie: customerCookie } });
    return body?.data?.summary?.currentBalanceMinor ?? 0;
  }

  // Create a fresh pre-dispatch order of 10 units so the flow is deterministic.
  let orderId = null;
  try {
    const { body: productsBody } = await jsonFetch("/api/products", { headers: { Cookie: customerCookie } });
    const product = (productsBody?.data ?? []).find((p) => p.price > 1 && !p.priceBreakdown?.discountApplied);
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
    await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: product._id, quantity: 10 }),
    });
    const { body: orderBody } = await jsonFetch("/api/orders", { method: "POST", headers: { Cookie: customerCookie } });
    orderId = orderBody?.data?.id ?? null;
    report("adjust: created a 10-unit pre-dispatch order", Boolean(orderId), `orderId=${orderId}`);
  } catch (err) {
    report("adjust: created a 10-unit pre-dispatch order", false, String(err));
  }
  if (!orderId) return;

  try {
    // Read admin detail: find a non-gift line, its ordered qty + unit price.
    const { body: d0 } = await jsonFetch(`/api/admin/orders/${orderId}`, { headers: { Cookie: adminCookie } });
    const detail0 = d0?.data;
    const idx = (detail0?.items ?? []).findIndex((it) => !it.isGift);
    const line = detail0.items[idx];
    const unit = line.unitPrice;
    const total0 = detail0.total;
    const balance0 = await ledgerBalance();
    report(
      "adjust: line starts supplied === ordered",
      line.suppliedQuantity === line.quantity && line.quantity === 10,
      `ordered=${line.quantity}, supplied=${line.suppliedQuantity}`
    );

    // Adjust 10 → 9 with a note.
    const { res: a1, body: b1 } = await jsonFetch(`/api/admin/orders/${orderId}/adjust`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ lines: [{ index: idx, suppliedQuantity: 9, note: "SMOKE: חוסר במלאי" }] }),
    });
    const total1 = b1?.data?.total;
    const balance1 = await ledgerBalance();
    const expectedDelta = Math.round(unit * 100); // one unit, in agorot
    report(
      "adjust: 10→9 drops order total by exactly one unit + ledger by the same",
      a1.status === 200 &&
        Math.round((total0 - total1) * 100) === expectedDelta &&
        balance0 - balance1 === expectedDelta &&
        b1?.data?.items?.[idx]?.suppliedQuantity === 9 &&
        b1?.data?.adjusted === true,
      `Δtotal=${Math.round((total0 - total1) * 100)}, Δbalance=${balance0 - balance1}, expected=${expectedDelta}`
    );

    // Idempotent: re-applying supplied=9 changes nothing.
    const { body: bDup } = await jsonFetch(`/api/admin/orders/${orderId}/adjust`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ lines: [{ index: idx, suppliedQuantity: 9, note: "SMOKE: חוסר במלאי" }] }),
    });
    const balanceDup = await ledgerBalance();
    report(
      "adjust: re-applying the same supplied value is a no-op (idempotent)",
      bDup?.data?.total === total1 && balanceDup === balance1,
      `total=${bDup?.data?.total}, balance=${balanceDup}`
    );

    // Second adjustment 9 → 8: balance still exact.
    const { body: b2 } = await jsonFetch(`/api/admin/orders/${orderId}/adjust`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ lines: [{ index: idx, suppliedQuantity: 8 }] }),
    });
    const balance2 = await ledgerBalance();
    report(
      "adjust: 9→8 credits one more unit; balance exact after two adjustments",
      balance1 - balance2 === expectedDelta && balance0 - balance2 === expectedDelta * 2,
      `Δbalance=${balance1 - balance2}, total0-total2=${balance0 - balance2}`
    );

    // supplied > ordered → 400 ADJUSTMENT_INVALID.
    const { res: rInvalid, body: bInvalid } = await jsonFetch(`/api/admin/orders/${orderId}/adjust`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ lines: [{ index: idx, suppliedQuantity: 999 }] }),
    });
    report(
      "adjust: supplied > ordered → 400 ADJUSTMENT_INVALID",
      rInvalid.status === 400 && bInvalid?.code === "ADJUSTMENT_INVALID",
      `status ${rInvalid.status}, code=${bInvalid?.code}`
    );

    // Customer sees supplied qty + the note.
    const { body: cust } = await jsonFetch(`/api/orders/${orderId}`, { headers: { Cookie: customerCookie } });
    const custLine = (cust?.data?.items ?? [])[idx];
    report(
      "adjust: customer sees supplied quantity + supplier note + adjusted flag",
      custLine?.suppliedQuantity === 8 && custLine?.quantity === 10 && Boolean(custLine?.adjustmentNote) && cust?.data?.adjusted === true,
      `supplied=${custLine?.suppliedQuantity}, ordered=${custLine?.quantity}`
    );

    // Cross-scope agent (SMOKE agent has no customers now) → 404.
    const agentLogin = await fetch(`${BASE_URL}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "+972-50-7199999", password: "Agent1234A" }),
    });
    const agentCookie = extractCookie(agentLogin, "authToken");
    if (agentCookie) {
      const { res: rCross } = await jsonFetch(`/api/admin/orders/${orderId}/adjust`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: agentCookie },
        body: JSON.stringify({ lines: [{ index: idx, suppliedQuantity: 7 }] }),
      });
      report("adjust: cross-scope agent adjust → 404", rCross.status === 404, `got ${rCross.status}`);
    } else {
      report("adjust: cross-scope agent adjust → 404", false, "agent login failed");
    }

    // After dispatch → 403 ADJUSTMENT_NOT_ALLOWED; receipt shows supplied qty.
    await jsonFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "out_for_delivery" }),
    });
    const { res: rLate, body: bLate } = await jsonFetch(`/api/admin/orders/${orderId}/adjust`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ lines: [{ index: idx, suppliedQuantity: 7 }] }),
    });
    report(
      "adjust: after dispatch → 403 ADJUSTMENT_NOT_ALLOWED",
      rLate.status === 403 && bLate?.code === "ADJUSTMENT_NOT_ALLOWED",
      `status ${rLate.status}, code=${bLate?.code}`
    );
    const { body: rc } = await jsonFetch(`/api/orders/${orderId}/receipt`, { headers: { Cookie: customerCookie } });
    const rcLine = (rc?.data?.order?.items ?? [])[idx];
    report(
      "adjust: dispatched receipt shows the SUPPLIED quantity",
      rcLine?.suppliedQuantity === 8 && rcLine?.quantity === 10,
      `supplied=${rcLine?.suppliedQuantity}, ordered=${rcLine?.quantity}`
    );
  } finally {
    // Restore: cancel the test order (posts a balancing reversal, no dangling debt).
    await jsonFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "cancelled" }),
    });
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
  }
}

// ---------- payment methods + stock commitment + collections section ----------

async function paymentSection(customerCookie, adminCookie) {
  if (!customerCookie || !adminCookie) {
    console.log("WARN  payment section skipped — needs both customer and admin logins");
    return;
  }

  async function ledgerBalance() {
    const { body } = await jsonFetch("/api/account/ledger", { headers: { Cookie: customerCookie } });
    return body?.data?.summary?.currentBalanceMinor ?? 0;
  }
  async function productStock(productId) {
    const { body } = await jsonFetch(`/api/admin/products?search=`, { headers: { Cookie: adminCookie } });
    const row = (body?.data?.items ?? []).find((p) => p.id === productId);
    return row ? row.stock : undefined;
  }
  async function setStock(productId, stock) {
    await jsonFetch(`/api/admin/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ stock }),
    });
  }
  async function setOrderStatus(orderId, status) {
    await jsonFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status }),
    });
  }
  async function offsetCredit(customerId, amountMinor, label) {
    // Restores the seed ledger after a cancel reversal (adjustment posts a debit).
    await jsonFetch(`/api/admin/customers/${customerId}/ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ type: "adjustment", amount: amountMinor / 100, description: label }),
    });
  }

  // Resolve seed customer id (for ledger restore).
  let customerId = null;
  try {
    const { body } = await jsonFetch(`/api/admin/customers?search=${encodeURIComponent(SMOKE_CUSTOMER_PHONE)}`, {
      headers: { Cookie: adminCookie },
    });
    customerId = body?.data?.items?.[0]?.id ?? null;
  } catch {
    /* reported below */
  }

  // Pick a product and give it tracked stock 50 (restored at the end).
  let product = null;
  let originalStock;
  try {
    const { body } = await jsonFetch("/api/admin/products?page=1", { headers: { Cookie: adminCookie } });
    product = (body?.data?.items ?? []).find((p) => p.isActive && p.price > 1) ?? null;
    originalStock = product?.stock ?? null;
    if (product) await setStock(product.id, 50);
    report("pay: staged a tracked-stock product (50 units)", Boolean(product), `product=${product?.id}`);
  } catch (err) {
    report("pay: staged a tracked-stock product (50 units)", false, String(err));
  }
  if (!product || !customerId) return;

  const QTY = 3;

  try {
    // ---- AGENT PATH ----
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
    await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: product.id, quantity: QTY }),
    });
    const balance0 = await ledgerBalance();
    const { res: oRes, body: oBody } = await jsonFetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ paymentMethod: "agent" }),
    });
    const agentOrder = oBody?.data;
    const totalMinor = Math.round((agentOrder?.total ?? 0) * 100);
    report(
      "pay(agent): order created as collect_via_agent",
      oRes.status === 200 && agentOrder?.paymentMethod === "agent" && agentOrder?.paymentStatus === "collect_via_agent",
      `method=${agentOrder?.paymentMethod}, status=${agentOrder?.paymentStatus}`
    );

    let stockNow = await productStock(product.id);
    report("pay(agent): stock UNCHANGED at order creation", stockNow === 50, `stock=${stockNow}`);

    // Confirm → collection task exists; stock still unchanged (commit is at dispatch).
    await setOrderStatus(agentOrder.id, "confirmed");
    const { body: collBody } = await jsonFetch("/api/admin/collections", { headers: { Cookie: adminCookie } });
    const task = (collBody?.data ?? []).find((r) => r.orderId === agentOrder.id);
    report(
      "pay(agent): confirmed -> open collection task with the SERVER amount",
      Boolean(task) && task.amountMinor === totalMinor,
      `task=${Boolean(task)}, amount=${task?.amountMinor} vs ${totalMinor}`
    );
    stockNow = await productStock(product.id);
    report("pay(agent): stock still unchanged after confirm", stockNow === 50, `stock=${stockNow}`);

    // Cross-scope agent (SMOKE agent has no customers) -> 404 on collect.
    const agentLogin = await fetch(`${BASE_URL}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "+972-50-7199999", password: "Agent1234A" }),
    });
    const smokeAgentCookie = extractCookie(agentLogin, "authToken");
    if (task && smokeAgentCookie) {
      const { res: crossRes } = await jsonFetch(`/api/admin/collections/${task.taskId}/collect`, {
        method: "POST",
        headers: { Cookie: smokeAgentCookie },
      });
      report("pay(agent): cross-agent collect -> 404", crossRes.status === 404, `got ${crossRes.status}`);
    } else {
      report("pay(agent): cross-agent collect -> 404", false, "no task or agent login failed");
    }

    // Dispatch -> stock committed EXACTLY once (double dispatch = no-op).
    await setOrderStatus(agentOrder.id, "out_for_delivery");
    stockNow = await productStock(product.id);
    report("pay(agent): dispatch commits stock once (50 -> 47)", stockNow === 50 - QTY, `stock=${stockNow}`);
    await setOrderStatus(agentOrder.id, "packed");
    await setOrderStatus(agentOrder.id, "out_for_delivery"); // double dispatch
    stockNow = await productStock(product.id);
    report("pay(agent): double dispatch does NOT decrement again", stockNow === 50 - QTY, `stock=${stockNow}`);

    // Advance to DELIVERED — the row must STAY collectible with its task
    // (regression guard for the "delivered shows not-yet-collectible" bug).
    await setOrderStatus(agentOrder.id, "delivered");
    const { body: delivView } = await jsonFetch("/api/admin/collections", { headers: { Cookie: adminCookie } });
    const delivRow = (delivView?.data ?? []).find((r) => r.orderId === agentOrder.id);
    report(
      "pay(agent): delivered order stays collectible with a task (not stuck pending)",
      delivRow?.state === "collectible" && Boolean(delivRow?.taskId) && delivRow?.orderStatus === "delivered",
      `state=${delivRow?.state}, task=${Boolean(delivRow?.taskId)}, status=${delivRow?.orderStatus}`
    );

    // Collect -> ledger payment by the actor; balance returns to pre-order level.
    if (task) {
      await jsonFetch(`/api/admin/collections/${task.taskId}/collect`, {
        method: "POST",
        headers: { Cookie: adminCookie },
      });
      const balanceAfterCollect = await ledgerBalance();
      report(
        "pay(agent): collected -> payment posted, balance back to baseline",
        balanceAfterCollect === balance0,
        `balance=${balanceAfterCollect}, baseline=${balance0}`
      );
      // Idempotent: collect again -> no second payment.
      await jsonFetch(`/api/admin/collections/${task.taskId}/collect`, {
        method: "POST",
        headers: { Cookie: adminCookie },
      });
      const balanceAfterTwice = await ledgerBalance();
      report("pay(agent): double collect posts NO second payment", balanceAfterTwice === balance0, `balance=${balanceAfterTwice}`);

      // Collected order leaves the collections list.
      const { body: afterCollectView } = await jsonFetch("/api/admin/collections", { headers: { Cookie: adminCookie } });
      const stillListed = (afterCollectView?.data ?? []).some((r) => r.orderId === agentOrder.id);
      report("pay(agent): collected order leaves the collections list", !stillListed, `stillListed=${stillListed}`);
    }

    // Cancel -> stock returned once + reversal; offset the credit to restore the seed ledger.
    await setOrderStatus(agentOrder.id, "cancelled");
    stockNow = await productStock(product.id);
    report("pay(agent): cancel returns the stock (back to 50)", stockNow === 50, `stock=${stockNow}`);
    await offsetCredit(customerId, totalMinor, "SMOKE payment restore (auto)");

    // ---- OVERSELL (accepted risk): stock 2, order 3 -> commit 2, flag, credit ----
    await setStock(product.id, 2);
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
    await jsonFetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: product.id, quantity: QTY }),
    });
    const overBalance0 = await ledgerBalance();
    const { body: ovBody } = await jsonFetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ paymentMethod: "agent" }),
    });
    const overOrder = ovBody?.data;
    await setOrderStatus(overOrder.id, "confirmed");
    await setOrderStatus(overOrder.id, "out_for_delivery"); // commit: only 2 available
    const overStock = await productStock(product.id);
    const { body: ovAfter } = await jsonFetch(`/api/orders/${overOrder.id}`, { headers: { Cookie: customerCookie } });
    const ovLine = (ovAfter?.data?.items ?? []).find((i) => i.productId === product.id && !i.isGift);
    const overBalance = await ledgerBalance();
    const newTotalMinor = Math.round((ovAfter?.data?.total ?? 0) * 100);
    report(
      "pay(oversell): payment kept, committed down to stock, order flagged adjusted",
      overStock === 0 && ovAfter?.data?.adjusted === true && ovLine?.suppliedQuantity === 2 && ovLine?.quantity === QTY,
      `stock=${overStock}, adjusted=${ovAfter?.data?.adjusted}, supplied=${ovLine?.suppliedQuantity}`
    );
    report(
      "pay(oversell): ledger nets to the ADJUSTED total (charge - shortage credit)",
      overBalance - overBalance0 === newTotalMinor,
      `delta=${overBalance - overBalance0}, adjustedTotal=${newTotalMinor}`
    );
    // Cleanup: cancel -> returns the 2 committed units + reversal of the adjusted total.
    await setOrderStatus(overOrder.id, "cancelled");
    const overStockEnd = await productStock(product.id);
    const overBalanceEnd = await ledgerBalance();
    report(
      "pay(oversell): cancel returns committed units + balance restored",
      overStockEnd === 2 && overBalanceEnd === overBalance0,
      `stock=${overStockEnd}, balance=${overBalanceEnd} vs ${overBalance0}`
    );
    await setStock(product.id, 50);

    // ---- CARD PATH (mock) — only when the SERVER has PAYMENTS_ENABLED ----
    const { body: optBody } = await jsonFetch("/api/payments/options", { headers: { Cookie: customerCookie } });
    const cardEnabled = Boolean(optBody?.data?.cardEnabled);
    if (!cardEnabled) {
      // Disabled: endpoints answer 503 with the stable code; card path skipped.
      const whRes = await fetch(`${BASE_URL}/api/payments/webhook`, { method: "POST", body: "{}" });
      const whBody = await whRes.json().catch(() => ({}));
      report(
        "pay(card): disabled -> webhook 503 PAYMENTS_DISABLED (flow skipped)",
        whRes.status === 503 && whBody?.code === "PAYMENTS_DISABLED",
        `got ${whRes.status}/${whBody?.code}`
      );
      console.log("WARN  card flow skipped — start the server with PAYMENTS_ENABLED=true to run it");
    } else {
      // Bad webhook signature -> 400 (never applied).
      const badRes = await fetch(`${BASE_URL}/api/payments/webhook`, {
        method: "POST",
        headers: { "x-payment-signature": "deadbeef" },
        body: JSON.stringify({ intentId: "x", status: "paid", amountMinor: 1 }),
      });
      report("pay(card): invalid webhook signature -> 400", badRes.status === 400, `got ${badRes.status}`);

      await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
      await jsonFetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: customerCookie },
        body: JSON.stringify({ productId: product.id, quantity: QTY }),
      });
      const cardBalance0 = await ledgerBalance();
      const { res: cRes, body: cBody } = await jsonFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: customerCookie },
        body: JSON.stringify({ paymentMethod: "card" }),
      });
      const cardOrder = cBody?.data;
      const cardTotalMinor = Math.round((cardOrder?.total ?? 0) * 100);
      report(
        "pay(card): order created pending with a client token (no card data)",
        cRes.status === 200 && cardOrder?.paymentStatus === "pending" && Boolean(cBody?.clientToken),
        `status=${cardOrder?.paymentStatus}, token=${Boolean(cBody?.clientToken)}`
      );
      let cardStock = await productStock(product.id);
      report("pay(card): stock unchanged before payment", cardStock === 50, `stock=${cardStock}`);

      // Simulate the provider's SIGNED webhook (mock) -> paid + stock committed once.
      await jsonFetch("/api/payments/mock/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: customerCookie },
        body: JSON.stringify({ orderId: cardOrder.id, outcome: "paid" }),
      });
      const { body: paidBody } = await jsonFetch(`/api/orders/${cardOrder.id}`, { headers: { Cookie: customerCookie } });
      cardStock = await productStock(product.id);
      report(
        "pay(card): signed webhook -> paid + stock committed once",
        paidBody?.data?.paymentStatus === "paid" && cardStock === 50 - QTY,
        `status=${paidBody?.data?.paymentStatus}, stock=${cardStock}`
      );
      const balancePaid = await ledgerBalance();
      report(
        "pay(card): ledger shows charge + payment netting to baseline",
        balancePaid === cardBalance0,
        `balance=${balancePaid}, baseline=${cardBalance0}`
      );

      // Webhook REPLAY -> no second decrement, no second payment.
      await jsonFetch("/api/payments/mock/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: customerCookie },
        body: JSON.stringify({ orderId: cardOrder.id, outcome: "paid" }),
      });
      const stockReplay = await productStock(product.id);
      const balanceReplay = await ledgerBalance();
      report(
        "pay(card): webhook replay is a no-op (stock + ledger unchanged)",
        stockReplay === 50 - QTY && balanceReplay === cardBalance0,
        `stock=${stockReplay}, balance=${balanceReplay}`
      );

      // Cleanup: cancel (stock returns, reversal posts) + offset the credit.
      await setOrderStatus(cardOrder.id, "cancelled");
      const stockEnd = await productStock(product.id);
      report("pay(card): cancel returns stock", stockEnd === 50, `stock=${stockEnd}`);
      await offsetCredit(customerId, cardTotalMinor, "SMOKE card restore (auto)");
    }
  } finally {
    // Restore the product's original stock value.
    await setStock(product.id, originalStock);
    await jsonFetch("/api/cart/clear", { method: "POST", headers: { Cookie: customerCookie } });
  }
}

async function main() {
  console.log(`Smoke checks against ${BASE_URL}\n`);

  await checkPageStatus("/en");
  await checkPageStatus("/he");
  await checkPageStatus("/ar");
  await localeSection();

  const cookie = await loginSeededCustomer();
  await checkCartWithCookie(cookie);
  await checkAdminOrdersUnauthenticated();
  await checkPaymentOptions(cookie);
  await checkCollectionsUnauthenticated();
  const adminCookie = await adminProductsSection();
  await pricingEngineSection(cookie, adminCookie);
  await promotionsSection(cookie, adminCookie);
  await bannersSection(cookie, adminCookie);
  await overviewSection(cookie, adminCookie);
  await adminOrderDetailSection(adminCookie);
  await realtimeSection(cookie);
  await restrictedCustomerSection(cookie, adminCookie);
  await receiptSection(cookie, adminCookie);
  await ledgerSection(cookie, adminCookie);
  await agentSection(cookie, adminCookie);
  await adjustmentSection(cookie, adminCookie);
  await paymentSection(cookie, adminCookie);
  await aiAssistantSection(cookie, adminCookie);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Smoke run crashed:", err);
  process.exit(1);
});
