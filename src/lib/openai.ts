import OpenAI from "openai";

let singleton: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  if (!singleton) {
    singleton = new OpenAI({ apiKey });
  }

  return singleton;
}

