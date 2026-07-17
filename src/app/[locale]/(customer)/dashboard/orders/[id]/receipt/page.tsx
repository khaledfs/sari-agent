"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { OrderReceipt, type OrderViewData } from "@/components/orders/order-view";

type ReceiptState =
  | { kind: "loading" }
  | { kind: "ok"; order: OrderViewData; customer: { businessName: string; phoneNumber: string } | null }
  | { kind: "locked" }
  | { kind: "notfound" }
  | { kind: "error" };

/**
 * Standalone, print-styled receipt reachable by NORMAL navigation (no popup,
 * no new window) so iOS in-app browsers (Instagram / Facebook / WhatsApp
 * webviews) that cannot call window.print() can still use the iOS Share sheet
 * → Print / Save to Files. Gated identically to the print button: it reads the
 * same `/api/orders/[id]/receipt` endpoint, so 401/403/404 (incl. another
 * customer's order → 404, no existence leak) behave exactly the same.
 */
export default function StandaloneReceiptPage() {
  const t = useTranslations("orders");
  const locale = useLocale();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [state, setState] = useState<ReceiptState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${id}/receipt`);
        const json = (await res.json()) as {
          success?: boolean;
          code?: string;
          data?: { order: OrderViewData; customer: { businessName: string; phoneNumber: string } | null };
        };
        if (cancelled) return;
        if (res.status === 200 && json.success && json.data) {
          setState({ kind: "ok", order: json.data.order, customer: json.data.customer });
        } else if (res.status === 403 && json.code === "RECEIPT_NOT_AVAILABLE") {
          setState({ kind: "locked" });
        } else if (res.status === 404) {
          setState({ kind: "notfound" });
        } else {
          setState({ kind: "error" });
        }
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // SYNCHRONOUS — data is already loaded, so the click keeps the iOS gesture.
  function print() {
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  }

  return (
    <main className="ds-page ds-receipt-standalone">
      <div className="ds-profile-section ds-receipt-standalone__actions">
        <Link href={`/${locale}/dashboard/orders/${id}`} className="ds-link">
          ← {t("backToDetail")}
        </Link>
      </div>

      {state.kind === "loading" ? (
        <div className="ds-skeleton-card" aria-hidden="true">
          <span className="ds-skeleton ds-skeleton-line ds-skeleton-line--title" />
          <span className="ds-skeleton ds-skeleton-block" />
        </div>
      ) : null}

      {state.kind === "locked" ? (
        <p className="ds-text-caption" role="note">
          🔒 {t("receiptLockedTooltip")}
        </p>
      ) : null}
      {state.kind === "notfound" ? (
        <p className="ds-error" role="alert">
          {t("error")}
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="ds-error" role="alert">
          {t("error")}
        </p>
      ) : null}

      {state.kind === "ok" ? (
        <>
          <div className="ds-actions-row ds-receipt-standalone__actions">
            <button type="button" className="ds-btn ds-btn--secondary ds-btn--block" onClick={print}>
              {t("printReceipt")}
            </button>
          </div>
          <p className="ds-text-caption ds-receipt-standalone__actions" role="note">
            {t("receiptShareHint")}
          </p>
          <OrderReceipt order={state.order} customer={state.customer} locale={locale} t={t} standalone />
        </>
      ) : null}
    </main>
  );
}
