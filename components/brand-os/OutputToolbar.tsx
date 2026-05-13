"use client";

// OutputToolbar — client wrapper for the Brand OS output page actions.
// Lives in its own file because the output page is a server component and
// can't pass onClick handlers to client components inline.

import { useState } from "react";
import { Button } from "@/components/ui";

export default function OutputToolbar({
  runId, defaultEmail,
}: {
  runId: string;
  defaultEmail: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/brand-os/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setStatus("Sent — check your inbox.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => window.print()} variant="ghost">
        Print / Save PDF
      </Button>
      <form onSubmit={sendEmail} className="flex items-center gap-2 flex-wrap">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email this to me"
          className="h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-caption)] focus:border-[var(--brand-strong)] focus:outline-none"
          required
        />
        <Button type="submit" disabled={sending || !email}>
          {sending ? "Sending…" : "Email me"}
        </Button>
      </form>
      {status && (
        <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">{status}</span>
      )}
    </div>
  );
}
