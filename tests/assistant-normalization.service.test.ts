import { describe, expect, it } from "vitest";

import { normalizeAssistantText } from "@/services/assistant-normalization.service";

describe("normalizeAssistantText", () => {
  describe("Hebrew catalog synonyms (mapped toward the term the catalog uses)", () => {
    it.each([
      ["סמיד", "סולת"],
      ["سميد", "סולת"],
      ["semolina", "סולת"],
      ["קורנפלור", "עמילן"],
      ["cornflour", "עמילן"],
      ["ונילין", "וניל"],
      ["גלטינה", "גלטין"],
      ["פולנטה", "תירס"],
      ["polenta", "תירס"],
    ])("maps %s to %s", (input, expected) => {
      expect(normalizeAssistantText(input).normalized).toBe(expected);
    });

    it("maps synonyms inside a longer sentence", () => {
      const result = normalizeAssistantText("תוסיף 2 סמיד");
      expect(result.tokens).toContain("סולת");
      expect(result.tokens).not.toContain("סמיד");
    });
  });

  describe("typo replacements", () => {
    it.each([
      ["כמח", "קמח"],
      ["flour", "קמח"],
      ["sugar", "סוכר"],
      ["yeast", "שמרים"],
      ["طحين", "קמח"],
    ])("maps %s to %s", (input, expected) => {
      expect(normalizeAssistantText(input).normalized).toBe(expected);
    });
  });

  describe("filler words and cleanup", () => {
    it("drops filler words", () => {
      const result = normalizeAssistantText("תוסיף לי בבקשה קמח");
      expect(result.tokens).toContain("קמח");
      expect(result.tokens).not.toContain("לי");
      expect(result.tokens).not.toContain("בבקשה");
    });

    it("strips punctuation and collapses whitespace", () => {
      const result = normalizeAssistantText("  קמח,   מלא!! ");
      expect(result.normalized).toBe("קמח מלא");
    });

    it("preserves the original input verbatim (trimmed)", () => {
      expect(normalizeAssistantText(" קמח מלא ").original).toBe("קמח מלא");
    });

    it("returns empty results for empty input", () => {
      const result = normalizeAssistantText("");
      expect(result.normalized).toBe("");
      expect(result.tokens).toEqual([]);
    });
  });

  it("does NOT map תירס away (no reverse polenta mapping)", () => {
    expect(normalizeAssistantText("קמח תירס").tokens).toContain("תירס");
  });
});
