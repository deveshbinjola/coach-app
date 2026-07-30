"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type SequenceWithStats = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  step_count: number;
  stats: { enrolled: number; completed: number; failed: number };
};

type Props = {
  sequences: SequenceWithStats[];
};

const TRIGGER_LABELS: Record<string, string> = {
  quiz_completed: "Quiz completed",
  status_change: "Status change",
};

export default function SequenceList({ sequences: initial }: Props) {
  const router = useRouter();
  const [sequences] = useState(initial);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("cp_sequences")
        .insert({
          coach_id: user.id,
          name: "New Sequence",
          trigger_type: "quiz_completed",
          trigger_config: {},
          is_active: false,
        })
        .select("id")
        .single();

      if (error || !data) {
        console.error("Failed to create sequence:", error);
        return;
      }

      router.push(`/sequences/${data.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[length:var(--t-heading)] font-extrabold text-[color:var(--text)]">
            Sequences
          </h1>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">
            Automated email chains triggered by events
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 px-4 h-10 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] text-[length:var(--t-caption)] font-bold shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition disabled:opacity-50"
        >
          <Plus size={16} strokeWidth={2.5} />
          New Sequence
        </button>
      </div>

      {/* Sequence cards */}
      {sequences.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-12 text-center">
          <Zap size={32} className="mx-auto mb-3 text-[color:var(--text-muted)]" />
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] font-bold">
            Create your first sequence to start automating follow-ups
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sequences.map((seq) => (
            <a
              key={seq.id}
              href={`/sequences/${seq.id}`}
              className="block bg-[var(--surface-elevated)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition"
              style={{
                borderLeftWidth: "3px",
                borderLeftColor: seq.is_active
                  ? "var(--brand)"
                  : "var(--border)",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[length:var(--t-body)] font-bold text-[color:var(--text)] truncate">
                      {seq.name}
                    </span>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-[var(--r-sm)] text-[length:var(--t-micro)] font-bold ${
                        seq.is_active
                          ? "bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[color:var(--brand)]"
                          : "bg-[var(--surface-deep)] text-[color:var(--text-muted)]"
                      }`}
                    >
                      {seq.is_active ? "Active" : "Draft"}
                    </span>
                  </div>
                  <p className="text-[length:var(--t-micro)] text-[color:var(--text-muted)] mt-1">
                    Trigger: {TRIGGER_LABELS[seq.trigger_type] ?? seq.trigger_type}
                    {seq.trigger_type === "status_change" && seq.trigger_config?.to_status
                      ? ` → ${seq.trigger_config.to_status}`
                      : ""}
                    {" · "}
                    {seq.step_count} step{seq.step_count !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Stats */}
                {seq.stats.enrolled > 0 && (
                  <div className="flex gap-4 shrink-0 ml-4">
                    <div className="text-center">
                      <div className="text-[length:var(--t-heading)] font-extrabold text-[color:var(--brand)]">
                        {seq.stats.enrolled}
                      </div>
                      <div className="text-[length:var(--t-micro)] text-[color:var(--text-muted)]">
                        enrolled
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[length:var(--t-heading)] font-extrabold text-[color:var(--accent-indigo,#6366f1)]">
                        {seq.stats.completed}
                      </div>
                      <div className="text-[length:var(--t-micro)] text-[color:var(--text-muted)]">
                        completed
                      </div>
                    </div>
                    {seq.stats.failed > 0 && (
                      <div className="text-center">
                        <div className="text-[length:var(--t-heading)] font-extrabold text-[color:var(--danger)]">
                          {seq.stats.failed}
                        </div>
                        <div className="text-[length:var(--t-micro)] text-[color:var(--text-muted)]">
                          failed
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
