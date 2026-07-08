"use client";

import { useTranslations } from "next-intl";

/**
 * The five fulfillment stages shown in the stepper, in order.
 * Keep this length in sync with the `inset-inline: 10%` on
 * `.ds-timeline__track` in sari-enhance.css (10% == half of one step).
 */
const STEP_KEYS = ["placed", "confirmed", "packed", "outForDelivery", "delivered"] as const;

type Stage = { index: number; cancelled: boolean };

/**
 * Derives a stepper stage from the order's existing free-form `status`
 * string. We never assume fields the order model doesn't have — the model
 * only stores `status` (created as "pending"), so this maps whatever value
 * is present onto the happy path, and treats an existing order as at least
 * "Placed". Matching is case-insensitive and substring-based so related
 * wording ("processing", "shipped", "out for delivery"…) lands sensibly.
 */
export function deriveOrderStage(status: string): Stage {
  const s = (status ?? "").trim().toLowerCase();

  // Halted states — surfaced as a cancelled timeline, not the happy path.
  if (["cancel", "fail", "reject", "refund", "return", "void"].some((k) => s.includes(k))) {
    return { index: 0, cancelled: true };
  }
  // Out for delivery / shipped / in transit — checked BEFORE the delivered
  // bucket so a value like "out_for_delivery" (which contains "deliver") isn't
  // misread as fully delivered. Note the delivered bucket matches "delivered"
  // (not "deliver") for the same reason.
  if (["out", "delivery", "ship", "dispatch", "transit", "way"].some((k) => s.includes(k))) {
    return { index: 3, cancelled: false };
  }
  // Final stage.
  if (["delivered", "complete", "fulfil", "done"].some((k) => s.includes(k))) {
    return { index: STEP_KEYS.length - 1, cancelled: false };
  }
  // Packed / prepared / ready.
  if (["pack", "prepar", "ready"].some((k) => s.includes(k))) {
    return { index: 2, cancelled: false };
  }
  // Confirmed / processing / accepted / approved.
  if (["confirm", "process", "accept", "approv"].some((k) => s.includes(k))) {
    return { index: 1, cancelled: false };
  }
  // pending / new / created / placed / unknown → the order exists, so it's placed.
  return { index: 0, cancelled: false };
}

type OrderTimelineProps = {
  status: string;
  /** Dots-only variant for order-list cards (labels kept for screen readers). */
  compact?: boolean;
};

export function OrderTimeline({ status, compact = false }: OrderTimelineProps) {
  const t = useTranslations("orders");
  const { index, cancelled } = deriveOrderStage(status);

  // Fill runs from the first dot centre to the current dot centre.
  const lastStep = STEP_KEYS.length - 1;
  const fillPct = lastStep > 0 ? Math.min(100, Math.max(0, (index / lastStep) * 100)) : 0;

  const className = [
    "ds-timeline",
    compact ? "ds-timeline--compact" : "",
    cancelled ? "ds-timeline--cancelled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div className="ds-timeline__track" aria-hidden="true">
        <span className="ds-timeline__fill" style={{ inlineSize: `${fillPct}%` }} />
      </div>
      <ol className="ds-timeline__steps" aria-label={t("timeline.aria")}>
        {STEP_KEYS.map((key, i) => {
          const state = cancelled
            ? i === index
              ? "active"
              : i < index
                ? "done"
                : "todo"
            : i < index
              ? "done"
              : i === index
                ? "active"
                : "todo";
          return (
            <li
              key={key}
              className={`ds-timeline__step ds-timeline__step--${state}`}
              aria-current={i === index ? "step" : undefined}
            >
              <span className="ds-timeline__dot" aria-hidden="true" />
              <span className="ds-timeline__label">{t(`timeline.${key}`)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
