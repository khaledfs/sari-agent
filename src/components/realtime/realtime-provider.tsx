"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { RealtimeEvent, RealtimeEventType } from "@/types/realtime";

/**
 * Realtime client layer (Work Order Issue 4).
 *
 * Exactly ONE EventSource per tab: the provider is mounted once in the stable
 * dashboard layouts, ABOVE the route subtree, so client-side navigation never
 * recreates the connection (this also protects the chat panel — Issue 7).
 *
 * Reconnect strategy: the browser's EventSource retries on its own (the server
 * sends `retry: 3000`). There is no event replay — after a reconnect the
 * provider bumps `recovery`, and consumers refetch their authoritative
 * endpoints to recover anything missed.
 */

const EVENT_TYPES: RealtimeEventType[] = [
  "order.created",
  "order.status_changed",
  "product.updated",
  "inventory.updated",
  "account.restricted",
  "account.unrestricted",
  "ledger.entry_created",
  "message.created",
];

type RealtimeHandler = (event: RealtimeEvent) => void;

type RealtimeContextValue = {
  /** Registers a handler for every event this session receives; returns cleanup. */
  subscribe: (handler: RealtimeHandler) => () => void;
  /** Increments after a dropped connection is re-established — refetch on change. */
  recovery: number;
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const handlersRef = useRef<Set<RealtimeHandler>>(new Set());
  // De-duplication by entity id + timestamp (EventSource can redeliver around
  // reconnects); bounded so the set never grows unbounded in long sessions.
  const seenRef = useRef<Set<string>>(new Set());
  const [recovery, setRecovery] = useState(0);

  const subscribe = useCallback((handler: RealtimeHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/events");
    let hadError = false;

    const dispatch = (raw: MessageEvent) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(String(raw.data)) as RealtimeEvent;
      } catch {
        return;
      }
      if (!event || typeof event.type !== "string") return;

      const entityId =
        "orderId" in event
          ? event.orderId
          : "productId" in event
            ? event.productId
            : "entryId" in event
              ? event.entryId
              : "threadId" in event
                ? event.threadId
                : event.userId;
      const key = `${event.type}:${entityId}:${event.at}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      if (seenRef.current.size > 500) {
        const first = seenRef.current.values().next().value;
        if (first) seenRef.current.delete(first);
      }

      for (const handler of handlersRef.current) {
        try {
          handler(event);
        } catch {
          // One broken consumer must not stop delivery to the others.
        }
      }
    };

    for (const type of EVENT_TYPES) {
      source.addEventListener(type, dispatch);
    }
    source.onopen = () => {
      if (hadError) {
        hadError = false;
        setRecovery((n) => n + 1);
      }
    };
    source.onerror = () => {
      // Browser retries automatically (server retry: 3000); stay silent —
      // no full-page loader, no state reset.
      hadError = true;
    };

    return () => {
      source.close();
    };
  }, []);

  const value = useMemo(() => ({ subscribe, recovery }), [subscribe, recovery]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Raw event stream access. Safe outside the provider (no-op) so shared components don't crash. */
export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  return ctx ?? { subscribe: () => () => {}, recovery: 0 };
}

/**
 * Refetch-on-event helper: calls `refetch` (debounced) whenever one of `types`
 * arrives or the connection recovers. While the tab is hidden, refetching is
 * paused and coalesced into ONE refetch when the tab becomes visible again.
 */
export function useRealtimeRefetch(types: RealtimeEventType[], refetch: () => void): void {
  const { subscribe, recovery } = useRealtime();
  const refetchRef = useRef(refetch);
  const typesRef = useRef(types);
  useEffect(() => {
    refetchRef.current = refetch;
    typesRef.current = types;
  });
  const pendingWhileHiddenRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) {
      pendingWhileHiddenRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      refetchRef.current();
    }, 250);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (typesRef.current.includes(event.type)) trigger();
    });
    const onVisible = () => {
      if (!document.hidden && pendingWhileHiddenRef.current) {
        pendingWhileHiddenRef.current = false;
        trigger();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [subscribe, trigger]);

  // Missed-event recovery: refetch once per re-established connection.
  const lastRecoveryRef = useRef(recovery);
  useEffect(() => {
    if (recovery !== lastRecoveryRef.current) {
      lastRecoveryRef.current = recovery;
      trigger();
    }
  }, [recovery, trigger]);
}

/** Event-payload access for consumers that patch state instead of refetching. */
export function useRealtimeEvent(
  types: RealtimeEventType[],
  onEvent: (event: RealtimeEvent) => void
): void {
  const { subscribe } = useRealtime();
  const onEventRef = useRef(onEvent);
  const typesRef = useRef(types);
  useEffect(() => {
    onEventRef.current = onEvent;
    typesRef.current = types;
  });

  useEffect(
    () =>
      subscribe((event) => {
        if (typesRef.current.includes(event.type)) onEventRef.current(event);
      }),
    [subscribe]
  );
}
