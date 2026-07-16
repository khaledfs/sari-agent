"use client";

import type { AssistantChatTurn, AssistantCommandResponse } from "@/types/assistant";

/**
 * Application-level chat store — the architectural fix for the assistant's
 * "self-closing" history.
 *
 * ROOT CAUSE of the old bug: the open/closed flag and the thread lived in
 * component useState. Any event that unmounted the dashboard subtree (layout
 * remounts, suspense fallbacks) or wiped module memory (dev Fast Refresh FULL
 * reloads triggered by mixed-export files) re-initialized that state to
 * "closed, empty". Patching individual triggers kept regressing.
 *
 * THE FIX: state ownership moves OUTSIDE the React tree entirely — a module
 * singleton exposed through the useSyncExternalStore contract, mirrored to
 * sessionStorage. Components merely subscribe; they can mount/unmount/remount
 * freely and always render the same state. Full page reloads restore from
 * sessionStorage (per-tab, dies with the tab — the thread stays client-side
 * only, per the original design decision).
 */

export type ChatEntry =
  | { id: string; type: "user"; text: string; ts?: number }
  | { id: string; type: "assistant_loading"; ts?: number }
  | { id: string; type: "assistant"; text: string; ts?: number }
  | { id: string; type: "assistant_cards"; data: AssistantCommandResponse; ts?: number }
  | { id: string; type: "assistant_clarification"; data: AssistantCommandResponse; ts?: number }
  | { id: string; type: "error"; text: string; ts?: number };

export type ChatState = {
  isOpen: boolean;
  history: ChatEntry[];
  assistantData: AssistantCommandResponse | null;
  activeClarificationEntryId: string | null;
  pendingSourceMessage: string;
  seq: number;
};

const STORAGE_KEY = "sari-assistant-session";

const DEFAULT_STATE: ChatState = {
  isOpen: false,
  history: [],
  assistantData: null,
  activeClarificationEntryId: null,
  pendingSourceMessage: "",
  seq: 0,
};

function loadStoredState(): ChatState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ChatState>;
    if (!Array.isArray(parsed.history)) return DEFAULT_STATE;
    return {
      isOpen: parsed.isOpen === true,
      history: parsed.history,
      assistantData: parsed.assistantData ?? null,
      activeClarificationEntryId: parsed.activeClarificationEntryId ?? null,
      pendingSourceMessage: parsed.pendingSourceMessage ?? "",
      seq: typeof parsed.seq === "number" ? parsed.seq : parsed.history.length + 1,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

let state: ChatState | null = null; // lazily loaded on first client access
const listeners = new Set<() => void>();

function persist(current: ChatState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // storage full/unavailable — the session just won't survive a reload
  }
}

export function getChatState(): ChatState {
  if (state === null) state = loadStoredState();
  return state;
}

/** Stable server snapshot (SSR + hydration render): always the closed default. */
export function getServerChatState(): ChatState {
  return DEFAULT_STATE;
}

export function setChatState(partial: Partial<ChatState>): void {
  state = { ...getChatState(), ...partial };
  persist(state);
  for (const listener of listeners) listener();
}

export function subscribeChat(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function nextEntryId(): string {
  const seq = getChatState().seq + 1;
  setChatState({ seq });
  return `ai-${seq}-${Date.now()}`;
}

export function resetConversation(): void {
  setChatState({
    history: [],
    assistantData: null,
    activeClarificationEntryId: null,
    pendingSourceMessage: "",
    // isOpen and seq intentionally kept
  });
}

/** Last 10 visible turns flattened for the server LLM calls. */
export function conversationTurns(history: ChatEntry[]): AssistantChatTurn[] {
  const turns: AssistantChatTurn[] = [];
  for (const m of history) {
    if (m.type === "user" && m.text.trim()) {
      turns.push({ role: "user", content: m.text.slice(0, 4000) });
    } else if (m.type === "assistant" && m.text.trim()) {
      turns.push({ role: "assistant", content: m.text.slice(0, 4000) });
    } else if (
      (m.type === "assistant_cards" || m.type === "assistant_clarification") &&
      m.data.message.trim()
    ) {
      turns.push({ role: "assistant", content: m.data.message.slice(0, 4000) });
    }
  }
  return turns.slice(-10);
}
