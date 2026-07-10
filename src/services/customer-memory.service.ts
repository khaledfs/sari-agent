import { isValidObjectId } from "mongoose";
import { z } from "zod";

import { connectDB } from "@/lib/db";
import { getOpenAIClient } from "@/lib/openai";
import {
  CUSTOMER_MEMORY_BUSINESS_TYPES,
  CustomerMemoryModel,
  type CustomerMemoryBusinessType,
} from "@/models/customer-memory.model";

/** One chat turn as passed to the memory summarizer. */
export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Lean shape consumed by prompt building (what getMemoryForUser returns). */
export type CustomerMemoryLean = {
  businessType?: CustomerMemoryBusinessType;
  memorySummary: string;
  conversationCount: number;
  inferredPreferences: {
    preferredCategories: string[];
    avoidedProducts: string[];
    notedFacts: string[];
  };
};

const BUSINESS_TYPE_LABELS: Record<CustomerMemoryBusinessType, string> = {
  bakery: "Bakery (bread, dough, industrial flour, yeast)",
  oriental_sweets: "Oriental sweets shop (semolina, ghee, rose water, pistachios, knafeh cheese)",
  western_sweets: "Western sweets shop (cake flour, butter, chocolate, cream, vanilla)",
  cafe: "Cafe (coffee, syrups, milk, cups, croissant ingredients)",
  ice_cream: "Ice cream shop (stabilizers, flavors, sugar, cones, dairy)",
};

const memoryUpdateSchema = z.object({
  memorySummary: z.string().trim().min(1),
  preferredCategories: z.array(z.string().trim().min(1)).max(15).default([]),
  avoidedProducts: z.array(z.string().trim().min(1)).max(15).default([]),
  notedFacts: z.array(z.string().trim().min(1)).max(15).default([]),
});

const businessTypeInferenceSchema = z.object({
  businessType: z.enum(CUSTOMER_MEMORY_BUSINESS_TYPES).nullable(),
});

function getMemoryModelName(): string {
  // Cheap/fast summarizer; overridable like OPENAI_PARSER_MODEL / OPENAI_ADVISOR_MODEL.
  return process.env.OPENAI_MEMORY_MODEL?.trim() || "gpt-4o-mini";
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Memory model did not return JSON.");
  }
  return text.slice(start, end + 1);
}

function formatConversation(conversationMessages: ConversationMessage[]): string {
  return conversationMessages
    .map((m) => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`)
    .join("\n");
}

export async function getMemoryForUser(userId: string): Promise<CustomerMemoryLean | null> {
  if (!isValidObjectId(userId)) return null;
  await connectDB();
  const doc = await CustomerMemoryModel.findOne({ userId }).lean().exec();
  if (!doc) return null;
  return {
    businessType: doc.businessType ?? undefined,
    memorySummary: doc.memorySummary ?? "",
    conversationCount: doc.conversationCount ?? 0,
    inferredPreferences: {
      preferredCategories: doc.inferredPreferences?.preferredCategories ?? [],
      avoidedProducts: doc.inferredPreferences?.avoidedProducts ?? [],
      notedFacts: doc.inferredPreferences?.notedFacts ?? [],
    },
  };
}

/**
 * Builds the "[Customer context]" block prepended BEFORE the main AI system
 * prompt. Returns "" when there is nothing useful to say, so callers can
 * prepend unconditionally.
 */
export function buildMemorySystemPrompt(memory: CustomerMemoryLean | null): string {
  if (!memory) return "";

  const lines: string[] = ["[Customer context]"];

  if (memory.businessType) {
    lines.push(`Business type: ${BUSINESS_TYPE_LABELS[memory.businessType]}`);
  }
  if (memory.memorySummary) {
    lines.push(`What we know about this customer: ${memory.memorySummary}`);
  }
  if (memory.inferredPreferences.preferredCategories.length > 0) {
    lines.push(`Known preferences: ${memory.inferredPreferences.preferredCategories.join(", ")}`);
  }
  if (memory.inferredPreferences.avoidedProducts.length > 0) {
    lines.push(`Avoids: ${memory.inferredPreferences.avoidedProducts.join(", ")}`);
  }
  if (memory.inferredPreferences.notedFacts.length > 0) {
    lines.push(`Noted facts: ${memory.inferredPreferences.notedFacts.join("; ")}`);
  }
  lines.push(`Conversation history: ${memory.conversationCount} sessions`);
  lines.push(
    "Tailor advice to this business type and these preferences, but never contradict the customer's explicit current question."
  );

  // Only the header + session count means we know nothing useful yet.
  if (lines.length <= 3 && !memory.businessType && !memory.memorySummary) return "";

  return lines.join("\n");
}

/**
 * Summarizes what the latest conversation taught us about the customer and
 * persists it (upsert). Designed to run fire-and-forget AFTER the user
 * response is sent — callers must .catch() and must never await it on the
 * request path.
 */
export async function updateMemoryAfterConversation(
  userId: string,
  conversationMessages: ConversationMessage[]
): Promise<void> {
  if (!isValidObjectId(userId) || conversationMessages.length === 0) return;

  await connectDB();
  const existing = await getMemoryForUser(userId);

  const client = getOpenAIClient();
  const systemPrompt = [
    "You maintain a long-term memory profile of a B2B wholesale food customer (bakery/sweets/cafe/ice-cream businesses buying ingredients in bulk).",
    "Given the existing profile and one new conversation, return the UPDATED profile.",
    "Keep memorySummary a compact plain-text paragraph under 450 words (~600 tokens): business focus, recurring products/brands, quantities and ordering rhythm, stated constraints (budget, allergens, kashrut/halal), tone preferences.",
    "Merge — never drop still-relevant facts from the existing summary; drop only what the new conversation contradicts.",
    "preferredCategories: short ingredient/product-category phrases the customer cares about. avoidedProducts: things they explicitly avoid. notedFacts: short standalone facts worth remembering (e.g. \"asks about allergens for their clientele\").",
    "Only record facts actually supported by the conversations. No speculation, no filler.",
    'Output strict JSON only: { "memorySummary": string, "preferredCategories": string[], "avoidedProducts": string[], "notedFacts": string[] }. No markdown.',
  ].join("\n");

  const userPrompt = [
    `Existing profile summary: ${existing?.memorySummary || "(none yet — first conversation)"}`,
    `Existing preferredCategories: ${JSON.stringify(existing?.inferredPreferences.preferredCategories ?? [])}`,
    `Existing avoidedProducts: ${JSON.stringify(existing?.inferredPreferences.avoidedProducts ?? [])}`,
    `Existing notedFacts: ${JSON.stringify(existing?.inferredPreferences.notedFacts ?? [])}`,
    "",
    "New conversation:",
    formatConversation(conversationMessages),
  ].join("\n");

  const response = await client.responses.create({
    model: getMemoryModelName(),
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.output_text?.trim();
  if (!raw) throw new Error("Memory model returned empty output.");
  const update = memoryUpdateSchema.parse(JSON.parse(extractJsonObject(raw)));

  await CustomerMemoryModel.updateOne(
    { userId },
    {
      $set: {
        memorySummary: update.memorySummary,
        "inferredPreferences.preferredCategories": update.preferredCategories,
        "inferredPreferences.avoidedProducts": update.avoidedProducts,
        "inferredPreferences.notedFacts": update.notedFacts,
        lastUpdatedAt: new Date(),
      },
      $inc: { conversationCount: 1 },
    },
    { upsert: true }
  ).exec();

  if (!existing?.businessType) {
    await inferBusinessTypeFromConversation(userId, conversationMessages);
  }
}

/**
 * If businessType is not set yet, tries to infer it from conversation content
 * and saves it. Conservative: saves only a confident match, otherwise leaves
 * the field unset for a later conversation.
 */
export async function inferBusinessTypeFromConversation(
  userId: string,
  conversationMessages: ConversationMessage[]
): Promise<void> {
  if (!isValidObjectId(userId) || conversationMessages.length === 0) return;

  await connectDB();
  const doc = await CustomerMemoryModel.findOne({ userId }).select("businessType").lean().exec();
  if (doc?.businessType) return;

  const client = getOpenAIClient();
  const systemPrompt = [
    "Classify a B2B wholesale food customer's business type from a conversation with their purchasing assistant.",
    "Allowed values: bakery (bread, dough, industrial flour, yeast) | oriental_sweets (semolina, ghee, rose water, pistachios, knafeh cheese) | western_sweets (cake flour, butter, chocolate, cream, vanilla) | cafe (coffee, syrups, milk, cups, croissant ingredients) | ice_cream (stabilizers, flavors, sugar, cones, dairy).",
    "Return null unless the conversation gives clear evidence for exactly one type.",
    'Output strict JSON only: { "businessType": "<one of the values>" | null }. No markdown.',
  ].join("\n");

  const response = await client.responses.create({
    model: getMemoryModelName(),
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: formatConversation(conversationMessages) },
    ],
  });

  const raw = response.output_text?.trim();
  if (!raw) return;

  let inferred: z.infer<typeof businessTypeInferenceSchema>;
  try {
    inferred = businessTypeInferenceSchema.parse(JSON.parse(extractJsonObject(raw)));
  } catch {
    return;
  }
  if (!inferred.businessType) return;

  // Upsert only when no doc exists at all; otherwise guard with $exists so a
  // concurrently-set businessType is never overwritten (and never re-inserted
  // against the unique userId index).
  await CustomerMemoryModel.updateOne(
    { userId, businessType: { $exists: false } },
    { $set: { businessType: inferred.businessType, lastUpdatedAt: new Date() } },
    { upsert: doc === null }
  ).exec();
}
