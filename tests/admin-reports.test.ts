import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));
vi.mock("@/lib/jwt", () => ({
  signAuthToken: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

import { buildCsv, csvEscape, joinOrderItems, validateDateRange } from "@/lib/admin-reports";

describe("validateDateRange", () => {
  it("accepts a valid range and returns Dates", () => {
    const { from, to } = validateDateRange("2026-01-01", "2026-03-01");
    expect(from.getTime()).toBeLessThan(to.getTime());
  });

  it("rejects missing values", () => {
    expect(() => validateDateRange(null, "2026-01-01")).toThrow("from and to are required.");
    expect(() => validateDateRange("2026-01-01", undefined)).toThrow("from and to are required.");
  });

  it("rejects invalid dates", () => {
    expect(() => validateDateRange("banana", "2026-01-01")).toThrow("Invalid from date.");
    expect(() => validateDateRange("2026-01-01", "banana")).toThrow("Invalid to date.");
  });

  it("rejects reversed ranges", () => {
    expect(() => validateDateRange("2026-03-01", "2026-01-01")).toThrow("from must be before to.");
  });

  it("rejects ranges over 365 days; accepts exactly 365", () => {
    expect(() => validateDateRange("2025-01-01", "2026-06-01")).toThrow(
      "Date range must be at most 365 days."
    );
    expect(() => validateDateRange("2025-07-16", "2026-07-16")).not.toThrow();
  });
});

describe("csvEscape", () => {
  it.each([
    ["plain", "plain"],
    ["Chocolate, Dark", '"Chocolate, Dark"'],
    ['He said "hi"', '"He said ""hi"""'],
    ["line1\nline2", '"line1\nline2"'],
    ["", ""],
    [null, ""],
    [undefined, ""],
    [42.5, "42.5"],
    ["קמח לבן 25 ק\"ג", '"קמח לבן 25 ק""ג"'],
    ["حلويات شرقية", "حلويات شرقية"],
  ])("escapes %j", (input, expected) => {
    expect(csvEscape(input)).toBe(expected);
  });
});

describe("buildCsv", () => {
  it("builds CRLF-joined rows with escaped values", () => {
    const csv = buildCsv(
      ["name", "note"],
      [
        ["Chocolate, Dark", 'says "yum"'],
        ["קמח", "רגיל"],
      ]
    );
    expect(csv).toBe('name,note\r\n"Chocolate, Dark","says ""yum"""\r\nקמח,רגיל');
  });

  it("handles empty rows", () => {
    expect(buildCsv(["a", "b"], [])).toBe("a,b");
  });
});

describe("joinOrderItems", () => {
  it("joins items into a readable string with gift markers", () => {
    expect(
      joinOrderItems([
        { name: "קמח לבן 25kg", quantity: 2 },
        { name: "שוקולד", quantity: 5 },
        { name: "וניל", quantity: 1, isGift: true },
      ])
    ).toBe("קמח לבן 25kg x2, שוקולד x5, 🎁 וניל x1");
  });
});
