export default function ContentLoading() {
  return (
    <main
      className="min-h-screen p-6 max-w-3xl mx-auto"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {/* Header */}
      <div className="h-7 w-36 rounded-[var(--r-md)] bg-[var(--surface-deep)] animate-pulse mb-6" />

      {/* Content rows */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)]"
          >
            {/* Platform icon */}
            <div className="h-8 w-8 rounded-[var(--r-md)] bg-[var(--surface-deep)] animate-pulse shrink-0" />
            {/* Title */}
            <div className="flex-1 h-4 rounded-full bg-[var(--surface-deep)] animate-pulse" />
            {/* Status badge */}
            <div className="h-6 w-20 rounded-full bg-[var(--surface-deep)] animate-pulse shrink-0" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading content…</span>
    </main>
  );
}
