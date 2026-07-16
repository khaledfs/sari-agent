"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useRealtimeEvent } from "@/components/realtime/realtime-provider";

/**
 * Client mirror of the server-side ordering permission (Work Order Issue 3).
 *
 * UX ONLY — the real enforcement is requireOrderingEnabled() on every mutating
 * request. This context drives the persistent banner and disabled (not hidden)
 * controls, flips live on account.restricted / account.unrestricted events,
 * and lets any fetch handler that received 403 ACCOUNT_RESTRICTED flip the UI
 * gracefully — no logout, no redirect, nothing cleared.
 */

type AccountStatusContextValue = {
  restricted: boolean;
  /** Call when any endpoint returns { code: "ACCOUNT_RESTRICTED" }. */
  notifyRestricted: () => void;
};

const AccountStatusContext = createContext<AccountStatusContextValue>({
  restricted: false,
  notifyRestricted: () => {},
});

export function AccountStatusProvider({
  initialRestricted,
  children,
}: {
  initialRestricted: boolean;
  children: React.ReactNode;
}) {
  const [restricted, setRestricted] = useState(initialRestricted);

  useRealtimeEvent(["account.restricted", "account.unrestricted"], (event) => {
    // Channel scoping guarantees these are the logged-in customer's own events.
    setRestricted(event.type === "account.restricted");
  });

  const notifyRestricted = useCallback(() => setRestricted(true), []);

  const value = useMemo(() => ({ restricted, notifyRestricted }), [restricted, notifyRestricted]);
  return <AccountStatusContext.Provider value={value}>{children}</AccountStatusContext.Provider>;
}

export function useAccountStatus(): AccountStatusContextValue {
  return useContext(AccountStatusContext);
}

/** Persistent, non-dismissible hold notice shown on every dashboard page. */
export function RestrictedBanner() {
  const { restricted } = useAccountStatus();
  const t = useTranslations("restricted");
  if (!restricted) return null;
  return (
    <div className="ds-restricted-banner" role="status">
      <span aria-hidden="true">🔒</span> {t("banner")}
    </div>
  );
}
