// 404 — a coach hit a URL that doesn't exist.
//
// Most likely causes: stale link from an old email, mistyped path, or
// a deleted lead's detail page. Strategy is calm + helpful, not cute:
// surface the three rooms a coach probably wanted (Command, Leads,
// Voice) so they can re-orient with one click. The Fraunces headline
// matches the rest of the app's hero moments.
//
// Server Component — no state, no JS.

import Link from "next/link";

const QUICK_LINKS: Array<{ href: string; label: string; helper: string }> = [
  {
    href:   "/command-center",
    label:  "Command center",
    helper: "Today's pipeline, drafts, and rescue queue.",
  },
  {
    href:   "/inbox",
    label:  "Leads",
    helper: "Every conversation in one ranked list.",
  },
  {
    href:   "/voice",
    label:  "Voice",
    helper: "The voice profile every AI draft runs through.",
  },
];

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-[color:var(--brand-strong)]">
          404 · Not found
        </div>
        <h1 className="font-display mt-3 text-4xl sm:text-5xl font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
          That page isn't here.
        </h1>
        <p className="mt-3 text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)] max-w-xl">
          The link you followed is wrong, broken, or pointing at something that
          no longer exists. Try one of the rooms below, or head back home.
        </p>

        <ul className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {QUICK_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group block h-full rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 hover:border-[var(--brand)] hover:shadow-[var(--shadow-sm)] transition"
              >
                <div className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                  {link.label}
                </div>
                <div className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
                  {link.helper}
                </div>
                <div className="mt-3 inline-flex items-center text-[length:var(--t-caption)] font-extrabold text-[color:var(--brand-strong)] group-hover:text-[color:var(--text)] transition">
                  Open →
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
