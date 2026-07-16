"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

const STATUSES = ["pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"] as const;

type AdminOrderRow = {
  id: string;
  customer: { id: string; businessName: string; phoneNumber: string } | null;
  itemCount: number;
  total: number;
  status: string;
  createdAt: string;
  notes: string;
};

type AdminOrderDetailItem = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isGift: boolean;
  promotionId: string | null;
  priceBreakdown: { base: number; final: number } | null;
  imageUrl: string | null;
  sku: string | null;
  unit: string | null;
  packageSize: string | null;
};

type AdminOrderDetail = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  items: AdminOrderDetailItem[];
  subtotal: number;
  promotionDiscount: { promotionId: string; discountType: string; value: number; amountOff: number } | null;
  appliedPromotionIds: string[];
  total: number;
  customer: {
    id: string;
    businessName: string;
    phoneNumber: string;
    email: string;
    businessType: string | null;
    adminNotes: string;
  } | null;
  statusHistory: Array<{ status: string; changedAt: string; changedByUserId: string; changedByRole: string }>;
};

export default function AdminOrdersPage() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const router = useRouter();

  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Order-details drawer state.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const openDetail = useCallback(
    async (id: string) => {
      setDetailId(id);
      setDetail(null);
      setDetailError("");
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/admin/orders/${id}`, { method: "GET" });
        if (res.status === 401) {
          router.replace(`/${locale}/admin/login`);
          return;
        }
        const json = (await res.json()) as { success?: boolean; data?: AdminOrderDetail; message?: string };
        if (res.status === 200 && json.success && json.data) {
          setDetail(json.data);
          return;
        }
        setDetailError(json.message ?? t("orders.detail.error"));
      } catch {
        setDetailError(t("orders.detail.error"));
      } finally {
        setDetailLoading(false);
      }
    },
    [locale, router, t]
  );

  const closeDetail = useCallback(() => {
    setDetailId(null);
    setDetail(null);
    setDetailError("");
  }, []);

  useEffect(() => {
    if (!detailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailId, closeDetail]);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/orders", { method: "GET" });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as { success?: boolean; data?: AdminOrderRow[]; message?: string };
      if (res.status === 200 && json.success && json.data) {
        setOrders(json.data);
        return;
      }
      setError(json.message ?? t("orders.error"));
    } catch {
      setError(t("orders.error"));
    } finally {
      setLoading(false);
    }
  }, [locale, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(id: string, status: string) {
    const prev = orders;
    setUpdatingId(id);
    setError("");
    // Optimistic: reflect the change immediately, roll back on failure.
    setOrders((list) => list.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        router.replace(`/${locale}/admin/login`);
        return;
      }
      const json = (await res.json()) as { success?: boolean; data?: AdminOrderRow; message?: string };
      if (res.status === 200 && json.success && json.data) {
        const updated = json.data;
        setOrders((list) => list.map((o) => (o.id === updated.id ? updated : o)));
        // Keep the open drawer's status history in sync with the change.
        if (detailId === id) void openDetail(id);
        return;
      }
      setOrders(prev);
      setError(json.message ?? t("orders.updateError"));
    } catch {
      setOrders(prev);
      setError(t("orders.updateError"));
    } finally {
      setUpdatingId(null);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  }

  function formatDateTime(iso: string) {
    try {
      return new Date(iso).toLocaleString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function statusLabel(s: string) {
    return (STATUSES as readonly string[]).includes(s) ? t(`orders.status.${s}`) : s;
  }

  return (
    <div>
      <Link href={`/${locale}/admin/dashboard`} className="admin-back-link">
        ← {t("hub.backToDashboard")}
      </Link>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>{t("orders.title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>{t("orders.subtitle")}</p>

      {error ? <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p> : null}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("orders.loading")}</p>
      ) : orders.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 0" }}>{t("orders.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("orders.columns.customer")}</th>
                <th>{t("orders.columns.phone")}</th>
                <th>{t("orders.columns.date")}</th>
                <th>{t("orders.columns.items")}</th>
                <th>{t("orders.columns.total")}</th>
                <th>{t("orders.columns.status")}</th>
                <th aria-label={t("orders.detail.open")} />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const options = (STATUSES as readonly string[]).includes(o.status)
                  ? (STATUSES as readonly string[])
                  : [o.status, ...STATUSES];
                return (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600, maxWidth: "240px" }}>
                      {o.customer?.businessName ?? t("orders.unknownCustomer")}
                      {o.notes ? (
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400 }}>
                          📝 {o.notes}
                        </div>
                      ) : null}
                    </td>
                    <td dir="ltr">{o.customer?.phoneNumber ?? "—"}</td>
                    <td>{formatDate(o.createdAt)}</td>
                    <td>{o.itemCount}</td>
                    <td>₪ {o.total}</td>
                    <td>
                      <select
                        className="admin-select"
                        value={o.status}
                        disabled={updatingId === o.id}
                        onChange={(e) => void changeStatus(o.id, e.target.value)}
                        aria-label={t("orders.columns.status")}
                      >
                        {options.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="admin-btn" onClick={() => void openDetail(o.id)}>
                        {t("orders.detail.open")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailId ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={t("orders.detail.title")}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetail();
          }}
        >
          <div className="admin-modal" style={{ maxInlineSize: "720px", maxBlockSize: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "1.15rem" }}>{t("orders.detail.title")}</h2>
              <button type="button" className="admin-btn" onClick={closeDetail}>
                {t("orders.detail.close")}
              </button>
            </div>

            {detailLoading ? (
              <p style={{ color: "var(--text-muted)", padding: "2rem 0", textAlign: "center" }}>
                {t("orders.detail.loading")}
              </p>
            ) : detailError ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{detailError}</p>
                <button type="button" className="admin-btn" onClick={() => detailId && void openDetail(detailId)}>
                  {t("orders.detail.retry")}
                </button>
              </div>
            ) : detail ? (
              <>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1rem" }} dir="ltr">
                  #{detail.id}
                </p>
                <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", marginBottom: "1rem", fontSize: "0.875rem" }}>
                  <span>
                    <strong>{t("orders.columns.status")}:</strong> {statusLabel(detail.status)}
                  </span>
                  <span>
                    <strong>{t("orders.detail.createdAt")}:</strong> {formatDateTime(detail.createdAt)}
                  </span>
                  <span>
                    <strong>{t("orders.detail.updatedAt")}:</strong> {formatDateTime(detail.updatedAt)}
                  </span>
                </div>

                {detail.customer ? (
                  <section style={{ marginBottom: "1.25rem" }}>
                    <h3 style={{ fontSize: "0.95rem", marginBottom: "0.4rem" }}>{t("orders.detail.customer")}</h3>
                    <div style={{ fontSize: "0.875rem", display: "grid", gap: "0.2rem" }}>
                      <span style={{ fontWeight: 600 }}>{detail.customer.businessName}</span>
                      <span dir="ltr">{detail.customer.phoneNumber}</span>
                      <span dir="ltr">{detail.customer.email}</span>
                      {detail.customer.businessType ? (
                        <span>
                          {t("orders.detail.businessType")}: {detail.customer.businessType}
                        </span>
                      ) : null}
                      {detail.customer.adminNotes ? (
                        <span style={{ color: "var(--text-muted)" }}>
                          🔒 {t("orders.detail.adminNotes")}: {detail.customer.adminNotes}
                        </span>
                      ) : null}
                    </div>
                  </section>
                ) : (
                  <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>{t("orders.unknownCustomer")}</p>
                )}

                {detail.notes ? (
                  <section style={{ marginBottom: "1.25rem" }}>
                    <h3 style={{ fontSize: "0.95rem", marginBottom: "0.4rem" }}>{t("orders.detail.customerNotes")}</h3>
                    <p style={{ fontSize: "0.875rem" }}>📝 {detail.notes}</p>
                  </section>
                ) : null}

                <section style={{ marginBottom: "1.25rem" }}>
                  <h3 style={{ fontSize: "0.95rem", marginBottom: "0.4rem" }}>{t("orders.detail.items")}</h3>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>{t("orders.detail.itemName")}</th>
                          <th>{t("orders.detail.itemSku")}</th>
                          <th>{t("orders.detail.itemQty")}</th>
                          <th>{t("orders.detail.itemUnitPrice")}</th>
                          <th>{t("orders.detail.itemLineTotal")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((it, i) => (
                          <tr key={`${it.productId}-${i}`}>
                            <td>
                              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                {it.imageUrl ? (
                                  <Image
                                    src={it.imageUrl}
                                    alt=""
                                    width={40}
                                    height={40}
                                    style={{ borderRadius: "6px", objectFit: "cover" }}
                                  />
                                ) : null}
                                <span>
                                  {it.name}
                                  {it.isGift ? (
                                    <span
                                      style={{
                                        marginInlineStart: "0.4rem",
                                        fontSize: "0.72rem",
                                        color: "var(--sari-gold-deep, #a07d2a)",
                                        fontWeight: 700,
                                      }}
                                    >
                                      🎁 {t("orders.detail.gift")}
                                    </span>
                                  ) : null}
                                  {it.unit || it.packageSize ? (
                                    <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                      {[it.packageSize, it.unit].filter(Boolean).join(" · ")}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                            </td>
                            <td dir="ltr">{it.sku ?? "—"}</td>
                            <td>{it.quantity}</td>
                            <td>₪ {it.unitPrice}</td>
                            <td>₪ {it.lineTotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section style={{ marginBottom: "1.25rem", fontSize: "0.875rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{t("orders.detail.subtotal")}</span>
                    <span>₪ {detail.subtotal}</span>
                  </div>
                  {detail.promotionDiscount ? (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--sari-gold-deep, #a07d2a)" }}>
                      <span>{t("orders.detail.promotionDiscount")}</span>
                      <span>-₪ {detail.promotionDiscount.amountOff}</span>
                    </div>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: "0.3rem" }}>
                    <span>{t("orders.detail.total")}</span>
                    <span>₪ {detail.total}</span>
                  </div>
                </section>

                <section>
                  <h3 style={{ fontSize: "0.95rem", marginBottom: "0.4rem" }}>{t("orders.detail.history")}</h3>
                  {detail.statusHistory.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{t("orders.detail.historyEmpty")}</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.35rem", fontSize: "0.875rem" }}>
                      {detail.statusHistory.map((h, i) => (
                        <li key={i} style={{ display: "flex", gap: "0.6rem", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 600 }}>{statusLabel(h.status)}</span>
                          <span style={{ color: "var(--text-muted)" }}>{formatDateTime(h.changedAt)}</span>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            {t(`orders.detail.role.${h.changedByRole === "admin" ? "admin" : "customer"}`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
