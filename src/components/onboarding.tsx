"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const TOPICS: { id: string; label: string; seed?: boolean }[] = [
  { id: "nba", label: "NBA", seed: true },
  { id: "tech", label: "Tech & startups", seed: true },
  { id: "taiwan", label: "Taiwan", seed: true },
  { id: "us-politics", label: "US politics", seed: true },
  { id: "ai", label: "AI" },
  { id: "vc", label: "Venture capital" },
  { id: "world", label: "World" },
  { id: "business", label: "Business & markets" },
  { id: "science", label: "Science" },
  { id: "media", label: "Media" },
];

/**
 * Fifteen seconds, once — in the design's poster voice. Interests picked here
 * only warm-start the ranking; everything after is learned from reading.
 */
export function Onboarding() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(TOPICS.filter((t) => t.seed).map((t) => t.id)),
  );
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const start = async () => {
    setBusy(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interests: [...selected] }),
      });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="space-shell dark flex-1 flex flex-col text-white">
      <div className="border-b-[3px] border-rule-strong bg-black/[0.18] px-6 sm:px-10 pt-14 pb-10 backdrop-blur-[2px]">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 bg-accent inline-block" aria-hidden />
          <span className="font-display font-black text-[44px] sm:text-[56px] leading-none tracking-[-0.04em]">
            INFLOW
          </span>
        </div>
        <p className="mt-5 font-display font-bold text-[19px] sm:text-[22px] tracking-[-0.01em] max-w-[38ch] leading-[1.25]">
          The things you need to stay informed. Nothing more.
        </p>
        <p className="mt-2 font-mono text-[0.65rem] tracking-[0.16em] uppercase text-ink-faint">
          No ads — no engagement bait — learns from how you actually read
        </p>
      </div>

      <div className="px-6 sm:px-10 py-8 flex-1">
        <div className="font-mono text-[0.65rem] tracking-[0.2em] uppercase text-accent mb-4">
          01 — Start with what you follow
        </div>
        <div className="flex flex-wrap gap-2.5 max-w-2xl">
          {TOPICS.map((t) => {
            const on = selected.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                aria-pressed={on}
                className={`cursor-pointer border-2 px-4 py-2 font-display font-bold text-[13px] tracking-[0.04em] uppercase transition-colors ${
                  on
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-rule-strong text-ink hover:border-accent hover:text-accent"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-5 text-[13px] leading-relaxed text-ink-soft max-w-[56ch]">
          A starting point, not a contract — the feed learns from what you read, skip, and save, and
          keeps adjusting.
        </p>

        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="mt-9 cursor-pointer bg-ink text-paper font-display font-black text-[15px] tracking-[0.05em] uppercase px-8 py-3.5 hover:bg-accent hover:text-accent-ink transition-colors disabled:opacity-50"
        >
          {busy ? "Setting up…" : "Start reading →"}
        </button>
      </div>
    </main>
  );
}
