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

async function adminProductsSection() {
  const credentials = await getAdminCredentials();
  if (!credentials) {
    console.log(
      "WARN  admin section skipped — set ADMIN_EMAIL and ADMIN_PASSWORD (env or .env.local) to enable it"
    );
    return;
  }

  const cookie = await loginAdmin(credentials);
  if (!cookie) return;

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
}

async function main() {
  console.log(`Smoke checks against ${BASE_URL}\n`);

  await checkPageStatus("/en");
  await checkPageStatus("/he");

  const cookie = await loginSeededCustomer();
  await checkCartWithCookie(cookie);
  await checkAdminOrdersUnauthenticated();
  await adminProductsSection();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Smoke run crashed:", err);
  process.exit(1);
});
