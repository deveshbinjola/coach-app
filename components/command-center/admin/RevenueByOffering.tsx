// components/command-center/admin/RevenueByOffering.tsx
"use client";

type Offering = {
  id: string; name: string; revenueCents: number; enrolled: number;
  capacity: number | null; priceCents: number | null; pctFull: number | null; projectedCents: number | null;
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function RevenueByOffering({ offerings }: { offerings: Offering[] }) {
  const total = offerings.reduce((s, o) => s + o.revenueCents, 0);
  return (
    <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em]">Revenue by offering</span>
        <span className="text-[11px] font-bold text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-0.5">{usd(total)}</span>
      </div>
      {offerings.length === 0 ? (
        <div className="px-[18px] py-4 border-t border-[var(--border-faint)] text-[length:var(--t-caption)] text-[color:var(--text-faint)]">No active offerings yet.</div>
      ) : (
        offerings.map((o) => (
          <a key={o.id} href={`/clients/offerings/${o.id}`} className="block px-[18px] py-3.5 border-t border-[var(--border-faint)] hover:bg-[var(--surface-deep)] transition">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="font-extrabold text-[14px]">{o.name}</span>
              <span className="font-display font-bold text-[16px]">{usd(o.revenueCents)}</span>
            </div>
            {o.capacity != null && (
              <div className="h-1.5 rounded-full bg-[var(--surface-deep)] overflow-hidden" role="img" aria-label={`${o.enrolled} of ${o.capacity} seats filled`}>
                <span className="block h-full rounded-full bg-[var(--brand-strong)]" style={{ width: `${o.pctFull ?? 0}%` }} />
              </div>
            )}
            <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5">
              {o.capacity != null
                ? `${o.enrolled} of ${o.capacity} seats${o.priceCents ? ` · ${usd(o.priceCents)} / seat` : ""}${o.pctFull != null ? ` · ${o.pctFull}% full` : ""}`
                : `${o.enrolled} active${o.priceCents ? ` · ${usd(o.priceCents)}` : ""}`}
            </div>
          </a>
        ))
      )}
    </div>
  );
}
