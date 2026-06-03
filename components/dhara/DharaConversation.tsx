"use client";

import { useState } from "react";
import { useDhara } from "@/components/dhara/DharaProvider";
import SpeakOrType from "@/components/voice/SpeakOrType";
import DharaMemoryView from "@/components/dhara/DharaMemoryView";

export default function DharaConversation({ onClose }: { onClose: () => void }) {
  const { messages, sending, send, suggestions, lastLearned, runSuggestion } = useDhara();
  const [tab, setTab] = useState<"talk" | "memory">("talk");
  const [draft, setDraft] = useState("");

  const submit = () => { const t = draft.trim(); if (!t || sending) return; setDraft(""); void send(t); };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-faint)]">
        <div className="flex items-center gap-2 font-extrabold text-[14px]">
          <span className="h-2 w-2 rounded-full bg-[var(--brand)]" /> Dhara
        </div>
        <div className="flex items-center gap-1">
          {(["talk", "memory"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${tab === t ? "bg-[var(--navy)] text-white" : "text-[color:var(--text-muted)]"}`}>
              {t === "talk" ? "Talk" : "What I remember"}
            </button>
          ))}
          <button onClick={onClose} className="ml-1 text-[color:var(--text-faint)] hover:text-[color:var(--text)] px-1.5" aria-label="Close">&#10005;</button>
        </div>
      </div>

      {tab === "memory" ? (
        <DharaMemoryView />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">Take a breath. What&apos;s on your mind?</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-[var(--r-md)] px-3 py-2 text-[length:var(--t-body)] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-[var(--navy)] text-white" : "bg-[var(--surface-deep)] text-[color:var(--text)]"}`}>
                  {m.content || (m.streaming ? "…" : "")}
                </div>
              </div>
            ))}
            {lastLearned.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lastLearned.map((l) => (
                  <span key={l.id} className="text-[11px] text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-1">&#10003; Remembered: {l.text}</span>
                ))}
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => s.enabled ? (
                  <button key={i} onClick={() => runSuggestion(s)} className="text-[11px] font-extrabold rounded-full px-3 py-1.5 border border-[var(--brand)] text-[color:var(--brand-strong)] hover:bg-[var(--brand-soft)]">{s.label} &rarr;</button>
                ) : (
                  <span key={i} className="text-[11px] font-extrabold rounded-full px-3 py-1.5 border border-dashed border-[var(--border)] text-[color:var(--text-faint)]">{s.label} &middot; soon</span>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-[var(--border-faint)] p-3">
            <SpeakOrType value={draft} onChange={setDraft} placeholder="Talk to Dhara, or just say it&hellip;" minRows={2} maxLength={4000} disabled={sending} />
            <button onClick={submit} disabled={sending || !draft.trim()}
              className="mt-2 w-full rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] font-extrabold text-[14px] py-2.5 disabled:opacity-40">
              {sending ? "…" : "Send"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
