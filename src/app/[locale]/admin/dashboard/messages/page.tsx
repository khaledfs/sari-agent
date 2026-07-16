"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";

type ThreadRow = {
  threadId: string;
  customerId: string;
  agentId: string;
  agentName: string;
  customerName: string;
  lastMessageAt: string;
  unreadCount: number;
};

type MessageRow = {
  id: string;
  senderRole: "customer" | "agent" | "admin";
  mine: boolean;
  body: string;
  createdAt: string;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

/**
 * Console inbox (Task D): agents see their customers' threads, admin sees all.
 * This is HUMAN messaging — a separate surface from the AI assistant.
 */
export default function ConsoleMessagesPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<{ thread: ThreadRow; messages: MessageRow[] } | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const loadThreads = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/messages");
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as ApiEnvelope<ThreadRow[]>;
      if (res.status === 200 && json.success && json.data) {
        setThreads(json.data);
        return;
      }
      setError(json.message ?? t("messages.error"));
    } catch {
      setError(t("messages.error"));
    } finally {
      setLoading(false);
    }
  }, [locale, router, t]);

  const loadConversation = useCallback(
    async (threadId: string) => {
      setConversationLoading(true);
      try {
        const res = await fetch(`/api/admin/messages/${threadId}`);
        const json = (await res.json()) as ApiEnvelope<{ thread: ThreadRow; messages: MessageRow[] }>;
        if (res.status === 200 && json.success && json.data) {
          setConversation(json.data);
          // Opening marks as read — clear the unread badge locally too.
          setThreads((list) => list.map((th) => (th.threadId === threadId ? { ...th, unreadCount: 0 } : th)));
          return;
        }
        setError(json.message ?? t("messages.error"));
      } catch {
        setError(t("messages.error"));
      } finally {
        setConversationLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // Live: new messages refresh the inbox and the open conversation.
  useRealtimeRefetch(["message.created"], () => {
    void loadThreads();
    if (activeId) void loadConversation(activeId);
  });

  function openThread(threadId: string) {
    setActiveId(threadId);
    void loadConversation(threadId);
  }

  async function send() {
    const text = reply.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/messages/${activeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json()) as ApiEnvelope<MessageRow>;
      if (res.status === 200 && json.success) {
        setReply("");
        await loadConversation(activeId);
        await loadThreads();
        return;
      }
      setError(json.message ?? t("messages.error"));
    } catch {
      setError(t("messages.error"));
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
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("messages.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>{t("messages.subtitle")}</p>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("messages.loading")}</p>
      ) : threads.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("messages.empty")}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 2fr", gap: "1rem", alignItems: "start" }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
            {threads.map((thread) => (
              <li key={thread.threadId}>
                <button
                  type="button"
                  className="admin-btn"
                  style={{
                    inlineSize: "100%",
                    justifyContent: "space-between",
                    ...(activeId === thread.threadId ? { borderColor: "var(--brand)" } : {}),
                  }}
                  onClick={() => openThread(thread.threadId)}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {thread.customerName}
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}> · {thread.agentName}</span>
                  </span>
                  {thread.unreadCount > 0 ? (
                    <span
                      style={{
                        background: "var(--brand)",
                        color: "var(--text-on-brand)",
                        borderRadius: "999px",
                        padding: "0 0.45rem",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                      }}
                    >
                      {thread.unreadCount}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          <div className="admin-panel" style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minBlockSize: "300px" }}>
            {!activeId ? (
              <p style={{ color: "var(--text-muted)", margin: "auto" }}>{t("messages.pick")}</p>
            ) : conversationLoading && !conversation ? (
              <p style={{ color: "var(--text-muted)", margin: "auto" }}>{t("messages.loading")}</p>
            ) : conversation ? (
              <>
                <div style={{ display: "grid", gap: "0.45rem", maxBlockSize: "50vh", overflowY: "auto" }}>
                  {conversation.messages.length === 0 ? (
                    <p style={{ color: "var(--text-muted)" }}>{t("messages.emptyThread")}</p>
                  ) : (
                    conversation.messages.map((message) => (
                      <div
                        key={message.id}
                        style={{
                          justifySelf: message.senderRole === "customer" ? "start" : "end",
                          maxInlineSize: "80%",
                          padding: "0.45rem 0.7rem",
                          borderRadius: "12px",
                          background: message.senderRole === "customer" ? "var(--surface-2)" : "var(--brand-bg)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                          {t(`messages.role.${message.senderRole}`)} · {formatTime(message.createdAt)}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</div>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className="admin-input"
                    style={{ flex: 1 }}
                    value={reply}
                    maxLength={2000}
                    placeholder={t("messages.replyPlaceholder")}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void send();
                    }}
                  />
                  <button type="button" className="admin-btn-primary" disabled={sending || !reply.trim()} onClick={() => void send()}>
                    {sending ? t("messages.sending") : t("messages.send")}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
