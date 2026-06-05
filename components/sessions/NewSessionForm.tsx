"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SessionBrief from "@/components/sessions/SessionBrief";

type Client = { id: string; full_name: string };

type Props = {
  clients: Client[];
};

export default function NewSessionForm({ clients }: Props) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [sessionDate, setSessionDate] = useState(todayISO());
  const [durationMinutes, setDurationMinutes] = useState("");
  const [rawNotes, setRawNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);

  async function handleSubmit() {
    if (!clientId || !rawNotes.trim()) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          session_date: new Date(sessionDate).toISOString(),
          duration_minutes: durationMinutes ? Number(durationMinutes) : undefined,
          raw_notes: rawNotes.trim(),
          transcript: transcript.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not save session.");
        setSaving(false);
        return;
      }

      // Navigate to the new session detail
      router.push(`/sessions/${data.session.id}`);
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/sessions"
        className="inline-flex items-center gap-1.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition"
      >
        <ArrowLeft size={14} />
        Back to sessions
      </Link>

      {/* Title */}
      <div>
        <h1 className="text-[length:var(--t-h1)] font-extrabold text-[color:var(--text)]">
          Capture session
        </h1>
        <p className="mt-1 text-[length:var(--t-body)] text-[color:var(--text-muted)]">
          Write what you noticed. The patterns will find themselves.
        </p>
      </div>

      {/* Client + date row */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Client selector */}
        <div>
          <label className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1.5">
            Client
          </label>
          <div className="relative">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full appearance-none min-h-11 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 pr-9 text-[length:var(--t-body)] outline-none focus:border-[var(--brand-strong)] transition"
            >
              <option value="">Select a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)] pointer-events-none"
            />
          </div>
        </div>

        {/* Date + duration */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full min-h-11 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-body)] outline-none focus:border-[var(--brand-strong)] transition"
            />
          </div>
          <div>
            <label className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1.5">
              Duration
            </label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="min"
              min={1}
              max={300}
              className="w-full min-h-11 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-body)] outline-none focus:border-[var(--brand-strong)] transition placeholder:text-[color:var(--text-muted)]"
            />
          </div>
        </div>
      </div>

      {/* Pre-session brief (appears when client is selected) */}
      {clientId && selectedClient && (
        <SessionBrief
          clientId={clientId}
          clientName={selectedClient.full_name}
        />
      )}

      {/* The notepad */}
      <Card variant="flat" padding="none">
        <textarea
          value={rawNotes}
          onChange={(e) => setRawNotes(e.target.value)}
          rows={14}
          className="w-full p-5 bg-transparent text-[length:var(--t-body)] text-[color:var(--text)] leading-relaxed outline-none resize-none placeholder:text-[color:var(--text-muted)]"
          placeholder="What happened in the session?

What did you notice in their body? Where was the energy?
What did they commit to? What are they avoiding?
What surprised you?

Write freely. The AI will find the structure."
        />
      </Card>

      {/* Optional transcript toggle */}
      <div>
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition"
        >
          {showTranscript ? "Hide transcript field" : "+ Paste a transcript (optional)"}
        </button>
        {showTranscript && (
          <Card variant="flat" padding="none" className="mt-2">
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={8}
              className="w-full p-5 bg-transparent text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-relaxed outline-none resize-none font-mono text-sm placeholder:text-[color:var(--text-muted)]"
              placeholder="Paste a Granola or Zoom transcript here..."
            />
          </Card>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-[length:var(--t-body)] text-[color:var(--danger)] font-bold">
          {error}
        </p>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          disabled={!clientId || !rawNotes.trim() || saving}
          leadingIcon={
            saving ? (
              <Sparkles size={15} className="animate-pulse" />
            ) : (
              <Check size={15} />
            )
          }
        >
          {saving ? "Saving..." : "Save session"}
        </Button>
        <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          Saved to this client&apos;s timeline
        </span>
      </div>
    </div>
  );
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
