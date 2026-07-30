"use client";

// Top-level error boundary — catches anything that throws during render
// in any route segment that doesn't have its own error.tsx.
//
// Next.js requirements:
//   - Must be a Client Component ("use client") because it uses an
//     event handler (the Reset button).
//   - Receives `error` and `reset` as props. `reset` re-renders the
//     segment from scratch — usually enough to recover from transient
//     failures (network blip, race in a query). For permanent failures
//     it just throws again, which is fine; user clicks "Go home" instead.
//   - `error.digest` is a server-side hash Next attaches to the error.
//     We surface it as a copy-pasteable line at the bottom so support
//     can grep server logs. Local dev shows the full stack instead.
//
// Visual: matches the design system (Fraunces headline, brand gradient
// glow corner, navy/green palette). The page mounts on top of the body
// gradient so it inherits atmosphere automatically.

import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  // Log to console so the dev sees the trace even if Next swallows it
  // in production. In a future iteration this is where Sentry / PostHog
  // capture would hook in.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[error.tsx] caught:", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="relative w-full max-w-lg rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-8 sm:p-10 shadow-[var(--shadow-md)] overflow-hidden">
        {/* Brand glow corner — matches the BillboardCard pattern */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[color-mix(in_srgb,var(--brand)_30%,transparent)] blur-3xl"
        />

        <div className="relative">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-[color:var(--brand-strong)]">
            Something broke
          </div>
          <h1 className="font-display mt-3 text-3xl sm:text-4xl font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            That wasn't supposed to happen.
          </h1>
          <p className="mt-3 text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)]">
            The page hit an error before it could finish loading. Try again —
            most of the time it's a transient hiccup. If it keeps happening,
            send us the reference below.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center h-11 px-5 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] text-[length:var(--t-caption)] font-extrabold hover:bg-[var(--brand-strong)] transition"
            >
              Try again
            </button>
            <a
              href="/command-center"
              className="inline-flex items-center justify-center h-11 px-5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] hover:bg-[var(--surface-deep)] transition"
            >
              Go home
            </a>
          </div>

          {error.digest && (
            <p className="mt-6 pt-5 border-t border-[var(--border-faint)] text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-mono break-all">
              Reference: {error.digest}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
