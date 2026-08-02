"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type Props = {
  showAll: boolean;
  hasLead: boolean;
  hasVoice: boolean;
};

const MILESTONES = [
  { key: "lead", label: "Add your first lead", unlocks: "Voice tab" },
  { key: "voice", label: "Complete voice setup", unlocks: "Content tab" },
] as const;

export default function NavigationSettingsPanel({ showAll: initialShowAll, hasLead, hasVoice }: Props) {
  const [showAll, setShowAll] = useState(initialShowAll);
  const [saving, setSaving] = useState(false);

  async function toggleShowAll() {
    const next = !showAll;
    setShowAll(next);
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("cp_coaches")
        .update({ nav_show_all: next })
        .eq("id", user.id);
    }
    if (next) {
      document.cookie = "nav-unlocks=" + encodeURIComponent(JSON.stringify({ voice: true, content: true })) + "; path=/; max-age=86400; samesite=lax";
    }
    setSaving(false);
  }

  const milestoneComplete = (key: string) => {
    if (key === "lead") return hasLead;
    if (key === "voice") return hasVoice;
    return false;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">Milestones</p>
        {MILESTONES.map((m) => (
          <div key={m.key} className="flex items-center gap-2 text-[length:var(--t-caption)]">
            <span className={milestoneComplete(m.key) ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text-faint)]"}>
              {milestoneComplete(m.key) ? "✓" : "○"}
            </span>
            <span className={milestoneComplete(m.key) ? "text-[color:var(--text)]" : "text-[color:var(--text-muted)]"}>
              {m.label}
            </span>
            <span className="text-[color:var(--text-faint)]">→ unlocks {m.unlocks}</span>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <button
          type="button"
          role="switch"
          aria-checked={showAll}
          onClick={toggleShowAll}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
            showAll ? "bg-[var(--brand-strong)]" : "bg-[var(--border)]"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-[var(--surface-elevated)] shadow ring-0 transition-transform ${
              showAll ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
          Show all tabs
        </span>
      </label>
      {showAll && (
        <p className="text-[length:var(--t-micro)] text-[color:var(--text-faint)]">
          All navigation tabs are visible regardless of milestones.
        </p>
      )}
    </div>
  );
}
