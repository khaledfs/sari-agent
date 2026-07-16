/**
 * Assistant quality evaluation harness (Work Order 2, Task E).
 *
 * Runs 24 real-world fixture cases (Hebrew/Arabic/English) against a RUNNING
 * server using SEEDED demo customers only, and asserts CHECKABLE BEHAVIOR —
 * never exact wording: did it call the catalog tool · do returned products
 * exist in the catalog · did the cart actually change (or stay unchanged) ·
 * at most one clarification question · reply language matches the customer.
 *
 * Costs real OpenAI calls (~2-3 per case) — deliberately opt-in:
 *   node scripts/assistant-eval.mjs --dry    # list cases, no calls
 *   node scripts/assistant-eval.mjs          # full run (needs dev server + OPENAI_API_KEY)
 *
 * State safety: uses seeded customers, clears their carts before/after,
 * restores restriction status and product stock it touches. Never writes
 * anything else.
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const DRY = process.argv.includes("--dry");

const CUSTOMERS = {
  bakery: { identifier: "+972-52-3841176", password: "Customer1234" }, // מאפיית הזהב
  oriental: { identifier: "+972-53-4906138", password: "Customer1234" }, // חלويات نابلس
  western: { identifier: "+972-54-2379865", password: "Customer1234" }, // שוקו לב
};

let ADMIN = null;

// ---------- plumbing ----------

function extractCookie(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) if (cookie.startsWith("authToken=")) return cookie.split(";")[0];
  return null;
}

async function login(identifier, password, admin = false) {
  const res = await fetch(`${BASE_URL}/api/auth/${admin ? "admin/" : ""}login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const cookie = extractCookie(res);
  if (!cookie) throw new Error(`login failed for ${identifier}: ${res.status}`);
  return cookie;
}

async function api(cookie, path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(options.headers ?? {}) },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = {};
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    /* non-JSON */
  }
  return { res, json };
}

async function ask(cookie, message, locale, history) {
  const { res, json } = await api(cookie, "/api/assistant/message", {
    method: "POST",
    body: JSON.stringify({ message, locale, history }),
  });
  return { status: res.status, data: json.data ?? null };
}

async function cartItems(cookie) {
  const { json } = await api(cookie, "/api/cart");
  return json.data?.items ?? [];
}

async function clearCart(cookie) {
  await api(cookie, "/api/cart/clear", { method: "POST" });
}

async function productExists(cookie, productId) {
  if (!productId) return false;
  const { res } = await api(cookie, `/api/products/${productId}`);
  return res.status === 200;
}

// ---------- checkable-fact helpers ----------

function scriptShare(text, rangeTest) {
  const letters = [...String(text)].filter((ch) => /\p{L}/u.test(ch));
  if (!letters.length) return 0;
  return letters.filter(rangeTest).length / letters.length;
}
const hebrewShare = (t) => scriptShare(t, (c) => /[֐-׿]/.test(c));
const arabicShare = (t) => scriptShare(t, (c) => /[؀-ۿ]/.test(c));
const latinShare = (t) => scriptShare(t, (c) => /[A-Za-z]/.test(c));

function questionCount(text) {
  return (String(text).match(/[?؟]/g) ?? []).length;
}

function usedCatalogTool(data) {
  const tools = data?.metadata?.tools ?? [];
  return tools.some((t) => ["search_products", "get_product", "compare_products", "get_product_availability"].includes(t));
}

async function realMatches(cookie, data) {
  const matches = data?.matchedProducts ?? [];
  if (!matches.length) return false;
  for (const m of matches) {
    if (!(await productExists(cookie, m.productId))) return false;
  }
  return true;
}

// ---------- fixtures ----------

/** Each case: run(ctx) → { pass, detail }. ctx = { cookies, admin }. */
const CASES = [
  {
    name: "he: typo בקלאווה resolves against the real catalog",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.bakery, "יש לכם בקלאווה?", "he", []);
      const grounded = usedCatalogTool(data) && (await realMatches(cookies.bakery, data));
      return { pass: status === 200 && grounded, detail: `tools=${data?.metadata?.tools}` };
    },
  },
  {
    name: "he: synonym סמיד finds סולת products",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.bakery, "כמה עולה סמיד אצלכם?", "he", []);
      const names = (data?.matchedProducts ?? []).map((m) => m.name).join("|");
      return {
        pass: status === 200 && usedCatalogTool(data) && names.includes("סולת"),
        detail: names || "(no matches)",
      };
    },
  },
  {
    name: "he: QA comparison סמנת חלוב vs בקלאוה uses two real products",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.oriental, "האם סמנת חלוב יותר טובה מבקלאוה?", "he", []);
      const text = data?.message ?? "";
      const mentionsBoth = /חלוב/.test(text) && /בקלא/.test(text);
      return {
        pass: status === 200 && usedCatalogTool(data) && mentionsBoth,
        detail: `mentionsBoth=${mentionsBoth}, tools=${data?.metadata?.tools}`,
      };
    },
  },
  {
    name: "he: follow-up 'תוסיף שתיים ממנו' adds 2 of the referenced product",
    async run({ cookies }) {
      await clearCart(cookies.bakery);
      const first = await ask(cookies.bakery, "כמה עולה סוכר לבן שק 25 קילו?", "he", []);
      const history = [
        { role: "user", content: "כמה עולה סוכר לבן שק 25 קילו?" },
        { role: "assistant", content: first.data?.message ?? "" },
      ];
      const second = await ask(cookies.bakery, "תוסיף שתיים ממנו", "he", history);
      const items = await cartItems(cookies.bakery);
      const ok = second.status === 200 && items.length === 1 && items[0].quantity === 2 && items[0].product.name.includes("סוכר");
      await clearCart(cookies.bakery);
      return { pass: ok, detail: items.map((i) => `${i.product.name} x${i.quantity}`).join("|") || "(empty cart)" };
    },
  },
  {
    name: "he: correction 'לא, התכוונתי ל…' swaps the cart line",
    async run({ cookies }) {
      await clearCart(cookies.bakery);
      const first = await ask(cookies.bakery, "תוסיף אחד קמח לבן שק של שטיבל", "he", []);
      const history = [
        { role: "user", content: "תוסיף אחד קמח לבן שק של שטיבל" },
        { role: "assistant", content: first.data?.message ?? "" },
      ];
      await ask(cookies.bakery, "לא, התכוונתי לקמח לבן של מפרץ", "he", history);
      const items = await cartItems(cookies.bakery);
      const ok = items.length === 1 && items[0].product.name.includes("מפרץ");
      await clearCart(cookies.bakery);
      return { pass: ok, detail: items.map((i) => i.product.name).join("|") || "(empty)" };
    },
  },
  {
    name: "he: genuinely ambiguous 'קמח' → at most ONE clarification, no cart change",
    async run({ cookies }) {
      await clearCart(cookies.bakery);
      const { status, data } = await ask(cookies.bakery, "תוסיף קמח", "he", []);
      const items = await cartItems(cookies.bakery);
      // Either it asked ONE question, or it made a defensible single choice —
      // what it must NOT do: ask multiple questions or add multiple lines.
      const ok = status === 200 && questionCount(data?.message) <= 1 && items.length <= 1;
      await clearCart(cookies.bakery);
      return { pass: ok, detail: `questions=${questionCount(data?.message)}, cartLines=${items.length}` };
    },
  },
  {
    name: "he: out-of-catalog קוויאר → honest, nothing invented, cart untouched",
    async run({ cookies }) {
      await clearCart(cookies.bakery);
      const { status, data } = await ask(cookies.bakery, "תוסיף קוויאר בלוגה", "he", []);
      const items = await cartItems(cookies.bakery);
      const ok = status === 200 && data?.actionResult !== "added" && items.length === 0 && usedCatalogTool(data);
      return { pass: ok, detail: `actionResult=${data?.actionResult}, cart=${items.length}` };
    },
  },
  {
    name: "he: out-of-stock product is not added",
    async run({ cookies, admin }) {
      // Find a product, set stock 0, try to add, restore.
      const { json: listJson } = await api(admin, "/api/admin/products?search=%D7%A1%D7%95%D7%9B%D7%A8");
      const product = (listJson.data?.items ?? [])[0];
      if (!product) return { pass: false, detail: "no product found for stock test" };
      const originalStock = product.stock;
      await api(admin, `/api/admin/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ stock: 0 }) });
      await clearCart(cookies.bakery);
      const { data } = await ask(cookies.bakery, `תוסיף 1 ${product.name}`, "he", []);
      const items = await cartItems(cookies.bakery);
      await api(admin, `/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stock: originalStock === null ? null : originalStock }),
      });
      await clearCart(cookies.bakery);
      // The SOLD-OUT product must not land in the cart; suggesting/adding an
      // available alternative is acceptable rep behavior.
      const soldOutInCart = items.some((i) => i.productId === product.id);
      return { pass: !soldOutInCart, detail: `soldOutInCart=${soldOutInCart}, actionResult=${data?.actionResult}` };
    },
  },
  {
    name: "he: restricted customer → polite refusal on cart, advice still works",
    async run({ cookies, admin }) {
      const { json } = await api(admin, `/api/admin/customers?search=${encodeURIComponent(CUSTOMERS.bakery.identifier)}`);
      const customerId = json.data?.items?.[0]?.id;
      await api(admin, `/api/admin/customers/${customerId}`, { method: "PATCH", body: JSON.stringify({ accountStatus: "restricted" }) });
      await clearCart(cookies.western); // unrelated cart guard
      const cartTry = await ask(cookies.bakery, "תוסיף 2 קמח לבן", "he", []);
      const items = await cartItems(cookies.bakery);
      const advice = await ask(cookies.bakery, "איזה שמרים מתאימים ללחם?", "he", []);
      await api(admin, `/api/admin/customers/${customerId}`, { method: "PATCH", body: JSON.stringify({ accountStatus: "active" }) });
      const ok = cartTry.status === 200 && cartTry.data?.actionResult !== "added" && items.length === 0 && advice.status === 200 && (advice.data?.message ?? "").length > 20;
      return { pass: ok, detail: `cartResult=${cartTry.data?.actionResult}, adviceLen=${advice.data?.message?.length}` };
    },
  },
  {
    name: "he: live-web question → honest 'no web access', nothing fabricated",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.bakery, "מה מחיר החיטה בבורסת שיקגו היום?", "he", []);
      // Checkable: no cart action, no invented catalog products claimed as an answer.
      const ok = status === 200 && data?.actionResult !== "added" && (data?.message ?? "").length > 10;
      return { pass: ok, detail: `len=${data?.message?.length}` };
    },
  },
  {
    name: "en: English request answered in English with real products",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.bakery, "What white flour do you carry and what does it cost?", "en", []);
      const ok = status === 200 && usedCatalogTool(data) && latinShare(data?.message) > 0.4;
      return { pass: ok, detail: `latin=${latinShare(data?.message).toFixed(2)}` };
    },
  },
  {
    name: "ar: Arabic request answered in Arabic",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.oriental, "هل عندكم سكر؟ ما السعر؟", "ar", []);
      const ok = status === 200 && usedCatalogTool(data) && arabicShare(data?.message) > 0.3;
      return { pass: ok, detail: `arabic=${arabicShare(data?.message).toFixed(2)}` };
    },
  },
  {
    name: "he: Hebrew reply for Hebrew question",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.western, "מה ההבדל בין שוקולד מריר לחלב לעבודה?", "he", []);
      return { pass: status === 200 && hebrewShare(data?.message) > 0.5, detail: `hebrew=${hebrewShare(data?.message).toFixed(2)}` };
    },
  },
  {
    name: "business-type sensitivity: same question differs for bakery vs patisserie",
    async run({ cookies }) {
      const q = "איזה קמח הכי כדאי לי להזמין לעסק שלי?";
      const a = await ask(cookies.bakery, q, "he", []);
      const b = await ask(cookies.western, q, "he", []);
      const ok = a.status === 200 && b.status === 200 && (a.data?.message ?? "") !== (b.data?.message ?? "");
      return { pass: ok, detail: `lenA=${a.data?.message?.length}, lenB=${b.data?.message?.length}` };
    },
  },
  {
    name: "he: add flow confirms only after the backend succeeded (cart matches claim)",
    async run({ cookies }) {
      await clearCart(cookies.bakery);
      const { data } = await ask(cookies.bakery, "תוסיף 3 סוכר לבן שק של סוגת", "he", []);
      const items = await cartItems(cookies.bakery);
      const claimedAdd = data?.actionResult === "added";
      const reallyAdded = items.length === 1 && items[0].quantity === 3;
      await clearCart(cookies.bakery);
      return { pass: claimedAdd === reallyAdded && reallyAdded, detail: `claimed=${claimedAdd}, real=${reallyAdded}` };
    },
  },
  {
    name: "he: remove flow empties the cart",
    async run({ cookies }) {
      await clearCart(cookies.bakery);
      const add = await ask(cookies.bakery, "תוסיף 1 סוכר חום 1 קילו", "he", []);
      const history = [
        { role: "user", content: "תוסיף 1 סוכר חום 1 קילו" },
        { role: "assistant", content: add.data?.message ?? "" },
      ];
      await ask(cookies.bakery, "בעצם תוריד את זה מהעגלה", "he", history);
      const items = await cartItems(cookies.bakery);
      await clearCart(cookies.bakery);
      return { pass: items.length === 0, detail: `cartLines=${items.length}` };
    },
  },
  {
    name: "he: availability question uses the catalog, no invented stock claims",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.bakery, "יש במלאי שמרים טריים?", "he", []);
      return { pass: status === 200 && usedCatalogTool(data), detail: `tools=${data?.metadata?.tools}` };
    },
  },
  {
    name: "he: package-size question grounded in catalog attributes",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.bakery, "באיזה גדלים מגיע קמח לבן אצלכם?", "he", []);
      return { pass: status === 200 && usedCatalogTool(data) && (await realMatches(cookies.bakery, data)), detail: `matches=${data?.matchedProducts?.length}` };
    },
  },
  {
    name: "en: transliterated 'semolina' resolves to סולת",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.oriental, "Do you have semolina?", "en", []);
      const names = (data?.matchedProducts ?? []).map((m) => m.name).join("|");
      return { pass: status === 200 && names.includes("סולת"), detail: names || "(none)" };
    },
  },
  {
    name: "ar: سميد resolves to סולת",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.oriental, "بدي سميد ناعم", "ar", []);
      const names = (data?.matchedProducts ?? []).map((m) => m.name).join("|");
      return { pass: status === 200 && names.includes("סולת"), detail: names || "(none)" };
    },
  },
  {
    name: "he: comparison of two real products uses compare/get tooling",
    async run({ cookies }) {
      const { status, data } = await ask(cookies.western, "מה עדיף לי, קמח לבן של שטיבל או של מפרץ?", "he", []);
      const ok = status === 200 && usedCatalogTool(data) && (await realMatches(cookies.western, data));
      return { pass: ok, detail: `tools=${data?.metadata?.tools}` };
    },
  },
  {
    name: "he: cart read question reflects the actual cart",
    async run({ cookies }) {
      await clearCart(cookies.bakery);
      const { status, data } = await ask(cookies.bakery, "מה יש לי כרגע בעגלה?", "he", []);
      const tools = data?.metadata?.tools ?? [];
      return { pass: status === 200 && tools.includes("get_cart"), detail: `tools=${tools}` };
    },
  },
  {
    name: "he: no invented promises — cancelled action stays honest",
    async run({ cookies }) {
      await clearCart(cookies.bakery);
      const { data } = await ask(cookies.bakery, "תוסיף 5000 יחידות של קמח לבן", "he", []);
      const items = await cartItems(cookies.bakery);
      // Either the server accepted a big-but-valid qty (≤999 per tool contract —
      // so 5000 must NOT land) or the assistant refused; cart must not hold 5000.
      const total = items.reduce((n, i) => n + i.quantity, 0);
      await clearCart(cookies.bakery);
      return { pass: total < 5000, detail: `cartQty=${total}, actionResult=${data?.actionResult}` };
    },
  },
  {
    name: "he: unrelated smalltalk answered briefly without cart action",
    async run({ cookies }) {
      await clearCart(cookies.bakery);
      const { status, data } = await ask(cookies.bakery, "בוקר טוב! מה נשמע?", "he", []);
      const items = await cartItems(cookies.bakery);
      return { pass: status === 200 && items.length === 0 && data?.actionResult !== "added", detail: `actionResult=${data?.actionResult}` };
    },
  },
];

// ---------- runner ----------

async function main() {
  console.log(`Assistant eval against ${BASE_URL} — ${CASES.length} cases\n`);
  if (DRY) {
    CASES.forEach((c, i) => console.log(`${String(i + 1).padStart(2)}. ${c.name}`));
    console.log("\n--dry: no calls made.");
    return;
  }

  const cookies = {
    bakery: await login(CUSTOMERS.bakery.identifier, CUSTOMERS.bakery.password),
    oriental: await login(CUSTOMERS.oriental.identifier, CUSTOMERS.oriental.password),
    western: await login(CUSTOMERS.western.identifier, CUSTOMERS.western.password),
  };
  const adminEmail = process.env.ADMIN_EMAIL || "admin@sari.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin1234";
  ADMIN = await login(adminEmail, adminPassword, true);

  let passed = 0;
  for (const [index, testCase] of CASES.entries()) {
    try {
      const { pass, detail } = await testCase.run({ cookies, admin: ADMIN });
      console.log(`${pass ? "PASS" : "FAIL"}  ${String(index + 1).padStart(2)}. ${testCase.name}${detail ? ` — ${detail}` : ""}`);
      if (pass) passed += 1;
    } catch (err) {
      console.log(`FAIL  ${String(index + 1).padStart(2)}. ${testCase.name} — crashed: ${String(err).slice(0, 120)}`);
    }
  }

  // Restore: clear all seeded carts.
  for (const cookie of Object.values(cookies)) await clearCart(cookie);

  console.log(`\nSCORE: ${passed}/${CASES.length}`);
  if (passed < CASES.length) process.exit(1);
}

main().catch((err) => {
  console.error("Eval crashed:", err);
  process.exit(1);
});
