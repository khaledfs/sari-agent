import { connectDB } from "@/lib/db";
import { ProductModel } from "@/models/product.model";
import { normalizeAssistantText } from "@/services/assistant-normalization.service";
import { computePricesForProducts, type PriceBreakdown } from "@/services/pricing.service";

/**
 * Smart multilingual catalog search.
 *
 * Pipeline (in order):
 *   1. Normalize the query with the EXISTING assistant normalization
 *      (normalizeAssistantText — synonyms like סמיד→סולת, flour→קמח, typo
 *      correction). One dictionary for the whole app, imported, never copied.
 *   2. MongoDB $text search over name+category (schema-declared text index).
 *   3. Fallback: when text search yields < FALLBACK_THRESHOLD results, add
 *      per-token partial regex matches (name + category).
 *   4. Deterministic in-memory ranking over the capped candidate pool.
 *
 * No external search engines, no new dependencies.
 */

export const CATALOG_SEARCH_MAX_PAGE_SIZE = 30;
/** Text-search result count below which the regex fallback kicks in. */
const FALLBACK_THRESHOLD = 5;
/** Candidate pool cap — ranking happens in memory over at most this many docs. */
const CANDIDATE_POOL_LIMIT = 200;
const MAX_SUGGESTIONS = 3;
/** Levenshtein distance ceiling for "did you mean" suggestions. */
const SUGGESTION_MAX_DISTANCE = 2;

export type CatalogSearchFilters = {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
};

export type CatalogSearchParams = {
  query: string;
  filters?: CatalogSearchFilters;
  page?: number;
  pageSize?: number;
  /** Per-customer pricing context (null = base prices). */
  userId?: string | null;
};

export type CatalogSearchProduct = {
  _id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  basePrice: number;
  unit: string;
  packageSize: string;
  imageUrl: string;
  stock: number | null;
  priceBreakdown?: PriceBreakdown;
};

export type CatalogSearchResult = {
  products: CatalogSearchProduct[];
  total: number;
  page: number;
  hasMore: boolean;
  suggestions?: string[];
};

type ProductDoc = {
  _id: unknown;
  name: string;
  sku: string;
  category?: string;
  price: number;
  unit?: string;
  packageSize?: string;
  imageUrl?: string;
  stock?: number | null;
  tierPrices?: Map<string, number> | Record<string, number> | null;
  textScore?: number;
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Relevance score for one product. Pure — exported for unit tests.
 * Priority mirrors the spec: exact name > exact normalized token matches >
 * Mongo text score > partial matches.
 */
export function scoreProduct(
  product: { name: string; textScore?: number },
  rawQuery: string,
  normalizedQuery: string,
  normalizedTokens: string[]
): number {
  const name = product.name.toLowerCase().trim();
  const raw = rawQuery.toLowerCase().trim();
  const nameWords = new Set(wordsOf(name));
  let score = 0;

  // 1. Exact product-name match.
  if (name === raw || name === normalizedQuery) score += 1000;

  // Full normalized phrase contained in the name ("קמח לבן" in "קמח לבן 25 ק\"ג").
  if (normalizedQuery && name.includes(normalizedQuery)) score += 400;

  // 2. Exact normalized-token word matches.
  let exactTokens = 0;
  let partialTokens = 0;
  for (const token of normalizedTokens) {
    if (nameWords.has(token)) {
      exactTokens += 1;
    } else if ([...nameWords].some((w) => w.includes(token) || token.includes(w))) {
      partialTokens += 1;
    }
  }
  if (normalizedTokens.length > 0) {
    score += (exactTokens / normalizedTokens.length) * 300;
    // 4. Partial matches rank below exact token matches.
    score += (partialTokens / normalizedTokens.length) * 60;
  }

  // 3. Mongo text-search score as a tiebreaker between the buckets above.
  score += (product.textScore ?? 0) * 10;

  return score;
}

/** Iterative Levenshtein distance — no libraries, unicode-safe. Pure. */
export function levenshtein(a: string, b: string): number {
  const s = [...a.toLowerCase()];
  const t = [...b.toLowerCase()];
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[t.length];
}

/**
 * "Did you mean" suggestions: compares the FIRST normalized token against the
 * distinct words of the candidate product names, distance ≤ 2. Pure.
 */
export function buildSuggestions(firstToken: string, productNames: string[]): string[] {
  if (!firstToken) return [];
  const seen = new Set<string>();
  const scored: Array<{ word: string; distance: number }> = [];
  for (const name of productNames) {
    for (const word of wordsOf(name)) {
      if (word.length < 2 || seen.has(word)) continue;
      seen.add(word);
      const distance = levenshtein(firstToken, word);
      if (distance > 0 && distance <= SUGGESTION_MAX_DISTANCE) {
        scored.push({ word, distance });
      }
    }
  }
  return scored
    .sort((a, b) => a.distance - b.distance || (a.word < b.word ? -1 : 1))
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => s.word);
}

function baseFilter(filters: CatalogSearchFilters): Record<string, unknown> {
  const filter: Record<string, unknown> = { isActive: true };
  if (filters.category?.trim()) filter.category = filters.category.trim();
  if (typeof filters.minPrice === "number" || typeof filters.maxPrice === "number") {
    const price: Record<string, number> = {};
    if (typeof filters.minPrice === "number") price.$gte = filters.minPrice;
    if (typeof filters.maxPrice === "number") price.$lte = filters.maxPrice;
    filter.price = price;
  }
  if (filters.inStockOnly) {
    // Untracked stock (null) counts as available; tracked must be > 0.
    filter.$and = [{ $or: [{ stock: null }, { stock: { $gt: 0 } }] }];
  }
  return filter;
}

export async function searchCatalog(params: CatalogSearchParams): Promise<CatalogSearchResult> {
  const rawQuery = params.query.trim();
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(
    CATALOG_SEARCH_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(params.pageSize ?? CATALOG_SEARCH_MAX_PAGE_SIZE))
  );
  const filters = params.filters ?? {};

  if (!rawQuery) {
    return { products: [], total: 0, page, hasMore: false };
  }

  await connectDB();

  // Step 1 — shared normalization (synonyms + typo correction).
  const normalized = normalizeAssistantText(rawQuery);
  const normalizedQuery = normalized.normalized;
  const tokens = normalized.tokens;

  const filter = baseFilter(filters);
  const projection = "name sku category price unit packageSize imageUrl stock tierPrices";

  // Step 2 — Mongo text search over both the raw and normalized wording.
  const textQuery = [rawQuery, normalizedQuery].filter(Boolean).join(" ");
  const textDocs = (await ProductModel.find(
    { ...filter, $text: { $search: textQuery } },
    { score: { $meta: "textScore" } }
  )
    .select(projection)
    .sort({ score: { $meta: "textScore" } })
    .limit(CANDIDATE_POOL_LIMIT)
    .lean()
    .exec()) as unknown as Array<ProductDoc & { score?: number }>;

  const pool = new Map<string, ProductDoc>();
  for (const doc of textDocs) {
    pool.set(String(doc._id), { ...doc, textScore: doc.score ?? 0 });
  }

  // Step 3 — regex fallback when text search comes up short (partial and
  // multilingual matches the text tokenizer misses).
  if (pool.size < FALLBACK_THRESHOLD && tokens.length > 0) {
    const rxParts = [...new Set([...tokens, rawQuery.toLowerCase()])].map(escapeRegex);
    const rx = new RegExp(rxParts.join("|"), "i");
    const fallbackDocs = (await ProductModel.find({
      ...filter,
      $or: [{ name: rx }, { category: rx }],
    })
      .select(projection)
      .limit(CANDIDATE_POOL_LIMIT)
      .lean()
      .exec()) as unknown as ProductDoc[];
    for (const doc of fallbackDocs) {
      const id = String(doc._id);
      if (!pool.has(id)) pool.set(id, { ...doc, textScore: 0 });
    }
  }

  // Step 4 — deterministic ranking, then in-memory pagination of the pool.
  const ranked = [...pool.values()]
    .map((doc) => ({ doc, score: scoreProduct(doc, rawQuery, normalizedQuery, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || String(a.doc._id).localeCompare(String(b.doc._id)));

  const total = ranked.length;
  const pageDocs = ranked.slice((page - 1) * pageSize, page * pageSize).map((r) => r.doc);

  // Per-customer pricing on the returned page only (same engine as /api/products).
  const breakdowns = await computePricesForProducts(
    pageDocs as unknown as Parameters<typeof computePricesForProducts>[0],
    params.userId ?? null
  );

  const products: CatalogSearchProduct[] = pageDocs.map((doc) => {
    const id = String(doc._id);
    const breakdown = breakdowns.get(id);
    return {
      _id: id,
      name: doc.name,
      sku: doc.sku,
      category: doc.category ?? "",
      price: breakdown?.final ?? doc.price,
      basePrice: doc.price,
      unit: doc.unit ?? "",
      packageSize: doc.packageSize ?? "",
      imageUrl: doc.imageUrl ?? "",
      stock: typeof doc.stock === "number" ? doc.stock : null,
      ...(breakdown ? { priceBreakdown: breakdown } : {}),
    };
  });

  // Suggestions only when the search found nothing.
  let suggestions: string[] | undefined;
  if (total === 0 && tokens.length > 0) {
    const sampleNames = (await ProductModel.find({ isActive: true })
      .select("name")
      .limit(500)
      .lean()
      .exec()) as unknown as Array<{ name: string }>;
    const found = buildSuggestions(tokens[0], sampleNames.map((p) => p.name));
    if (found.length > 0) suggestions = found;
  }

  return {
    products,
    total,
    page,
    hasMore: page * pageSize < total,
    ...(suggestions ? { suggestions } : {}),
  };
}
