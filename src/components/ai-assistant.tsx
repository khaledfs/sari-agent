"use client";

import { KeyboardEvent, useState } from "react";

type AssistantResponse = {
  success?: boolean;
  data?: { message?: string };
  message?: string;
};

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");

  async function send() {
    const input = message.trim();
    if (!input || loading) return;

    setLoading(true);
    setResponse("");
    try {
      const res = await fetch("/api/assistant/cart-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const json = (await res.json()) as AssistantResponse;

      if (res.ok && json.success) {
        setResponse(json.data?.message ?? "Done.");
        setMessage("");
        return;
      }

      setResponse(json.message ?? "Failed to process command.");
    } catch {
      setResponse("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void send();
    }
  }

  return (
    <>
      <button type="button" className="ds-ai-launch" onClick={() => setIsOpen(true)}>
        AI Assistant
      </button>

      {isOpen ? (
        <div className="ds-ai-overlay" role="presentation" onClick={() => setIsOpen(false)}>
          <div
            className="ds-ai-card"
            role="dialog"
            aria-modal="true"
            aria-label="AI Assistant"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ds-ai-head">
              <h3 className="ds-ai-title">AI Assistant</h3>
              <button type="button" className="ds-ai-close" onClick={() => setIsOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <input
              type="text"
              dir="auto"
              className="ds-ai-input"
              placeholder="Type your cart command..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={onKeyDown}
            />

            <button type="button" className="ds-btn ds-btn--primary ds-btn--block" onClick={() => void send()} disabled={loading || !message.trim()}>
              {loading ? "Processing..." : "Send"}
            </button>

            {response ? <p className="ds-ai-response">{response}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

