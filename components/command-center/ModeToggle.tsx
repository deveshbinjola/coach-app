"use client";

type Mode = "coach" | "admin";

type Props = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
};

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "coach", label: "Coach" },
  { id: "admin", label: "Admin" },
];

export type { Mode };

export default function ModeToggle({ mode, onModeChange }: Props) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-0 rounded-[var(--r-pill)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-0.5"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          type="button"
          onClick={() => onModeChange(m.id)}
          className={`px-3.5 py-1.5 rounded-[calc(var(--r-pill)-2px)] text-[length:var(--t-caption)] font-extrabold transition ${
            mode === m.id
              ? "bg-[var(--brand-strong)] text-[var(--surface)] shadow-[var(--shadow-sm)]"
              : "text-[color:var(--text-faint)] hover:text-[color:var(--text-muted)]"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
