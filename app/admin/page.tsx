"use client";

import { useEffect, useState, useCallback } from "react";

interface Coach {
  id: string;
  email: string;
  full_name: string | null;
  business_name: string | null;
  plan: string;
  onboarded_at: string | null;
  created_at: string;
}

interface Payment {
  id: string;
  coach_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  customer_email: string | null;
  created_at: string;
}

interface StripeAccount {
  coach_id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  display_name: string | null;
  livemode: boolean;
}

interface Offering {
  id: string;
  coach_id: string;
  name: string;
  kind: string;
  status: string;
  price_cents: number | null;
  capacity: number | null;
}

interface AdminData {
  coaches: Coach[];
  payments: Payment[];
  stripeAccounts: StripeAccount[];
  offerings: Offering[];
  totalLeads: number;
  totalRevenue: number;
}

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function ago(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTier, setUpdatingTier] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin");
      if (!res.ok) {
        if (res.status === 403) {
          setError("Access denied.");
          return;
        }
        throw new Error("Failed to load");
      }
      setData(await res.json());
    } catch {
      setError("Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function updatePlan(coachId: string, plan: string) {
    setUpdatingTier(coachId);
    try {
      const res = await fetch("/api/admin/update-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coach_id: coachId, plan }),
      });
      if (res.ok) await loadData();
    } finally {
      setUpdatingTier(null);
    }
  }

  if (loading) return <div style={styles.loading}>Loading...</div>;
  if (error) return <div style={styles.loading}>{error}</div>;
  if (!data) return null;

  const stripeMap = Object.fromEntries(
    data.stripeAccounts.map((s) => [s.coach_id, s])
  );
  const offeringsByCoach: Record<string, Offering[]> = {};
  data.offerings.forEach((o) => {
    (offeringsByCoach[o.coach_id] ??= []).push(o);
  });

  const activeThisWeek = data.coaches.filter((c) => {
    if (!c.onboarded_at) return false;
    const d = new Date(c.onboarded_at);
    return new Date().getTime() - d.getTime() < 7 * 86400000;
  }).length;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.headerLeft}>
            <svg width="28" height="28" viewBox="0 0 100 120" fill="none">
              <path d="M50 0C50 0 20 30 20 65c0 22 13.5 40 30 48c16.5-8 30-26 30-48C80 30 50 0 50 0z" fill="#00FF41" />
              <path d="M50 20c0 0-15 20-15 40c0 12 7 22 15 26c8-4 15-14 15-26C65 40 50 20 50 20z" fill="#0A0F1C" opacity="0.3" />
            </svg>
            <span style={styles.headerTitle}>Admin Console</span>
          </div>
          <a href="/command-center" style={styles.backLink}>Back to app</a>
        </div>
      </header>

      {/* Metrics bar */}
      <div style={styles.metrics}>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{data.coaches.length}</div>
          <div style={styles.metricLabel}>Total coaches</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{activeThisWeek}</div>
          <div style={styles.metricLabel}>Onboarded this week</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{data.totalLeads.toLocaleString()}</div>
          <div style={styles.metricLabel}>Total leads</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{fmt(data.totalRevenue)}</div>
          <div style={styles.metricLabel}>Total revenue</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{data.payments.length}</div>
          <div style={styles.metricLabel}>Payments (last 50)</div>
        </div>
      </div>

      {/* Coaches table */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Coaches</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Business</th>
                <th style={styles.th}>Plan</th>
                <th style={styles.th}>Stripe</th>
                <th style={styles.th}>Offerings</th>
                <th style={styles.th}>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {data.coaches.map((c) => {
                const stripe = stripeMap[c.id];
                const offerings = offeringsByCoach[c.id] ?? [];
                return (
                  <tr key={c.id} style={styles.tr}>
                    <td style={styles.td}>{c.full_name ?? "—"}</td>
                    <td style={{ ...styles.td, ...styles.email }}>{c.email}</td>
                    <td style={styles.td}>{c.business_name ?? "—"}</td>
                    <td style={styles.td}>
                      <select
                        value={c.plan}
                        disabled={updatingTier === c.id}
                        onChange={(e) => updatePlan(c.id, e.target.value)}
                        style={styles.select}
                      >
                        <option value="founding">founding</option>
                        <option value="standard">standard</option>
                        <option value="premium">premium</option>
                      </select>
                    </td>
                    <td style={styles.td}>
                      {stripe ? (
                        <span style={{
                          ...styles.badge,
                          background: stripe.charges_enabled ? "rgba(0,255,65,0.15)" : "rgba(255,180,0,0.15)",
                          color: stripe.charges_enabled ? "#00FF41" : "#FFB400",
                        }}>
                          {stripe.charges_enabled ? "active" : "pending"}
                        </span>
                      ) : (
                        <span style={{ ...styles.badge, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" }}>none</span>
                      )}
                    </td>
                    <td style={styles.td}>{offerings.length}</td>
                    <td style={styles.td}>{ago(c.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent payments */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Recent Payments</h2>
        {data.payments.length === 0 ? (
          <p style={styles.empty}>No payments yet.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} style={styles.tr}>
                    <td style={{ ...styles.td, ...styles.email }}>{p.customer_email ?? "—"}</td>
                    <td style={styles.td}>{fmt(p.amount_cents)}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        background: p.status === "completed" ? "rgba(0,255,65,0.15)" : "rgba(255,180,0,0.15)",
                        color: p.status === "completed" ? "#00FF41" : "#FFB400",
                      }}>
                        {p.status}
                      </span>
                    </td>
                    <td style={styles.td}>{ago(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0A0F1C",
    color: "#FAFAF8",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  loading: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0A0F1C",
    color: "#FAFAF8",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    fontSize: "1rem",
  },
  header: {
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    padding: "1rem 2rem",
  },
  headerInner: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  headerTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  backLink: {
    fontSize: "0.85rem",
    color: "rgba(255,255,255,0.5)",
    textDecoration: "none",
  },
  metrics: {
    maxWidth: 1200,
    margin: "2rem auto",
    padding: "0 2rem",
    display: "flex",
    gap: "1rem",
    flexWrap: "wrap" as const,
  },
  metricCard: {
    flex: "1 1 160px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "1.25rem 1.5rem",
  },
  metricValue: {
    fontSize: "1.75rem",
    fontWeight: 800,
    color: "#00FF41",
    letterSpacing: "-0.03em",
  },
  metricLabel: {
    fontSize: "0.78rem",
    color: "rgba(255,255,255,0.45)",
    marginTop: "0.25rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    fontWeight: 600,
  },
  section: {
    maxWidth: 1200,
    margin: "2rem auto",
    padding: "0 2rem",
  },
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 700,
    marginBottom: "1rem",
    letterSpacing: "-0.01em",
  },
  tableWrap: {
    overflowX: "auto" as const,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.02)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "0.85rem",
  },
  th: {
    textAlign: "left" as const,
    padding: "0.75rem 1rem",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.45)",
    fontWeight: 600,
    fontSize: "0.75rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "0.75rem 1rem",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    whiteSpace: "nowrap" as const,
  },
  tr: {},
  email: {
    fontSize: "0.8rem",
    color: "rgba(255,255,255,0.6)",
  },
  select: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#FAFAF8",
    padding: "0.3rem 0.5rem",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  badge: {
    display: "inline-block",
    padding: "0.2rem 0.6rem",
    borderRadius: 20,
    fontSize: "0.72rem",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  empty: {
    color: "rgba(255,255,255,0.35)",
    fontSize: "0.9rem",
    padding: "2rem 0",
  },
};
