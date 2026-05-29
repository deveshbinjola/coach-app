"use client";

import Link from "next/link";
import { Calendar, Clock, MessageCircle } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { CoachingSession } from "@/lib/session-intelligence";

type Props = {
  session: CoachingSession;
  clientName: string;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SessionCard({ session, clientName }: Props) {
  const topicSlice = session.key_topics.slice(0, 3);
  const hasSomatic = session.somatic_observations.length > 0;

  return (
    <Link href={`/sessions/${session.id}`} className="block group">
      <Card className="transition hover:border-[var(--brand)] hover:shadow-[var(--shadow-sm)] group-hover:-translate-y-px">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Client name + date */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] truncate">
                {clientName}
              </span>
              <span className="flex items-center gap-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] shrink-0">
                <Calendar size={12} aria-hidden />
                {formatDate(session.session_date)}
              </span>
            </div>

            {/* AI summary */}
            {session.ai_summary && (
              <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] line-clamp-2 mb-2">
                {session.ai_summary}
              </p>
            )}

            {/* Topics */}
            {topicSlice.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topicSlice.map((topic) => (
                  <Badge key={topic} tone="neutral" size="xs">
                    {topic}
                  </Badge>
                ))}
                {session.key_topics.length > 3 && (
                  <Badge tone="muted" size="xs">
                    +{session.key_topics.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Right-side indicators */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {session.duration_minutes && (
              <span className="flex items-center gap-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                <Clock size={12} aria-hidden />
                {session.duration_minutes}m
              </span>
            )}
            {hasSomatic && (
              <Badge tone="brand" size="xs">
                somatic
              </Badge>
            )}
            {session.commitments.length > 0 && (
              <span className="flex items-center gap-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                <MessageCircle size={12} aria-hidden />
                {session.commitments.length}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
