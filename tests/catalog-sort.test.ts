import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock("@/lib/jwt", () => ({ signAuthToken: vi.fn(), verifyAuthToken: vi.fn() }));

import { resolveCatalogSort } from "@/services/product.service";
import { sortByCatalogPrice } from "@/services/catalog-search.service";

describe("resolveCatalogSort (browse sort → Mongo spec)", () => {
  it("maps each option; unknown falls back to the default recency order", () => {
    expect(resolveCatalogSort("price_asc")).toEqual({ price: 1, _id: 1 });
    expect(resolveCatalogSort("price_desc")).toEqual({ price: -1, _id: 1 });
    expect(resolveCatalogSort("default")).toEqual({ createdAt: -1, _id: -1 });
    expect(resolveCatalogSort(undefined)).toEqual({ createdAt: -1, _id: -1 });
    expect(resolveCatalogSort("garbage")).toEqual({ createdAt: -1, _id: -1 });
  });
});

describe("sortByCatalogPrice (search sort by the resolved/customer price)", () => {
  const docs = [
    { _id: "b", price: 30 },
    { _id: "a", price: 10 },
    { _id: "c", price: 20 },
    { _id: "d", price: 10 }, // ties with 'a' → id tiebreak
  ];
  const priceOf = (d: { price: number }) => d.price;

  it("ascending: cheapest first, deterministic id tiebreak", () => {
    expect(sortByCatalogPrice(docs, "price_asc", priceOf).map((d) => d._id)).toEqual(["a", "d", "c", "b"]);
  });

  it("descending: most expensive first", () => {
    expect(sortByCatalogPrice(docs, "price_desc", priceOf).map((d) => d._id)).toEqual(["b", "c", "a", "d"]);
  });

  it("sorts by the priceOf result (the CUSTOMER price), not a raw field", () => {
    // customer price inverts the base order for one product
    const customerPrice = (d: { _id: unknown; price: number }) => (d._id === "b" ? 5 : d.price);
    expect(sortByCatalogPrice(docs, "price_asc", customerPrice)[0]._id).toBe("b");
  });

  it("does not mutate the input array", () => {
    const copy = [...docs];
    sortByCatalogPrice(docs, "price_asc", priceOf);
    expect(docs).toEqual(copy);
  });
});
