"use client";

type ContentTab = "create" | "library";

type Props = {
  activeTab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
  draftCount: number;
};

const TABS: Array<{ id: ContentTab; label: string }> = [
  { id: "create", label: "Create" },
  { id: "library", label: "Library" },
];

export type { ContentTab };

export default function ContentTabBar({ activeTab, onTabChange, draftCount }: Props) {
  return (
    <div className="flex items-center gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`min-h-9 rounded-[var(--r-md)] border px-4 text-[length:var(--t-caption)] font-extrabold transition ${
            activeTab === tab.id
              ? "border-[color-mix(in_srgb,var(--brand)_55%,var(--border))] bg-[var(--brand-soft)] text-[color:var(--text)]"
              : "border-[var(--border-faint)] bg-[var(--surface-elevated)] text-[color:var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[color:var(--text)]"
          }`}
        >
          {tab.label}
          {tab.id === "library" && (
            <span className="ml-1.5 text-[color:var(--text-faint)]">{draftCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}
