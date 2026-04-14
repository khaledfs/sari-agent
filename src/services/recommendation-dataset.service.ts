import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { OrderModel } from "@/models/order.model";
import { ProductModel } from "@/models/product.model";
import { UserModel } from "@/models/user.model";
import { buildRecommendationCandidatePoolForUser } from "@/services/recommendation-candidates.service";
import { buildRecommendationUserProductFeatures } from "@/services/recommendation-features.service";
import type { RecommendationTrainingExample } from "@/types/recommendation";

type OrderItemRow = {
  productId: mongoose.Types.ObjectId;
  quantity: number;
};

/**
 * Supervised-learning rows (offline training source).
 *
 * Positives: products ordered in each order snapshot.
 * Hard Negatives V1 (deterministic): for each order, sample non-ordered products from
 * realistic candidate buckets in this priority:
 *   1) same-category alternatives
 *   2) co_purchase candidates
 *   3) segment_popular candidates
 *   4) frequent/favorite candidates
 *   5) generic exploration candidates
 */
export async function buildRecommendationExamplesForUser(userId: string): Promise<RecommendationTrainingExample[]> {
  if (!isValidObjectId(userId)) {
    return [];
  }

  const uid = new mongoose.Types.ObjectId(userId);
  await connectDB();

  const orders = await OrderModel.find({ userId: uid }).sort({ createdAt: -1 }).lean().exec();
  const examples: RecommendationTrainingExample[] = [];

  for (const doc of orders) {
    const orderId = String(doc._id);
    const created = doc.createdAt ? new Date(doc.createdAt as Date) : new Date(0);
    const orderCreatedAt = created.toISOString();
    const ref = created;
    const items = (doc.items ?? []) as OrderItemRow[];
    const purchased = new Set(items.map((i) => String(i.productId)).filter((id) => isValidObjectId(id)));

    if (purchased.size === 0) {
      continue;
    }

    const purchasedOids = [...purchased].map((id) => new mongoose.Types.ObjectId(id));
    const purchasedRows = await ProductModel.find({ _id: { $in: purchasedOids } })
      .select("_id category")
      .lean()
      .exec();

    const categoriesInOrder = new Set<string>();
    for (const row of purchasedRows) {
      const cat = row.category ? String(row.category) : "";
      if (cat) categoriesInOrder.add(cat);
    }

    for (const pid of purchased) {
      const features = await buildRecommendationUserProductFeatures(userId, pid, ref);
      if (!features) continue;
      examples.push({
        userId,
        productId: pid,
        label: 1,
        features,
        orderId,
        orderCreatedAt,
      });
    }

    const candidatePool = await buildRecommendationCandidatePoolForUser(userId, {
      referenceAt: ref,
      limit: 180,
      explorationLimit: 12,
    });

    const sameCategoryRows = categoriesInOrder.size
      ? await ProductModel.find({
          isActive: true,
          category: { $in: [...categoriesInOrder] },
        })
          .sort({ sku: 1 })
          .limit(120)
          .select("_id")
          .lean()
          .exec()
      : [];

    const sourceById = new Map<string, Set<string>>();
    for (const c of candidatePool.candidates) {
      sourceById.set(c.product._id, new Set(c.sources));
    }

    const buckets: Record<string, string[]> = {
      same_category: sameCategoryRows.map((r) => String(r._id)),
      co_purchase: [],
      segment_popular: [],
      frequent_or_favorite: [],
      generic: [],
    };

    for (const c of candidatePool.candidates) {
      const id = c.product._id;
      const sources = sourceById.get(id) ?? new Set<string>();
      if (sources.has("co_purchase")) buckets.co_purchase.push(id);
      if (sources.has("segment_popular")) buckets.segment_popular.push(id);
      if (sources.has("frequent") || sources.has("favorite")) buckets.frequent_or_favorite.push(id);
      if (!sources.has("co_purchase") && !sources.has("segment_popular") && !sources.has("frequent") && !sources.has("favorite")) {
        buckets.generic.push(id);
      }
    }

    const negativesTarget = Math.min(Math.max(purchased.size * 2, 4), 18);
    const selectedNegatives: string[] = [];
    const selectedSet = new Set<string>();

    const takeFrom = (ids: string[]) => {
      for (const id of ids) {
        if (!isValidObjectId(id) || purchased.has(id) || selectedSet.has(id)) continue;
        selectedSet.add(id);
        selectedNegatives.push(id);
        if (selectedNegatives.length >= negativesTarget) return;
      }
    };

    takeFrom(buckets.same_category);
    if (selectedNegatives.length < negativesTarget) takeFrom(buckets.co_purchase);
    if (selectedNegatives.length < negativesTarget) takeFrom(buckets.segment_popular);
    if (selectedNegatives.length < negativesTarget) takeFrom(buckets.frequent_or_favorite);
    if (selectedNegatives.length < negativesTarget) takeFrom(buckets.generic);

    for (const negId of selectedNegatives) {
      const features = await buildRecommendationUserProductFeatures(userId, negId, ref);
      if (!features) continue;
      examples.push({
        userId,
        productId: negId,
        label: 0,
        features,
        orderId,
        orderCreatedAt,
      });
    }
  }

  return examples;
}

/**
 * Builds training examples for many customers (for offline export).
 * `maxUsers` limits how many users are scanned (newest customers first); omit for all.
 */
export async function buildRecommendationExamplesForAllUsers(
  maxUsers?: number
): Promise<RecommendationTrainingExample[]> {
  await connectDB();
  const q = UserModel.find({ role: "customer" }).sort({ createdAt: -1 }).select("_id").lean();
  const users = maxUsers != null && maxUsers > 0 ? await q.limit(maxUsers).exec() : await q.exec();

  const all: RecommendationTrainingExample[] = [];
  for (const u of users) {
    const id = String(u._id);
    if (!isValidObjectId(id)) continue;
    const rows = await buildRecommendationExamplesForUser(id);
    all.push(...rows);
  }
  return all;
}
