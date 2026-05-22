export default function LeadsLoading() {
  return (
    <main
      className="min-h-screen p-6 max-w-3xl mx-auto"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {/* Search bar */}
      <div className="h-10 w-full rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] animate-pulse mb-6" />

      {/* Lead rows */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)]"
          >
            {/* Avatar */}
            <div className="h-8 w-8 rounded-full bg-[var(--surface-deep)] animate-pulse shrink-0" />
            {/* Text lines */}
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/5 rounded-full bg-[var(--surface-deep)] animate-pulse" />
              <div className="h-3 w-3/5 rounded-full bg-[var(--surface-deep)] animate-pulse" />
            </div>
            {/* Badge */}
            <div className="h-6 w-16 rounded-full bg-[var(--surface-deep)] animate-pulse shrink-0" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading leads…</span>
    </main>
  );
}
