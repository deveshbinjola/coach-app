"use client";

import { Trash2 } from "lucide-react";

export type StepData = {
  id?: string;
  position: number;
  delay_minutes: number;
  content_mode: "template" | "ai_draft";
  action_config: {
    subject?: string;
    body_html?: string;
    reply_to?: string;
  };
  ai_prompt: string | null;
};

type Props = {
  step: StepData;
  index: number;
  isLast: boolean;
  onChange: (updated: StepData) => void;
  onDelete: () => void;
};

const DELAY_PRESETS = [
  { label: "Immediately", minutes: 0 },
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 1440 },
  { label: "2 days", minutes: 2880 },
  { label: "3 days", minutes: 4320 },
  { label: "7 days", minutes: 10080 },
];

export default function SequenceStepEditor({
  step,
  index,
  isLast,
  onChange,
  onDelete,
}: Props) {
  const isTemplate = step.content_mode === "template";
  const stepColor = isTemplate ? "var(--brand)" : "var(--accent-indigo, #6366f1)";

  function updateField<K extends keyof StepData>(key: K, value: StepData[K]) {
    onChange({ ...step, [key]: value });
  }

  function updateConfig(key: string, value: string) {
    onChange({
      ...step,
      action_config: { ...step.action_config, [key]: value },
    });
  }

  return (
    <div>
      {/* Step card with timeline connector */}
      <div className="flex gap-3">
        {/* Timeline indicator */}
        <div className="flex flex-col items-center w-7 shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[length:var(--t-micro)] font-extrabold"
            style={{ backgroundColor: stepColor, color: isTemplate ? "var(--navy)" : "#fff" }}
          >
            {index + 1}
          </div>
          {!isLast && (
            <div className="w-0.5 flex-1 bg-[var(--border)] mt-1 mb-1" />
          )}
        </div>

        {/* Step content */}
        <div
          className="flex-1 bg-[var(--surface-elevated)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 mb-3"
          style={{ borderLeftWidth: "3px", borderLeftColor: stepColor }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
                Send Email
              </span>
              {/* Mode toggle */}
              <select
                value={step.content_mode}
                onChange={(e) =>
                  updateField("content_mode", e.target.value as "template" | "ai_draft")
                }
                className="px-2 py-0.5 rounded-[var(--r-sm)] text-[length:var(--t-micro)] font-bold border border-[var(--border)] bg-[var(--surface-deep)] text-[color:var(--text)]"
              >
                <option value="template">Template</option>
                <option value="ai_draft">AI Draft</option>
              </select>
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-[var(--r-sm)] hover:bg-[var(--danger-soft)] text-[color:var(--text-muted)] hover:text-[color:var(--danger)] transition"
              title="Delete step"
            >
              <Trash2 size={14} strokeWidth={2.2} />
            </button>
          </div>

          {/* Content based on mode */}
          {isTemplate ? (
            <div className="space-y-2">
              <div>
                <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={step.action_config.subject ?? ""}
                  onChange={(e) => updateConfig("subject", e.target.value)}
                  placeholder="Welcome {{first_name}} — your results"
                  className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)] placeholder:text-[color:var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] mb-1">
                  Body (HTML)
                </label>
                <textarea
                  value={step.action_config.body_html ?? ""}
                  onChange={(e) => updateConfig("body_html", e.target.value)}
                  placeholder="<p>Hey {{first_name}}, thanks for taking the quiz!...</p>"
                  rows={4}
                  className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)] placeholder:text-[color:var(--text-muted)] focus:border-[var(--brand)] focus:outline-none resize-y"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] mb-1">
                AI Prompt
              </label>
              <textarea
                value={step.ai_prompt ?? ""}
                onChange={(e) => updateField("ai_prompt", e.target.value)}
                placeholder="Write a warm follow-up about their quiz results. Reference their Brand OS output. Invite them to a free session. Under 150 words."
                rows={3}
                className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)] placeholder:text-[color:var(--text-muted)] focus:border-[var(--brand)] focus:outline-none resize-y"
              />
            </div>
          )}

          {/* Delay selector */}
          <div className="mt-3 pt-3 border-t border-[var(--border-faint)]">
            <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] mb-1">
              Delay before this step
            </label>
            <select
              value={step.delay_minutes}
              onChange={(e) => updateField("delay_minutes", Number(e.target.value))}
              className="px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)]"
            >
              {DELAY_PRESETS.map((p) => (
                <option key={p.minutes} value={p.minutes}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Delay indicator between steps */}
      {!isLast && step.delay_minutes > 0 && (
        <div className="flex gap-3 mb-3">
          <div className="flex flex-col items-center w-7 shrink-0">
            <div className="w-4 h-4 rounded-full bg-[var(--surface-deep)] border border-[var(--border)] flex items-center justify-center text-[8px]">
              ⏱
            </div>
            <div className="w-0.5 flex-1 bg-[var(--border)] mt-1" />
          </div>
          <span className="text-[length:var(--t-micro)] text-[color:var(--text-muted)]">
            Wait {formatDelay(step.delay_minutes)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDelay(minutes: number): string {
  if (minutes === 0) return "immediately";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  const days = Math.round(minutes / 1440);
  return `${days} day${days !== 1 ? "s" : ""}`;
}
