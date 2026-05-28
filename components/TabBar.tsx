// components/TabBar.tsx
"use client";

type Tab = { key: string; label: string; count?: number };

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
};

export default function TabBar({ tabs, active, onChange }: Props) {
  return (
    <div className="flex gap-0 border-b border-[var(--border-faint)] mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={[
            "px-4 py-2 text-[length:var(--t-caption)] font-bold transition-colors",
            active === tab.key
              ? "text-[color:var(--brand)] border-b-2 border-[var(--brand)]"
              : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
          ].join(" ")}
        >
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span className="ml-1.5 text-[10px] font-bold text-[color:var(--text-faint)]">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
