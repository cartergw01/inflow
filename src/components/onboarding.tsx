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
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const start = async () => {
    if (selected.size === 0) {
      setError("Choose at least one topic to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interests: [...selected] }),
      });
      if (!response.ok) throw new Error(String(response.status));
      router.push("/");
      router.refresh();
    } catch {
      setError("InFlow could not create your briefing. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="space-shell onboarding-shell dark flex-1 flex flex-col justify-center text-white">
      <div className="onboarding-panel">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 bg-accent inline-block" aria-hidden />
          <span className="font-display font-black text-[38px] sm:text-[46px] leading-none">
            INFLOW
          </span>
        </div>
        <p className="mt-5 font-display font-bold text-[20px] sm:text-[24px] max-w-[34ch] leading-[1.22]">
          Build a galaxy around what matters to you.
        </p>
        <div className="font-mono text-[0.65rem] uppercase text-accent mt-9 mb-4">
          Choose your starting signals
        </div>
        <div className="flex flex-wrap gap-2.5 max-w-2xl">
          {(expanded ? TOPICS : TOPICS.slice(0, 6)).map((t) => {
            const on = selected.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                aria-pressed={on}
                className={`cursor-pointer border px-4 py-2 font-display font-bold text-[13px] uppercase transition-colors ${
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
        {!expanded ? <button type="button" className="onboarding-more" onClick={() => setExpanded(true)}>More topics +</button> : null}
        {error ? <p className="onboarding-error" role="alert">{error}</p> : null}

        <button
          type="button"
          onClick={start}
          disabled={busy || selected.size === 0}
          className="mt-9 cursor-pointer bg-ink text-paper font-display font-black text-[15px] tracking-[0.05em] uppercase px-8 py-3.5 hover:bg-accent hover:text-accent-ink transition-colors disabled:opacity-50"
        >
          {busy ? "Setting up…" : "Start reading →"}
        </button>
      </div>
    </main>
  );
}
