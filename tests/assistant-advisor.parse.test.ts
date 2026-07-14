import { describe, expect, it, vi } from "vitest";

// @/lib/db validates MONGODB_URI at import time; the advisor module pulls it
// in transitively. parseAdvisorOutput itself is pure — no DB is touched.
vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));

import { parseAdvisorOutput } from "@/services/assistant-advisor.service";

const validPayload = {
  answer: "קמח לחם מכיל יותר חלבון.",
  confidence: "high" as const,
  needsFreshInfo: false,
  productSearchQuery: "קמח לחם",
};

describe("parseAdvisorOutput", () => {
  it("parses strict JSON output", () => {
    const result = parseAdvisorOutput(JSON.stringify(validPayload));
    expect(result).toEqual(validPayload);
  });

  it("parses JSON wrapped in markdown fences", () => {
    const raw = "```json\n" + JSON.stringify(validPayload) + "\n```";
    expect(parseAdvisorOutput(raw)).toEqual(validPayload);
  });

  it("parses JSON with surrounding prose", () => {
    const raw = "Here is the result:\n" + JSON.stringify(validPayload) + "\nHope this helps!";
    expect(parseAdvisorOutput(raw)).toEqual(validPayload);
  });

  it('salvages the "answer" string from malformed JSON', () => {
    const raw = '{"answer": "use \\"strong\\" flour for bread", "confidence": ';
    const result = parseAdvisorOutput(raw);
    expect(result.answer).toBe('use "strong" flour for bread');
    expect(result.confidence).toBe("low");
    expect(result.needsFreshInfo).toBe(false);
    expect(result.productSearchQuery).toBeNull();
  });

  it("falls back to treating plain prose as the answer", () => {
    const raw = "קמח לחם מתאים יותר ללחמים כי יש בו יותר חלבון.";
    const result = parseAdvisorOutput(raw);
    expect(result.answer).toBe(raw);
    expect(result.confidence).toBe("low");
    expect(result.productSearchQuery).toBeNull();
  });

  it("throws on empty output", () => {
    expect(() => parseAdvisorOutput("")).toThrow("Advisor returned empty output.");
  });

  it("throws on fences-only output (empty after cleanup)", () => {
    expect(() => parseAdvisorOutput("```json\n```")).toThrow("Advisor returned empty output.");
  });

  it("does not accept JSON with a missing answer key as valid (salvage path)", () => {
    const raw = '{"confidence": "high", "needsFreshInfo": false, "productSearchQuery": null}';
    const result = parseAdvisorOutput(raw);
    // Whole text becomes the answer, downgraded confidence.
    expect(result.confidence).toBe("low");
    expect(result.answer).toContain("confidence");
  });
});
