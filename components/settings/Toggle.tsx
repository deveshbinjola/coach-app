"use client";

// Toggle — labeled switch row used by every boolean setting on the page.
// Matches the design-system motion + spacing; the brand green fill
// signals "on" without needing a label change.

type Props = {
  label:    string;
  hint?:    string;
  value:    boolean;
  onChange: (next: boolean) => void;
  saving:   boolean;
  disabled?: boolean;
};

export default function Toggle({
  label,
  hint,
  value,
  onChange,
  saving,
  disabled = false,
}: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label
          className={`block font-semibold text-sm ${disabled ? "text-[color:var(--text-faint)]" : "text-navy"}`}
        >
          {label}
        </label>
        {hint && (
          <p
            className={`text-xs mt-0.5 ${disabled ? "text-[color:var(--text-faint)]" : "text-[color:var(--text-muted)]"}`}
          >
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled || saving}
        onClick={() => onChange(!value)}
        className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
          value ? "bg-brand" : "bg-[var(--border)]"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-[var(--surface-elevated)] shadow transition transform ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
