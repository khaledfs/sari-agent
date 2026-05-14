"use client";

import { useEffect, useState } from "react";

type ViewportMode = "mobile" | "desktop";

/**
 * Detect viewport mode: mobile (≤1024px) vs desktop (>1024px).
 * Mobile includes phones and tablets.
 */
export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>("desktop");

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px)");

    function handleChange(e: MediaQueryListEvent | MediaQueryList) {
      setMode(e.matches ? "mobile" : "desktop");
    }

    // Initial check
    handleChange(query);

    // Listen for changes
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return mode;
}