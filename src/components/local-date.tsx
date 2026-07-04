"use client";

import { useEffect, useState } from "react";

/**
 * Today's date in the reader's timezone. Rendered after mount because the
 * server clock is UTC — a daily masthead must show the reader's "today",
 * and a wrong date beats a flash less than it costs trust.
 */
export function LocalDate() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(
      new Date().toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
    );
  }, []);
  return <span suppressHydrationWarning>{text}</span>;
}
