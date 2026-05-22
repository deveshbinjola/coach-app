export default function LeadDetailLoading() {
  return (
    <main
      className="min-h-screen p-6 max-w-6xl mx-auto"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {/* Back link */}
      <div className="h-3 w-24 rounded-full bg-[var(--surface-deep)] animate-pulse mb-6" />

      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_240px] gap-4">
        {/* Left sidebar */}
        <div className="rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-sm)] space-y-3">
          <div className="h-5 w-3/4 rounded-full bg-[var(--surface-deep)] animate-pulse" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 w-full rounded-full bg-[var(--surface-deep)] animate-pulse" />
          ))}
        </div>

        {/* Center conversation */}
        <div className="rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-sm)] space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
              <div className={`h-10 rounded-[var(--r-xl)] bg-[var(--surface-deep)] animate-pulse ${i % 2 === 0 ? "w-3/5" : "w-2/5"}`} />
            </div>
          ))}
        </div>

        {/* Right card */}
        <div className="rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-sm)] space-y-3">
          <div className="h-5 w-2/3 rounded-full bg-[var(--surface-deep)] animate-pulse" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3 w-full rounded-full bg-[var(--surface-deep)] animate-pulse" />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading lead detail…</span>
    </main>
  );
}
