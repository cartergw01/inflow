"use client";

import { useEffect, useRef, useState } from "react";
import { fullDate, topicLabel } from "../../lib/format";
import { sendSignal } from "../../lib/signals-client";

export interface ReaderPayload {
  id: number;
  title: string;
  author: string | null;
  sourceName: string;
  publishedAt: string;
  topics: string[];
  contentHtml: string | null;
  excerpt: string | null;
  url: string;
  saved: boolean;
}

/**
 * The reading view. 2D and typographic on purpose — the 3D space is for
 * discovery, this is for consumption. It floats over the still-live scene
 * (dimmed and blurred behind), so closing it returns you to space instead
 * of cutting to a different app.
 */
export function ReaderOverlay({
  item,
  accent,
  onClose,
  onSaveChange,
}: {
  item: ReaderPayload;
  accent: string;
  onClose: (readSeconds: number) => void;
  onSaveChange: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(item.saved);
  const [noted, setNoted] = useState<"more" | "less" | null>(null);
  const visibleMs = useRef(0);
  const visibleSince = useRef<number | null>(null);

  useEffect(() => {
    visibleSince.current = document.visibilityState === "visible" ? Date.now() : null;
    const onVis = () => {
      if (document.visibilityState === "visible") visibleSince.current ??= Date.now();
      else if (visibleSince.current !== null) {
        visibleMs.current += Date.now() - visibleSince.current;
        visibleSince.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const close = () => {
    if (visibleSince.current !== null) {
      visibleMs.current += Date.now() - visibleSince.current;
      visibleSince.current = null;
    }
    onClose(Math.round(visibleMs.current / 1000));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const note = (kind: "more" | "less") => {
    sendSignal({ itemId: item.id, type: kind === "more" ? "more_like" : "less_like" });
    setNoted(kind);
    setTimeout(() => setNoted(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-center overflow-y-auto bg-black/[0.62] backdrop-blur-[8px] animate-[reader-in_260ms_ease-out]">
      <article className="w-full max-w-[760px] min-h-full bg-[#0a0b10]/[0.96] border-x border-white/10 shadow-[0_0_120px_rgba(0,0,0,0.55)] px-6 sm:px-10 pt-6 pb-24">
        <div className="flex items-center justify-between sticky top-0 bg-[#0a0b10]/[0.96] backdrop-blur-md py-3 border-b border-white/10 z-10">
          <button
            type="button"
            onClick={close}
            className="cursor-pointer font-mono text-[0.65rem] tracking-[0.16em] uppercase text-white/60 hover:text-white transition-colors"
          >
            ← Back to space
          </button>
          <div className="flex items-center gap-5 font-mono text-[0.65rem] tracking-[0.14em] uppercase">
            <button
              type="button"
              onClick={() => {
                sendSignal({ itemId: item.id, type: saved ? "unsave" : "save" });
                setSaved(!saved);
                onSaveChange(!saved);
              }}
              className="cursor-pointer transition-colors"
              style={{ color: saved ? "#ffd66b" : "rgba(255,255,255,0.6)" }}
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
            {noted ? (
              <span style={{ color: accent }}>{noted === "more" ? "More ✓" : "Less ✓"}</span>
            ) : (
              <>
                <button type="button" onClick={() => note("more")} className="cursor-pointer text-white/60 hover:text-white">
                  More
                </button>
                <button type="button" onClick={() => note("less")} className="cursor-pointer text-white/60 hover:text-white">
                  Less
                </button>
              </>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors"
            >
              Original ↗
            </a>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center gap-2.5 font-mono text-[0.65rem] tracking-[0.2em] uppercase" style={{ color: accent }}>
            <span>{item.topics.map(topicLabel).join(" / ") || item.sourceName}</span>
            <span className="flex-1 h-[2px]" style={{ background: accent }} aria-hidden />
          </div>
          <h1 className="mt-4 font-display font-black text-[28px] sm:text-[38px] leading-[1.04] tracking-[-0.03em] text-white">
            {item.title}
          </h1>
          <div className="mt-4 pb-5 border-b border-white/15 font-mono text-[0.625rem] tracking-[0.1em] uppercase text-white/45">
            <span className="text-white/70">{item.sourceName}</span>
            {item.author ? <> — {item.author}</> : null}
            <> — {fullDate(item.publishedAt)}</>
          </div>

          {item.contentHtml ? (
            <div
              className="reader-body reader-body-dark mt-8"
              dangerouslySetInnerHTML={{ __html: item.contentHtml }}
            />
          ) : (
            <div className="mt-9">
              {item.excerpt ? (
                <p className="text-[17px] leading-[1.6] text-white/75 max-w-[60ch]">{item.excerpt}</p>
              ) : null}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => sendSignal({ itemId: item.id, type: "open" })}
                className="mt-9 inline-block font-display font-black text-[14px] tracking-[0.05em] uppercase px-7 py-3 text-black transition-opacity hover:opacity-90"
                style={{ background: accent }}
              >
                Read at {item.sourceName} ↗
              </a>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
