"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, usePathname } from "next/navigation";

import {
  appendChatEntries,
  conversationTurns,
  getChatState,
  getServerChatState,
  nextEntryId,
  patchChatEntry,
  replaceChatEntry,
  resetConversation,
  setChatState,
  subscribeChat,
  type ChatEntry,
} from "@/components/assistant/chat-store";
import { createAssistantStreamParser } from "@/components/assistant/assistant-stream";
import {
  AssistantBubble,
  AssistantCardsBlock,
  AssistantClarificationList,
  Composer,
  SuggestionChips,
  TypingIndicator,
  UserBubble,
  formatTime,
} from "@/components/assistant/assistant-ui";
import type { AssistantCommandResponse, AssistantIntent } from "@/types/assistant";

type ApiResponse = { success: true; data: AssistantCommandResponse } | { success: false; message?: string };

function canResolveClarificationIntent(
  intent: AssistantIntent | undefined
): intent is Exclude<AssistantIntent, "compare" | "clarify"> {
  return (
    intent === "add" || intent === "update" || intent === "remove" || intent === "info" || intent === "reorder_habit"
  );
}

function getMetadataParsed(
  data: AssistantCommandResponse | null
): { intent?: AssistantIntent; quantity?: number | null } {
  if (!data?.metadata || typeof data.metadata !== "object") return {};
  const parsed = (data.metadata as { parsed?: { intent?: AssistantIntent; quantity?: number | null } }).parsed;
  return parsed ?? {};
}

function classifyEntry(data: AssistantCommandResponse): ChatEntry {
  const id = nextEntryId();
  const ts = Date.now();
  if (data.actionResult === "failed") return { id, type: "error", text: data.message, ts };
  if (data.actionResult === "clarification_required" && data.clarification?.options?.length) {
    return { id, type: "assistant_clarification", data, ts };
  }
  if (["info", "compare", "added", "updated", "removed", "advice"].includes(data.actionResult)) {
    return { id, type: "assistant_cards", data, ts };
  }
  return { id, type: "assistant", text: data.message, ts };
}

/**
 * SARI Assistant — production chat UI.
 * Mobile ≤768px: full-height bottom sheet. Desktop: fixed side panel (~420px).
 * All conversation state lives in the external chat store (see chat-store.ts)
 * so it survives remounts, route changes, and full reloads by construction.
 * Backend contracts (/api/assistant/*) are unchanged; the API is
 * request/response, so a typing indicator covers the waiting time.
 */
export function AIAssistant() {
  const t = useTranslations("dashboard.assistant");
  const locale = useLocale();
  const params = useParams();
  const pathname = usePathname();
  const isRtl = locale === "he" || locale === "ar";
  const localeParam = typeof params.locale === "string" ? params.locale : "en";
  const cartHref = `/${localeParam}/dashboard/cart`;

  // External store: components subscribe, never own, the conversation state.
  const chat = useSyncExternalStore(subscribeChat, getChatState, getServerChatState);

  // Typed-but-unsent text lives in the external store too (Issue 7): it
  // survives subtree remounts, route changes, and reloads like the thread.
  const message = chat.draft;
  const setMessage = useCallback((next: string) => setChatState({ draft: next }), []);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");

  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  // Streaming turn in flight (Task C): closing the panel / sending a new
  // message aborts it — the server cancels the generation via the signal.
  const abortRef = useRef<AbortController | null>(null);

  const open = useCallback(() => setChatState({ isOpen: true }), []);

  /** Close keeps the thread — a fresh conversation is an explicit user action. */
  const close = useCallback(() => {
    abortRef.current?.abort();
    setChatState({ isOpen: false });
    setResolvingId(null);
    launchRef.current?.focus();
  }, []);

  // Never leave an orphaned generation behind an unmounted panel.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Focus the composer when the panel opens.
  useEffect(() => {
    if (chat.isOpen) inputRef.current?.focus();
  }, [chat.isOpen]);

  // Escape closes (WCAG keyboard support).
  useEffect(() => {
    if (!chat.isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat.isOpen, close]);

  // Lock body scrolling behind the mobile sheet.
  useEffect(() => {
    if (!chat.isOpen) return;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [chat.isOpen]);

  // Header shows who's logged in (fail-soft; decorative).
  useEffect(() => {
    if (!chat.isOpen || customerName) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account");
        if (res.status !== 200) return;
        const json = (await res.json()) as { success?: boolean; data?: { profile?: { businessName?: string } } };
        if (!cancelled && json.success && json.data?.profile?.businessName) {
          setCustomerName(json.data.profile.businessName);
        }
      } catch {
        // stays blank
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chat.isOpen, customerName]);

  // Keep the newest message in view.
  useEffect(() => {
    if (chat.isOpen) threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.history, chat.isOpen, loading]);

  function newConversation() {
    resetConversation();
    setMessage("");
    setResolvingId(null);
    inputRef.current?.focus();
  }

  function appendEntries(...entries: ChatEntry[]) {
    appendChatEntries(entries); // id-deduplicated merge (Issue 7)
  }

  function replaceLoadingWith(loadingId: string, entry: ChatEntry) {
    replaceChatEntry(loadingId, entry);
  }

  function applyResponse(data: AssistantCommandResponse, entry: ChatEntry) {
    setChatState({
      assistantData: data,
      activeClarificationEntryId: entry.type === "assistant_clarification" ? entry.id : null,
      ...(data.actionResult !== "clarification_required" ? { pendingSourceMessage: "" } : {}),
    });
  }

  async function postJson(url: string, body: unknown): Promise<{ res: Response; json: ApiResponse }> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResponse;
    return { res, json };
  }

  async function send(rawText?: string) {
    const input = (rawText ?? message).trim();
    if (!input || loading) return;

    const turns = conversationTurns(getChatState().history);
    const loadingId = nextEntryId();
    const streamEntryId = nextEntryId();

    // Task C: a new message cancels any turn still streaming.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setMessage("");
    setChatState({
      assistantData: null,
      activeClarificationEntryId: null,
      pendingSourceMessage: input,
    });
    // Typing indicator appears the moment the message is sent (before any
    // network round trip) — Task C immediate-feedback requirement.
    appendEntries(
      { id: nextEntryId(), type: "user", text: input, ts: Date.now() },
      { id: loadingId, type: "assistant_loading", ts: Date.now() }
    );

    let streamedText = "";
    try {
      const res = await fetch("/api/assistant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, locale, history: turns, stream: true }),
        signal: controller.signal,
      });

      const isStream = (res.headers.get("content-type") ?? "").includes("text/event-stream");
      if (!res.ok || !isStream || !res.body) {
        // Fallback: legacy JSON contract (non-streaming callers keep working).
        const json = (await res.json().catch(() => ({}))) as ApiResponse;
        if (res.ok && json.success) {
          const entry = classifyEntry(json.data);
          replaceLoadingWith(loadingId, entry);
          applyResponse(json.data, entry);
        } else {
          const errText = (!json.success && json.message) || t("failed");
          replaceLoadingWith(loadingId, { id: nextEntryId(), type: "error", text: errText, ts: Date.now() });
          setChatState({ assistantData: null, activeClarificationEntryId: null });
        }
        return;
      }

      const parser = createAssistantStreamParser();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sawFinal = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const event of parser.feed(decoder.decode(value, { stream: true }))) {
          if (event.type === "delta") {
            if (!streamedText) {
              // First token: swap the typing indicator for a live bubble.
              replaceLoadingWith(loadingId, { id: streamEntryId, type: "assistant", text: event.text, ts: Date.now() });
            } else {
              patchChatEntry(streamEntryId, { text: streamedText + event.text });
            }
            streamedText += event.text;
          } else if (event.type === "status") {
            // Honest tool status — never fabricated progress.
            patchChatEntry(loadingId, { statusText: t("statusChecking") });
          } else if (event.type === "final") {
            sawFinal = true;
            const entry = classifyEntry(event.data);
            replaceLoadingWith(loadingId, entry); // no-op if already swapped
            replaceChatEntry(streamEntryId, entry);
            applyResponse(event.data, entry);
          } else if (event.type === "error") {
            sawFinal = true;
            const errEntry: ChatEntry = { id: nextEntryId(), type: "error", text: t("streamError"), ts: Date.now() };
            replaceLoadingWith(loadingId, errEntry);
            if (streamedText) replaceChatEntry(streamEntryId, errEntry);
            setChatState({ assistantData: null, activeClarificationEntryId: null });
          }
        }
      }

      if (!sawFinal && !controller.signal.aborted) {
        // Stream ended without a terminal event — surface it, never a silent
        // half-sentence.
        const errEntry: ChatEntry = { id: nextEntryId(), type: "error", text: t("streamError"), ts: Date.now() };
        replaceLoadingWith(loadingId, errEntry);
        if (streamedText) replaceChatEntry(streamEntryId, errEntry);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // User-initiated cancel: drop the indicator; any already-streamed
        // text stays in the thread as-is.
        setChatState({ history: getChatState().history.filter((m) => m.id !== loadingId) });
      } else {
        void error;
        replaceLoadingWith(loadingId, { id: nextEntryId(), type: "error", text: t("networkError"), ts: Date.now() });
        setChatState({ assistantData: null, activeClarificationEntryId: null });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function selectClarificationOption(productId: string, productName: string) {
    if (loading || resolvingId) return;
    const data = getChatState().assistantData;
    if (!data || data.actionResult !== "clarification_required" || !data.clarification?.options?.length) return;

    const clarificationId = data.clarification.clarificationId;
    const { intent, quantity } = getMetadataParsed(data);

    setResolvingId(productId);
    setLoading(true);
    try {
      let result: { res: Response; json: ApiResponse };
      if (clarificationId) {
        result = await postJson("/api/assistant/resolve-clarification", { clarificationId, selectedProductId: productId });
      } else if (canResolveClarificationIntent(intent)) {
        result = await postJson("/api/assistant/cart-command", {
          resolveSelection: { productId, intent, quantity: quantity ?? null },
        });
      } else {
        const followUp = t("followUpWithSelection", {
          name: productName,
          original: getChatState().pendingSourceMessage,
        });
        result = await postJson("/api/assistant/cart-command", { message: followUp });
      }

      if (result.res.ok && result.json.success) {
        const entry = classifyEntry(result.json.data);
        appendEntries(entry);
        applyResponse(result.json.data, entry);
        return;
      }
      appendEntries({
        id: nextEntryId(),
        type: "error",
        text: (!result.json.success && result.json.message) || t("failed"),
        ts: Date.now(),
      });
    } catch {
      appendEntries({ id: nextEntryId(), type: "error", text: t("networkError"), ts: Date.now() });
    } finally {
      setResolvingId(null);
      setLoading(false);
    }
  }

  function renderEntry(m: ChatEntry) {
    const time = formatTime(locale, m.ts);
    const stamp = time ? <span className="ds-ai-time">{time}</span> : null;

    if (m.type === "user") {
      return (
        <div key={m.id} className="ds-ai-row ds-ai-row--user">
          <UserBubble>
            <p className="ds-ai-bubble-text">{m.text}</p>
          </UserBubble>
          {stamp}
        </div>
      );
    }
    if (m.type === "assistant_loading") {
      return (
        <div key={m.id} className="ds-ai-row ds-ai-row--assistant ds-ai-row--animate">
          <TypingIndicator t={t} />
          {m.statusText ? (
            <span className="ds-ai-time" role="status">
              {m.statusText}
            </span>
          ) : null}
        </div>
      );
    }
    if (m.type === "assistant") {
      return (
        <div key={m.id} className="ds-ai-row ds-ai-row--assistant ds-ai-row--animate">
          <AssistantBubble>
            <p className="ds-ai-bubble-text">{m.text}</p>
          </AssistantBubble>
          {stamp}
        </div>
      );
    }
    if (m.type === "error") {
      return (
        <div key={m.id} className="ds-ai-row ds-ai-row--assistant ds-ai-row--animate">
          <AssistantBubble variant="error">
            <p className="ds-ai-bubble-text">{m.text}</p>
          </AssistantBubble>
          {stamp}
        </div>
      );
    }
    if (m.type === "assistant_cards") {
      return (
        <div key={m.id} className="ds-ai-row ds-ai-row--assistant ds-ai-row--animate">
          <AssistantCardsBlock data={m.data} locale={locale} t={t} cartHref={cartHref} />
          {stamp}
        </div>
      );
    }
    if (m.type === "assistant_clarification") {
      const interactive = m.id === chat.activeClarificationEntryId;
      return (
        <div key={m.id} className="ds-ai-row ds-ai-row--assistant ds-ai-row--clarify ds-ai-row--animate">
          <AssistantBubble>
            <p className="ds-ai-bubble-text">{m.data.message}</p>
          </AssistantBubble>
          <AssistantClarificationList
            data={m.data}
            interactive={interactive}
            locale={locale}
            t={t}
            resolvingId={resolvingId}
            loading={loading}
            onChoose={selectClarificationOption}
          />
          {stamp}
        </div>
      );
    }
    return null;
  }

  // The customer↔agent messages screen is a conversation with a HUMAN — never
  // float the AI robot button over its composer.
  if (pathname?.endsWith("/dashboard/messages")) {
    return null;
  }

  return (
    <>
      <button ref={launchRef} type="button" className="ds-ai-launch" onClick={open}>
        {t("launch")}
      </button>

      {chat.isOpen ? (
        <div className="ds-ai-overlay ds-ai-overlay--sheet" role="presentation" onClick={close}>
          <div
            className="ds-ai-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            dir={isRtl ? "rtl" : "ltr"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ds-ai-sheet-handle" aria-hidden="true" />

            <header className="ds-ai-sheet-head">
              <span className="ds-ai-avatar" aria-hidden="true">
                ✨
              </span>
              <div className="ds-ai-head-copy">
                <h3 className="ds-ai-title">{t("title")}</h3>
                <p className="ds-ai-subtitle">{customerName || t("subtitle")}</p>
              </div>
              {/* כפתור שיחה חדשה, בינתיים מושבת 
              <button type="button" className="ds-ai-head-btn" onClick={newConversation} aria-label={t("newConversation")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>*/}
              
              <button type="button" className="ds-ai-head-btn" onClick={close} aria-label={t("close")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="ds-ai-thread" role="log" aria-live="polite" aria-relevant="additions text">
              {chat.history.length === 0 ? (
                <>
                  <p className="ds-ai-thread-empty">{t("emptyHint")}</p>
                  <SuggestionChips t={t} onPick={(text) => void send(text)} />
                </>
              ) : null}

              {chat.history.map(renderEntry)}
              <div ref={threadEndRef} />
            </div>

            <Composer
              value={message}
              disabled={loading}
              t={t}
              onChange={setMessage}
              onSend={() => void send()}
              inputRef={inputRef}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
