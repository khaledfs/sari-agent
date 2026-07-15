import { describe, expect, it, vi } from "vitest";

// admin-products pulls requireAdmin (→ @/lib/jwt, env-validated at import) and
// @/lib/db (→ MONGODB_URI, env-validated at import). The helpers under test
// are pure; no DB is touched.
vi.mock("@/lib/jwt", () => ({
  signAuthToken: vi.fn(),
  verifyAuthToken: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));

import {
  buildAdminProductFilter,
  buildManualSku,
  sanitizeAdminProductPatch,
} from "@/lib/admin-products";

describe("sanitizeAdminProductPatch (whitelist)", () => {
  it("accepts every whitelisted field", () => {
    const clean = sanitizeAdminProductPatch({
      name: " קמח מלא ",
      price: 12.5,
      unit: "kg",
      packageSize: "25kg",
      isActive: false,
      stock: 4,
      lowStockThreshold: 5,
      category: "flours",
    });
    expect(clean).toEqual({
      name: "קמח מלא",
      price: 12.5,
      unit: "kg",
      packageSize: "25kg",
      isActive: false,
      stock: 4,
      lowStockThreshold: 5,
      category: "flours",
    });
  });

  it.each(["sku", "imageUrl", "_id", "createdAt", "$set", "role"])(
    "rejects non-whitelisted field %s",
    (field) => {
      expect(() => sanitizeAdminProductPatch({ [field]: "x" })).toThrow(
        `Field "${field}" cannot be updated.`
      );
    }
  );

  it("rejects an empty patch", () => {
    expect(() => sanitizeAdminProductPatch({})).toThrow(
      "At least one field is required for update."
    );
  });

  it.each([0, -1, -0.5])("rejects price <= 0 (%d)", (price) => {
    expect(() => sanitizeAdminProductPatch({ price })).toThrow("Price must be greater than 0.");
  });

  it("rejects a non-numeric price", () => {
    expect(() => sanitizeAdminProductPatch({ price: "12" })).toThrow(
      "Price must be greater than 0."
    );
  });

  it.each([-1, -10, 1.5])("rejects invalid stock %d", (stock) => {
    expect(() => sanitizeAdminProductPatch({ stock })).toThrow(
      "Stock must be null (untracked) or an integer of at least 0."
    );
  });

  it("accepts stock null (untracked) and stock 0 (sold out)", () => {
    expect(sanitizeAdminProductPatch({ stock: null })).toEqual({ stock: null });
    expect(sanitizeAdminProductPatch({ stock: 0 })).toEqual({ stock: 0 });
  });

  it("rejects an empty name", () => {
    expect(() => sanitizeAdminProductPatch({ name: "  " })).toThrow("Product name is required.");
  });

  it("rejects a negative lowStockThreshold", () => {
    expect(() => sanitizeAdminProductPatch({ lowStockThreshold: -2 })).toThrow(
      "Low-stock threshold must be an integer of at least 0."
    );
  });

  it("rejects a non-boolean isActive", () => {
    expect(() => sanitizeAdminProductPatch({ isActive: "yes" })).toThrow(
      "isActive must be a boolean."
    );
  });
});

describe("buildManualSku", () => {
  it("prefixes MANUAL- and slugifies", () => {
    expect(buildManualSku("Chocolate Chips 70%")).toBe("MANUAL-CHOCOLATE-CHIPS-70");
  });

  it("keeps Hebrew letters", () => {
    expect(buildManualSku("קמח מלא")).toBe("MANUAL-קמח-מלא");
  });

  it("collapses punctuation runs into a single dash", () => {
    expect(buildManualSku("a -- b!!c")).toBe("MANUAL-A-B-C");
  });

  it("falls back to a non-empty sku for an all-punctuation name", () => {
    const sku = buildManualSku("!!!");
    expect(sku.startsWith("MANUAL-")).toBe(true);
    expect(sku.length).toBeGreaterThan("MANUAL-".length);
  });
});

describe("buildAdminProductFilter", () => {
  it("returns an empty filter for no params", () => {
    expect(buildAdminProductFilter({})).toEqual({});
  });

  it("builds a name/sku $or regex for search (Hebrew-safe)", () => {
    const filter = buildAdminProductFilter({ search: "סולת" });
    const or = filter.$or as Array<Record<string, RegExp>>;
    expect(or).toHaveLength(2);
    expect(or[0].name.test("סולת מפרץ 5 קג")).toBe(true);
    expect(or[1].sku.test("SOLET-01")).toBe(false);
  });

  it("escapes regex metacharacters in search input", () => {
    const filter = buildAdminProductFilter({ search: "a+b (special)" });
    const or = filter.$or as Array<Record<string, RegExp>>;
    expect(or[0].name.test("a+b (special) thing")).toBe(true);
    expect(or[0].name.test("aab special")).toBe(false);
  });

  it("search is case-insensitive", () => {
    const filter = buildAdminProductFilter({ search: "manual" });
    const or = filter.$or as Array<Record<string, RegExp>>;
    expect(or[1].sku.test("MANUAL-X")).toBe(true);
  });

  it("adds category and active filters", () => {
    expect(buildAdminProductFilter({ category: "flours", active: "active" })).toMatchObject({
      category: "flours",
      isActive: true,
    });
    expect(buildAdminProductFilter({ active: "inactive" })).toEqual({ isActive: false });
    expect(buildAdminProductFilter({ active: "all" })).toEqual({});
  });

  it("ignores blank search/category", () => {
    expect(buildAdminProductFilter({ search: "  ", category: "" })).toEqual({});
  });
});
