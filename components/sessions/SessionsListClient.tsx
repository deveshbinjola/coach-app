"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import SessionCard from "@/components/sessions/SessionCard";
import type { CoachingSession } from "@/lib/session-intelligence";

type Props = {
  sessions: CoachingSession[];
  clientMap: Record<string, string>;
};

export default function SessionsListClient({ sessions, clientMap }: Props) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? sessions.filter((s) => {
        const q = search.toLowerCase();
        const name = (clientMap[s.client_id] ?? "").toLowerCase();
        const topics = s.key_topics.join(" ").toLowerCase();
        const summary = (s.ai_summary ?? "").toLowerCase();
        return name.includes(q) || topics.includes(q) || summary.includes(q);
      })
    : sessions;

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-4">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]"
          aria-hidden
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions by client, topic, or summary..."
          className="w-full pl-9 pr-4 py-2.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[length:var(--t-body)] outline-none focus:border-[var(--brand-strong)] transition placeholder:text-[color:var(--text-muted)]"
        />
      </div>

      {/* Session cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)]">
            {sessions.length === 0
              ? "No sessions yet. Capture your first coaching session."
              : "No sessions match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              clientName={clientMap[session.client_id] ?? "Unknown client"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
