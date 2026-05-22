export default function CommandCenterLoading() {
  return (
    <main
      className="min-h-screen p-6 max-w-4xl mx-auto"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {/* Greeting + toggle row */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-48 rounded-[var(--r-md)] bg-[var(--surface-deep)] animate-pulse" />
        <div className="h-8 w-36 rounded-full bg-[var(--surface-deep)] animate-pulse" />
      </div>

      {/* Insight queue bar */}
      <div className="h-12 w-full rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] animate-pulse mb-6" />

      {/* Cards */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-full rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-sm)] mb-4 space-y-3"
        >
          <div className="h-4 w-2/5 rounded-full bg-[var(--surface-deep)] animate-pulse" />
          <div className="h-3 w-full rounded-full bg-[var(--surface-deep)] animate-pulse" />
          <div className="h-3 w-5/6 rounded-full bg-[var(--surface-deep)] animate-pulse" />
          <div className="h-3 w-3/4 rounded-full bg-[var(--surface-deep)] animate-pulse" />
        </div>
      ))}

      <span className="sr-only">Loading command center…</span>
    </main>
  );
}
