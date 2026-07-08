import { z } from "zod";

import { getOpenAIClient } from "@/lib/openai";
import { parsedAssistantCommandSchema, type ParsedAssistantCommand } from "@/types/assistant";

const parserInputSchema = z.object({
  message: z.string().trim().min(1, "Message is required."),
});

const systemPrompt = [
  "You are a strict B2B shopping assistant parser.",
  "Task: parse ONE user message into ONE intent command.",
  "Supported intents only: add, update, remove, info, compare, reorder_habit, clarify.",
  "Extract exactly JSON keys:",
  "- intent: one of supported intents",
  "- productQuery: string or null",
  "- productQueries: optional string[] for compare when user mentions two products",
  "- quantity: integer or null",
  "Rules:",
  "- One command only (single intent).",
  "- If intent is compare and two names are present, set productQueries with two short queries.",
  "- If intent is info/add/update/remove/reorder_habit, use productQuery.",
  "- If quantity is missing or not relevant, use null.",
  "- For remove/info/compare/clarify, quantity must be null.",
  "- Output JSON only. No explanations.",
  "- No explanations and no extra keys.",
].join("\n");

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Parser did not return JSON.");
  }
  return text.slice(start, end + 1);
}

export async function parseAssistantCommandWithOpenAI(message: string): Promise<ParsedAssistantCommand> {
  const { message: safeMessage } = parserInputSchema.parse({ message });
  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: process.env.OPENAI_PARSER_MODEL?.trim() || "gpt-5-mini",
  
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: safeMessage },
    ],
  });

  const raw = response.output_text?.trim();
  if (!raw) {
    throw new Error("Parser returned empty output.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(raw));
  } catch {
    throw new Error("Parser returned invalid JSON.");
  }

  const command = parsedAssistantCommandSchema.parse(parsed);

  const qtyNullableInt = command.quantity ?? null;
  if (qtyNullableInt !== null && qtyNullableInt <= 0) {
    throw new Error("Quantity must be greater than 0.");
  }

  if (["remove", "info", "compare", "clarify"].includes(command.intent)) {
    return { ...command, quantity: null };
  }

  return { ...command, quantity: qtyNullableInt };
}

