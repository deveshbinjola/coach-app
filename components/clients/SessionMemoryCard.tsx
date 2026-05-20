"use client";

import { useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { ClientRoom, ClientSession, ClientTask } from "@/lib/types";

type Props = {
  room: ClientRoom;
  onSessionAdded: (session: ClientSession, tasks: ClientTask[], room?: ClientRoom) => void;
  onError: (message: string) => void;
};

export default function SessionMemoryCard({ room, onSessionAdded, onError }: Props) {
  const [title, setTitle] = useState("Session note");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function addSession() {
    if (!note.trim()) return;
    setSaving(true);
    const response = await fetch("/api/clients/session-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientRoomId: room.id,
        title: title.trim() || "Session note",
        notes: note.trim(),
      }),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      onError(String(payload?.error ?? "Could not save session memory."));
      return;
    }
    onSessionAdded(
      payload.session as ClientSession,
      Array.isArray(payload.tasks) ? (payload.tasks as ClientTask[]) : [],
      payload.room as ClientRoom | undefined
    );
    setNote("");
    setTitle("Session note");
    setSuccess(true);
    window.setTimeout(() => setSuccess(false), 3500);
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
            Session memory
          </h3>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            Paste notes or a transcript. The room pulls out the next move.
          </p>
        </div>
        <Sparkles size={17} className="text-[color:var(--brand-strong)]" aria-hidden />
      </div>
      <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-11 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
          placeholder="Session title"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[length:var(--t-body)] outline-none focus:border-[var(--brand-strong)]"
          placeholder="What changed? What did they commit to? What needs follow-up?"
        />
      </div>
      <Button
        onClick={addSession}
        disabled={!note.trim() || saving}
        leadingIcon={saving ? <Sparkles size={15} className="animate-pulse" /> : <Plus size={15} />}
      >
        {saving ? "AI is extracting insights…" : "Add session memory"}
      </Button>
      {success && (
        <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[var(--brand-soft)] px-3 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--brand-strong)] animate-in fade-in slide-in-from-bottom-1">
          <Check size={14} aria-hidden />
          Session saved — wins, blockers, and homework extracted.
        </div>
      )}
    </Card>
  );
}
