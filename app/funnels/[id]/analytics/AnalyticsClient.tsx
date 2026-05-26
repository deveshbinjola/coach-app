// AnalyticsClient — per-question quiz analytics with drop-off funnel,
// choice distribution bars, and result archetype breakdown.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Users, TrendingDown } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

type ChoiceStat = {
  key: string;
  text: string;
  count: number;
  percent: number;
};

type QuestionStat = {
  questionIndex: number;
  questionId: string;
  questionText: string;
  responseCount: number;
  dropOff: number;
  choices: ChoiceStat[];
};

type ResultStat = {
  key: string;
  pillarName: string;
  count: number;
  percent: number;
};

type AnalyticsData = {
  totalResponses: number;
  perQuestion: QuestionStat[];
  resultDistribution: ResultStat[];
};

type Props = {
  funnelId: string;
  funnelTitle: string;
  funnelSlug: string;
};

export default function AnalyticsClient({ funnelId, funnelTitle, funnelSlug }: Props) {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/funnels/${funnelId}/analytics`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then(setData)
      .catch(() => setError("Failed to load analytics."))
      .finally(() => setLoading(false));
  }, [funnelId]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<ArrowLeft size={14} />}
          onClick={() => router.push("/funnels")}
        >
          Back
        </Button>
        <div className="min-w-0">
          <h1 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] truncate">
            {funnelTitle}
          </h1>
          <p className="text-xs text-[color:var(--text-muted)] font-mono">/q/{funnelSlug}</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="inline-block w-8 h-8 border-2 border-[var(--brand-strong)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <Card padding="lg" className="text-center">
          <p className="text-[color:var(--danger)] font-semibold">{error}</p>
        </Card>
      )}

      {data && !loading && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard
              icon={<Users size={20} />}
              label="Total responses"
              value={data.totalResponses.toLocaleString()}
            />
            <SummaryCard
              icon={<BarChart3 size={20} />}
              label="Questions"
              value={String(data.perQuestion.length)}
            />
            <SummaryCard
              icon={<TrendingDown size={20} />}
              label="Completion rate"
              value={completionRate(data)}
            />
          </div>

          {/* Result distribution */}
          {data.resultDistribution.length > 0 && (
            <Card padding="lg">
              <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] mb-4">
                Result distribution
              </h2>
              <div className="space-y-3">
                {data.resultDistribution.map((r) => (
                  <div key={r.key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-semibold text-[color:var(--text)]">{r.pillarName}</span>
                      <span className="text-[color:var(--text-muted)]">
                        {r.count} ({r.percent}%)
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-[var(--surface-deep)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--brand-strong)] transition-all duration-500"
                        style={{ width: `${r.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Per-question breakdown */}
          <div className="space-y-4">
            <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)]">
              Per-question breakdown
            </h2>
            {data.perQuestion.map((q) => (
              <Card key={q.questionId} padding="lg">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--text-muted)]">
                      Question {q.questionIndex}
                    </p>
                    <p className="text-sm font-semibold text-[color:var(--text)] mt-1">
                      {q.questionText}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-extrabold text-[color:var(--text)]">
                      {q.responseCount}
                    </p>
                    <p className="text-[10px] text-[color:var(--text-muted)] uppercase tracking-wider">
                      responses
                    </p>
                    {q.dropOff > 0 && (
                      <p className="text-[10px] text-[color:var(--danger)] font-bold mt-0.5">
                        ↓ {q.dropOff} dropped
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {q.choices.map((ch) => (
                    <div key={ch.key} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[color:var(--text-muted)] w-5 text-center shrink-0">
                        {ch.key.toUpperCase()}
                      </span>
                      <div className="flex-1">
                        <div className="h-6 rounded bg-[var(--surface-deep)] overflow-hidden relative">
                          <div
                            className="h-full rounded bg-[var(--brand-soft)] transition-all duration-500"
                            style={{ width: `${ch.percent}%` }}
                          />
                          <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-[color:var(--text)]">
                            {ch.text}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[color:var(--text-muted)] w-16 text-right shrink-0">
                        {ch.count} ({ch.percent}%)
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {data.totalResponses === 0 && (
            <Card padding="lg" className="text-center">
              <p className="text-[color:var(--text-muted)]">
                No responses yet. Share your quiz to start collecting data.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card padding="lg" className="text-center">
      <div className="flex items-center justify-center text-[color:var(--text-muted)] mb-2">
        {icon}
      </div>
      <p className="text-2xl font-extrabold text-[color:var(--text)]">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mt-1">
        {label}
      </p>
    </Card>
  );
}

function completionRate(data: AnalyticsData): string {
  if (data.perQuestion.length === 0) return "--";
  const first = data.perQuestion[0].responseCount;
  const last = data.perQuestion[data.perQuestion.length - 1].responseCount;
  if (first === 0) return "--";
  return `${Math.round((last / first) * 100)}%`;
}
