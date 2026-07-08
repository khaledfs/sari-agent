import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { CustomerAccountModel } from "@/models/customer-account.model";
import { OrderModel } from "@/models/order.model";
import { ProductModel } from "@/models/product.model";
import { getFavoriteProductsByUser } from "@/services/favorites.service";
import { normalizeAssistantText } from "@/services/assistant-normalization.service";
import { getFrequentProductsByUser, getRecentProductsByUser } from "@/services/smart-ordering.service";
import type { AssistantMatchedProduct } from "@/types/assistant";

type ProductRow = {
  _id: mongoose.Types.ObjectId;
  name: string;
  sku: string;
  category?: string;
  price: number;
  unit?: string;
  packageSize?: string;
  imageUrl?: string;
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function textScore(query: string, product: ProductRow): { score: number; reasons: string[] } {
  const q = normalizeAssistantText(query);
  const name = normalize(product.name ?? "");
  const sku = normalize(product.sku ?? "");
  const cat = normalize(product.category ?? "");
  const hay = `${name} ${sku} ${cat}`;
  const reasons: string[] = [];
  let score = 0;

  if (q.normalized && (q.normalized === name || q.normalized === sku)) {
    score += 95;
    reasons.push("exact_name_or_sku");
  }
  if (q.normalized && hay.includes(q.normalized)) {
    score += 45;
    reasons.push("contains_normalized_query");
  }

  const tokens = q.tokens;
  const hayTokens = new Set(hay.split(" ").filter(Boolean));
  let overlap = 0;
  let fuzzy = 0;
  for (const t of tokens) {
    if (hayTokens.has(t)) {
      overlap += 1;
      continue;
    }
    for (const ht of hayTokens) {
      if (editDistance(t, ht) <= 1) {
        fuzzy += 1;
        break;
      }
    }
  }
  if (overlap > 0) {
    score += (overlap / Math.max(1, tokens.length)) * 40;
    reasons.push("token_overlap");
  }
  if (fuzzy > 0) {
    score += (fuzzy / Math.max(1, tokens.length)) * 20;
    reasons.push("fuzzy_token_match");
  }
  return { score, reasons };
}

export async function getAssistantRankedProductCandidates(
  userId: string,
  query: string,
  limit = 6
): Promise<AssistantMatchedProduct[]> {
  await connectDB();
  const products = (await ProductModel.find({ isActive: true })
    .select("_id name sku category price unit packageSize imageUrl")
    .lean()
    .exec()) as ProductRow[];
  if (!products.length) return [];

  const [favorites, recent, frequent] = await Promise.all([
    getFavoriteProductsByUser(userId),
    getRecentProductsByUser(userId),
    getFrequentProductsByUser(userId),
  ]);
  const favoriteSet = new Set(favorites.map((p) => p._id));
  const recentRank = new Map(recent.map((p, i) => [p._id, i]));
  const frequentRank = new Map(frequent.map((p, i) => [p._id, i]));
  const frequentScoreMap = new Map(frequent.map((p) => [p._id, p.frequency ?? 0]));

  const uid = isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : null;
  let categoryCounts = new Map<string, number>();
  let topCategory = "";
  if (uid) {
    const rows = await OrderModel.find({ userId: uid }).select("items").lean().exec();
    const itemIds = new Set<string>();
    for (const r of rows) for (const it of (r.items ?? []) as Array<{ productId: mongoose.Types.ObjectId }>) itemIds.add(String(it.productId));
    if (itemIds.size > 0) {
      const pr = await ProductModel.find({
        _id: { $in: [...itemIds].filter((id) => isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select("_id category")
        .lean()
        .exec();
      for (const p of pr) {
        const c = p.category ? String(p.category) : "";
        if (!c) continue;
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
      topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }
  }

  // segment boost
  let segmentBoostCategories = new Set<string>();
  if (uid) {
    const me = await CustomerAccountModel.findOne({ userId: uid }).lean().exec();
    if (me?.businessType) {
      const peers = await CustomerAccountModel.find({
        userId: { $ne: uid },
        businessType: me.businessType,
      })
        .select("userId")
        .lean()
        .limit(50)
        .exec();
      const peerIds = peers
        .map((p) => String(p.userId))
        .filter((id) => isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      if (peerIds.length > 0) {
        const peerOrders = await OrderModel.find({ userId: { $in: peerIds } }).select("items").lean().limit(400).exec();
        const pop = new Map<string, number>();
        for (const o of peerOrders) {
          for (const it of (o.items ?? []) as Array<{ productId: mongoose.Types.ObjectId; quantity: number }>) {
            const id = String(it.productId);
            pop.set(id, (pop.get(id) ?? 0) + (Number.isFinite(it.quantity) ? it.quantity : 1));
          }
        }
        const topIds = [...pop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id]) => new mongoose.Types.ObjectId(id));
        const topProducts = await ProductModel.find({ _id: { $in: topIds }, isActive: true }).select("category").lean().exec();
        for (const p of topProducts) {
          if (p.category) segmentBoostCategories.add(String(p.category));
        }
      }
    }
  }

  const scored: AssistantMatchedProduct[] = products.map((p) => {
    const id = String(p._id);
    const t = textScore(query, p);
    let score = t.score;
    const sources: string[] = [];
    const reasons = [...t.reasons];

    if (favoriteSet.has(id)) {
      score += 20;
      sources.push("favorite");
      reasons.push("explicit_favorite");
    }
    if (recentRank.has(id)) {
      score += Math.max(2, 14 - (recentRank.get(id) ?? 0));
      sources.push("recent");
      reasons.push("recent_history");
    }
    if (frequentRank.has(id)) {
      score += Math.max(2, 14 - (frequentRank.get(id) ?? 0));
      const f = frequentScoreMap.get(id) ?? 0;
      score += Math.min(10, f / 3);
      sources.push("frequent");
      reasons.push("frequent_history");
    }
    const cat = p.category ? String(p.category) : "";
    if (cat && topCategory && cat === topCategory) {
      score += 8;
      sources.push("category_affinity");
      reasons.push("top_category");
    }
    if (cat && segmentBoostCategories.has(cat)) {
      score += 6;
      sources.push("segment_popular");
      reasons.push("segment_popular_category");
    }

    return {
      productId: id,
      name: p.name ?? "",
      sku: p.sku ?? "",
      category: p.category ?? "",
      price: Number(p.price),
      unit: p.unit ?? "",
      packageSize: p.packageSize ?? "",
      imageUrl: p.imageUrl || undefined,
      score,
      reasons,
      sources,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit));
}
