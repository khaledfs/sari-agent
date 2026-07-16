import { describe, expect, it, vi } from "vitest";

import {
  assembleFinalText,
  createAssistantStreamParser,
  type AssistantStreamEvent,
} from "@/components/assistant/assistant-stream";

// Agent-side streaming needs the same mocks as assistant-agent.test.ts.
vi.mock("@/lib/db", () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock("@/lib/jwt", () => ({ signAuthToken: vi.fn(), verifyAuthToken: vi.fn() }));
vi.mock("@/services/cart.service", () => ({
  addToCart: vi.fn(),
  updateCartItem: vi.fn(),
  removeCartItem: vi.fn(),
  getCartByUserId: vi.fn(),
}));
vi.mock("@/services/assistant-candidates.service", () => ({
  getAssistantRankedProductCandidates: vi.fn(async () => []),
}));
vi.mock("@/services/customer-memory.service", () => ({
  getMemoryForUser: vi.fn(async () => null),
  buildMemorySystemPrompt: vi.fn(() => ""),
}));
vi.mock("@/services/pricing.service", () => ({
  getPricesForCustomer: vi.fn(async () => new Map()),
}));
vi.mock("@/models/product.model", () => ({ ProductModel: { find: vi.fn() } }));

const createMock = vi.fn();
vi.mock("@/lib/openai", () => ({
  getOpenAIClient: () => ({ chat: { completions: { create: (...a: unknown[]) => createMock(...a) } } }),
}));

import { runAssistantAgentTurn } from "@/services/assistant-agent.service";

function sse(events: Array<Record<string, unknown>>): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

describe("createAssistantStreamParser (client SSE parsing)", () => {
  it("parses complete frames into typed events", () => {
    const parser = createAssistantStreamParser();
    const events = parser.feed(
      sse([{ type: "delta", text: "שלום" }, { type: "status", key: "tools" }, { type: "final", data: { message: "שלום עולם" } }])
    );
    expect(events.map((e) => e.type)).toEqual(["delta", "status", "final"]);
  });

  it("handles frames split across arbitrary chunk boundaries", () => {
    const parser = createAssistantStreamParser();
    const full = sse([{ type: "delta", text: "חצי " }, { type: "delta", text: "שני" }]);
    const collected: AssistantStreamEvent[] = [];
    // Feed byte-by-byte-ish: split mid-JSON and mid-separator.
    for (let i = 0; i < full.length; i += 7) {
      collected.push(...parser.feed(full.slice(i, i + 7)));
    }
    expect(assembleFinalText(collected)).toBe("חצי שני");
  });

  it("skips malformed frames without crashing", () => {
    const parser = createAssistantStreamParser();
    const events = parser.feed(`data: {not json}\n\n` + sse([{ type: "delta", text: "ok" }]));
    expect(events).toHaveLength(1);
    expect(assembleFinalText(events)).toBe("ok");
  });
});

function chunkStream(chunks: Array<Record<string, unknown>>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

describe("streamed agent turn (server side)", () => {
  it("emits deltas that assemble into exactly the final response text", async () => {
    createMock.mockResolvedValueOnce(
      chunkStream([
        { choices: [{ delta: { content: "התשובה " } }] },
        { choices: [{ delta: { content: "המלאה" } }] },
        { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 500 } },
      ])
    );
    const events: Array<{ type: string; text?: string }> = [];
    const result = await runAssistantAgentTurn("6a0000000000000000000001", "שאלה", "he", [], {
      onEvent: (e) => events.push(e),
    });
    const streamed = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
    expect(result.message).toBe("התשובה המלאה");
    expect(streamed).toBe(result.message);
  });

  it("abort signal is passed to the SDK so the generation cancels server-side", async () => {
    const controller = new AbortController();
    createMock.mockImplementationOnce(async (_params: unknown, options: { signal?: AbortSignal }) => {
      expect(options.signal).toBe(controller.signal);
      throw Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" });
    });
    controller.abort();
    await expect(
      runAssistantAgentTurn("6a0000000000000000000001", "שאלה", "he", [], { signal: controller.signal })
    ).rejects.toThrow("aborted");
  });
});
