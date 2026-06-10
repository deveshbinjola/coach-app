// /refer · public referral page
//
// Linked from the bottom of legacy-recovery and post-call emails.
// URL pattern: /refer?from=matt@yourbrand.com
//
// The referrer's first name is resolved server-side (cp_coaches or cp_brand_os_runs).
// The form is client-side, calls /api/refer/send on submit.

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
  const fromEmail = (searchParams?.get("from") ?? "").trim().toLowerCase();

  const [friendName, setFriendName] = useState("");
  const [friendEmail, setFriendEmail] = useState("");
  const [note, setNote] = useState("");
  const [referrerName, setReferrerName] = useState("a friend");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sentCount, setSentCount] = useState(0);

  // Pretty referrer-name preview from email local-part. Server will override
  // with the real first name when sending. This is just for the on-page header.
  useEffect(() => {
    if (!fromEmail) return;
    const local = fromEmail.split("@")[0].replace(/[^a-zA-Z]/g, "") || "a friend";
    setReferrerName(local.charAt(0).toUpperCase() + local.slice(1));
  }, [fromEmail]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!fromEmail) {
      setResult({ ok: false, error: "Missing referrer email. Visit this page from the link in the email." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/refer/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_email: fromEmail,
          friend_email: friendEmail.trim(),
          friend_first_name: friendName.trim(),
          note: note.trim() || null,
        }),
      });
      const json = (await res.json()) as Result;
      setResult(json);
      if (json.ok) {
        setSentCount((c) => c + 1);
        setFriendName("");
        setFriendEmail("");
        setNote("");
        if (json.referrer_first_name) setReferrerName(json.referrer_first_name);
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }, [busy, fromEmail, friendEmail, friendName, note]);

  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F3", color: "#0A0F1C", padding: "48px 16px 96px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <svg viewBox="0 0 88 88" width="40" height="40">
            <rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/>
            <path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/>
            <path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" strokeWidth="5" strokeLinecap="round" fill="none"/>
          </svg>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "2.5px", textTransform: "uppercase", color: "#5A5A52", fontWeight: 700, marginTop: 14 }}>
            ElevateAI · Brand OS
          </div>
        </div>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1 style={{ margin: "0 0 14px", fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1, fontFamily: "'Playfair Display', Georgia, serif" }}>
            Send Brand OS to <em style={{ fontStyle: "italic", color: "#0B6E23" }}>a friend.</em>
          </h1>
          <p style={{ margin: "0 0 8px", color: "#0A0F1C", fontSize: 17, lineHeight: 1.55, fontWeight: 500 }}>
            Free. Their name on the cover.
          </p>
          <p style={{ margin: 0, color: "#5A5A52", fontSize: 15, lineHeight: 1.55 }}>
            We send them their own personalized Brand OS, with you ({referrerName}) attached as the referral.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ background: "#FFFFFF", border: "1px solid #E5E1D8", borderRadius: 14, padding: 28 }}>

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="friend_name" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Friend's first name <span style={{ color: "#0B6E23" }}>·</span> required
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

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="friend_email" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Friend's email <span style={{ color: "#0B6E23" }}>·</span> required
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

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="note" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Personal note <span style={{ color: "#5A5A52", fontWeight: 400 }}>· optional</span>
            </label>
            <textarea
              id="note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Thought of you when I read mine. The voice rules alone are worth it."
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
            />
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#5A5A52" }}>
              If filled in, this gets quoted in the email above your name. If empty, the email just says you thought of them.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy || !fromEmail}
            style={{
              width: "100%",
              padding: "14px 24px",
              borderRadius: 100,
              border: "none",
              background: busy || !fromEmail ? "#5A5A52" : "#0B6E23",
              color: "#FAF8F3",
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: busy ? "wait" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {busy ? "Sending…" : "Send the invite →"}
          </button>

          {!fromEmail && (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "#B23A2E", textAlign: "center" }}>
              Missing referrer link. Click through from the Brand OS email you received.
            </p>
          )}
        </form>

        {/* Result */}
        {result && (
          <div style={{ marginTop: 20, padding: 18, borderRadius: 10, background: result.ok ? "#0B6E23" : "#B23A2E", color: "#FAF8F3" }}>
            {result.ok ? (
              <>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 6, opacity: 0.9 }}>Sent ✓</div>
                <div style={{ fontSize: 15, lineHeight: 1.5 }}>{result.sent_to} got their invite. Want to send another?</div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Could not send</div>
                <div style={{ fontSize: 14 }}>{result.error}</div>
              </>
            )}
          </div>
        )}

        {sentCount > 0 && (
          <p style={{ marginTop: 24, textAlign: "center", color: "#5A5A52", fontSize: 14 }}>
            {sentCount === 1 ? "1 invite sent" : `${sentCount} invites sent`} so far. {referrerName} is on a roll.
          </p>
        )}

        <div style={{ marginTop: 48, padding: 18, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E5E1D8", fontSize: 13, color: "#5A5A52", lineHeight: 1.6 }}>
          <strong style={{ color: "#0A0F1C" }}>What happens next:</strong>
          <ol style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>I personally send your friend a short email with the Brand OS invite, with your name attached.</li>
            <li>They open the link and take their free Snapshot.</li>
            <li>You can keep sending more if you have other friends in mind.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid #E5E1D8",
  fontSize: 15,
  color: "#0A0F1C",
  background: "#FFFFFF",
  boxSizing: "border-box",
  fontFamily: "inherit",
};
