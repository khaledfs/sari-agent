import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { CustomerAccountModel } from "@/models/customer-account.model";
import { OrderModel } from "@/models/order.model";
import { ProductModel } from "@/models/product.model";
import { getFavoriteProductsByUser } from "@/services/favorites.service";
import type {
  RecommendationCandidate,
  RecommendationCandidatePool,
  RecommendationCandidateSource,
} from "@/types/recommendation";

type OrderItemRow = { productId: mongoose.Types.ObjectId; quantity: number };

type CandidateOptions = {
  referenceAt?: Date;
  limit?: number;
  explorationLimit?: number;
};

function toUserObjectId(userId: string) {
  if (!isValidObjectId(userId)) {
    throw new Error("Invalid user id.");
  }
  return new mongoose.Types.ObjectId(userId);
}

function sourceWeight(source: RecommendationCandidateSource): number {
  switch (source) {
    case "favorite":
      return 35;
    case "frequent":
      return 30;
    case "recent":
      return 24;
    case "co_purchase":
      return 20;
    case "segment_popular":
      return 17;
    case "category_affinity":
      return 12;
    case "exploration":
      return 6;
    default:
      return 0;
  }
}

function topKeysFromMap(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

async function loadActiveProductMap(ids: string[]): Promise<Map<string, RecommendationCandidate["product"]>> {
  const valid = [...new Set(ids)].filter((id) => isValidObjectId(id));
  if (valid.length === 0) return new Map();
  const oids = valid.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await ProductModel.find({ _id: { $in: oids }, isActive: true }).lean().exec();
  const map = new Map<string, RecommendationCandidate["product"]>();
  for (const row of rows) {
    map.set(String(row._id), {
      _id: String(row._id),
      name: String(row.name),
      sku: String(row.sku),
      price: Number(row.price),
      unit: row.unit ? String(row.unit) : "",
      imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
      category: row.category ? String(row.category) : undefined,
    });
  }
  return map;
}

/**
 * Candidate Generation V2.
 * Deterministic, explainable source mix before ML scoring.
 */
export async function buildRecommendationCandidatePoolForUser(
  userId: string,
  options?: CandidateOptions
): Promise<RecommendationCandidatePool> {
  const uid = toUserObjectId(userId);
  const referenceAt = options?.referenceAt ?? new Date();
  const limit = Math.min(Math.max(options?.limit ?? 120, 20), 250);
  const explorationLimit = Math.min(Math.max(options?.explorationLimit ?? 8, 0), 30);
  await connectDB();

  const userOrders = await OrderModel.find({
    userId: uid,
    createdAt: { $lte: referenceAt },
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  const recentUnique: string[] = [];
  const recentSeen = new Set<string>();
  for (const doc of userOrders.slice(0, 20)) {
    for (const item of (doc.items ?? []) as OrderItemRow[]) {
      const id = String(item.productId);
      if (recentSeen.has(id)) continue;
      recentSeen.add(id);
      recentUnique.push(id);
    }
  }

  const freq = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const allOrderItemIds = new Set<string>();
  const productIdsFromOrders = new Set<string>();
  for (const doc of userOrders) {
    for (const item of (doc.items ?? []) as OrderItemRow[]) {
      const id = String(item.productId);
      allOrderItemIds.add(id);
      productIdsFromOrders.add(id);
      const qty = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      freq.set(id, (freq.get(id) ?? 0) + qty);
    }
  }

  const orderProducts = await ProductModel.find({
    _id: { $in: [...allOrderItemIds].filter((id) => isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)) },
    isActive: true,
  })
    .select("_id category")
    .lean()
    .exec();
  const categoryByProduct = new Map<string, string>();
  for (const p of orderProducts) {
    const cat = p.category ? String(p.category) : "";
    categoryByProduct.set(String(p._id), cat);
    if (cat) {
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
  }

  const favorites = await getFavoriteProductsByUser(userId);
  const favoriteIds = favorites.map((f) => f._id);

  const sourceToIds = new Map<RecommendationCandidateSource, string[]>();
  sourceToIds.set("recent", recentUnique.slice(0, 24));
  sourceToIds.set("frequent", topKeysFromMap(freq, 24));
  sourceToIds.set("favorite", favoriteIds.slice(0, 24));

  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cat]) => cat);
  if (topCategories.length > 0) {
    const catRows = await ProductModel.find({
      isActive: true,
      category: { $in: topCategories },
    })
      .sort({ sku: 1 })
      .limit(80)
      .select("_id")
      .lean()
      .exec();
    sourceToIds.set(
      "category_affinity",
      catRows.map((r) => String(r._id))
    );
  } else {
    sourceToIds.set("category_affinity", []);
  }

  // Co-purchase: items that appear in the same orders as seed products.
  const coSeed = new Set([...recentUnique.slice(0, 12), ...topKeysFromMap(freq, 12), ...favoriteIds.slice(0, 12)]);
  const coCounts = new Map<string, number>();
  if (coSeed.size > 0) {
    for (const doc of userOrders) {
      const ids = ((doc.items ?? []) as OrderItemRow[]).map((i) => String(i.productId));
      const hasSeed = ids.some((id) => coSeed.has(id));
      if (!hasSeed) continue;
      for (const id of ids) {
        if (coSeed.has(id)) continue;
        coCounts.set(id, (coCounts.get(id) ?? 0) + 1);
      }
    }
  }
  sourceToIds.set("co_purchase", topKeysFromMap(coCounts, 30));

  // Segment-popular: customers with similar profile.
  const me = await CustomerAccountModel.findOne({ userId: uid }).lean().exec();
  const segCounts = new Map<string, number>();
  if (me?.businessType) {
    const sameType = await CustomerAccountModel.find({
      userId: { $ne: uid },
      businessType: me.businessType,
    })
      .select("userId specialization sizeBand")
      .lean()
      .exec();
    const sorted = sameType
      .map((r) => {
        let score = 1;
        if (me.specialization && r.specialization && String(me.specialization).trim() === String(r.specialization).trim()) score += 2;
        if (me.sizeBand && r.sizeBand && me.sizeBand === r.sizeBand) score += 1;
        return { userId: String(r.userId), score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);
    const segUserIds = sorted
      .map((r) => r.userId)
      .filter((id) => isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (segUserIds.length > 0) {
      const segOrders = await OrderModel.find({
        userId: { $in: segUserIds },
        createdAt: { $lte: referenceAt },
      })
        .select("items")
        .lean()
        .exec();
      for (const doc of segOrders) {
        for (const item of (doc.items ?? []) as OrderItemRow[]) {
          const id = String(item.productId);
          const qty = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
          segCounts.set(id, (segCounts.get(id) ?? 0) + qty);
        }
      }
    }
  }
  sourceToIds.set("segment_popular", topKeysFromMap(segCounts, 36));

  if (explorationLimit > 0) {
    const explore = await ProductModel.find({ isActive: true })
      .sort({ createdAt: -1, sku: 1 })
      .limit(explorationLimit * 3)
      .select("_id")
      .lean()
      .exec();
    sourceToIds.set("exploration", explore.map((r) => String(r._id)));
  } else {
    sourceToIds.set("exploration", []);
  }

  const scoreById = new Map<string, number>();
  const sourcesById = new Map<string, Set<RecommendationCandidateSource>>();
  const insertionOrder: string[] = [];
  for (const [source, ids] of sourceToIds) {
    for (const id of ids) {
      if (!isValidObjectId(id)) continue;
      if (!sourcesById.has(id)) {
        sourcesById.set(id, new Set());
        insertionOrder.push(id);
      }
      sourcesById.get(id)!.add(source);
      scoreById.set(id, (scoreById.get(id) ?? 0) + sourceWeight(source));
    }
  }

  const activeMap = await loadActiveProductMap(insertionOrder);
  const countsBySource: Record<RecommendationCandidateSource, number> = {
    recent: 0,
    frequent: 0,
    favorite: 0,
    category_affinity: 0,
    co_purchase: 0,
    segment_popular: 0,
    exploration: 0,
  };

  const candidates: RecommendationCandidate[] = [];
  for (const id of insertionOrder) {
    const product = activeMap.get(id);
    if (!product) continue;
    const sources = [...(sourcesById.get(id) ?? new Set<RecommendationCandidateSource>())];
    const candidatePriority = scoreById.get(id) ?? 0;
    for (const s of sources) countsBySource[s] += 1;
    candidates.push({ product, sources, candidatePriority });
  }

  candidates.sort((a, b) => b.candidatePriority - a.candidatePriority || a.product.sku.localeCompare(b.product.sku));

  return {
    userId,
    generatedAt: new Date().toISOString(),
    candidates: candidates.slice(0, limit),
    countsBySource,
  };
}
