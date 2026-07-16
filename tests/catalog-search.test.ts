import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));

import { buildSuggestions, levenshtein, scoreProduct } from "@/services/catalog-search.service";
import { normalizeAssistantText } from "@/services/assistant-normalization.service";

describe("ranking (scoreProduct)", () => {
  const rank = (names: string[], query: string) => {
    const n = normalizeAssistantText(query);
    return [...names].sort(
      (a, b) =>
        scoreProduct({ name: b }, query, n.normalized, n.tokens) -
        scoreProduct({ name: a }, query, n.normalized, n.tokens)
    );
  };

  it('exact phrase "קמח לבן" ranks קמח לבן 25 ק"ג above קמח מלא', () => {
    const ordered = rank(['קמח מלא 25 ק"ג', 'קמח לבן 25 ק"ג'], "קמח לבן");
    expect(ordered[0]).toBe('קמח לבן 25 ק"ג');
  });

  it("exact full-name match outranks everything", () => {
    const ordered = rank(["סולת מפרץ", "סולת מפרץ 5 ק\"ג", "סולת דקה"], "סולת מפרץ");
    expect(ordered[0]).toBe("סולת מפרץ");
  });

  it("normalized synonym token matches (סמיד → סולת products)", () => {
    const n = normalizeAssistantText("סמיד");
    const solet = scoreProduct({ name: "סולת מפרץ" }, "סמיד", n.normalized, n.tokens);
    const flour = scoreProduct({ name: "קמח מלא" }, "סמיד", n.normalized, n.tokens);
    expect(solet).toBeGreaterThan(0);
    expect(flour).toBe(0);
  });

  it("english cross-language (flour → קמח)", () => {
    const n = normalizeAssistantText("flour");
    expect(scoreProduct({ name: 'קמח לבן 25 ק"ג' }, "flour", n.normalized, n.tokens)).toBeGreaterThan(0);
  });

  it("text score breaks ties between equal token matches", () => {
    const n = normalizeAssistantText("קמח");
    const a = scoreProduct({ name: "קמח א", textScore: 2 }, "קמח", n.normalized, n.tokens);
    const b = scoreProduct({ name: "קמח ב", textScore: 1 }, "קמח", n.normalized, n.tokens);
    expect(a).toBeGreaterThan(b);
  });

  it("partial token match scores lower than exact word match", () => {
    const n = normalizeAssistantText("סוכר");
    const exact = scoreProduct({ name: "סוכר לבן" }, "סוכר", n.normalized, n.tokens);
    const partial = scoreProduct({ name: "סוכריות צבעוניות" }, "סוכר", n.normalized, n.tokens);
    expect(exact).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
  });
});

describe("levenshtein", () => {
  it.each([
    ["", "", 0],
    ["abc", "abc", 0],
    ["abc", "abd", 1],
    ["סולת", "סולתת", 1],
    ["kitten", "sitting", 3],
    ["", "ab", 2],
  ])("distance(%j, %j) = %i", (a, b, expected) => {
    expect(levenshtein(a, b)).toBe(expected);
  });

  it("case-insensitive", () => {
    expect(levenshtein("Flour", "flour")).toBe(0);
  });
});

describe("buildSuggestions", () => {
  const names = ["סולת מפרץ 5 ק\"ג", "סוכר לבן", "קמח מלא", "וניל טבעי"];

  it("suggests סולת for the typo סולתת (distance 1)", () => {
    expect(buildSuggestions("סולתת", names)).toContain("סולת");
  });

  it("caps at 3 suggestions and sorts by distance", () => {
    const result = buildSuggestions("סולת", names);
    expect(result.length).toBeLessThanOrEqual(3);
    // exact same word excluded (distance 0)
    expect(result).not.toContain("סולת");
  });

  it("returns nothing for empty token or far-off input", () => {
    expect(buildSuggestions("", names)).toEqual([]);
    expect(buildSuggestions("xyz123", names)).toEqual([]);
  });
});
