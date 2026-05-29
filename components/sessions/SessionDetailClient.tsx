"use client";

import { Calendar, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { CoachingSession } from "@/lib/session-intelligence";

type Props = {
  session: CoachingSession;
  clientName: string;
};

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function SessionDetailClient({ session, clientName }: Props) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition mb-3"
        >
          <ArrowLeft size={14} />
          Back to sessions
        </Link>

        <h1 className="text-[length:var(--t-h1)] font-extrabold text-[color:var(--text)]">
          {clientName}
        </h1>
        <div className="flex items-center gap-3 mt-1 text-[length:var(--t-body)] text-[color:var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <Calendar size={14} aria-hidden />
            {formatFullDate(session.session_date)}
          </span>
          {session.duration_minutes && (
            <span className="flex items-center gap-1.5">
              <Clock size={14} aria-hidden />
              {session.duration_minutes} minutes
            </span>
          )}
        </div>
      </div>

      {/* AI Summary */}
      {session.ai_summary && (
        <Card>
          <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] mb-2">
            Summary
          </h2>
          <p className="text-[length:var(--t-body)] text-[color:var(--text)] leading-relaxed">
            {session.ai_summary}
          </p>
        </Card>
      )}

      {/* Key topics */}
      {session.key_topics.length > 0 && (
        <Card>
          <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] mb-3">
            Key topics
          </h2>
          <div className="flex flex-wrap gap-2">
            {session.key_topics.map((topic) => (
              <Badge key={topic} tone="neutral" size="sm">
                {topic}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Commitments */}
      {session.commitments.length > 0 && (
        <Card>
          <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] mb-3">
            Commitments
          </h2>
          <ul className="space-y-2">
            {session.commitments.map((c, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-[length:var(--t-body)] text-[color:var(--text)]"
              >
                <span className="w-5 h-5 rounded-full border-2 border-[var(--brand)] shrink-0 mt-0.5" />
                {c}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Somatic observations */}
      {session.somatic_observations.length > 0 && (
        <Card>
          <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] mb-3">
            Somatic observations
          </h2>
          <ul className="space-y-2">
            {session.somatic_observations.map((obs, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-[length:var(--t-body)] text-[color:var(--text)]"
              >
                <span className="text-[color:var(--brand-strong)] mt-0.5 shrink-0">~</span>
                {obs}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Patterns flagged */}
      {session.patterns_flagged.length > 0 && (
        <Card>
          <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] mb-3">
            Patterns noticed
          </h2>
          <ul className="space-y-2">
            {session.patterns_flagged.map((pattern, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-[length:var(--t-body)] text-[color:var(--warning)]"
              >
                <span className="shrink-0 mt-0.5">*</span>
                <span className="text-[color:var(--text)]">{pattern}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Raw notes */}
      <Card>
        <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] mb-3">
          Session notes
        </h2>
        <div className="text-[length:var(--t-body)] text-[color:var(--text)] leading-relaxed whitespace-pre-wrap font-mono text-sm bg-[var(--surface-deep)] rounded-[var(--r-md)] p-4 max-h-96 overflow-y-auto">
          {session.raw_notes}
        </div>
      </Card>

      {/* Transcript (if present) */}
      {session.transcript && (
        <Card>
          <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] mb-3">
            Transcript
          </h2>
          <div className="text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-relaxed whitespace-pre-wrap font-mono text-sm bg-[var(--surface-deep)] rounded-[var(--r-md)] p-4 max-h-96 overflow-y-auto">
            {session.transcript}
          </div>
        </Card>
      )}
    </div>
  );
}
