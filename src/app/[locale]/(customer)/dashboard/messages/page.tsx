"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";

type MessageRow = {
  id: string;
  senderRole: "customer" | "agent" | "admin";
  mine: boolean;
  body: string;
  createdAt: string;
};

type ThreadInfo = {
  threadId: string;
  agentName: string;
} | null;

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; code?: string };

/**
 * Customer ↔ field-agent messaging (Task D), WhatsApp-style: full-height chat
 * with the composer pinned to the bottom. This talks to a HUMAN — the page says
 * so explicitly, so it is never confused with the AI assistant (whose floating
 * button is hidden on this route). Restricted (read-only) customers can message.
 *
 * LAYOUT ONLY — the messaging service/endpoints/scope rules are untouched.
 */
export default function CustomerMessagesPage() {
  const t = useTranslations("agentMessages");
  const tNav = useTranslations("dashboard.nav");
  const locale = useLocale();

  const [thread, setThread] = useState<ThreadInfo>(null);
  const [hasAgent, setHasAgent] = useState(true);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/messages");
      const json = (await res.json()) as ApiEnvelope<{
        thread: { threadId: string; agentName: string } | null;
        messages: MessageRow[];
      }>;
      if (res.status === 200 && json.success && json.data) {
        if (!json.data.thread) {
          setHasAgent(false);
          setThread(null);
          setMessages([]);
          return;
        }
        setHasAgent(true);
        setThread({ threadId: json.data.thread.threadId, agentName: json.data.thread.agentName });
        setMessages(json.data.messages);
        return;
      }
      setError(json.message ?? t("error"));
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live: the agent's reply appears without a refresh.
  useRealtimeRefetch(["message.created"], load);

  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight; // no focus change — never steals focus
  }, []);

  // Scroll to newest on open and whenever messages change.
  useEffect(() => {
    scrollToBottom();
  }, [messages, hasAgent, loading, scrollToBottom]);

  /**
   * Fill the available height (header → scrollable list → composer) and keep it
   * correct when the iOS keyboard opens. visualViewport shrinks on keyboard
   * open; we resize the chat to match and re-pin to the newest message so the
   * composer never hides behind the keyboard. Verified against visualViewport,
   * not assumed. (Real-device iOS confirmation is owner-run — see PROGRESS.)
   */
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const vv = window.visualViewport;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      const viewportH = vv?.height ?? window.innerHeight;
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const bottomChrome = isMobile ? 64 : 8; // fixed tab bar on mobile; small gap on desktop
      el.style.height = `${Math.max(320, Math.round(viewportH - top - bottomChrome))}px`;
      scrollToBottom();
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
  }, [hasAgent, loading, scrollToBottom]);

  /** Auto-grow the textarea: 1 line → ~5 lines, then scroll internally. */
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`; // CSS max-block-size caps it at ~5 lines
  }, []);

  useEffect(() => {
    autoGrow();
  }, [draft, autoGrow]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json()) as ApiEnvelope<MessageRow>;
      if (res.status === 200 && json.success) {
        setDraft("");
        requestAnimationFrame(() => {
          autoGrow();
          scrollToBottom();
        });
        await load();
        return;
      }
      if (json.code === "NO_AGENT_ASSIGNED") {
        setHasAgent(false);
        return;
      }
      setError(json.message ?? t("error"));
    } catch {
      setError(t("error"));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    // Mobile: Enter is a newline; sending is the button. Desktop: Enter sends,
    // Shift+Enter is a newline.
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile || e.shiftKey) return;
    e.preventDefault();
    void send();
  }

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  const headerLine = (
    <div className="ds-chat__head">
      <div>
        <h1 className="ds-page-title ds-m-0">{t("title")}</h1>
        <p className="ds-text-caption ds-m-0">
          {thread?.agentName ? t("subtitleWithAgent", { name: thread.agentName }) : t("subtitle")}
        </p>
      </div>
      <Link href={`/${locale}/dashboard`} className="ds-link">
        ← {tNav("home")}
      </Link>
    </div>
  );

  return (
    <main className="ds-page ds-page--chat">
      {loading ? (
        <ul className="ds-skeleton-list" aria-hidden="true">
          {[0, 1].map((i) => (
            <li key={i} className="ds-skeleton-card">
              <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--wide" />
              <span className="ds-skeleton ds-skeleton-block" />
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && !hasAgent ? (
        <>
          {headerLine}
          <div className="ds-empty-state">
            <span className="ds-empty-state__icon" aria-hidden="true">
              💬
            </span>
            <p className="ds-empty-state__text">{t("noAgent")}</p>
          </div>
        </>
      ) : null}

      {!loading && hasAgent ? (
        <div className="ds-chat" ref={chatRef}>
          {headerLine}

          <div className="ds-chat__list" ref={listRef} role="log" aria-live="polite">
            {messages.length === 0 ? (
              <div className="ds-chat__empty">
                <span aria-hidden="true">💬</span>
                <p className="ds-m-0">{t("emptyThread")}</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`ds-chat__bubble ${message.mine ? "ds-chat__bubble--mine" : "ds-chat__bubble--theirs"}`}
                >
                  <div className="ds-chat__body">{message.body}</div>
                  <span className="ds-chat__meta">
                    {message.mine ? t("you") : t(`role.${message.senderRole}`)} · {formatTime(message.createdAt)}
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
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="button"
              className="ds-chat__send"
              disabled={sending || !draft.trim()}
              onClick={() => void send()}
              aria-label={t("send")}
            >
              {sending ? t("sending") : t("send")}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
