import fs from "fs";
import path from "path";

import { BASELINE_MODEL_FEATURE_KEYS, baselineFeatureVector } from "@/lib/recommendation-feature-flat";
import { RECOMMENDATION_SCHEMA_VERSION } from "@/lib/recommendation-schema";
import { buildRecommendationCandidatePoolForUser } from "@/services/recommendation-candidates.service";
import { buildRecommendationUserProductFeatures } from "@/services/recommendation-features.service";
import type {
  RankedRecommendationProduct,
  RecommendationCandidateSource,
  RecommendationInferenceStatus,
  RecommendationLinearHeadV1,
} from "@/types/recommendation";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "recommendation-logreg");
const LINEAR_HEAD_FILE = path.join(ARTIFACT_DIR, "linear_head.json");
const METRICS_FILE = path.join(ARTIFACT_DIR, "metrics.json");

type LoadResult =
  | {
      ok: true;
      head: RecommendationLinearHeadV1;
      status: RecommendationInferenceStatus;
    }
  | {
      ok: false;
      status: RecommendationInferenceStatus;
    };

function sigmoid(z: number): number {
  if (z > 35) return 1;
  if (z < -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

function readJsonFileSafe(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function loadLinearHeadWithValidation(): LoadResult {
  const parsed = readJsonFileSafe(LINEAR_HEAD_FILE) as RecommendationLinearHeadV1 | null;
  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      status: {
        mode: "deterministic_fallback",
        loaded: false,
        reason: "missing_or_invalid_linear_head_json",
      },
    };
  }

  const schemaVersion = parsed.schemaVersion;
  const trainedAt = parsed.trainedAt;
  if (schemaVersion !== RECOMMENDATION_SCHEMA_VERSION) {
    return {
      ok: false,
      status: {
        mode: "deterministic_fallback",
        loaded: false,
        reason: "schema_version_mismatch",
        schemaVersion: schemaVersion ?? null,
        expectedSchemaVersion: RECOMMENDATION_SCHEMA_VERSION,
        trainedAt: typeof trainedAt === "string" ? trainedAt : null,
      },
    };
  }

  if (
    typeof parsed.intercept !== "number" ||
    !Array.isArray(parsed.coef) ||
    !Array.isArray(parsed.feature_names) ||
    typeof parsed.feature_count !== "number"
  ) {
    return {
      ok: false,
      status: {
        mode: "deterministic_fallback",
        loaded: false,
        reason: "invalid_linear_head_structure",
      },
    };
  }

  if (parsed.coef.length !== parsed.feature_names.length || parsed.feature_count !== parsed.feature_names.length) {
    return {
      ok: false,
      status: {
        mode: "deterministic_fallback",
        loaded: false,
        reason: "coef_feature_count_mismatch",
        schemaVersion,
        expectedSchemaVersion: RECOMMENDATION_SCHEMA_VERSION,
      },
    };
  }

  const expected = [...BASELINE_MODEL_FEATURE_KEYS];
  if (!arraysEqual(parsed.feature_names, expected)) {
    return {
      ok: false,
      status: {
        mode: "deterministic_fallback",
        loaded: false,
        reason: "feature_order_mismatch",
        schemaVersion,
        expectedSchemaVersion: RECOMMENDATION_SCHEMA_VERSION,
      },
    };
  }

  const metrics = readJsonFileSafe(METRICS_FILE) as { trainedAt?: string } | null;
  return {
    ok: true,
    head: parsed,
    status: {
      mode: "logreg",
      loaded: true,
      reason: null,
      schemaVersion,
      expectedSchemaVersion: RECOMMENDATION_SCHEMA_VERSION,
      trainedAt:
        typeof parsed.trainedAt === "string"
          ? parsed.trainedAt
          : typeof metrics?.trainedAt === "string"
            ? metrics.trainedAt
            : null,
      featureCount: parsed.feature_count,
    },
  };
}

function scoreWithLinearHead(head: RecommendationLinearHeadV1, vec: number[]): number {
  if (vec.length !== head.coef.length) return 0;
  let z = head.intercept;
  for (let i = 0; i < vec.length; i += 1) {
    z += head.coef[i] * vec[i];
  }
  return sigmoid(z);
}

export type GetRecommendedOptions = {
  limit?: number;
  candidateCap?: number;
};

function fallbackStatus(reason: string): RecommendationInferenceStatus {
  return {
    mode: "deterministic_fallback",
    loaded: false,
    reason,
    expectedSchemaVersion: RECOMMENDATION_SCHEMA_VERSION,
  };
}

export function getRecommendationModelStatus(): RecommendationInferenceStatus {
  return loadLinearHeadWithValidation().status;
}

async function deterministicFallbackFromCandidates(
  userId: string,
  limit: number,
  candidateCap: number
): Promise<RankedRecommendationProduct[]> {
  const pool = await buildRecommendationCandidatePoolForUser(userId, {
    limit: candidateCap,
    explorationLimit: 8,
  });
  return pool.candidates.slice(0, limit).map((c) => ({
    ...c.product,
    score: null,
    source: (c.sources[0] ?? "exploration") as RecommendationCandidateSource,
  }));
}

/**
 * Logistic baseline scoring over Candidate Generation V2 pool.
 * If model is unavailable/invalid, falls back to deterministic candidate priority order.
 */
export async function getRecommendedProductsByUser(
  userId: string,
  options?: GetRecommendedOptions
): Promise<{ data: RankedRecommendationProduct[]; status: RecommendationInferenceStatus }> {
  const limit = Math.min(Math.max(options?.limit ?? 12, 1), 40);
  const candidateCap = Math.min(Math.max(options?.candidateCap ?? 120, 20), 250);

  const load = loadLinearHeadWithValidation();
  if (!load.ok) {
    console.warn(`[recommendation-model] fallback: ${load.status.reason}`);
    return {
      data: await deterministicFallbackFromCandidates(userId, limit, candidateCap),
      status: load.status,
    };
  }

  const candidatePool = await buildRecommendationCandidatePoolForUser(userId, {
    limit: candidateCap,
    explorationLimit: 8,
  });

  const scored: RankedRecommendationProduct[] = [];
  for (const candidate of candidatePool.candidates) {
    const pid = candidate.product._id;
    const features = await buildRecommendationUserProductFeatures(userId, pid, new Date());
    if (!features) continue;
    const vec = baselineFeatureVector(features);
    if (vec.length !== load.head.coef.length) {
      console.warn("[recommendation-model] fallback: inference_vector_length_mismatch");
      return {
        data: await deterministicFallbackFromCandidates(userId, limit, candidateCap),
        status: fallbackStatus("inference_vector_length_mismatch"),
      };
    }
    const score = scoreWithLinearHead(load.head, vec);
    scored.push({
      ...candidate.product,
      score,
      source: "model",
    });
  }

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (scored.length === 0) {
    return {
      data: await deterministicFallbackFromCandidates(userId, limit, candidateCap),
      status: fallbackStatus("no_scored_candidates"),
    };
  }

  return { data: scored.slice(0, limit), status: load.status };
}
