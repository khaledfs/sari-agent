import { z } from "zod";

import { getOpenAIClient } from "@/lib/openai";
import { parsedCartCommandSchema, type ParsedCartCommand } from "@/types/assistant";

const parserInputSchema = z.object({
  message: z.string().trim().min(1, "Message is required."),
});

const systemPrompt = [
  "You are a strict shopping cart command parser.",
  "Task: parse ONE user message into ONE cart command.",
  "Supported actions only: add, update, remove.",
  "Extract exactly:",
  "- action: add | update | remove",
  "- productQuery: short product phrase",
  "- quantity: integer or null",
  "Rules:",
  "- One command only.",
  "- One product only.",
  "- If quantity is missing, use null.",
  "- For remove, quantity should be null.",
  "- Output JSON only with keys: action, productQuery, quantity.",
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

export async function parseCartCommandWithOpenAI(message: string): Promise<ParsedCartCommand> {
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

  const command = parsedCartCommandSchema.parse(parsed);

  if (command.action === "remove") {
    return { ...command, quantity: null };
  }

  if (command.quantity !== null && command.quantity <= 0) {
    throw new Error("Quantity must be greater than 0.");
  }

  return command;
}

