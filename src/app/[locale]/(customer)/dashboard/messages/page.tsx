"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useRealtimeRefetch } from "@/components/realtime/realtime-provider";
import { ChatConversation, useChatViewportHeight, type ChatMessage } from "@/components/messaging/chat-conversation";

type ThreadInfo = {
  threadId: string;
  agentName: string;
} | null;

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; code?: string };

/**
 * Customer ↔ field-agent messaging (Task D): full-height WhatsApp-style chat via
 * the SHARED <ChatConversation> (same component the console inbox uses — no
 * variant drift). Talks to a HUMAN (the AI robot button is hidden on this
 * route). Restricted customers can message. LAYOUT ONLY — services untouched.
 */
export default function CustomerMessagesPage() {
  const t = useTranslations("agentMessages");
  const tNav = useTranslations("dashboard.nav");
  const locale = useLocale();

  const [thread, setThread] = useState<ThreadInfo>(null);
  const [hasAgent, setHasAgent] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const fillRef = useRef<HTMLDivElement>(null);
  useChatViewportHeight(fillRef, !loading && hasAgent);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/messages");
      const json = (await res.json()) as ApiEnvelope<{
        thread: { threadId: string; agentName: string } | null;
        messages: ChatMessage[];
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
      const json = (await res.json()) as ApiEnvelope<ChatMessage>;
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

  const header = (
    <div className="ds-chat__head">
      <div className="ds-chat__head-main">
        <h1 className="ds-chat__head-title">{t("title")}</h1>
        <p className="ds-chat__head-sub">
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
          {header}
          <div className="ds-empty-state">
            <span className="ds-empty-state__icon" aria-hidden="true">
              💬
            </span>
            <p className="ds-empty-state__text">{t("noAgent")}</p>
          </div>
        </>
      ) : null}

      {!loading && hasAgent ? (
        <div className="ds-chat-fill ds-chat-fill--bleed" ref={fillRef}>
          <ChatConversation
            header={header}
            messages={messages}
            draft={draft}
            onDraftChange={setDraft}
            onSend={() => void send()}
            sending={sending}
            error={error}
            formatTime={formatTime}
            labels={{
              placeholder: t("placeholder"),
              send: t("send"),
              sending: t("sending"),
              emptyThread: t("emptyThread"),
              you: t("you"),
              role: (role) => t(`role.${role}`),
            }}
          />
        </div>
      ) : null}
    </main>
  );
}
