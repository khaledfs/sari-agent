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

async function main() {
  console.log(`Smoke checks against ${BASE_URL}\n`);

  await checkPageStatus("/en");
  await checkPageStatus("/he");

  const cookie = await loginSeededCustomer();
  await checkCartWithCookie(cookie);
  await checkAdminOrdersUnauthenticated();
  const adminCookie = await adminProductsSection();
  await pricingEngineSection(cookie, adminCookie);
  await promotionsSection(cookie, adminCookie);
  await bannersSection(cookie, adminCookie);
  await overviewSection(cookie, adminCookie);
  await adminOrderDetailSection(adminCookie);
  await realtimeSection(cookie);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Smoke run crashed:", err);
  process.exit(1);
});
