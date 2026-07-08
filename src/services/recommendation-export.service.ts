import fs from "fs/promises";
import path from "path";

import { requireAdmin } from "@/lib/auth-user";
import { buildRecommendationSchemaMetadata } from "@/lib/recommendation-schema";
import { buildRecommendationExamplesForAllUsers } from "@/services/recommendation-dataset.service";

export type RecommendationDatasetExportResult = {
  outputFile: string;
  featureKeysFile: string;
  metadataFile: string;
  schemaVersion: string;
  featureCount: number;
  userCount: number;
  exampleCount: number;
  generatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "artifacts", "recommendation-data");
const DATASET_FILENAME = "dataset.jsonl";
const FEATURE_KEYS_FILENAME = "feature_keys.json";
const METADATA_FILENAME = "metadata.json";

/**
 * Offline ML export (admin-only). Writes JSONL training rows + baseline feature key order.
 * Not for public clients — call only from admin-authenticated routes.
 */
export async function exportRecommendationDatasetToArtifacts(options?: {
  maxUsers?: number;
}): Promise<RecommendationDatasetExportResult> {
  await requireAdmin();

  await fs.mkdir(DATA_DIR, { recursive: true });

  const examples = await buildRecommendationExamplesForAllUsers(options?.maxUsers);
  const userIds = new Set(examples.map((e) => e.userId));
  const schemaMeta = buildRecommendationSchemaMetadata();

  const outPath = path.join(DATA_DIR, DATASET_FILENAME);
  const keysPath = path.join(DATA_DIR, FEATURE_KEYS_FILENAME);
  const metaPath = path.join(DATA_DIR, METADATA_FILENAME);

  await fs.writeFile(keysPath, `${JSON.stringify(schemaMeta, null, 2)}\n`, "utf8");
  await fs.writeFile(
    metaPath,
    `${JSON.stringify(
      {
        ...schemaMeta,
        generatedAt: new Date().toISOString(),
        userCount: userIds.size,
        exampleCount: examples.length,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const lines = examples.map((ex) => JSON.stringify(ex)).join("\n");
  await fs.writeFile(outPath, lines ? `${lines}\n` : "", "utf8");

  return {
    outputFile: outPath,
    featureKeysFile: keysPath,
    metadataFile: metaPath,
    schemaVersion: schemaMeta.schemaVersion,
    featureCount: schemaMeta.featureCount,
    userCount: userIds.size,
    exampleCount: examples.length,
    generatedAt: new Date().toISOString(),
  };
}
