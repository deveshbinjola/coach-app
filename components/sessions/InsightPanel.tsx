"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Target, Eye } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

type InsightsData = {
  total_sessions: number;
  recurring_topics: Array<{ topic: string; count: number }>;
  patterns: string[];
  open_commitments: string[];
  pre_session_brief: string | null;
};

export default function InsightPanel() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sessions/insights");
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // silent
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <div className="h-4 bg-[var(--surface-deep)] rounded w-1/2 mb-3" />
        <div className="h-3 bg-[var(--surface-deep)] rounded w-full mb-2" />
        <div className="h-3 bg-[var(--surface-deep)] rounded w-3/4 mb-2" />
        <div className="h-3 bg-[var(--surface-deep)] rounded w-1/2" />
      </Card>
    );
  }

  if (!data || data.total_sessions === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <Eye size={15} className="text-[color:var(--brand-strong)]" aria-hidden />
          <h3 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)]">
            Coaching patterns
          </h3>
        </div>
        <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)]">
          Patterns emerge after a few sessions. Start capturing session notes to see insights here.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Eye size={15} className="text-[color:var(--brand-strong)]" aria-hidden />
        <h3 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)]">
          Coaching patterns
        </h3>
        <Badge tone="brand" size="xs">
          {data.total_sessions} sessions
        </Badge>
      </div>

      {/* Recurring topics */}
      {data.recurring_topics.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={13} className="text-[color:var(--text-muted)]" aria-hidden />
            <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
              Recurring themes
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.recurring_topics.map(({ topic, count }) => (
              <Badge key={topic} tone="neutral" size="sm">
                {topic}
                <span className="ml-1 text-[color:var(--text-muted)]">{count}x</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Patterns flagged */}
      {data.patterns.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={13} className="text-[color:var(--text-muted)]" aria-hidden />
            <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
              Patterns noticed
            </p>
          </div>
          <ul className="space-y-1.5">
            {data.patterns.slice(0, 5).map((pattern, i) => (
              <li
                key={i}
                className="text-[length:var(--t-body)] text-[color:var(--text)] flex items-start gap-2"
              >
                <span className="text-[color:var(--warning)] mt-0.5 shrink-0">*</span>
                {pattern}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Open commitments across all clients */}
      {data.open_commitments.length > 0 && (
        <div className="pt-3 border-t border-[var(--border)]">
          <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-2">
            Recent commitments to follow up
          </p>
          <ul className="space-y-1">
            {data.open_commitments.slice(0, 5).map((c, i) => (
              <li
                key={i}
                className="text-[length:var(--t-body)] text-[color:var(--text)] flex items-start gap-2"
              >
                <span className="text-[color:var(--brand-strong)] mt-0.5 shrink-0">-</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
