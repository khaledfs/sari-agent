"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

export type ChatMessage = {
  id: string;
  /** Sent by the logged-in viewer (gold bubble). */
  mine: boolean;
  senderRole: "customer" | "agent" | "admin";
  body: string;
  createdAt: string;
};

export type ChatLabels = {
  placeholder: string;
  send: string;
  sending: string;
  emptyThread: string;
  you: string;
  role: (role: "customer" | "agent" | "admin") => string;
};

/**
 * Sizes a chat container to the VISUAL viewport (keyboard-aware): on the iOS
 * keyboard opening, visualViewport.height shrinks; we shrink the container so
 * the composer stays visible above the keyboard. Set on the parent that wraps
 * <ChatConversation> so both the single-pane (customer / mobile) and the
 * two-pane (desktop console) layouts share ONE height strategy.
 */
export function useChatViewportHeight(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const vv = window.visualViewport;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      const viewportH = vv?.height ?? window.innerHeight;
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const bottomChrome = isMobile ? 64 : 8; // fixed tab bar on mobile; small gap on desktop
      el.style.height = `${Math.max(320, Math.round(viewportH - top - bottomChrome))}px`;
    };
    update();
    window.addEventListener("resize", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [ref, active]);
}

/**
 * THE one chat conversation UI (customer↔agent AND console↔customer): header →
 * scrollable message list → composer pinned at the bottom of its container.
 * WhatsApp-style — auto-grow textarea, Enter sends on desktop / newline on
 * mobile, own bubble gold + other party neutral, sender+time quiet. Layout only;
 * the parent owns data + which endpoint to call.
 */
export function ChatConversation({
  header,
  messages,
  draft,
  onDraftChange,
  onSend,
  sending,
  labels,
  formatTime,
  error,
}: {
  header: ReactNode;
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  labels: ChatLabels;
  formatTime: (iso: string) => string;
  error?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight; // no focus change — never steals focus
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Re-pin to newest when the keyboard opens/closes (visual viewport resizes).
  useEffect(() => {
    const vv = window.visualViewport;
    const onResize = () => scrollToBottom();
    vv?.addEventListener("resize", onResize);
    return () => vv?.removeEventListener("resize", onResize);
  }, [scrollToBottom]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`; // CSS max-block-size caps at ~5 lines
  }, []);

  useEffect(() => {
    autoGrow();
  }, [draft, autoGrow]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    // Mobile: Enter is a newline, the button sends. Desktop: Enter sends,
    // Shift+Enter is a newline.
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile || e.shiftKey) return;
    e.preventDefault();
    onSend();
  }

  return (
    <div className="ds-chat">
      {header}

      <div className="ds-chat__list" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="ds-chat__empty">
            <span aria-hidden="true">💬</span>
            <p className="ds-m-0">{labels.emptyThread}</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`ds-chat__bubble ${message.mine ? "ds-chat__bubble--mine" : "ds-chat__bubble--theirs"}`}
            >
              <div className="ds-chat__body">{message.body}</div>
              <span className="ds-chat__meta">
                {message.mine ? labels.you : labels.role(message.senderRole)} · {formatTime(message.createdAt)}
              </span>
            </div>
          ))
        )}
      </div>

      {error ? (
        <p className="ds-error ds-chat__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ds-chat__composer">
        <textarea
          ref={textareaRef}
          className="ds-chat__textarea"
          rows={1}
          value={draft}
          maxLength={2000}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="ds-chat__send"
          disabled={sending || !draft.trim()}
          onClick={onSend}
          aria-label={labels.send}
        >
          {sending ? labels.sending : labels.send}
        </button>
      </div>
    </div>
  );
}
