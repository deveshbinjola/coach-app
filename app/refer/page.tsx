// /refer · public referral page
//
// Simplified per Sunny's request:
//   - Only 2 fields when ?from= is present: friend's first name + email.
//   - When ?from= is absent (direct visit), add a 3rd field at the top: "Your email"
//     so visitors can still refer. We use their own email as the from_email.
//   - No "what happens next" block. No "personal note". No verbose copy.
//   - Single bold ask, one button. Get them through it in 10 seconds.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

type Result = {
  ok: boolean;
  sent_to?: string;
  referrer_first_name?: string;
  error?: string;
};

export default function ReferPage() {
  const searchParams = useSearchParams();
  const queryFromEmail = (searchParams?.get("from") ?? "").trim().toLowerCase();

  const [yourEmail, setYourEmail] = useState("");
  const [friendName, setFriendName] = useState("");
  const [friendEmail, setFriendEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sentCount, setSentCount] = useState(0);

  // Direct-visit mode if ?from= is missing
  const directVisit = !queryFromEmail;
  const effectiveFromEmail = (queryFromEmail || yourEmail.trim().toLowerCase()).trim();

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!effectiveFromEmail || !effectiveFromEmail.includes("@")) {
      setResult({ ok: false, error: "Please enter your email so I know who to attach the referral to." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/refer/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_email: effectiveFromEmail,
          friend_email: friendEmail.trim(),
          friend_first_name: friendName.trim(),
        }),
      });
      const json = (await res.json()) as Result;
      setResult(json);
      if (json.ok) {
        setSentCount((c) => c + 1);
        setFriendName("");
        setFriendEmail("");
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }, [busy, effectiveFromEmail, friendEmail, friendName]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)", padding: "48px 16px 96px", fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <svg viewBox="0 0 88 88" width="40" height="40">
            <rect x="6" y="8" width="72" height="72" rx="18" fill="var(--brand)"/>
            <path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="var(--surface)"/>
            <path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="var(--surface)" strokeWidth="5" strokeLinecap="round" fill="none"/>
          </svg>
        </div>

        {/* Hero · stripped down */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1, fontFamily: "'Playfair Display', Georgia, serif" }}>
            Send Brand OS to <em style={{ fontStyle: "italic", color: "var(--brand)" }}>a friend.</em>
          </h1>
        </div>

        {/* Form · minimal */}
        <form onSubmit={handleSubmit} style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 14, padding: 28 }}>

          {directVisit && (
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="your_email" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Your email
              </label>
              <input
                id="your_email"
                type="email"
                required
                value={yourEmail}
                onChange={(e) => setYourEmail(e.target.value)}
                placeholder="you@yourbrand.com"
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="friend_name" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              First name
            </label>
            <input
              id="friend_name"
              type="text"
              required
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
              placeholder="Jordan"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="friend_email" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Email
            </label>
            <input
              id="friend_email"
              type="email"
              required
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              placeholder="jordan@theirbrand.com"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              padding: "14px 24px",
              borderRadius: 100,
              border: "none",
              background: busy ? "var(--text-muted)" : "var(--brand)",
              color: "var(--surface)",
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: busy ? "wait" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {busy ? "Sending…" : "Send the invite →"}
          </button>
        </form>

        {/* Result */}
        {result && (
          <div style={{ marginTop: 20, padding: 18, borderRadius: 10, background: result.ok ? "var(--brand)" : "var(--danger)", color: "var(--surface)" }}>
            {result.ok ? (
              <>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 6, opacity: 0.9 }}>Sent ✓</div>
                <div style={{ fontSize: 15, lineHeight: 1.5 }}>{result.sent_to} got their invite. Send another?</div>
              </>
            ) : (
              <div style={{ fontSize: 14 }}>{result.error}</div>
            )}
          </div>
        )}

        {sentCount > 0 && (
          <p style={{ marginTop: 18, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            {sentCount === 1 ? "1 invite sent" : `${sentCount} invites sent`} so far.
          </p>
        )}

      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 15,
  color: "var(--text)",
  background: "var(--surface-elevated)",
  boxSizing: "border-box",
  fontFamily: "inherit",
};
