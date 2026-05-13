"use client";

// EmailSendingPanel — /settings card for BYOK Resend.
//
// Three states:
//   1. Not connected, platform fallback ON   → "Connect your Resend (optional)"
//   2. Not connected, platform fallback OFF  → "Email sending requires a Resend key"
//   3. Connected                             → status + from picker + disconnect

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import type { CoachEmailConfigStatus } from "@/app/api/coach/email-config/route";

export default function EmailSendingPanel() {
  const [status, setStatus] = useState<CoachEmailConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Form state for connect flow
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/coach/email-config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json() as CoachEmailConfigStatus);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load status.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/coach/email-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, from_email: fromEmail, from_name: fromName }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.hint ? `${data.error} ${data.hint}` : (data?.error ?? `HTTP ${res.status}`);
        throw new Error(msg);
      }
      setApiKey(""); setFromEmail(""); setFromName("");
      await refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not connect.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeFrom(newFromEmail: string, newFromName: string) {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/coach/email-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_email: newFromEmail, from_name: newFromName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setSubmitting(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect your Resend key? Emails will fall back to Elevate's sender until you reconnect.")) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/coach/email-config", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not disconnect.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6 space-y-4">
      <Header />

      {loading && !status ? (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Loading…</p>
      ) : !status?.connected ? (
        <NotConnected
          status={status}
          apiKey={apiKey} setApiKey={setApiKey}
          fromEmail={fromEmail} setFromEmail={setFromEmail}
          fromName={fromName} setFromName={setFromName}
          onSubmit={connect}
          submitting={submitting}
          err={err}
        />
      ) : (
        <Connected
          status={status}
          onChangeFrom={changeFrom}
          onDisconnect={disconnect}
          submitting={submitting}
          err={err}
        />
      )}
    </Card>
  );
}

function Header() {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <h3 className="text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)]">Email sending</h3>
        <Badge tone="muted" size="xs" uppercase>BYOK · Resend</Badge>
      </div>
      <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
        Connect your Resend account so emails go out from <strong>your domain</strong> — Brand OS deliverables, newsletters, nurture sequences. Without this, emails use Elevate's fallback sender.
      </p>
    </div>
  );
}

// ── NOT CONNECTED ─────────────────────────────────────────

function NotConnected({
  status, apiKey, setApiKey, fromEmail, setFromEmail, fromName, setFromName,
  onSubmit, submitting, err,
}: {
  status: CoachEmailConfigStatus | null;
  apiKey: string; setApiKey: (s: string) => void;
  fromEmail: string; setFromEmail: (s: string) => void;
  fromName: string; setFromName: (s: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  err: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-2 border-t border-[var(--border)]">
      {status?.platform_fallback_available ? (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
          Fallback active: emails currently send from <code>brand-os@elevateaisystem.com</code>. Connect your own for full control.
        </p>
      ) : (
        <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">
          ⚠ No fallback configured. You need to connect Resend below to send any emails.
        </p>
      )}

      <Field label="Resend API key" hint="Starts with re_… · resend.com → API Keys → Create. Choose 'Sending access' if you want to limit scope.">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="re_xxxxxxxx_xxxxxxxxxxxxxxxxxx"
          className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] font-mono text-[length:var(--t-caption)] focus:border-[var(--brand-strong)] focus:outline-none"
          autoComplete="off"
          required
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="From email" hint="Must be on a verified domain in your Resend.">
          <input
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="you@yourdomain.com"
            className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
            required
          />
        </Field>
        <Field label="From name (optional)" hint="Shown to recipients as the sender name.">
          <input
            type="text"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Marcus Chen"
            className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
          />
        </Field>
      </div>

      {err && (
        <p className="text-[length:var(--t-caption)] text-[color:var(--danger)] whitespace-pre-wrap">{err}</p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
        <a
          href="https://resend.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          Open Resend dashboard ↗
        </a>
        <Button type="submit" disabled={submitting || !apiKey || !fromEmail}>
          {submitting ? "Verifying…" : "Connect Resend"}
        </Button>
      </div>
    </form>
  );
}

// ── CONNECTED ─────────────────────────────────────────────

function Connected({
  status, onChangeFrom, onDisconnect, submitting, err,
}: {
  status: CoachEmailConfigStatus;
  onChangeFrom: (fromEmail: string, fromName: string) => void;
  onDisconnect: () => void;
  submitting: boolean;
  err: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draftFrom, setDraftFrom] = useState(status.from_email ?? "");
  const [draftName, setDraftName] = useState(status.from_name ?? "");

  return (
    <div className="pt-2 border-t border-[var(--border)] space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Status" value={<><span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-strong)] mr-2" /> Connected</>} />
        <Stat label="API key" value={status.api_key_last4 ? `…${status.api_key_last4}` : "(stored)"} mono />
        <Stat label="From" value={status.from_name ? `${status.from_name} <${status.from_email}>` : status.from_email ?? "—"} />
        <Stat label="Verified domain" value={status.verified_domain ?? "—"} mono />
      </div>

      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setEditing(true)}>Change from address</Button>
          <Button variant="ghost" onClick={onDisconnect} disabled={submitting}>Disconnect</Button>
          {status.connected_at && (
            <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] ml-auto">
              Connected {new Date(status.connected_at).toLocaleDateString()}
            </span>
          )}
        </div>
      ) : (
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3">
          <Field label="From email" hint={status.available_domains.length > 0 ? `Verified: ${status.available_domains.join(", ")}` : "No verified domains found."}>
            <input
              type="email"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
            />
          </Field>
          <Field label="From name (optional)">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button onClick={() => { onChangeFrom(draftFrom, draftName); setEditing(false); }} disabled={submitting}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {err && <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">{err}</p>}

      {status.available_domains.length > 0 && (
        <div className="pt-2 border-t border-[var(--border)]">
          <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)] mb-1">All verified domains on this key</p>
          <div className="flex flex-wrap gap-1">
            {status.available_domains.map((d) => (
              <span key={d} className="font-mono text-[length:var(--t-caption)] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)]">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">{label}</span>
      {children}
      {hint && <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed block">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">{label}</p>
      <p className={`text-[color:var(--text)] ${mono ? "font-mono text-[length:var(--t-caption)]" : ""}`}>{value}</p>
    </div>
  );
}
