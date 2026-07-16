import { describe, expect, it, vi } from "vitest";

// The agent pulls db/model/cart/candidate/memory/pricing modules that validate
// env at import or hit Mongo — everything side-effectful is mocked; the logic
// under test (argument validation, refusal shaping, loop bound) is pure.
vi.mock("@/lib/db", () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock("@/lib/jwt", () => ({ signAuthToken: vi.fn(), verifyAuthToken: vi.fn() }));

const addToCartMock = vi.fn();
const updateCartItemMock = vi.fn();
const removeCartItemMock = vi.fn();
const getCartMock = vi.fn();
vi.mock("@/services/cart.service", () => ({
  addToCart: (...a: unknown[]) => addToCartMock(...a),
  updateCartItem: (...a: unknown[]) => updateCartItemMock(...a),
  removeCartItem: (...a: unknown[]) => removeCartItemMock(...a),
  getCartByUserId: (...a: unknown[]) => getCartMock(...a),
}));

const candidatesMock = vi.fn();
vi.mock("@/services/assistant-candidates.service", () => ({
  getAssistantRankedProductCandidates: (...a: unknown[]) => candidatesMock(...a),
}));

vi.mock("@/services/customer-memory.service", () => ({
  getMemoryForUser: vi.fn(async () => null),
  buildMemorySystemPrompt: vi.fn(() => ""),
}));

vi.mock("@/services/pricing.service", () => ({
  getPricesForCustomer: vi.fn(async () => new Map()),
}));

const productFindMock = vi.fn();
vi.mock("@/models/product.model", () => ({
  ProductModel: {
    find: (...a: unknown[]) => productFindMock(...a),
  },
}));

const createMock = vi.fn();
vi.mock("@/lib/openai", () => ({
  getOpenAIClient: () => ({ chat: { completions: { create: (...a: unknown[]) => createMock(...a) } } }),
}));

import {
  createAgentToolContext,
  executeTool,
  MAX_TOOL_ITERATIONS,
  runAssistantAgentTurn,
} from "@/services/assistant-agent.service";
import { normalizeAssistantText } from "@/services/assistant-normalization.service";

const USER = "6a0000000000000000000001";
const PRODUCT = "6a0000000000000000000002";

function mockProductFind(rows: unknown[]) {
  productFindMock.mockReturnValue({
    select: () => ({ lean: () => ({ exec: async () => rows }) }),
  });
}

const EMPTY_CART = { cartId: "c1", userId: USER, items: [], cartTotal: 0 };

describe("tool-argument validation (server-side, never trusts the model)", () => {
  it("add_to_cart rejects an invented/invalid productId without touching the cart", async () => {
    const result = await executeTool(createAgentToolContext(USER), "add_to_cart", {
      productId: "totally-made-up",
      quantity: 2,
    });
    expect(result).toEqual({ ok: false, error: "invalid productId" });
    expect(addToCartMock).not.toHaveBeenCalled();
  });

  it.each([0, -3, 2.5, 1000, "many"])(
    "add_to_cart rejects quantity %s (integer 1-999 only)",
    async (quantity) => {
      const result = (await executeTool(createAgentToolContext(USER), "add_to_cart", {
        productId: PRODUCT,
        quantity,
      })) as { ok: boolean };
      expect(result.ok).toBe(false);
      expect(addToCartMock).not.toHaveBeenCalled();
    }
  );

  it("search_products requires a query", async () => {
    const result = await executeTool(createAgentToolContext(USER), "search_products", { query: "  " });
    expect(result).toEqual({ ok: false, error: "query is required" });
  });

  it("compare_products requires 2-3 ids", async () => {
    const one = (await executeTool(createAgentToolContext(USER), "compare_products", {
      productIds: [PRODUCT],
    })) as { ok: boolean };
    expect(one.ok).toBe(false);
  });

  it("unknown tools return a structured error, never throw", async () => {
    const result = (await executeTool(createAgentToolContext(USER), "drop_database", {})) as { ok: boolean };
    expect(result.ok).toBe(false);
  });
});

describe("restricted customer refusal (Issue 3 integration)", () => {
  it("maps the guard error to a structured blocked result, not a raw error", async () => {
    addToCartMock.mockRejectedValueOnce(new Error("Account restricted."));
    const result = (await executeTool(createAgentToolContext(USER), "add_to_cart", {
      productId: PRODUCT,
      quantity: 1,
    })) as { ok: boolean; blocked?: string };
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe("account_restricted");
  });
});

describe("QA matching terms (catalog-verified normalization)", () => {
  it.each([
    ["בקלאווה", "בקלאוה"],
    ["בקלווה", "בקלאוה"],
    ["baklava", "בקלאוה"],
    ["بقلاوة", "בקלאוה"],
    ["سمنة", "סמנה"],
    ["סמיד", "סולת"],
  ])("%s normalizes to the catalog term %s", (input, expected) => {
    expect(normalizeAssistantText(input).normalized).toContain(expected);
  });

  it("search_products runs the normalization layer and surfaces strong matches", async () => {
    candidatesMock.mockResolvedValueOnce([
      {
        productId: PRODUCT,
        name: 'סמנה בקלאוה 16ק"ג',
        sku: "102046",
        category: "",
        price: 220,
        unit: "",
        packageSize: "",
        score: 88,
        reasons: [],
        sources: [],
      },
    ]);
    const ctx = createAgentToolContext(USER);
    const result = (await executeTool(ctx, "search_products", { query: "בקלאווה" })) as {
      ok: boolean;
      normalizedQuery: string;
      results: Array<{ strongMatch: boolean }>;
    };
    expect(result.ok).toBe(true);
    expect(result.normalizedQuery).toContain("בקלאוה");
    expect(result.results[0].strongMatch).toBe(true);
    expect(ctx.lastMatches).toHaveLength(1); // surfaces a product card
  });
});

describe("tool-call loop bound (runaway-cost cap)", () => {
  it("stops calling tools after MAX_TOOL_ITERATIONS and forces a final text answer", async () => {
    getCartMock.mockResolvedValue(EMPTY_CART);
    mockProductFind([]);
    // The model "wants" to call get_cart forever:
    createMock.mockImplementation(async (params: { tools?: unknown[] }) => {
      if (params.tools) {
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  { id: "t1", type: "function", function: { name: "get_cart", arguments: "{}" } },
                ],
              },
            },
          ],
        };
      }
      return { choices: [{ message: { role: "assistant", content: "תשובה סופית" } }] };
    });

    const result = await runAssistantAgentTurn(USER, "מה בעגלה?", "he", []);
    // MAX_TOOL_ITERATIONS rounds WITH tools + one forced no-tools round:
    expect(createMock).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS + 1);
    const lastCall = createMock.mock.calls.at(-1)?.[0] as { tools?: unknown[] };
    expect(lastCall.tools).toBeUndefined();
    expect(result.message).toBe("תשובה סופית");
    expect(result.actionResult).toBe("advice");
  });
});
