"use client";

import { useEffect } from "react";

/**
 * Measures genuinely-visible reading time on the reader page and reports it
 * as a read_time signal on exit. Only foreground time counts, and the engine
 * caps credit at 2 minutes, so an abandoned tab teaches nothing.
 */
export function ReadTracker({ itemId }: { itemId: number }) {
  useEffect(() => {
    let visibleSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
    let accumulated = 0;

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        visibleSince ??= Date.now();
      } else if (visibleSince !== null) {
        accumulated += Date.now() - visibleSince;
        visibleSince = null;
      }
    };

    const report = () => {
      if (visibleSince !== null) {
        accumulated += Date.now() - visibleSince;
        visibleSince = null;
      }
      const seconds = Math.round(accumulated / 1000);
      if (seconds >= 5) {
        const payload = JSON.stringify({ signals: [{ itemId, type: "read_time", value: seconds }] });
        if (!(navigator.sendBeacon && navigator.sendBeacon("/api/signals", payload))) {
          void fetch("/api/signals", { method: "POST", body: payload, keepalive: true });
        }
      }
      accumulated = 0;
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", report);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", report);
      report(); // client-side navigation back to the feed
    };
  }, [itemId]);

  return null;
}
