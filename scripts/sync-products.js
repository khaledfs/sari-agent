/* eslint-disable no-console */
/**
 * Synchronise the product catalog from sarihassan.com (WooCommerce/Elementor)
 * into MongoDB (the `products` collection).
 *
 * This ports the proven scraping/parse logic from
 * src/services/product-import.service.ts into a standalone, re-runnable script
 * so a full sync can be driven from the terminal without the dev server, auth,
 * or the API route's maxPages=1 cap. It follows `rel=next` pagination through
 * every page of every configured category.
 *
 * Behaviour: additive UPSERT by SKU (create new / update existing). It never
 * deletes and never touches orders, users, or carts. Products that have
 * disappeared from the site are left untouched (pass --deactivate-missing to
 * instead mark them isActive:false — off by default).
 *
 * Usage:
 *   node scripts/sync-products.js            # full sync, writes to Mongo
 *   node scripts/sync-products.js --dry      # parse only, no DB writes
 *   node scripts/sync-products.js --category=flours
 *   node scripts/sync-products.js --deactivate-missing
 */

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const mongoose = require("mongoose");

const SITE_ORIGIN = "https://sarihassan.com";
const MAX_PAGES_PER_CATEGORY = 25; // safety cap; pagination stops at rel=next anyway
const REQUEST_DELAY_MS = 300; // be polite to the origin
const REQUEST_TIMEOUT_MS = 20000;

// Kept in sync with src/lib/product-categories.ts (slug + WooCommerce URL).
const CATEGORIES = [
  { slug: "butter-margarine-and-oils", url: `${SITE_ORIGIN}/product-category/butter-margarine-and-oils/` },
  { slug: "legumes", url: `${SITE_ORIGIN}/product-category/legumes/` },
  { slug: "flours", url: `${SITE_ORIGIN}/product-category/flours/` },
  { slug: "cream-frozen-and-refrigerated-products", url: `${SITE_ORIGIN}/product-category/cream-frozen-and-refrigerated-products/` },
  { slug: "baking-and-drink-powders", url: `${SITE_ORIGIN}/product-category/baking-and-drink-powders/` },
  { slug: "packaging-and-disposable-items", url: `${SITE_ORIGIN}/product-category/packaging-and-disposable-items/` },
  { slug: "biscuits-and-pastry-dough", url: `${SITE_ORIGIN}/product-category/biscuits-and-pastry-dough/` },
  { slug: "tools", url: `${SITE_ORIGIN}/product-category/tools/` },
  { slug: "mirror-glaze-syrup-and-glucose", url: `${SITE_ORIGIN}/product-category/mirror-glaze-syrup-and-glucose/` },
  { slug: "improvers-and-yeast", url: `${SITE_ORIGIN}/product-category/improvers-and-yeast/` },
  { slug: "extracts-food-colors-and-concentrates", url: `${SITE_ORIGIN}/product-category/extracts-food-colors-and-concentrates/` },
  { slug: "cake-decorating-items", url: `${SITE_ORIGIN}/product-category/cake-decorating-items/` },
  { slug: "chocolate-and-fillings", url: `${SITE_ORIGIN}/product-category/chocolate-and-fillings/` },
  { slug: "canned-goods", url: `${SITE_ORIGIN}/product-category/canned-goods/` },
  { slug: "spices", url: `${SITE_ORIGIN}/product-category/spices/` },
];

// ---------- args ----------
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const DEACTIVATE_MISSING = args.includes("--deactivate-missing");
const categoryArg = (args.find((a) => a.startsWith("--category=")) || "").split("=")[1];

// ---------- env ----------
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ---------- parse helpers (ported from product-import.service.ts) ----------
function absUrlMaybe(url) {
  const u = (url || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return `${SITE_ORIGIN}${u}`;
  return u;
}

function normalizeSku(raw) {
  return (raw || "").trim().replace(/\s+/g, "").toUpperCase();
}

function parsePrice(raw) {
  const cleaned = (raw || "")
    .replace(/[\s ]/g, "")
    .replace(/[^\d.,]/g, "")
    .replace(/,/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function inferUnitAndPackageSize(text) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  const patterns = [
    { re: /(\d+(?:\.\d+)?)\s*(?:ק״?ג|ק"ג)\b/i, unit: "kg", fmt: (m) => `${m[1]}kg` },
    { re: /(\d+(?:\.\d+)?)\s*(?:גרם|g)\b/i, unit: "g", fmt: (m) => `${m[1]}g` },
    { re: /(\d+(?:\.\d+)?)\s*(?:מ״?ל|מ"ל|ml)\b/i, unit: "ml", fmt: (m) => `${m[1]}ml` },
    { re: /(\d+(?:\.\d+)?)\s*(?:ליטר|liter|l)\b/i, unit: "liter", fmt: (m) => `${m[1]}L` },
    { re: /(\d+)\s*(?:יח'|יחידות|יחידה)\b/i, unit: "unit", fmt: (m) => `${m[1]} units` },
  ];
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (m) return { unit: p.unit, packageSize: p.fmt(m) };
  }
  return { unit: "", packageSize: "" };
}

function extractSkuFromText(text) {
  const m = /מק["״]?ט\s*([0-9A-Za-z-]+)/i.exec(text || "");
  return m && m[1] ? normalizeSku(m[1]) : "";
}

function parseCategoryPage(html, categorySlug) {
  const $ = cheerio.load(html);
  const products = [];

  $("div[data-elementor-type='loop-item'].product").each((_, el) => {
    const root = $(el);
    const name = root.find("h2.product_title").first().text().replace(/\s+/g, " ").trim();
    const addBtn = root.find("a.add_to_cart_button").first();
    const skuAttr = addBtn.attr("data-product_sku") || "";
    const sku = normalizeSku(skuAttr) || extractSkuFromText(root.text());
    const price = parsePrice(root.find("p.price").first().text());
    const imageUrl = absUrlMaybe(root.find("img").first().attr("src") || "");
    const { unit, packageSize } = inferUnitAndPackageSize(name);
    if (!name) return;
    products.push({
      name,
      sku,
      category: categorySlug,
      price: Number.isFinite(price) ? price : NaN,
      unit,
      packageSize,
      imageUrl,
      isActive: true,
    });
  });

  const nextUrl = ($("link[rel='next']").attr("href") || "").trim();
  return { products, nextUrl };
}

function validateParsedProduct(p) {
  if (!p.sku) return { ok: false, reason: "Missing SKU" };
  if (!p.name) return { ok: false, reason: "Missing name" };
  if (!Number.isFinite(p.price) || p.price <= 0) return { ok: false, reason: "Missing/invalid price" };
  return { ok: true };
}

// ---------- net ----------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "sari-agent-dev-import/1.0 (+https://example.local)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- mongo ----------
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    category: { type: String, trim: true, default: "" },
    price: { type: Number, required: true, min: 0.01 },
    unit: { type: String, trim: true, default: "" },
    packageSize: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
const ProductModel = mongoose.models.Product || mongoose.model("Product", productSchema);

async function upsertProduct(p) {
  const existing = await ProductModel.findOne({ sku: p.sku }).lean();
  const $set = {
    name: p.name,
    category: p.category,
    price: p.price,
    unit: p.unit,
    packageSize: p.packageSize,
    imageUrl: p.imageUrl,
    isActive: p.isActive,
  };
  if (existing) {
    await ProductModel.updateOne({ sku: p.sku }, { $set });
    return "updated";
  }
  await ProductModel.create({ sku: p.sku, ...$set });
  return "created";
}

// ---------- main ----------
async function main() {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri && !DRY) {
    throw new Error("Missing MONGODB_URI (checked process.env and .env.local).");
  }

  const targets = categoryArg ? CATEGORIES.filter((c) => c.slug === categoryArg) : CATEGORIES;
  if (categoryArg && targets.length === 0) {
    throw new Error(`Unknown category slug: ${categoryArg}`);
  }

  console.log(`\nSARI product sync — ${DRY ? "DRY RUN (no writes)" : "writing to Mongo"}`);
  console.log(`Categories: ${targets.length}  |  source: ${SITE_ORIGIN}\n`);

  if (!DRY) {
    await mongoose.connect(uri, { bufferCommands: false });
    console.log("Connected to MongoDB.\n");
  }

  const totals = { created: 0, updated: 0, skipped: 0, parsed: 0, pages: 0, errors: 0 };
  const seenSkus = new Set();

  for (const cat of targets) {
    let url = cat.url;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let pageCount = 0;

    for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page += 1) {
      let parsed;
      try {
        const html = await fetchHtml(url);
        parsed = parseCategoryPage(html, cat.slug);
      } catch (e) {
        totals.errors += 1;
        console.log(`  ! ${cat.slug} p${page}: ${e.message}`);
        break;
      }
      pageCount += 1;
      totals.pages += 1;

      for (const p of parsed.products) {
        totals.parsed += 1;
        const v = validateParsedProduct(p);
        if (!v.ok) {
          skipped += 1;
          continue;
        }
        seenSkus.add(p.sku);
        if (DRY) {
          created += 0; // no-op in dry mode; counted as parsed above
          continue;
        }
        try {
          const outcome = await upsertProduct(p);
          if (outcome === "created") created += 1;
          else updated += 1;
        } catch (e) {
          totals.errors += 1;
          console.log(`  ! upsert ${p.sku}: ${e.message}`);
        }
      }

      const next = parsed.nextUrl ? absUrlMaybe(parsed.nextUrl) : "";
      if (!next) break;
      url = next;
      await sleep(REQUEST_DELAY_MS);
    }

    totals.created += created;
    totals.updated += updated;
    totals.skipped += skipped;
    console.log(
      `  ✓ ${cat.slug.padEnd(38)} pages:${pageCount}  created:${created}  updated:${updated}  skipped:${skipped}`
    );
  }

  let deactivated = 0;
  if (DEACTIVATE_MISSING && !DRY && !categoryArg && seenSkus.size > 0) {
    const r = await ProductModel.updateMany(
      { sku: { $nin: Array.from(seenSkus) }, isActive: true },
      { $set: { isActive: false } }
    );
    deactivated = r.modifiedCount || 0;
  }

  console.log("\n──────── summary ────────");
  console.log(`pages fetched : ${totals.pages}`);
  console.log(`parsed items  : ${totals.parsed}`);
  console.log(`unique SKUs   : ${seenSkus.size}`);
  console.log(`created       : ${totals.created}`);
  console.log(`updated       : ${totals.updated}`);
  console.log(`skipped       : ${totals.skipped}  (missing sku/name/price)`);
  if (DEACTIVATE_MISSING) console.log(`deactivated   : ${deactivated}`);
  console.log(`errors        : ${totals.errors}`);

  if (!DRY) {
    const count = await ProductModel.countDocuments({});
    const active = await ProductModel.countDocuments({ isActive: true });
    console.log(`\nproducts in DB: ${count} (${active} active)`);
    await mongoose.disconnect();
  }
  console.log("");
}

main().catch(async (e) => {
  console.error("\nFATAL:", e.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
