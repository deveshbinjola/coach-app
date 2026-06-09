// /admin/outreach · Sunny pastes name + email + optional note from a call,
// hits send. The post-call email goes out. When they click through and sign
// up, the auth callback fires Day 0 + sets step=1 → the daily cron picks
// them up for Days 1-4 automatically.

"use client";

import { useState } from "react";

export default function OutreachPage() {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [ps, setPs] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; subject?: string; error?: string; snapshot_link?: string }>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/post-call-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          first_name: firstName.trim(),
          note: note.trim() || null,
          ps: ps.trim() || null,
        }),
      });
      const json = await res.json();
      setResult(json);
      if (json.ok) {
        setFirstName("");
        setEmail("");
        setNote("");
        setPs("");
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F3", color: "#0A0F1C", padding: "48px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "2.5px", textTransform: "uppercase", color: "#0B6E23", fontWeight: 700, marginBottom: 8 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: "#0B6E23", borderRadius: "50%", verticalAlign: "middle", marginRight: 8 }}></span>
            Admin · Outreach
          </div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
            After a call.
          </h1>
          <p style={{ margin: "12px 0 0", color: "#5A5A52", fontSize: 16, lineHeight: 1.55, maxWidth: 480 }}>
            Paste their name + email. Optionally the one alive thing they said. Hit send. They get the personalized "after our call" email. When they click through and sign up, the 5-day drip kicks in automatically.
          </p>
        </div>

        <form onSubmit={handleSend} style={{ background: "#FFFFFF", border: "1px solid #E5E1D8", borderRadius: 14, padding: 28, marginBottom: 24 }}>

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="first_name" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#0A0F1C" }}>
              First name <span style={{ color: "#0B6E23" }}>·</span> required
            </label>
            <input
              id="first_name"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Matt"
              style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #E5E1D8", fontSize: 16, fontFamily: "inherit", color: "#0A0F1C", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="email" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#0A0F1C" }}>
              Email <span style={{ color: "#0B6E23" }}>·</span> required
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="matt@yourbrand.com"
              style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #E5E1D8", fontSize: 16, fontFamily: "inherit", color: "#0A0F1C", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="note" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#0A0F1C" }}>
              The one alive thing they said <span style={{ color: "#5A5A52", fontWeight: 400 }}>· optional, becomes a quoted callback</span>
            </label>
            <textarea
              id="note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="My posts keep sounding like every other coach and I hate it."
              style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #E5E1D8", fontSize: 15, fontFamily: "inherit", color: "#0A0F1C", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
            />
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#5A5A52" }}>
              If filled in, this gets quoted in the email. If empty, the email opens with a generic warm acknowledgment instead.
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="ps" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#0A0F1C" }}>
              PS line <span style={{ color: "#5A5A52", fontWeight: 400 }}>· optional</span>
            </label>
            <input
              id="ps"
              type="text"
              value={ps}
              onChange={(e) => setPs(e.target.value)}
              placeholder="The book we talked about: 'Reciprocity is the Way' by Bret Hart."
              style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #E5E1D8", fontSize: 15, fontFamily: "inherit", color: "#0A0F1C", boxSizing: "border-box" }}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            style={{ width: "100%", padding: "14px 24px", borderRadius: 100, border: "none", background: busy ? "#5A5A52" : "#0B6E23", color: "#FAF8F3", fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: busy ? "wait" : "pointer", transition: "background 0.2s" }}
          >
            {busy ? "Sending…" : "Send the email →"}
          </button>

        </form>

        {result && (
          <div style={{ background: result.ok ? "#0B6E23" : "#B23A2E", color: "#FAF8F3", padding: 20, borderRadius: 10, marginBottom: 24, lineHeight: 1.55 }}>
            {result.ok ? (
              <>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 8, opacity: 0.85 }}>Sent ✓</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Subject: {result.subject}</div>
                {result.snapshot_link && (
                  <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85, wordBreak: "break-all" }}>
                    Their Snapshot link: <a href={result.snapshot_link} style={{ color: "#FAF8F3", textDecoration: "underline" }}>{result.snapshot_link}</a>
                  </div>
                )}
                <div style={{ fontSize: 13, marginTop: 12, opacity: 0.9 }}>
                  When they click through and sign up, the 5-day drip starts automatically.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 8, opacity: 0.85 }}>Error</div>
                <div style={{ fontSize: 14 }}>{result.error}</div>
              </>
            )}
          </div>
        )}

        <div style={{ background: "#F0EDE5", padding: 18, borderRadius: 10, fontSize: 13, lineHeight: 1.65, color: "#5A5A52" }}>
          <strong style={{ color: "#0A0F1C" }}>What this triggers:</strong>
          <ol style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>Personal "After our call" email goes out now.</li>
            <li>The Snapshot link in the email is prefilled with their email + name.</li>
            <li>When they sign up, /auth/callback sends Day 0 (Welcome) and sets onboarding_email_step = 1.</li>
            <li>The daily cron picks them up tomorrow → Day 1 (Content) → Day 2 (Pipeline) → Day 3 (Sessions) → Day 4 (Automations).</li>
          </ol>
        </div>

      </div>
    </div>
  );
}
