// /admin/outreach · post-call outreach + history view
//
// Top half: form to send the personalized "After our call" email.
// Bottom half: table of everyone Sunny has reached out to, with signup +
// drip + Snapshot status pulled from cp_outreach_log + cp_coaches +
// cp_brand_os_runs.

"use client";

import { useCallback, useEffect, useState } from "react";

type HistoryRow = {
  id: string;
  sent_at: string;
  email: string;
  first_name: string | null;
  note: string | null;
  signed_up: boolean;
  signed_up_at: string | null;
  drip_step: number;
  last_drip_at: string | null;
  snapshot_state: "none" | "in_progress" | "completed";
  archetype: string | null;
  snapshot_run_id: string | null;
};

type HistoryResponse = {
  outreach: HistoryRow[];
  total: number;
  signed_up_count: number;
  snapshot_done_count: number;
};

export default function OutreachPage() {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [ps, setPs] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; subject?: string; error?: string; snapshot_link?: string }>(null);

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/outreach-history");
      if (res.ok) {
        const json = (await res.json()) as HistoryResponse;
        setHistory(json);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

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
        void loadHistory();
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F3", color: "#0A0F1C", padding: "48px 16px 96px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* Hero */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "2.5px", textTransform: "uppercase", color: "#0B6E23", fontWeight: 700, marginBottom: 8 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: "#0B6E23", borderRadius: "50%", verticalAlign: "middle", marginRight: 8 }}></span>
            Admin · Outreach
          </div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
            After a call.
          </h1>
          <p style={{ margin: "12px 0 0", color: "#5A5A52", fontSize: 16, lineHeight: 1.55, maxWidth: 480 }}>
            Paste their name + email. Optionally the one alive thing they said. Hit send. The 5-day drip starts automatically when they sign up.
          </p>
        </div>

        {/* KPI row */}
        {history && history.total > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            <Kpi label="Total outreach" value={history.total} />
            <Kpi label="Signed up" value={history.signed_up_count} valueColor="#0B6E23" />
            <Kpi label="Snapshot complete" value={history.snapshot_done_count} valueColor="#0B6E23" />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSend} style={{ background: "#FFFFFF", border: "1px solid #E5E1D8", borderRadius: 14, padding: 28, marginBottom: 24, maxWidth: 640 }}>

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
              style={inputStyle}
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
              style={inputStyle}
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
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
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
              placeholder="The book we talked about: ..."
              style={inputStyle}
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
          <div style={{ background: result.ok ? "#0B6E23" : "#B23A2E", color: "#FAF8F3", padding: 20, borderRadius: 10, marginBottom: 32, lineHeight: 1.55, maxWidth: 640 }}>
            {result.ok ? (
              <>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 8, opacity: 0.85 }}>Sent ✓</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Subject: {result.subject}</div>
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

        {/* History */}
        <div style={{ marginTop: 48 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "2px", textTransform: "uppercase", color: "#0A0F1C", fontWeight: 700 }}>
              Recent outreach
            </h2>
            <button
              onClick={() => void loadHistory()}
              disabled={historyLoading}
              style={{ background: "transparent", border: "none", color: "#0B6E23", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              {historyLoading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>

          {history && history.outreach.length === 0 && (
            <div style={{ background: "#F0EDE5", borderRadius: 10, padding: 24, textAlign: "center", color: "#5A5A52", fontSize: 14 }}>
              No outreach sent yet. Send your first one above.
            </div>
          )}

          {history && history.outreach.length > 0 && (
            <div style={{ background: "#FFFFFF", border: "1px solid #E5E1D8", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: "#F0EDE5", borderBottom: "1px solid #E5E1D8" }}>
                      <th style={thStyle}>Sent</th>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Signed up?</th>
                      <th style={thStyle}>Drip day</th>
                      <th style={thStyle}>Snapshot</th>
                      <th style={thStyle}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.outreach.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #F0EDE5" }}>
                        <td style={tdStyle}>{formatRelative(r.sent_at)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{r.first_name ?? "—"}</td>
                        <td style={{ ...tdStyle, color: "#5A5A52", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{r.email}</td>
                        <td style={tdStyle}>
                          {r.signed_up ? (
                            <Badge color="#0B6E23" bg="#E8F3E8">Signed up</Badge>
                          ) : (
                            <Badge color="#5A5A52" bg="#F0EDE5">No</Badge>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {r.drip_step === 0 ? "—" :
                           r.drip_step === 99 ? <Badge color="#B23A2E" bg="#FCE7E4">Stopped</Badge> :
                           r.drip_step === 5 ? <Badge color="#0B6E23" bg="#E8F3E8">Done</Badge> :
                           <Badge color="#0A0F1C" bg="#F0EDE5">Day {r.drip_step}/5</Badge>}
                        </td>
                        <td style={tdStyle}>
                          {r.snapshot_state === "completed" ? (
                            <Badge color="#0B6E23" bg="#E8F3E8">{r.archetype ?? "Done"}</Badge>
                          ) : r.snapshot_state === "in_progress" ? (
                            <Badge color="#0A0F1C" bg="#FFF4D6">In progress</Badge>
                          ) : (
                            <span style={{ color: "#5A5A52" }}>—</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: "#5A5A52", maxWidth: 240 }} title={r.note ?? ""}>
                          {r.note ? truncate(r.note, 60) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
  fontFamily: "inherit",
  color: "#0A0F1C",
  boxSizing: "border-box",
  background: "#FFFFFF",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: "#5A5A52",
  fontWeight: 700,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  verticalAlign: "top",
  color: "#0A0F1C",
};

function Kpi({ label, value, valueColor }: { label: string; value: number; valueColor?: string }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E5E1D8", borderRadius: 10, padding: "14px 18px" }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: "#5A5A52", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: valueColor ?? "#0A0F1C", letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 700, background: bg, color, letterSpacing: "0.3px" }}>
      {children}
    </span>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  const diffDays = Math.floor(diffMin / 1440);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
