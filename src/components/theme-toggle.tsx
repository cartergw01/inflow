"use client";

import { useCallback } from "react";

/** Sun/moon-free theme toggle: a typographic ◐ that flips the palette. */
export function ThemeToggle() {
  const toggle = useCallback(() => {
    const root = document.documentElement;
    const dark = root.classList.toggle("dark");
    try {
      localStorage.setItem("inflow-theme", dark ? "dark" : "light");
    } catch {
      // private mode — theme just won't persist
    }
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="font-mono text-sm text-ink-faint hover:text-accent transition-colors cursor-pointer select-none"
    >
      ◐
    </button>
  );
}
