export default function VoiceLoading() {
  return (
    <main
      className="min-h-screen p-6 max-w-4xl mx-auto"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {/* Header */}
      <div className="space-y-2 mb-6">
        <div className="h-7 w-40 rounded-[var(--r-md)] bg-[var(--surface-deep)] animate-pulse" />
        <div className="h-4 w-64 rounded-full bg-[var(--surface-deep)] animate-pulse" />
      </div>

      {/* Large voice profile card */}
      <div className="w-full rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-8 shadow-[var(--shadow-sm)] mb-4 space-y-4">
        <div className="h-5 w-1/3 rounded-full bg-[var(--surface-deep)] animate-pulse" />
        <div className="h-3 w-full rounded-full bg-[var(--surface-deep)] animate-pulse" />
        <div className="h-3 w-5/6 rounded-full bg-[var(--surface-deep)] animate-pulse" />
        <div className="h-3 w-4/6 rounded-full bg-[var(--surface-deep)] animate-pulse" />
        <div className="h-10 w-36 rounded-[var(--r-md)] bg-[var(--surface-deep)] animate-pulse mt-2" />
      </div>

      {/* 2 smaller cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-sm)] space-y-3"
          >
            <div className="h-4 w-2/5 rounded-full bg-[var(--surface-deep)] animate-pulse" />
            <div className="h-3 w-full rounded-full bg-[var(--surface-deep)] animate-pulse" />
            <div className="h-3 w-3/4 rounded-full bg-[var(--surface-deep)] animate-pulse" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading voice settings…</span>
    </main>
  );
}
