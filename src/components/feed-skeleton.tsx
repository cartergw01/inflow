/**
 * Loading state in the design's own voice: grey bars on the real grid,
 * pulsing gently. Shown while a tab's pane streams in.
 */
export function FeedSkeleton() {
  return (
    <div className="flex-1 animate-pulse" aria-hidden>
      <div className="grid lg:grid-cols-[2fr_1fr] border-b-[3px] border-rule-strong">
        <div className="px-5 sm:px-7 py-6 lg:border-r-[3px] lg:border-rule-strong">
          <div className="h-2.5 w-40 bg-accent/25 mb-5" />
          <div className="h-9 w-11/12 bg-paper-raised mb-2.5" />
          <div className="h-9 w-3/4 bg-paper-raised mb-5" />
          <div className="h-3.5 w-2/3 bg-paper-raised mb-2" />
          <div className="h-3.5 w-1/2 bg-paper-raised" />
        </div>
        <div className="bg-ink px-5 py-5 hidden lg:block">
          <div className="h-2.5 w-16 bg-paper/30 mb-5" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-3 border-t border-paper/20">
              <div className="h-2 w-24 bg-paper/25 mb-2" />
              <div className="h-3 w-full bg-paper/30" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`px-5 sm:px-7 py-5 border-b border-rule ${i % 2 === 0 ? "sm:border-r sm:border-rule" : ""}`}>
            <div className="flex gap-4">
              <div className="h-6 w-9 bg-paper-raised" />
              <div className="flex-1">
                <div className="h-2 w-24 bg-accent/20 mb-3" />
                <div className="h-4 w-10/12 bg-paper-raised mb-2" />
                <div className="h-3 w-2/3 bg-paper-raised" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
