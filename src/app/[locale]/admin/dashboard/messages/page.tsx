"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";
import { ChatConversation, useChatViewportHeight, type ChatMessage } from "@/components/messaging/chat-conversation";

type ThreadRow = {
  threadId: string;
  customerId: string;
  agentId: string;
  agentName: string;
  customerName: string;
  lastMessageAt: string;
  unreadCount: number;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string };

/**
 * Console inbox (Task D): agents see their customers' threads, admin sees all
 * (the difference is only what the scope resolver returns — ONE component).
 * Master/detail: desktop = thread list + conversation side by side; mobile =
 * one pane at a time. Conversation uses the SHARED <ChatConversation> so it is
 * identical to the customer chat. HUMAN messaging — separate from the AI
 * assistant. LAYOUT ONLY — services/endpoints/scope untouched.
 */
export default function ConsoleMessagesPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<{ thread: ThreadRow; messages: ChatMessage[] } | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const fillRef = useRef<HTMLDivElement>(null);
  useChatViewportHeight(fillRef, !loading && threads.length > 0);

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
        const json = (await res.json()) as ApiEnvelope<{ thread: ThreadRow; messages: ChatMessage[] }>;
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
    setConversation(null);
    void loadConversation(threadId);
  }

  function closeThread() {
    setActiveId(null);
    setConversation(null);
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
      const json = (await res.json()) as ApiEnvelope<ChatMessage>;
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

  const activeThread = threads.find((th) => th.threadId === activeId) ?? conversation?.thread ?? null;

  const conversationHeader = (
    <div className="ds-chat__head">
      <button type="button" className="ds-chat__back" onClick={closeThread} aria-label={t("messages.back")}>
        ←
      </button>
      <div className="ds-chat__head-main">
        <h2 className="ds-chat__head-title">{activeThread?.customerName || t("messages.title")}</h2>
        {activeThread?.agentName ? (
          <p className="ds-chat__head-sub">{t("messages.threadAgent", { name: activeThread.agentName })}</p>
        ) : null}
      </div>
    </div>
  );

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
        <div className="ds-console-msgs" ref={fillRef} data-view={activeId ? "conversation" : "list"}>
          <ul className="ds-console-msgs__threads" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {threads.map((thread) => (
              <li key={thread.threadId}>
                <button
                  type="button"
                  className={`ds-console-thread${activeId === thread.threadId ? " ds-console-thread--active" : ""}`}
                  onClick={() => openThread(thread.threadId)}
                >
                  <span className="ds-console-thread__main">
                    <span className="ds-console-thread__name">{thread.customerName}</span>
                    <span className="ds-console-thread__sub">
                      {thread.agentName ? t("messages.threadAgent", { name: thread.agentName }) : ""}
                    </span>
                  </span>
                  {thread.unreadCount > 0 ? (
                    <span className="ds-console-thread__unread" aria-label={t("messages.unread", { count: thread.unreadCount })}>
                      {thread.unreadCount}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          <section className="ds-console-msgs__pane">
            {!activeId ? (
              <p className="ds-console-msgs__pane-empty">{t("messages.pick")}</p>
            ) : conversationLoading && !conversation ? (
              <p className="ds-console-msgs__pane-empty">{t("messages.loading")}</p>
            ) : conversation ? (
              <ChatConversation
                header={conversationHeader}
                messages={conversation.messages}
                draft={reply}
                onDraftChange={setReply}
                onSend={() => void send()}
                sending={sending}
                formatTime={formatTime}
                labels={{
                  placeholder: t("messages.replyPlaceholder"),
                  send: t("messages.send"),
                  sending: t("messages.sending"),
                  emptyThread: t("messages.emptyThread"),
                  you: t("messages.you"),
                  role: (role) => t(`messages.role.${role}`),
                }}
              />
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
