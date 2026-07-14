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

async function main() {
  console.log(`Smoke checks against ${BASE_URL}\n`);

  await checkPageStatus("/en");
  await checkPageStatus("/he");

  const cookie = await loginSeededCustomer();
  await checkCartWithCookie(cookie);
  await checkAdminOrdersUnauthenticated();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Smoke run crashed:", err);
  process.exit(1);
});
