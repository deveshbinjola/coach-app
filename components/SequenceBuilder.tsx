"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import SequenceStepEditor, { type StepData } from "@/components/SequenceStepEditor";
import type { Sequence, SequenceStep } from "@/lib/types";

type Props = {
  sequence: Sequence;
  initialSteps: SequenceStep[];
};

const TRIGGER_OPTIONS = [
  { value: "quiz_completed", label: "Quiz completed" },
  { value: "status_change", label: "Status change" },
];

const STATUS_OPTIONS = ["contacted", "qualified", "booked", "client", "closed_lost"];

export default function SequenceBuilder({ sequence: initialSeq, initialSteps }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialSeq.name);
  const [triggerType, setTriggerType] = useState(initialSeq.trigger_type);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    initialSeq.trigger_config ?? {}
  );
  const [isActive, setIsActive] = useState(initialSeq.is_active);
  const [steps, setSteps] = useState<StepData[]>(
    initialSteps.map((s) => ({
      id: s.id,
      position: s.position,
      delay_minutes: s.delay_minutes,
      content_mode: s.content_mode,
      action_config: s.action_config as StepData["action_config"],
      ai_prompt: s.ai_prompt,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  // ── Save ───────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      // Update sequence metadata.
      const { error: seqErr } = await supabase
        .from("cp_sequences")
        .update({
          name,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
        })
        .eq("id", initialSeq.id);

      if (seqErr) throw new Error(seqErr.message);

      // Batch replace steps: delete all, insert fresh.
      await supabase
        .from("cp_sequence_steps")
        .delete()
        .eq("sequence_id", initialSeq.id);

      if (steps.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const rows = steps.map((step, i) => ({
          sequence_id: initialSeq.id,
          coach_id: user!.id,
          position: i + 1,
          delay_minutes: step.delay_minutes,
          action_type: "send_email",
          content_mode: step.content_mode,
          action_config: step.action_config,
          ai_prompt: step.ai_prompt,
        }));

        const { error: stepErr } = await supabase
          .from("cp_sequence_steps")
          .insert(rows);

        if (stepErr) throw new Error(stepErr.message);
      }

      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [name, triggerType, triggerConfig, steps, initialSeq.id, supabase, router]);

  // ── Activate / Deactivate ──────────────────────────────────

  const handleToggleActive = useCallback(async () => {
    setActivating(true);
    setError("");
    try {
      // Save first.
      await handleSave();

      const newActive = !isActive;

      // Validate before activating.
      if (newActive) {
        if (steps.length === 0) {
          setError("Add at least one step before activating.");
          setActivating(false);
          return;
        }
        for (const step of steps) {
          if (step.content_mode === "template") {
            if (!step.action_config.subject || !step.action_config.body_html) {
              setError("All template steps need a subject and body.");
              setActivating(false);
              return;
            }
          } else if (!step.ai_prompt) {
            setError("All AI draft steps need a prompt.");
            setActivating(false);
            return;
          }
        }
      }

      const { error: actErr } = await supabase
        .from("cp_sequences")
        .update({ is_active: newActive })
        .eq("id", initialSeq.id);

      if (actErr) throw new Error(actErr.message);
      setIsActive(newActive);
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setActivating(false);
    }
  }, [isActive, steps, handleSave, initialSeq.id, supabase, router]);

  // ── Step management ────────────────────────────────────────

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        position: prev.length + 1,
        delay_minutes: prev.length === 0 ? 0 : 1440,
        content_mode: "template",
        action_config: { subject: "", body_html: "" },
        ai_prompt: null,
      },
    ]);
  }

  function updateStep(index: number, updated: StepData) {
    setSteps((prev) => prev.map((s, i) => (i === index ? updated : s)));
  }

  function deleteStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-6">
        <a
          href="/sequences"
          className="flex items-center gap-1 text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition"
        >
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back to sequences
        </a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 h-10 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:border-[var(--border-strong)] transition disabled:opacity-50"
          >
            <Save size={14} strokeWidth={2.5} />
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={activating}
            className={`flex items-center gap-1.5 px-4 h-10 rounded-[var(--r-md)] text-[length:var(--t-caption)] font-bold transition disabled:opacity-50 ${
              isActive
                ? "border border-[var(--danger)] text-[color:var(--danger)] hover:bg-[var(--danger-soft)]"
                : "bg-[var(--brand)] text-[color:var(--navy)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
            }`}
          >
            <Zap size={14} strokeWidth={2.5} />
            {activating ? "..." : isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-[var(--r-md)] bg-[var(--danger-soft)] text-[length:var(--t-caption)] text-[color:var(--danger)] font-bold">
          {error}
        </div>
      )}

      {/* Name + trigger config */}
      <div className="bg-[var(--surface-elevated)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1">
              Sequence Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Quiz Welcome Flow"
              className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)] focus:border-[var(--brand)] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1">
              Trigger
            </label>
            <select
              value={triggerType}
              onChange={(e) => {
                setTriggerType(e.target.value as "quiz_completed" | "status_change");
                setTriggerConfig({});
              }}
              className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)]"
            >
              {TRIGGER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status change sub-config */}
        {triggerType === "status_change" && (
          <div className="mt-3">
            <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1">
              When status changes to
            </label>
            <select
              value={(triggerConfig.to_status as string) ?? ""}
              onChange={(e) =>
                setTriggerConfig(
                  e.target.value ? { to_status: e.target.value } : {}
                )
              }
              className="px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)]"
            >
              <option value="">Any status change</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="mb-4">
        {steps.map((step, i) => (
          <SequenceStepEditor
            key={`step-${i}`}
            step={step}
            index={i}
            isLast={i === steps.length - 1}
            onChange={(updated) => updateStep(i, updated)}
            onDelete={() => deleteStep(i)}
          />
        ))}
      </div>

      {/* Add step button */}
      <div className="flex gap-3">
        <div className="w-7 shrink-0" />
        <button
          type="button"
          onClick={addStep}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[color:var(--text)] transition"
        >
          <Plus size={16} strokeWidth={2.5} />
          Add Step
        </button>
      </div>
    </div>
  );
}
