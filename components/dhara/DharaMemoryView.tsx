"use client";

import { useEffect, useState } from "react";

type Mem = { id: string; kind: string; text: string; source: string; confidence: string };

const CONF_LABEL: Record<string, string> = { candidate: "unconfirmed", repeated: "noticed again", confirmed: "confirmed" };

export default function DharaMemoryView() {
  const [memories, setMemories] = useState<Mem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => fetch("/api/dhara/memory").then((r) => r.ok ? r.json() : { memories: [] })
    .then((d) => setMemories(d.memories ?? [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const confirm = async (id: string) => { await fetch("/api/dhara/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, confirm: true }) }); load(); };
  const forget = async (id: string) => { await fetch("/api/dhara/memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); setMemories((m) => m.filter((x) => x.id !== id)); };

  if (loading) return <div className="flex-1 px-4 py-6 text-[length:var(--t-caption)] text-[color:var(--text-faint)]">Loading&hellip;</div>;
  if (memories.length === 0) return <div className="flex-1 px-4 py-6 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Nothing yet. As we talk, I&apos;ll remember what matters &mdash; and you can edit or forget any of it here.</div>;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      {memories.map((m) => (
        <div key={m.id} className="rounded-[var(--r-md)] border border-[var(--border-faint)] px-3 py-2.5">
          <div className="text-[length:var(--t-body)] text-[color:var(--text)]">{m.text}</div>
          <div className="flex items-center justify-between mt-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${m.confidence === "confirmed" ? "bg-[var(--brand-soft)] text-[color:var(--brand-strong)]" : "bg-[var(--surface-deep)] text-[color:var(--text-faint)]"}`}>
              {CONF_LABEL[m.confidence] ?? m.confidence}
            </span>
            <span className="flex gap-2 text-[11px] font-bold">
              {m.confidence !== "confirmed" && <button onClick={() => confirm(m.id)} className="text-[color:var(--brand-strong)]">Confirm</button>}
              <button onClick={() => forget(m.id)} className="text-[color:var(--text-muted)] hover:text-[color:var(--danger)]">Forget</button>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
