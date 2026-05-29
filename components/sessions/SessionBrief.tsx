"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";

type Props = {
  clientId: string;
  clientName: string;
};

type InsightsData = {
  total_sessions: number;
  recurring_topics: Array<{ topic: string; count: number }>;
  patterns: string[];
  open_commitments: string[];
  pre_session_brief: string | null;
};

export default function SessionBrief({ clientId, clientName }: Props) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/insights?client_id=${clientId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silent
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <div className="h-4 bg-[var(--surface-deep)] rounded w-1/3 mb-3" />
        <div className="h-3 bg-[var(--surface-deep)] rounded w-full mb-2" />
        <div className="h-3 bg-[var(--surface-deep)] rounded w-2/3" />
      </Card>
    );
  }

  if (!data || data.total_sessions === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={15} className="text-[color:var(--brand-strong)]" aria-hidden />
          <h3 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)]">
            Pre-session brief
          </h3>
        </div>
        <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)]">
          No previous sessions with {clientName}. The brief builds after the first session.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-[color:var(--brand-strong)]" aria-hidden />
          <h3 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)]">
            Pre-session brief
          </h3>
        </div>
        <button
          onClick={load}
          className="p-1.5 rounded-[var(--r-sm)] text-[color:var(--text-muted)] hover:text-[color:var(--text)] hover:bg-[var(--surface-deep)] transition"
          aria-label="Refresh brief"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* The brief */}
      {data.pre_session_brief && (
        <div className="text-[length:var(--t-body)] text-[color:var(--text)] leading-relaxed whitespace-pre-line mb-4">
          {data.pre_session_brief}
        </div>
      )}

      {/* Open commitments */}
      {data.open_commitments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-2">
            Open commitments
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

      {/* Session count */}
      <p className="mt-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
        {data.total_sessions} session{data.total_sessions === 1 ? "" : "s"} recorded
      </p>
    </Card>
  );
}
