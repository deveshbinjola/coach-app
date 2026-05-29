// components/command-center/admin/LeadPipeline.tsx
"use client";

type Props = { pipeline: { new: number; contacted: number; qualified: number; booked: number; won: number } };

export default function LeadPipeline({ pipeline }: Props) {
  const stages = [
    { name: "New", n: pipeline.new },
    { name: "Contacted", n: pipeline.contacted },
    { name: "Qualified", n: pipeline.qualified },
    { name: "Booked", n: pipeline.booked },
    { name: "Won this month", n: pipeline.won },
  ];
  const total = stages.reduce((s, x) => s + x.n, 0);
  const max = Math.max(...stages.map((s) => s.n), 1);
  return (
    <a href="/leads" className="block rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden hover:border-[var(--border-strong)] transition">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em]">Lead pipeline</span>
        <span className="text-[11px] font-bold text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-0.5">{total} leads</span>
      </div>
      {stages.map((s) => (
        <div key={s.name} className="px-[18px] py-2.5 border-t border-[var(--border-faint)]">
          <div className="flex items-center justify-between text-[length:var(--t-caption)] mb-1.5">
            <span className="text-[color:var(--text-muted)] font-semibold">{s.name}</span>
            <span className="font-display font-bold">{s.n}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-deep)] overflow-hidden">
            <span className="block h-full rounded-full bg-[var(--brand-strong)]" style={{ width: `${(s.n / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </a>
  );
}
