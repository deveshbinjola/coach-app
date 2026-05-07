"use client";

// NumberField — labeled numeric input with a Save button that only
// activates when the value is dirty. Used for reach target, SLA hours,
// and any other settings where typing alone shouldn't write — the
// coach should explicitly commit.

import { useState } from "react";

type Props = {
  label:   string;
  value:   number;
  onSave:  (next: number) => void;
  saving:  boolean;
  min:     number;
  max:     number;
  suffix?: string;
};

export default function NumberField({
  label,
  value,
  onSave,
  saving,
  min,
  max,
  suffix,
}: Props) {
  const [draft, setDraft] = useState(String(value));
  const dirty = parseInt(draft, 10) !== value;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="text-sm font-semibold text-navy sr-only">
        {label}
      </label>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-center font-bold tabular-nums focus:outline-none focus:border-brand"
      />
      {suffix && (
        <span className="text-sm text-gray-600 font-medium">{suffix}</span>
      )}
      <button
        type="button"
        disabled={!dirty || saving}
        onClick={() => {
          const n = parseInt(draft, 10);
          if (Number.isFinite(n) && n >= min && n <= max) onSave(n);
        }}
        className="ml-auto inline-flex items-center px-4 py-2 rounded-lg bg-brand text-navy font-extrabold text-sm hover:bg-[#00E03A] transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
