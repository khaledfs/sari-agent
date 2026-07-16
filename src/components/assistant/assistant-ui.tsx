"use client";

import Link from "next/link";
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type { useTranslations } from "next-intl";

import { emitCartAdd } from "@/components/living-bakery/micro";
import type {
  AssistantClarificationOption,
  AssistantCommandResponse,
  AssistantMatchedProduct,
} from "@/types/assistant";

type T = ReturnType<typeof useTranslations>;

export function formatPrice(locale: string, price: number) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price);
}

export function formatTime(locale: string, ts?: number) {
  if (!ts) return "";
  try {
    return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(ts));
  } catch {
    return "";
  }
}

export function AssistantBubble({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "error";
}) {
  return (
    <div className={`ds-ai-bubble ds-ai-bubble--assistant${variant === "error" ? " ds-ai-bubble--error" : ""}`}>
      {children}
    </div>
  );
}

export function UserBubble({ children }: { children: React.ReactNode }) {
  return <div className="ds-ai-bubble ds-ai-bubble--user">{children}</div>;
}

export function TypingIndicator({ t }: { t: T }) {
  return (
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
  );
}

/**
 * Inline add-to-cart on chat product cards. Same API as the product pages
 * (POST /api/cart) — no duplicated cart logic. Gold ✓ success state for 2s.
 */
function AddToCartButton({ productId, t }: { productId: string; t: T }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function add() {
    if (busy || done) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const json = (await res.json()) as { success?: boolean; message?: string };
      if (res.status === 200 && json.success) {
        emitCartAdd();
        setDone(true);
        timer.current = setTimeout(() => setDone(false), 2000);
        return;
      }
      setError(json.message ?? t("failed"));
    } catch {
      setError(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`ds-ai-pcard-add${done ? " ds-ai-pcard-add--done" : ""}`}
        onClick={() => void add()}
        disabled={busy}
        aria-label={t("addToCart")}
      >
        {done ? "✓" : busy ? t("choosing") : t("addToCart")}
      </button>
      {error ? (
        <span className="ds-ai-pcard-error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

export function ProductMiniCard({
  p,
  locale,
  t,
  badge,
  withAddToCart = true,
}: {
  p: AssistantMatchedProduct | AssistantClarificationOption;
  locale: string;
  t: T;
  badge?: string;
  withAddToCart?: boolean;
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
          {withAddToCart && p.productId ? <AddToCartButton productId={p.productId} t={t} /> : null}
        </div>
      </div>
    </div>
  );
}

function imageForClarificationOption(
  data: AssistantCommandResponse,
  productId: string,
  imageUrl?: string
): string | undefined {
  if (imageUrl) return imageUrl;
  return data.matchedProducts?.find((m) => m.productId === productId)?.imageUrl;
}

export function AssistantClarificationList({
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
  t: T;
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

export function AssistantCardsBlock({
  data,
  locale,
  t,
  cartHref,
}: {
  data: AssistantCommandResponse;
  locale: string;
  t: T;
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
    compareLeft &&
    compareRight &&
    compareLeft.category &&
    compareRight.category &&
    compareLeft.category !== compareRight.category
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
        <ProductMiniCard
          p={data.chosenProduct}
          locale={locale}
          t={t}
          badge={t("tagSelected")}
          withAddToCart={false}
        />
      ) : null}

      {showCartLink ? (
        <Link href={cartHref} className="ds-ai-cart-link">
          {t("viewCart")}
        </Link>
      ) : null}
    </div>
  );
}

/** Horizontally scrollable quick suggestions — shown before the first message only. */
export function SuggestionChips({ t, onPick }: { t: T; onPick: (text: string) => void }) {
  const chips: Array<{ key: string; icon: string }> = [
    { key: "chipAdd", icon: "+" },
    { key: "chipCompare", icon: "⇄" },
    { key: "chipInfo", icon: "i" },
    { key: "chipReorder", icon: "↻" },
    { key: "chipAdvice", icon: "💡" },
  ];
  return (
    <div className="ds-ai-chips ds-ai-chips--scroll" aria-label={t("emptyHint")}>
      {chips.map(({ key, icon }) => (
        <button key={key} type="button" className="ds-ai-chip" onClick={() => onPick(t(key))}>
          <span aria-hidden>{icon}</span> {t(key)}
        </button>
      ))}
    </div>
  );
}

/**
 * Modern composer: auto-growing textarea (max 4 lines), Enter sends,
 * Shift+Enter inserts a newline, sticky at the bottom of the sheet/panel.
 */
export function Composer({
  value,
  disabled,
  t,
  onChange,
  onSend,
  inputRef,
}: {
  value: string;
  disabled: boolean;
  t: T;
  onChange: (next: string) => void;
  onSend: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const resize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 22;
    const max = lineHeight * 4 + 20; // 4 lines + padding
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [inputRef]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="ds-ai-foot ds-ai-composer">
      <div className="ds-ai-input-wrap">
        <textarea
          ref={inputRef}
          rows={1}
          dir="auto"
          className="ds-ai-input ds-ai-input--pill ds-ai-textarea"
          placeholder={t("placeholder")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={t("placeholder")}
        />
        <button
          type="button"
          className="ds-ai-send-btn"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label={t("send")}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
