"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Living Bakery — micro-interaction layer (reusable, independent of SceneStage).
 *
 * 1. FlourDrift — ~12 CSS-only flour particles drifting down behind the UI;
 *    the field nudges upward briefly on scroll so the drift subtly responds
 *    (a transition on transform — no rAF loop, no layout reads).
 * 2. CartDropLayer + emitCartAdd() — when an item is added to the cart, a
 *    small gold dot arcs from the tap position into a little mixing bowl that
 *    pops up near the cart tab. Pure transform/opacity, ~700ms.
 */

const CART_ADD_EVENT = "sari:cart-add";
const DROP_MS = 750;
const FLOUR_COUNT = 12;

/** Call from any existing add-to-cart success path (one line, no cart logic). */
export function emitCartAdd() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_ADD_EVENT));
  }
}

// Deterministic particle placement (no Math.random → no hydration mismatch).
const FLOUR_PARTICLES = Array.from({ length: FLOUR_COUNT }, (_, i) => ({
  startInline: (i * 83) % 100, // %
  size: 2 + ((i * 7) % 4), // px
  duration: 14 + ((i * 5) % 9), // s
  delay: -((i * 31) % 20), // s (negative → field is already populated on mount)
  opacity: 0.25 + ((i * 13) % 20) / 100,
}));

export function FlourDrift() {
  const [brisk, setBrisk] = useState(false);
  const briskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      setBrisk(true);
      if (briskTimer.current) clearTimeout(briskTimer.current);
      briskTimer.current = setTimeout(() => setBrisk(false), 650);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (briskTimer.current) clearTimeout(briskTimer.current);
    };
  }, []);

  return (
    <div className="lb-flour-field" data-brisk={brisk ? "true" : "false"} aria-hidden="true">
      {FLOUR_PARTICLES.map((p, i) => (
        <span
          key={i}
          className="lb-flour"
          style={{
            insetInlineStart: `${p.startInline}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}

type DropState = {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  bowlX: number;
  bowlY: number;
};

export function CartDropLayer() {
  const [drop, setDrop] = useState<DropState | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const seq = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };

    const onCartAdd = () => {
      // One-time rect read on a click — not a per-frame layout read.
      const cartTab = document.querySelector<HTMLAnchorElement>('.ds-nav-tabs a[href*="/dashboard/cart"]');
      const rect = cartTab?.getBoundingClientRect();
      const bowlX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const bowlY = rect ? rect.top + rect.height / 2 : 24;
      const { x, y } = lastPointer.current;
      if (!x && !y) return;

      seq.current += 1;
      setDrop({ id: seq.current, x, y, dx: bowlX - x, dy: bowlY - y, bowlX, bowlY });
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setDrop(null), DROP_MS);
    };

    window.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
    window.addEventListener(CART_ADD_EVENT, onCartAdd);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener(CART_ADD_EVENT, onCartAdd);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  if (!drop) return null;

  return (
    <div className="lb-drop-layer" aria-hidden="true">
      <span
        key={drop.id}
        className="lb-drop-arc"
        style={{ left: drop.x, top: drop.y, "--lb-dx": `${drop.dx}px` } as React.CSSProperties}
      >
        <span className="lb-drop-dot" style={{ "--lb-dy": `${drop.dy}px` } as React.CSSProperties} />
      </span>
      <svg
        className="lb-drop-bowl"
        style={{ left: drop.bowlX, top: drop.bowlY }}
        viewBox="0 0 32 20"
        width="32"
        height="20"
        focusable="false"
      >
        <path d="M2 4h28c0 9-6 14-14 14S2 13 2 4z" fill="var(--sari-gold, #c9a54c)" opacity="0.9" />
        <rect x="0" y="2" width="32" height="3" rx="1.5" fill="var(--sari-gold-deep, #b48a2f)" />
      </svg>
    </div>
  );
}
