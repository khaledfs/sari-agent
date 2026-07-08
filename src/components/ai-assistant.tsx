"use client";

import Link from "next/link";
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import type {
  AssistantClarificationOption,
  AssistantCommandResponse,
  AssistantIntent,
  AssistantMatchedProduct,
} from "@/types/assistant";

type ApiSuccess = {
  success: true;
  data: AssistantCommandResponse;
};

type ApiError = {
  success: false;
  message?: string;
};

type ApiResponse = ApiSuccess | ApiError;

/** Local chat entries (no server persistence); cleared when the modal closes. */
type AssistantChatMessage =
  | { id: string; type: "user"; text: string }
  | { id: string; type: "assistant_loading" }
  | { id: string; type: "assistant"; text: string }
  | { id: string; type: "assistant_cards"; data: AssistantCommandResponse }
  | { id: string; type: "assistant_clarification"; data: AssistantCommandResponse }
  | { id: string; type: "error"; text: string };

function canResolveClarificationIntent(intent: AssistantIntent | undefined): intent is Exclude<
  AssistantIntent,
  "compare" | "clarify"
> {
  return (
    intent === "add" ||
    intent === "update" ||
    intent === "remove" ||
    intent === "info" ||
    intent === "reorder_habit"
  );
}

function getMetadataParsed(data: AssistantCommandResponse | null): { intent?: AssistantIntent; quantity?: number | null } {
  if (!data?.metadata || typeof data.metadata !== "object") return {};
  const parsed = (data.metadata as { parsed?: { intent?: AssistantIntent; quantity?: number | null } }).parsed;
  return parsed ?? {};
}

function nextMessageId(seq: React.MutableRefObject<number>) {
  seq.current += 1;
  return `ai-${seq.current}-${Date.now()}`;
}

function classifyAssistantEntryWithId(seq: React.MutableRefObject<number>, data: AssistantCommandResponse): AssistantChatMessage {
  const id = nextMessageId(seq);
  if (data.actionResult === "failed") {
    return { id, type: "error", text: data.message };
  }
  if (data.actionResult === "clarification_required" && data.clarification?.options?.length) {
    return { id, type: "assistant_clarification", data };
  }
  if (
    data.actionResult === "info" ||
    data.actionResult === "compare" ||
    data.actionResult === "added" ||
    data.actionResult === "updated" ||
    data.actionResult === "removed" ||
    data.actionResult === "advice"
  ) {
    return { id, type: "assistant_cards", data };
  }
  return { id, type: "assistant", text: data.message };
}

function imageForClarificationOption(
  data: AssistantCommandResponse,
  productId: string,
  imageUrl?: string
): string | undefined {
  if (imageUrl) return imageUrl;
  return data.matchedProducts?.find((m) => m.productId === productId)?.imageUrl;
}

function formatPrice(locale: string, price: number) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price);
}

function AssistantBubble({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "error" }) {
  return <div className={`ds-ai-bubble ds-ai-bubble--assistant${variant === "error" ? " ds-ai-bubble--error" : ""}`}>{children}</div>;
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return <div className="ds-ai-bubble ds-ai-bubble--user">{children}</div>;
}

function ProductMiniCard({
  p,
  locale,
  t,
  badge,
}: {
  p: AssistantMatchedProduct | AssistantClarificationOption;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  badge?: string;
}) {
  const isFull = "reasons" in p;
  const category = isFull ? p.category : undefined;
  const img = "imageUrl" in p && p.imageUrl ? p.imageUrl : undefined;
  const price = typeof p.price === "number" ? formatPrice(locale, p.price) : "";

  return (
    <div className="ds-ai-pcard">
      {badge ? <span className="ds-ai-pcard-badge">{badge}</span> : null}
      <div className="ds-ai-pcard-inner">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ds-ai-pcard-thumb" src={img} alt="" width={48} height={48} loading="lazy" />
        ) : (
          <div className="ds-ai-pcard-thumb ds-ai-pcard-thumb--empty" aria-hidden />
        )}
        <div className="ds-ai-pcard-body">
          <div className="ds-ai-pcard-name">{p.name}</div>
          <div className="ds-ai-pcard-meta">
            {p.sku ? (
              <span>
                {t("sku")}: {p.sku}
              </span>
            ) : null}
            {p.unit ? <span>{p.unit}</span> : null}
            {p.packageSize ? <span>{p.packageSize}</span> : null}
            {category ? <span>{category}</span> : null}
          </div>
          {price ? (
            <div className="ds-ai-pcard-price">
              {t("price")}: {price}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AssistantClarificationList({
  data,
  interactive,
  locale,
  t,
  resolvingId,
  loading,
  onChoose,
}: {
  data: AssistantCommandResponse;
  interactive: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  resolvingId: string | null;
  loading: boolean;
  onChoose: (productId: string, productName: string) => void;
}) {
  const clarification = data.clarification;
  if (!clarification?.options?.length) return null;

  return (
    <div className="ds-ai-clarify ds-ai-clarify--inthread">
      {clarification.question ? <p className="ds-ai-clarify-q">{clarification.question}</p> : null}
      <ul className="ds-ai-clarify-list" role="list">
        {clarification.options.map((opt, index) => {
          const img = imageForClarificationOption(data, opt.productId, opt.imageUrl);
          const busy = resolvingId === opt.productId;
          const priceFmt = typeof opt.price === "number" ? formatPrice(locale, opt.price) : "";

          return (
            <li key={`${opt.productId}-${index}`} className="ds-ai-clarify-item" role="listitem">
              <div className="ds-ai-opt">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ds-ai-opt-thumb" src={img} alt="" width={44} height={44} loading="lazy" />
                ) : (
                  <div className="ds-ai-opt-thumb ds-ai-opt-thumb--empty" aria-hidden />
                )}
                <div className="ds-ai-opt-body">
                  <div className="ds-ai-opt-name">
                    {opt.name}
                    <span className="ds-ai-inline-badge">{t("tagOption")}</span>
                  </div>
                  <div className="ds-ai-opt-meta">
                    {opt.sku ? (
                      <span className="ds-ai-opt-sku">
                        {t("sku")}: {opt.sku}
                      </span>
                    ) : null}
                    {opt.unit ? <span className="ds-ai-opt-unit">{opt.unit}</span> : null}
                    {opt.packageSize ? <span className="ds-ai-opt-pkg">{opt.packageSize}</span> : null}
                  </div>
                  {priceFmt ? (
                    <div className="ds-ai-opt-price">
                      {t("price")}: {priceFmt}
                    </div>
                  ) : null}
                </div>
                {interactive ? (
                  <button
                    type="button"
                    className="ds-btn ds-btn--secondary ds-ai-opt-btn ds-ai-opt-btn--choose"
                    disabled={loading}
                    onClick={() => onChoose(opt.productId, opt.name)}
                  >
                    {busy ? t("choosing") : t("choose")}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AssistantCardsBlock({
  data,
  locale,
  t,
  cartHref,
}: {
  data: AssistantCommandResponse;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  cartHref: string;
}) {
  const showCartLink =
    data.actionResult === "added" || data.actionResult === "updated" || data.actionResult === "removed";
  const compareLeft = data.actionResult === "compare" ? data.matchedProducts?.[0] : null;
  const compareRight = data.actionResult === "compare" ? data.matchedProducts?.[1] : null;
  const priceDiff =
    compareLeft && compareRight && compareLeft.price !== compareRight.price
      ? `${compareLeft.price < compareRight.price ? compareLeft.name : compareRight.name} ${t("compareCheaper")}`
      : null;
  const categoryDiff =
    compareLeft && compareRight && compareLeft.category && compareRight.category && compareLeft.category !== compareRight.category
      ? `${t("compareCategoryDiff")}: ${compareLeft.category} / ${compareRight.category}`
      : null;

  return (
    <div className="ds-ai-cards-block">
      <AssistantBubble>
        <p className="ds-ai-bubble-text">{data.message}</p>
      </AssistantBubble>

      {data.actionResult === "info" && data.chosenProduct ? (
        <ProductMiniCard p={data.chosenProduct} locale={locale} t={t} badge={t("tagInfo")} />
      ) : null}

      {data.actionResult === "advice" && data.chosenProduct ? (
        <ProductMiniCard p={data.chosenProduct} locale={locale} t={t} badge={t("tagAdvice")} />
      ) : null}

      {data.actionResult === "compare" && data.matchedProducts?.length ? (
        <div className="ds-ai-compare">
          <p className="ds-ai-compare-title">{t("tagCompared")}</p>
          <span className="ds-ai-pcard-badge ds-ai-pcard-badge--inline">{t("tagCompared")}</span>
          <div
            className={
              data.matchedProducts.length >= 2 ? "ds-ai-compare-row" : "ds-ai-compare-row ds-ai-compare-row--single"
            }
          >
            {data.matchedProducts.slice(0, 2).map((p, index) => (
              <ProductMiniCard
                key={`${p.productId}-${index}`}
                p={p}
                locale={locale}
                t={t}
                badge={index === 0 ? t("compareProductA") : t("compareProductB")}
              />
            ))}
          </div>
          {priceDiff || categoryDiff ? (
            <div className="ds-ai-compare-diff">
              {priceDiff ? <div>{priceDiff}</div> : null}
              {categoryDiff ? <div>{categoryDiff}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {(data.actionResult === "added" || data.actionResult === "updated" || data.actionResult === "removed") &&
      data.chosenProduct ? (
        <ProductMiniCard p={data.chosenProduct} locale={locale} t={t} badge={t("tagSelected")} />
      ) : null}

      {showCartLink ? (
        <Link href={cartHref} className="ds-ai-cart-link">
          {t("viewCart")}
        </Link>
      ) : null}
    </div>
  );
}

export function AIAssistant() {
  const t = useTranslations("dashboard.assistant");
  const locale = useLocale();
  const params = useParams();
  const isRtl = locale === "he" || locale === "ar";
  const localeParam = typeof params.locale === "string" ? params.locale : "en";
  const cartHref = `/${localeParam}/dashboard/cart`;

  const idSeq = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<AssistantChatMessage[]>([]);
  const [assistantData, setAssistantData] = useState<AssistantCommandResponse | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [activeClarificationEntryId, setActiveClarificationEntryId] = useState<string | null>(null);

  const pendingSourceMessageRef = useRef("");
  const threadEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [history, isOpen, loading, resolvingId, scrollToBottom]);

  function resetClarificationState() {
    setAssistantData(null);
    setActiveClarificationEntryId(null);
    pendingSourceMessageRef.current = "";
  }

  function closeModal() {
    setIsOpen(false);
    setHistory([]);
    setMessage("");
    resetClarificationState();
    setLoading(false);
    setResolvingId(null);
  }

  async function postAssistant(body: { message?: string; resolveSelection?: { productId: string; intent: AssistantIntent; quantity?: number | null } }) {
    const res = await fetch("/api/assistant/cart-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResponse;
    return { res, json };
  }

  /** New messages go through the intent router (cart vs advice); clarification
   *  continuations keep using postAssistant/cart-command directly above. */
  async function postAssistantMessage(text: string) {
    const res = await fetch("/api/assistant/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, locale }),
    });
    const json = (await res.json()) as ApiResponse;
    return { res, json };
  }

  async function postResolveClarification(clarificationId: string, selectedProductId: string) {
    const res = await fetch("/api/assistant/resolve-clarification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clarificationId, selectedProductId }),
    });
    const json = (await res.json()) as ApiResponse;
    return { res, json };
  }

  async function send() {
    const input = message.trim();
    if (!input || loading) return;

    const userEntry: AssistantChatMessage = { id: nextMessageId(idSeq), type: "user", text: input };
    const loadingId = nextMessageId(idSeq);

    setLoading(true);
    resetClarificationState();
    pendingSourceMessageRef.current = input;
    setMessage("");
    setHistory((h) => [...h, userEntry, { id: loadingId, type: "assistant_loading" }]);

    try {
      const { res, json } = await postAssistantMessage(input);

      if (res.ok && json.success) {
        const data = json.data;
        const entry = classifyAssistantEntryWithId(idSeq, data);
        setHistory((h) => [...h.filter((m) => m.id !== loadingId), entry]);
        setAssistantData(data);
        setActiveClarificationEntryId(entry.type === "assistant_clarification" ? entry.id : null);
        if (data.actionResult !== "clarification_required") {
          pendingSourceMessageRef.current = "";
        }
      } else {
        const errText = (!res.ok && !json.success && json.message) || t("failed");
        setHistory((h) => [...h.filter((m) => m.id !== loadingId), { id: nextMessageId(idSeq), type: "error", text: errText }]);
        setAssistantData(null);
        setActiveClarificationEntryId(null);
      }
    } catch {
      setHistory((h) => [
        ...h.filter((m) => m.id !== loadingId),
        { id: nextMessageId(idSeq), type: "error", text: t("networkError") },
      ]);
      setAssistantData(null);
      setActiveClarificationEntryId(null);
    } finally {
      setLoading(false);
    }
  }

  async function selectClarificationOption(productId: string, productName: string) {
    if (loading || resolvingId) return;

    const data = assistantData;
    if (!data || data.actionResult !== "clarification_required" || !data.clarification?.options?.length) return;

    const clarificationId = data.clarification.clarificationId;
    const { intent, quantity } = getMetadataParsed(data);

    setResolvingId(productId);
    setLoading(true);

    try {
      if (clarificationId) {
        const { res, json } = await postResolveClarification(clarificationId, productId);

        if (res.ok && json.success) {
          const next = json.data;
          const entry = classifyAssistantEntryWithId(idSeq, next);
          setHistory((h) => [...h, entry]);
          setAssistantData(next);
          setActiveClarificationEntryId(entry.type === "assistant_clarification" ? entry.id : null);
          if (next.actionResult !== "clarification_required") {
            pendingSourceMessageRef.current = "";
          }
          return;
        }

        setHistory((h) => [...h, { id: nextMessageId(idSeq), type: "error", text: (!res.ok && !json.success && json.message) || t("failed") }]);
        return;
      }

      if (canResolveClarificationIntent(intent)) {
        const { res, json } = await postAssistant({
          resolveSelection: {
            productId,
            intent,
            quantity: quantity ?? null,
          },
        });

        if (res.ok && json.success) {
          const next = json.data;
          const entry = classifyAssistantEntryWithId(idSeq, next);
          setHistory((h) => [...h, entry]);
          setAssistantData(next);
          setActiveClarificationEntryId(entry.type === "assistant_clarification" ? entry.id : null);
          if (next.actionResult !== "clarification_required") {
            pendingSourceMessageRef.current = "";
          }
          return;
        }

        setHistory((h) => [...h, { id: nextMessageId(idSeq), type: "error", text: (!res.ok && !json.success && json.message) || t("failed") }]);
        return;
      }

      const followUp = t("followUpWithSelection", { name: productName, original: pendingSourceMessageRef.current });
      const { res, json } = await postAssistant({ message: followUp });

      if (res.ok && json.success) {
        const next = json.data;
        const entry = classifyAssistantEntryWithId(idSeq, next);
        setHistory((h) => [...h, entry]);
        setAssistantData(next);
        setActiveClarificationEntryId(entry.type === "assistant_clarification" ? entry.id : null);
        if (next.actionResult !== "clarification_required") {
          pendingSourceMessageRef.current = "";
        }
        return;
      }

      setHistory((h) => [...h, { id: nextMessageId(idSeq), type: "error", text: (!res.ok && !json.success && json.message) || t("failed") }]);
    } catch {
      setHistory((h) => [...h, { id: nextMessageId(idSeq), type: "error", text: t("networkError") }]);
    } finally {
      setResolvingId(null);
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function applyChip(text: string) {
    setMessage(text);
  }

  return (
    <>
      <button type="button" className="ds-ai-launch" onClick={() => setIsOpen(true)}>
        {t("launch")}
      </button>

      {isOpen ? (
        <div className="ds-ai-overlay" role="presentation" onClick={closeModal}>
          <div
            className="ds-ai-card ds-ai-card--chat ds-ai-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            dir={isRtl ? "rtl" : "ltr"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ds-ai-head">
              <div className="ds-ai-head-copy">
                <h3 className="ds-ai-title">{t("title")}</h3>
                <p className="ds-ai-subtitle">{t("subtitle")}</p>
              </div>
              <button type="button" className="ds-ai-close" onClick={closeModal} aria-label={t("close")}>
                ×
              </button>
            </div>

            <div className="ds-ai-thread" role="log" aria-live="polite" aria-relevant="additions text">
              {history.length === 0 ? <p className="ds-ai-thread-empty">{t("emptyHint")}</p> : null}

              {history.length === 0 ? (
                <div className="ds-ai-chips" aria-label="Quick prompts">
                  <button type="button" className="ds-ai-chip" onClick={() => applyChip(t("chipAdd"))}>
                    <span aria-hidden>+</span> {t("chipAdd")}
                  </button>
                  <button type="button" className="ds-ai-chip" onClick={() => applyChip(t("chipCompare"))}>
                    <span aria-hidden>⇄</span> {t("chipCompare")}
                  </button>
                  <button type="button" className="ds-ai-chip" onClick={() => applyChip(t("chipInfo"))}>
                    <span aria-hidden>i</span> {t("chipInfo")}
                  </button>
                  <button type="button" className="ds-ai-chip" onClick={() => applyChip(t("chipReorder"))}>
                    <span aria-hidden>↻</span> {t("chipReorder")}
                  </button>
                  <button type="button" className="ds-ai-chip" onClick={() => applyChip(t("chipAdvice"))}>
                    <span aria-hidden>💡</span> {t("chipAdvice")}
                  </button>
                </div>
              ) : null}

              {history.map((m) => {
                if (m.type === "user") {
                  return (
                    <div key={m.id} className="ds-ai-row ds-ai-row--user">
                      <UserBubble>
                        <p className="ds-ai-bubble-text">{m.text}</p>
                      </UserBubble>
                    </div>
                  );
                }
                if (m.type === "assistant_loading") {
                  return (
                    <div key={m.id} className="ds-ai-row ds-ai-row--assistant ds-ai-row--animate">
                      <AssistantBubble>
                        <p className="ds-ai-bubble-text ds-ai-bubble-text--muted">
                          {t("thinking")}
                          <span className="ds-ai-loading-dots" aria-hidden>
                            <span />
                            <span />
                            <span />
                          </span>
                        </p>
                      </AssistantBubble>
                    </div>
                  );
                }
                if (m.type === "assistant") {
                  return (
                    <div key={m.id} className="ds-ai-row ds-ai-row--assistant ds-ai-row--animate">
                      <AssistantBubble>
                        <p className="ds-ai-bubble-text">{m.text}</p>
                      </AssistantBubble>
                    </div>
                  );
                }
                if (m.type === "error") {
                  return (
                    <div key={m.id} className="ds-ai-row ds-ai-row--assistant ds-ai-row--animate">
                      <AssistantBubble variant="error">
                        <p className="ds-ai-bubble-text">{m.text}</p>
                      </AssistantBubble>
                    </div>
                  );
                }
                if (m.type === "assistant_cards") {
                  return (
                    <div key={m.id} className="ds-ai-row ds-ai-row--assistant ds-ai-row--animate">
                      <AssistantCardsBlock data={m.data} locale={locale} t={t} cartHref={cartHref} />
                    </div>
                  );
                }
                if (m.type === "assistant_clarification") {
                  const interactive = m.id === activeClarificationEntryId;
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
                    </div>
                  );
                }
                return null;
              })}
              <div ref={threadEndRef} />
            </div>

            <div className="ds-ai-foot">
              <div className="ds-ai-input-wrap">
                <input
                  type="text"
                  dir="auto"
                  className="ds-ai-input ds-ai-input--pill"
                  placeholder={t("placeholder")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={onKeyDown}
                />
                <button
                  type="button"
                  className="ds-ai-send-btn"
                  onClick={() => void send()}
                  disabled={loading || !message.trim()}
                  aria-label={t("send")}
                >
                  {loading && !resolvingId ? "…" : "➤"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
