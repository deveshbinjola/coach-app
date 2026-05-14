// TrialHeader — the navbar for the standalone /trial/[token]/... pages.
//
// 3-column layout:
//   LEFT   ElevateAI logo + wordmark (links to elevateaisystem.com)
//   CENTER "Brand OS" — current product
//   RIGHT  Buyer's email — same email tied to the $7 purchase
//
// Server component. No interactive JS needed.

type Props = { email: string };

export default function TrialHeader({ email }: Props) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface-elevated)] print:hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-3">

        {/* LEFT — ElevateAI brand */}
        <a
          href="https://elevateaisystem.com"
          className="flex items-center gap-2 text-[color:var(--text)] hover:opacity-80 transition"
          rel="noopener"
        >
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-[var(--brand-strong)] text-[var(--text)]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
          </span>
          <span className="font-extrabold text-[color:var(--text)] text-[length:var(--t-body)]">
            Elevate<span className="text-[color:var(--brand-strong)]">AI</span>
          </span>
        </a>

        {/* CENTER — product name */}
        <div className="font-display font-extrabold text-[length:var(--t-body)] sm:text-[length:var(--t-h3)] text-[color:var(--text)] absolute left-1/2 -translate-x-1/2 pointer-events-none hidden sm:block">
          Brand OS
        </div>

        {/* RIGHT — buyer's email */}
        <div className="text-right min-w-0">
          {email ? (
            <>
              <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)] leading-none">
                Signed in as
              </p>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text)] font-bold truncate max-w-[200px] sm:max-w-[300px]">
                {email}
              </p>
            </>
          ) : (
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Trial access</p>
          )}
        </div>

      </div>
    </header>
  );
}
