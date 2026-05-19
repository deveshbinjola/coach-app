import Link from "next/link";
import { Card } from "@/components/ui";

export type OfferingRevenueSummary = {
  name: string;
  enrolled: number;
  capacity: number | null;
  price_cents: number | null;
};

type Props = {
  offerings: OfferingRevenueSummary[];
};

function fmtUSD(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function RevenueCard({ offerings }: Props) {
  const priced = offerings.filter((o) => o.price_cents != null && o.price_cents > 0);

  if (offerings.length === 0) {
    return (
      <Card>
        <div className="space-y-2">
          <div className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Revenue
          </div>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
            Add your offerings and pricing to see revenue here.
          </p>
          <Link
            href="/clients?tab=offerings"
            className="inline-flex items-center h-8 px-3 rounded-[var(--r-md)] bg-[var(--brand-strong)] text-[color:var(--surface)] text-[length:var(--t-caption)] font-bold hover:opacity-90 transition"
          >
            Set up offerings →
          </Link>
        </div>
      </Card>
    );
  }

  if (priced.length === 0) {
    return (
      <Card>
        <div className="space-y-2">
          <div className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Revenue
          </div>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
            You have {offerings.length} offering{offerings.length === 1 ? "" : "s"} but no pricing set.
            Add prices to track revenue.
          </p>
          <Link
            href="/clients?tab=offerings"
            className="inline-flex items-center h-8 px-3 rounded-[var(--r-md)] bg-[var(--brand-strong)] text-[color:var(--surface)] text-[length:var(--t-caption)] font-bold hover:opacity-90 transition"
          >
            Add pricing →
          </Link>
        </div>
      </Card>
    );
  }

  const totalEnrolled = priced.reduce(
    (sum, o) => sum + (o.enrolled * o.price_cents!) / 100,
    0
  );
  const totalAtCapacity = priced.reduce((sum, o) => {
    const seats = o.capacity ?? o.enrolled;
    return sum + (seats * o.price_cents!) / 100;
  }, 0);

  return (
    <Card>
      <div className="space-y-3">
        <div className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
          Revenue
        </div>

        <div>
          <p className="font-mono text-[length:var(--t-h2)] font-extrabold text-[color:var(--brand-strong)] leading-none">
            {fmtUSD(totalEnrolled)}
          </p>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            enrolled across {priced.length} offering{priced.length === 1 ? "" : "s"}
          </p>
        </div>

        {totalAtCapacity > totalEnrolled && (
          <div className="flex items-baseline gap-2">
            <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">At capacity</span>
            <span className="font-mono text-[length:var(--t-body)] font-extrabold text-[color:var(--text-muted)]">
              {fmtUSD(totalAtCapacity)}
            </span>
          </div>
        )}

        {totalEnrolled > 0 && totalAtCapacity > 0 && (
          <div className="h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
            <div
              className="h-full bg-[var(--brand-strong)] rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.round((totalEnrolled / totalAtCapacity) * 100))}%` }}
            />
          </div>
        )}

        <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
          {priced.map((o) => {
            const rev = (o.enrolled * o.price_cents!) / 100;
            return (
              <div key={o.name} className="flex items-baseline justify-between gap-2">
                <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] truncate">
                  {o.name}
                </span>
                <span className="font-mono text-[length:var(--t-caption)] font-bold text-[color:var(--text)] whitespace-nowrap">
                  {o.enrolled} × {fmtUSD(o.price_cents! / 100)} = {fmtUSD(rev)}
                </span>
              </div>
            );
          })}
        </div>

        <Link
          href="/clients?tab=offerings"
          className="block text-[length:var(--t-caption)] text-[color:var(--brand-strong)] font-bold hover:underline"
        >
          Manage offerings →
        </Link>
      </div>
    </Card>
  );
}
