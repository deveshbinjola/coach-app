"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { ClientSession } from "@/lib/types";

type Props = {
  sessions: ClientSession[];
};

export default function ClientTimeline({ sessions }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyFollowUp(session: ClientSession) {
    if (!session.follow_up_draft) return;
    await navigator.clipboard.writeText(session.follow_up_draft);
    setCopiedId(session.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="border-b border-[var(--border-faint)] px-4 py-4 sm:px-5">
        <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">Timeline</h3>
      </div>
      {sessions.length === 0 ? (
        <p className="px-5 py-8 text-center text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          No session notes yet.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-faint)]">
          {sessions.map((session) => (
            <article key={session.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                  {session.title}
                </h4>
                <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)]">
                  {new Date(session.session_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                {session.notes}
              </p>
              {(session.wins.length > 0 ||
                session.blockers.length > 0 ||
                session.commitments.length > 0 ||
                session.content_ideas.length > 0) && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MemoryList title="Wins" items={session.wins} />
                  <MemoryList title="Blockers" items={session.blockers} />
                  <MemoryList title="Homework" items={session.commitments} />
                  <MemoryList title="Content seeds" items={session.content_ideas} />
                </div>
              )}
              {session.follow_up_draft ? (
                <div className="mt-3 rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                      Follow-up draft
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => copyFollowUp(session)} leadingIcon={<Copy size={13} />}>
                      {copiedId === session.id ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text)]">
                    {session.follow_up_draft}
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function MemoryList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-[var(--r-md)] bg-[var(--surface-deep)] p-3">
      <div className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
        {title}
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item} className="text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
