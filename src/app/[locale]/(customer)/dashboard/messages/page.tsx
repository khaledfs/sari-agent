"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";
import { Button } from "@/components/ui/Button";

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
 * Customer ↔ field-agent messaging (Task D). This talks to a HUMAN — the
 * page says so explicitly, so it is never confused with the AI assistant.
 * Restricted (read-only) customers can message: it's how a hold is resolved.
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
  const endRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  return (
    <main className="ds-page">
      <div className="ds-header-row">
        <div>
          <h1 className="ds-page-title">{t("title")}</h1>
          <p className="ds-page-subtitle">
            {thread?.agentName ? t("subtitleWithAgent", { name: thread.agentName }) : t("subtitle")}
          </p>
        </div>
        <Link href={`/${locale}/dashboard`} className="ds-link">
          ← {tNav("home")}
        </Link>
      </div>

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
      {error ? (
        <div>
          <p className="ds-error">{error}</p>
          <Button variant="secondary" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {!loading && !hasAgent ? (
        <div className="ds-empty-state">
          <span className="ds-empty-state__icon" aria-hidden="true">
            💬
          </span>
          <p className="ds-empty-state__text">{t("noAgent")}</p>
        </div>
      ) : null}

      {!loading && hasAgent ? (
        <div className="ds-card ds-stack" style={{ gap: "0.6rem" }}>
          <div style={{ display: "grid", gap: "0.45rem", maxBlockSize: "55vh", overflowY: "auto" }} role="log" aria-live="polite">
            {messages.length === 0 ? (
              <p className="ds-text-muted">{t("emptyThread")}</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    justifySelf: message.mine ? "end" : "start",
                    maxInlineSize: "85%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "12px",
                    background: message.mine ? "var(--brand-bg)" : "var(--surface-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="ds-text-caption">
                    {message.mine ? t("you") : t(`role.${message.senderRole}`)} · {formatTime(message.createdAt)}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              className="ds-qty-input"
              style={{ flex: 1, minBlockSize: "44px", textAlign: "start", fontSize: "16px" }}
              value={draft}
              maxLength={2000}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
            />
            <Button variant="primary" disabled={sending || !draft.trim()} onClick={() => void send()}>
              {sending ? t("sending") : t("send")}
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
