import { BASELINE_MODEL_FEATURE_KEYS } from "@/lib/recommendation-feature-flat";

/**
 * Baseline schema contract for recommendation model artifacts.
 * Bump version whenever feature layout/order changes.
 */
export const RECOMMENDATION_SCHEMA_VERSION = "v1";

export type RecommendationSchemaMetadata = {
  schemaVersion: string;
  featureKeys: readonly string[];
  featureCount: number;
  generatedAt: string;
};

export function buildRecommendationSchemaMetadata(): RecommendationSchemaMetadata {
  return {
    schemaVersion: RECOMMENDATION_SCHEMA_VERSION,
    featureKeys: BASELINE_MODEL_FEATURE_KEYS,
    featureCount: BASELINE_MODEL_FEATURE_KEYS.length,
    generatedAt: new Date().toISOString(),
  };
}
