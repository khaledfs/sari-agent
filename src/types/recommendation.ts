/**
 * Types for future ML-based product recommendations.
 *
 * Explicit user Favorites (heart / "save") are separate from Frequent (order counts)
 * and from any future model-ranked "Recommended" list.
 */

import type { BusinessType, SizeBand, Specialization } from "@/types/business-segmentation";

/** Per (user, product) feature vector for ranking or training. */
export type RecommendationUserProductFeatures = {
  userId: string;
  productId: string;
  referenceAt: string;

  userProductHistory: {
    timesPurchasedTotal: number;
    timesPurchasedLast30d: number;
    timesPurchasedLast90d: number;
    daysSinceLastPurchase: number | null;
    wasInLastOrder: boolean;
    wasInLast3Orders: boolean;
    averageQuantity: number;
    totalQuantityOrdered: number;
  };

  categoryAffinity: {
    categoryPurchaseCount: number;
    categoryShare: number;
    isTopCategoryForCustomer: boolean;
  };

  favorite: {
    isExplicitFavorite: boolean;
  };

  businessProfile: {
    businessType: BusinessType | null;
    specialization: Specialization | null;
    sizeBand: SizeBand | null;
  };

  product: {
    category: string;
    price: number;
    unit: string;
    packageSize: string;
    isActive: boolean;
  };
};

export type RecommendationExampleLabel = 0 | 1;

/**
 * One supervised row: positive if the user ordered the product in the given order context.
 * Negatives use label 0 with the same feature snapshot at generation time (simplified MVP).
 */
export type RecommendationTrainingExample = {
  userId: string;
  productId: string;
  label: RecommendationExampleLabel;
  features: RecommendationUserProductFeatures;
  orderId: string;
  /** Order creation time used as event time for this example. */
  orderCreatedAt: string;
};

/** Serialized JSONL row for export (same shape as in-memory training example). */
export type ExportedRecommendationTrainingRow = RecommendationTrainingExample;

/** Logistic head artifact produced by `scripts/train_logistic_recommendation.py`. */
export type RecommendationLinearHeadV1 = {
  schemaVersion: string;
  trainedAt: string;
  intercept: number;
  coef: number[];
  feature_names: string[];
  feature_count: number;
};

/** API/catalog row returned by `getRecommendedProductsByUser`. */
export type RankedRecommendationProduct = {
  _id: string;
  name: string;
  sku: string;
  price: number;
  unit: string;
  imageUrl?: string;
  category?: string;
  /** Null when serving deterministic fallback (no model score). */
  score: number | null;
  source: "model" | RecommendationCandidateSource;
};

export type RecommendationInferenceStatus = {
  mode: "logreg" | "deterministic_fallback";
  loaded: boolean;
  reason: string | null;
  schemaVersion?: string | null;
  expectedSchemaVersion?: string | null;
  trainedAt?: string | null;
  featureCount?: number | null;
};

export type RecommendationCandidateSource =
  | "recent"
  | "frequent"
  | "favorite"
  | "category_affinity"
  | "co_purchase"
  | "segment_popular"
  | "exploration";

export type RecommendationCandidate = {
  product: {
    _id: string;
    name: string;
    sku: string;
    price: number;
    unit: string;
    imageUrl?: string;
    category?: string;
  };
  sources: RecommendationCandidateSource[];
  /** Deterministic pre-ranking score from source heuristics (before ML scoring). */
  candidatePriority: number;
};

export type RecommendationCandidatePool = {
  userId: string;
  generatedAt: string;
  candidates: RecommendationCandidate[];
  countsBySource: Record<RecommendationCandidateSource, number>;
};
