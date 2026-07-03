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
 * Fifteen seconds, once. Interests picked here only warm-start the ranking —
 * everything after is learned from reading, and these fade as learning kicks in.
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
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center px-5">
      <div className="max-w-md w-full py-16 text-center">
        <h1 className="font-serif italic font-semibold text-5xl tracking-tight">
          InFlow<span className="text-accent not-italic">.</span>
        </h1>
        <p className="mt-4 font-serif text-lg text-ink-soft leading-relaxed">
          The things you need to stay informed.
          <br />
          Nothing more.
        </p>

        <div className="mt-10 text-left">
          <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink-faint">
            Start with what you follow
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {TOPICS.map((t) => {
              const on = selected.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[0.8rem] transition-colors ${
                    on
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-rule-strong text-ink-soft hover:border-ink-faint"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-faint">
            This is a starting point, not a contract — the feed learns from what you actually read
            and keeps adjusting.
          </p>
        </div>

        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="mt-8 cursor-pointer rounded-full bg-accent text-paper font-medium text-[0.9rem] px-7 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? "Setting up…" : "Start reading →"}
        </button>
      </div>
    </main>
  );
}
