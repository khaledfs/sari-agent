import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendChatEntries,
  getChatState,
  mergeChatEntries,
  replaceChatEntry,
  resetConversation,
  setChatState,
  subscribeChat,
  type ChatEntry,
} from "@/components/assistant/chat-store";

function user(id: string, text: string): ChatEntry {
  return { id, type: "user", text, ts: 1 };
}

beforeEach(() => {
  // Fresh conversation between tests; isOpen/seq reset explicitly.
  resetConversation();
  setChatState({ isOpen: false, draft: "", seq: 0 });
});

describe("chat store survives a simulated parent remount (Issue 7)", () => {
  it("state persists when every subscriber unmounts and remounts", () => {
    // Mount: a component subscribes and writes state.
    const render = vi.fn();
    const unsubscribe = subscribeChat(render);
    setChatState({ isOpen: true, draft: "טרם נשלח" });
    appendChatEntries([user("m1", "שלום"), user("m2", "מה שלומך")]);
    expect(render).toHaveBeenCalled();

    // Parent remount: the subtree unmounts (subscription torn down)...
    unsubscribe();

    // ...and a NEW component instance mounts and reads the store.
    const remounted = subscribeChat(vi.fn());
    const state = getChatState();
    expect(state.isOpen).toBe(true); // panel stays open
    expect(state.history.map((m) => m.id)).toEqual(["m1", "m2"]); // thread intact
    expect(state.draft).toBe("טרם נשלח"); // unsent input survives
    remounted();
  });

  it("close hides without destroying the thread", () => {
    appendChatEntries([user("m1", "שלום")]);
    setChatState({ isOpen: false });
    expect(getChatState().history).toHaveLength(1);
  });
});

describe("mergeChatEntries (de-duplication by stable id)", () => {
  it("drops duplicates by id, keeps the original position and content", () => {
    const history = [user("a", "one"), user("b", "two")];
    const merged = mergeChatEntries(history, [user("b", "TWO CHANGED"), user("c", "three")]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect((merged[1] as { text: string }).text).toBe("two"); // original kept
  });

  it("keeps chronological order for genuinely new entries", () => {
    const merged = mergeChatEntries([user("a", "1")], [user("b", "2"), user("c", "3")]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("double-append of the same batch is a no-op (double-send race)", () => {
    appendChatEntries([user("x", "once")]);
    appendChatEntries([user("x", "once")]);
    expect(getChatState().history.filter((m) => m.id === "x")).toHaveLength(1);
  });
});

describe("replaceChatEntry (loading placeholder swap)", () => {
  it("removes the placeholder and appends the final entry exactly once", () => {
    appendChatEntries([user("u1", "שאלה"), { id: "load-1", type: "assistant_loading", ts: 1 }]);
    replaceChatEntry("load-1", { id: "a1", type: "assistant", text: "תשובה", ts: 2 });
    const ids = getChatState().history.map((m) => m.id);
    expect(ids).toEqual(["u1", "a1"]);
  });
});
