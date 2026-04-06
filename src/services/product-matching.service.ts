import { connectDB } from "@/lib/db";
import { ProductModel } from "@/models/product.model";

type ProductMatch = {
  productId: string;
  name: string;
  sku: string;
  category: string;
  score: number;
  reason: string;
};

export type ProductMatchCandidate = ProductMatch;

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string) {
  return normalizeText(input).split(" ").filter((t) => t.length > 1);
}

function scoreCandidate(query: string, name: string, sku: string): { score: number; reason: string } {
  const qNorm = normalizeText(query);
  const nNorm = normalizeText(name);
  const sNorm = normalizeText(sku);

  if (qNorm === sNorm) {
    return { score: 120, reason: "exact-sku" };
  }
  if (qNorm === nNorm) {
    return { score: 110, reason: "exact-name" };
  }

  if (nNorm.includes(qNorm) && qNorm.length >= 2) {
    const ratio = qNorm.length / Math.max(1, nNorm.length);
    return { score: 80 + ratio * 20, reason: "name-contains-query" };
  }

  const qTokens = tokenize(query);
  const nTokens = tokenize(name);
  if (!qTokens.length || !nTokens.length) {
    return { score: 0, reason: "no-tokens" };
  }

  const nSet = new Set(nTokens);
  const overlap = qTokens.filter((t) => nSet.has(t)).length;
  if (!overlap) {
    return { score: 0, reason: "no-overlap" };
  }

  const ratio = overlap / qTokens.length;
  return { score: ratio * 70 + overlap * 5, reason: "token-overlap" };
}

export async function matchActiveProductByQuery(query: string): Promise<ProductMatch | null> {
  await connectDB();
  const products = await ProductModel.find({ isActive: true }).select("_id name sku category").lean();
  const normalizedQuery = normalizeText(query);
  console.log("QUERY:", query);
  console.log("NORMALIZED QUERY:", normalizedQuery);
  console.log("PRODUCT NAMES:", products.map((p) => p.name ?? ""));
  if (!products.length) {
    return null;
  }

  let best: ProductMatch | null = null;
  for (const p of products) {
    const { score, reason } = scoreCandidate(query, p.name ?? "", p.sku ?? "");
    console.log({
      product: p.name ?? "",
      score,
      reason,
    });
    if (!best || score > best.score) {
      best = {
        productId: String(p._id),
        name: p.name ?? "",
        sku: p.sku ?? "",
        category: p.category ?? "",
        score,
        reason,
      };
    }
  }

  // Deterministic threshold for MVP safety.
  if (!best || best.score < 30) {
    return null;
  }

  return best;
}

export async function getTopProductMatches(query: string, limit = 5): Promise<ProductMatchCandidate[]> {
  await connectDB();
  const products = await ProductModel.find({ isActive: true }).select("_id name sku category").lean();
  const scored: ProductMatchCandidate[] = products.map((p) => {
    const { score, reason } = scoreCandidate(query, p.name ?? "", p.sku ?? "");
    return {
      productId: String(p._id),
      name: p.name ?? "",
      sku: p.sku ?? "",
      category: p.category ?? "",
      score,
      reason,
    };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit));
}

