// Top-level loading state — renders while a route segment's data
// fetches resolve. Next.js wraps the page in <Suspense> automatically
// when this file exists at the segment level.
//
// Strategy: don't try to skeleton the exact page (every page is
// different). Render a quiet, branded shell that signals "we're
// here, just loading" — restrained pulse on a card-shaped silhouette,
// brand-tinted shimmer instead of generic gray. Anything more
// elaborate competes for attention with the real content that's
// about to land.
//
// Server Component (no "use client") — pure markup, no state.

export default function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div
        className="w-full max-w-lg rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-8 sm:p-10 shadow-[var(--shadow-sm)]"
        role="status"
        aria-live="polite"
        aria-label="Loading"
      >
        <div className="space-y-4">
          {/* Eyebrow — short pulsing pill */}
          <div className="h-3 w-24 rounded-full bg-[var(--surface-deep)] animate-pulse" />

          {/* Headline — two-line silhouette at display width */}
          <div className="space-y-3">
            <div className="h-8 sm:h-10 w-11/12 rounded-[var(--r-md)] bg-[var(--surface-deep)] animate-pulse" />
            <div className="h-8 sm:h-10 w-3/4 rounded-[var(--r-md)] bg-[var(--surface-deep)] animate-pulse" />
          </div>

          {/* Body — three light lines */}
          <div className="space-y-2 pt-2">
            <div className="h-3 w-full rounded-full bg-[var(--surface-deep)] animate-pulse" />
            <div className="h-3 w-5/6 rounded-full bg-[var(--surface-deep)] animate-pulse" />
            <div className="h-3 w-2/3 rounded-full bg-[var(--surface-deep)] animate-pulse" />
          </div>
        </div>

        <span className="sr-only">Loading…</span>
      </div>
    </main>
  );
}
