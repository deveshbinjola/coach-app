"use client";

// ScopeOption — radio-style card used in the API key creation form.
// Picks read vs read+write scope. Lifted out of ApiKeysPanel so the
// scope-picker can be reused if other surfaces ever need it (e.g.
// when we add per-key channel scoping).

type Props = {
  active:  boolean;
  onClick: () => void;
  title:   string;
  hint:    string;
};

export default function ScopeOption({ active, onClick, title, hint }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-[var(--r-md)] border-2 transition ${
        active
          ? "border-brand bg-[#F0FFF4]"
          : "border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)]"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
            active
              ? "border-brand bg-brand"
              : "border-[var(--border)] bg-[var(--surface-elevated)]"
          }`}
        />
        <span className="text-sm font-bold text-navy">{title}</span>
      </div>
      <p className="text-[11px] text-[color:var(--text-muted)] leading-relaxed pl-6">{hint}</p>
    </button>
  );
}
