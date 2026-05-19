// OfferingsWorkspace — grid view at /clients?tab=offerings.
//
// Lists all offerings (catalog managed in /settings → Offerings) with the
// number of active members in each, kind, capacity, and date range. Click
// into one to see the roster + referral chains + add members.
//
// Pure server component — receives data, renders links.

import Link from "next/link";
import { Badge } from "@/components/ui";
import AddOfferingForm from "@/components/clients/AddOfferingForm";
import {
  OFFERING_KIND_LABEL,
  type Offering,
} from "@/lib/types";

export type OfferingCard = Offering & { member_count: number };

export default function OfferingsWorkspace({ offerings }: { offerings: OfferingCard[] }) {
  const active = offerings.filter((o) => o.status === "active");
  const archived = offerings.filter((o) => o.status === "archived");

  if (active.length === 0 && archived.length === 0) {
    return (
      <div className="space-y-6">
        <AddOfferingForm open />
        <EmptyState />
      </div>
    );
  }

  const totalRevenue = active.reduce((sum, o) => {
    if (o.price_cents == null) return sum;
    return sum + (o.member_count * o.price_cents) / 100;
  }, 0);
  const totalProjected = active.reduce((sum, o) => {
    if (o.price_cents == null) return sum;
    const seats = o.capacity ?? o.member_count;
    return sum + (seats * o.price_cents) / 100;
  }, 0);
  const hasRevenue = totalRevenue > 0 || totalProjected > 0;

  return (
    <div className="space-y-8">
      <AddOfferingForm />

      {hasRevenue && (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div>
            <span className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
              Enrolled revenue
            </span>
            <p className="font-mono text-[length:var(--t-h2)] font-extrabold text-[color:var(--brand-strong)]">
              {fmtUSD(totalRevenue)}
            </p>
          </div>
          {totalProjected > totalRevenue && (
            <div>
              <span className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
                At capacity
              </span>
              <p className="font-mono text-[length:var(--t-h2)] font-extrabold text-[color:var(--text-muted)]">
                {fmtUSD(totalProjected)}
              </p>
            </div>
          )}
        </div>
      )}

      {active.length > 0 ? (
        <section className="space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map((o) => (
              <OfferingTile key={o.id} offering={o} />
            ))}
          </div>
        </section>
      ) : null}

      {archived.length > 0 && (
        <section className="space-y-3 opacity-80">
          <h2 className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
            Archived
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {archived.map((o) => (
              <OfferingTile key={o.id} offering={o} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OfferingTile({ offering: o }: { offering: OfferingCard }) {
  const dateRange = formatRange(o.starts_at, o.ends_at);
  const cap = o.capacity != null ? `${o.member_count} / ${o.capacity}` : `${o.member_count}`;
  const capPct = o.capacity ? Math.min(100, Math.round((o.member_count / o.capacity) * 100)) : 0;
  const price = o.price_cents != null ? o.price_cents / 100 : null;
  const enrolled = o.member_count;
  const revenue = price != null ? enrolled * price : null;
  const projectedRevenue = price != null && o.capacity != null ? o.capacity * price : null;

  return (
    <Link
      href={`/clients/offerings/${o.id}`}
      className="group block rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--brand-strong)] hover:shadow-[var(--shadow-sm)] transition overflow-hidden"
    >
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Badge tone="muted" size="xs" uppercase>{OFFERING_KIND_LABEL[o.kind]}</Badge>
          {o.status === "archived" && <Badge tone="muted" size="xs" uppercase>Archived</Badge>}
        </div>

        <h3 className="font-display text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)] leading-tight">
          {o.name}
        </h3>

        {o.description && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] line-clamp-2 leading-relaxed">
            {o.description}
          </p>
        )}

        {price != null && (
          <p className="font-mono text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
            {fmtUSD(price)}<span className="text-[color:var(--text-faint)] font-normal text-[length:var(--t-caption)]"> / seat</span>
          </p>
        )}

        <div className="pt-2 border-t border-[var(--border)] space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
              Enrolled
            </span>
            <span className="font-mono text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)]">{cap}</span>
          </div>
          {o.capacity != null && (
            <div className="h-1 rounded-full bg-[var(--surface)] overflow-hidden">
              <div className="h-full bg-[var(--brand-strong)]" style={{ width: `${capPct}%` }} />
            </div>
          )}

          {revenue != null && (
            <div className="flex items-baseline justify-between">
              <span className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
                Revenue
              </span>
              <span className="font-mono text-[length:var(--t-body)] font-extrabold text-[color:var(--brand-strong)]">
                {fmtUSD(revenue)}
                {projectedRevenue != null && projectedRevenue > revenue && (
                  <span className="text-[color:var(--text-faint)] font-normal text-[length:var(--t-caption)]">
                    {" "}/ {fmtUSD(projectedRevenue)}
                  </span>
                )}
              </span>
            </div>
          )}

          {dateRange && (
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">{dateRange}</p>
          )}
        </div>

        <p className="text-[length:var(--t-caption)] text-[color:var(--brand-strong)] font-bold group-hover:underline">
          Open offering →
        </p>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center space-y-3">
      <h3 className="text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)]">
        No offerings yet
      </h3>
      <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] max-w-md mx-auto leading-relaxed">
        Offerings are the things you sell — 1:1, men&apos;s group, retreats. Add your first one in <a className="underline" href="/settings">Settings → Offerings</a>, then drop existing clients into it from here.
      </p>
      <a
        href="/settings"
        className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] bg-[var(--brand-strong)] text-[color:var(--surface)] text-[length:var(--t-body)] font-bold hover:opacity-90 transition"
      >
        Open Settings →
      </a>
    </div>
  );
}

function fmtUSD(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (s: string) =>
    new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return end ? `Until ${fmt(end)}` : null;
}
