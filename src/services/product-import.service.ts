import * as cheerio from "cheerio";

import { connectDB } from "@/lib/db";
import { ProductModel } from "@/models/product.model";

type CategoryConfig = {
  url: string;
  category: string;
};

export type ImportFromSiteResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ url: string; message: string }>;
};

type ParsedProduct = {
  name: string;
  sku: string;
  category: string;
  price: number;
  unit: string;
  packageSize: string;
  imageUrl: string;
  isActive: boolean;
};

function absUrlMaybe(url: string) {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return `https://sarihassan.com${u}`;
  return u;
}

function normalizeSku(raw: string) {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

function parsePrice(raw: string) {
  const cleaned = raw
    .replace(/[\s\u00a0]/g, "")
    .replace(/[^\d.,]/g, "")
    .replace(/,/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function inferUnitAndPackageSize(text: string): { unit: string; packageSize: string } {
  const s = text.replace(/\s+/g, " ").trim();

  const patterns: Array<{ re: RegExp; unit: string; fmt: (m: RegExpExecArray) => string }> = [
    { re: /(\d+(?:\.\d+)?)\s*(?:ק״?ג|ק"ג)\b/i, unit: "kg", fmt: (m) => `${m[1]}kg` },
    { re: /(\d+(?:\.\d+)?)\s*(?:גרם|g)\b/i, unit: "g", fmt: (m) => `${m[1]}g` },
    { re: /(\d+(?:\.\d+)?)\s*(?:מ״?ל|מ\"ל|ml)\b/i, unit: "ml", fmt: (m) => `${m[1]}ml` },
    { re: /(\d+(?:\.\d+)?)\s*(?:ליטר|liter|l)\b/i, unit: "liter", fmt: (m) => `${m[1]}L` },
    { re: /(\d+)\s*(?:יח'|יחידות|יחידה)\b/i, unit: "unit", fmt: (m) => `${m[1]} units` },
  ];

  for (const p of patterns) {
    const m = p.re.exec(s);
    if (m) {
      return { unit: p.unit, packageSize: p.fmt(m) };
    }
  }

  return { unit: "", packageSize: "" };
}

function extractSkuFromText(text: string) {
  // Matches Hebrew "מק\"ט 112099" (MKT = SKU)
  const m = /מק["״]?ט\s*([0-9A-Za-z-]+)/i.exec(text);
  return m?.[1] ? normalizeSku(m[1]) : "";
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent": "sari-agent-dev-import/1.0 (+https://example.local)",
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

function parseCategoryPage(html: string, category: string): { products: ParsedProduct[]; nextUrl: string } {
  const $ = cheerio.load(html);

  const products: ParsedProduct[] = [];

  // Elementor WooCommerce loop items are rendered as div.product blocks.
  $("div[data-elementor-type='loop-item'].product").each((_, el) => {
    const root = $(el);
    const name = root.find("h2.product_title").first().text().replace(/\s+/g, " ").trim();

    const addBtn = root.find("a.add_to_cart_button").first();
    const skuAttr = addBtn.attr("data-product_sku") ?? "";
    const sku = normalizeSku(skuAttr) || extractSkuFromText(root.text());

    const priceText = root.find("p.price").first().text();
    const price = parsePrice(priceText);

    const imgSrc = root.find("img").first().attr("src") ?? "";
    const imageUrl = absUrlMaybe(imgSrc);

    const { unit, packageSize } = inferUnitAndPackageSize(name);

    if (!name) {
      return;
    }

    // SKU is required by our model; skip if we cannot find it.
    if (!sku) {
      products.push({
        name,
        sku: "",
        category,
        price: Number.isFinite(price) ? price : NaN,
        unit,
        packageSize,
        imageUrl,
        isActive: true,
      });
      return;
    }

    products.push({
      name,
      sku,
      category,
      price: Number.isFinite(price) ? price : NaN,
      unit,
      packageSize,
      imageUrl,
      isActive: true,
    });
  });

  const nextUrl = $("link[rel='next']").attr("href")?.trim() ?? "";
  return { products, nextUrl };
}

function validateParsedProduct(p: ParsedProduct): { ok: true } | { ok: false; reason: string } {
  if (!p.sku) return { ok: false, reason: "Missing SKU" };
  if (!p.name) return { ok: false, reason: "Missing name" };
  if (!Number.isFinite(p.price) || p.price <= 0) return { ok: false, reason: "Missing/invalid price" };
  return { ok: true };
}

export async function importProductsFromSariHassanSite(input: {
  categories: CategoryConfig[];
  maxPagesPerCategory?: number;
}): Promise<ImportFromSiteResult> {
  const categories = input.categories ?? [];
  const maxPagesPerCategory = input.maxPagesPerCategory ?? 1;

  const result: ImportFromSiteResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (!categories.length) {
    return result;
  }

  await connectDB();

  for (const cat of categories) {
    let url = cat.url;
    for (let page = 1; page <= maxPagesPerCategory; page += 1) {
      try {
        const html = await fetchHtml(url);
        const parsed = parseCategoryPage(html, cat.category);

        for (const p of parsed.products) {
          const v = validateParsedProduct(p);
          if (!v.ok) {
            result.skipped += 1;
            continue;
          }

          const existing = await ProductModel.findOne({ sku: p.sku }).lean();
          if (existing) {
            await ProductModel.updateOne(
              { sku: p.sku },
              {
                $set: {
                  name: p.name,
                  category: p.category,
                  price: p.price,
                  unit: p.unit,
                  packageSize: p.packageSize,
                  imageUrl: p.imageUrl,
                  isActive: p.isActive,
                },
              }
            );
            result.updated += 1;
          } else {
            await ProductModel.create({
              name: p.name,
              sku: p.sku,
              category: p.category,
              price: p.price,
              unit: p.unit,
              packageSize: p.packageSize,
              imageUrl: p.imageUrl,
              isActive: p.isActive,
            });
            result.created += 1;
          }
        }

        const next = parsed.nextUrl ? absUrlMaybe(parsed.nextUrl) : "";
        if (!next || page === maxPagesPerCategory) {
          break;
        }
        url = next;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown import error.";
        result.errors.push({ url, message });
        break;
      }
    }
  }

  return result;
}

