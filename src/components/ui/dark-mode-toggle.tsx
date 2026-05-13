"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export const DarkModeToggle = () => {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = stored === "dark" || (!stored && prefersDark);
    setIsDark(dark);
    if (dark) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggle = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  if (!mounted) {
    return (
      <div className="fixed bottom-6 left-6 w-10 h-10 rounded-full bg-white/80 backdrop-blur-xl border border-gray-200 shadow-lg z-50" />
    );
  }

  return (
    <button
      onClick={toggle}
      className="fixed bottom-6 left-6 w-10 h-10 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group z-50 hover:scale-110"
      aria-label="Toggle dark mode"
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-yellow-500 group-hover:rotate-90 transition-transform duration-300" />
      ) : (
        <Moon className="w-4 h-4 text-gray-700 group-hover:rotate-12 transition-transform duration-300" />
      )}
    </button>
  );
};
