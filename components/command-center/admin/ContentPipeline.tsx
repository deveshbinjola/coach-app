// components/command-center/admin/ContentPipeline.tsx
"use client";

type Props = { content: { draft: number; scheduled: number; publishedThisWeek: number } };

export default function ContentPipeline({ content }: Props) {
  const stages = [
    { name: "Drafts ready", n: content.draft, soft: false },
    { name: "Scheduled", n: content.scheduled, soft: true },
    { name: "Published", n: content.publishedThisWeek, soft: false },
  ];
  const max = Math.max(content.draft, content.scheduled, content.publishedThisWeek, 1);
  return (
    <a href="/content" className="block rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden hover:border-[var(--border-strong)] transition">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em]">Content pipeline</span>
        <span className="text-[11px] font-bold text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-0.5">this week</span>
      </div>
      {stages.map((s) => (
        <div key={s.name} className="px-[18px] py-2.5 border-t border-[var(--border-faint)]">
          <div className="flex items-center justify-between text-[length:var(--t-caption)] mb-1.5">
            <span className="text-[color:var(--text-muted)] font-semibold">{s.name}</span>
            <span className="font-display font-bold">{s.n}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-deep)] overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${(s.n / max) * 100}%`, background: s.soft ? "var(--border-strong)" : "var(--brand-strong)" }} />
          </div>
        </div>
      ))}
    </a>
  );
}
