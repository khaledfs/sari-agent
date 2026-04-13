import { BUSINESS_TYPES, SIZE_BANDS } from "@/types/business-segmentation";
import type { RecommendationUserProductFeatures } from "@/types/recommendation";

/**
 * Fixed-order flat vector for the baseline Logistic Regression model.
 * MUST stay in sync with `scripts/train_logistic_recommendation.py` (`flatten_features`).
 * Schema drift invalidates trained artifacts. When changing this layout/order,
 * bump `RECOMMENDATION_SCHEMA_VERSION` in `src/lib/recommendation-schema.ts`.
 *
 * Target label for training remains "ordered in this order context" (from dataset service),
 * not "is favorite" — `isExplicitFavorite` is only an input signal.
 */
const BT_KEYS = BUSINESS_TYPES.map((t) => `bt_${t}` as const);
const SB_KEYS = SIZE_BANDS.map((s) => `sb_${s}` as const);

export const BASELINE_MODEL_FEATURE_KEYS = [
  "timesPurchasedTotal",
  "timesPurchasedLast30d",
  "timesPurchasedLast90d",
  "daysSinceLastPurchase",
  "averageQuantity",
  "totalQuantityOrdered",
  "categoryPurchaseCount",
  "categoryShare",
  "wasInLastOrder",
  "wasInLast3Orders",
  "isTopCategoryForCustomer",
  "isExplicitFavorite",
  "product_price",
  "product_isActive",
  "spec_len",
  "product_cat_len",
  "product_unit_len",
  "packageSize_len",
  ...BT_KEYS,
  ...SB_KEYS,
  "sb_missing",
] as const;

export type BaselineModelFeatureKey = (typeof BASELINE_MODEL_FEATURE_KEYS)[number];

const NEVER_PURCHASED_DAYS = 9999;

function bool01(v: boolean): number {
  return v ? 1 : 0;
}

/**
 * Maps nested recommendation features to a single numeric row (aligned to training).
 */
export function flattenRecommendationFeaturesForBaselineModel(
  features: RecommendationUserProductFeatures
): Record<BaselineModelFeatureKey, number> {
  const h = features.userProductHistory;
  const c = features.categoryAffinity;
  const fav = features.favorite;
  const bp = features.businessProfile;
  const p = features.product;

  const days =
    h.daysSinceLastPurchase === null || h.daysSinceLastPurchase === undefined
      ? NEVER_PURCHASED_DAYS
      : h.daysSinceLastPurchase;

  const row: Partial<Record<BaselineModelFeatureKey, number>> = {
    timesPurchasedTotal: h.timesPurchasedTotal,
    timesPurchasedLast30d: h.timesPurchasedLast30d,
    timesPurchasedLast90d: h.timesPurchasedLast90d,
    daysSinceLastPurchase: days,
    averageQuantity: h.averageQuantity,
    totalQuantityOrdered: h.totalQuantityOrdered,
    categoryPurchaseCount: c.categoryPurchaseCount,
    categoryShare: c.categoryShare,
    wasInLastOrder: bool01(h.wasInLastOrder),
    wasInLast3Orders: bool01(h.wasInLast3Orders),
    isTopCategoryForCustomer: bool01(c.isTopCategoryForCustomer),
    isExplicitFavorite: bool01(fav.isExplicitFavorite),
    product_price: p.price,
    product_isActive: bool01(p.isActive),
    spec_len: bp.specialization ? Math.min(bp.specialization.length, 200) : 0,
    product_cat_len: Math.min(p.category.length, 200),
    product_unit_len: Math.min(p.unit.length, 80),
    packageSize_len: Math.min(p.packageSize.length, 80),
  };

  for (const t of BUSINESS_TYPES) {
    row[`bt_${t}` as BaselineModelFeatureKey] = bp.businessType === t ? 1 : 0;
  }
  for (const s of SIZE_BANDS) {
    row[`sb_${s}` as BaselineModelFeatureKey] = bp.sizeBand === s ? 1 : 0;
  }
  row.sb_missing = bp.sizeBand ? 0 : 1;

  const out = {} as Record<BaselineModelFeatureKey, number>;
  for (const k of BASELINE_MODEL_FEATURE_KEYS) {
    const v = row[k];
    out[k] = typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  return out;
}

export function baselineFeatureVector(features: RecommendationUserProductFeatures): number[] {
  const row = flattenRecommendationFeaturesForBaselineModel(features);
  return BASELINE_MODEL_FEATURE_KEYS.map((k) => row[k]);
}
