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

  if (loading) return <div className="adm-loading">Loading...</div>;
  if (error) return <div className="adm-loading">{error}</div>;
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
    <>
      <style>{adminStyles}</style>
      <div className="adm-page">
        <header className="adm-header">
          <div className="adm-header-inner">
            <div className="adm-header-left">
              <svg width="24" height="24" viewBox="0 0 100 120" fill="none">
                <path d="M50 0C50 0 20 30 20 65c0 22 13.5 40 30 48c16.5-8 30-26 30-48C80 30 50 0 50 0z" fill="var(--brand)" />
                <path d="M50 20c0 0-15 20-15 40c0 12 7 22 15 26c8-4 15-14 15-26C65 40 50 20 50 20z" fill="var(--navy)" opacity="0.3" />
              </svg>
              <span className="adm-header-title">Admin Console</span>
            </div>
            <a href="/command-center" className="adm-back-link">Back to app</a>
          </div>
        </header>

        <div className="adm-metrics">
          <div className="adm-metric-card">
            <div className="adm-metric-value">{data.coaches.length}</div>
            <div className="adm-metric-label">Total coaches</div>
          </div>
          <div className="adm-metric-card">
            <div className="adm-metric-value">{activeThisWeek}</div>
            <div className="adm-metric-label">Onboarded this week</div>
          </div>
          <div className="adm-metric-card">
            <div className="adm-metric-value">{data.totalLeads.toLocaleString()}</div>
            <div className="adm-metric-label">Total leads</div>
          </div>
          <div className="adm-metric-card">
            <div className="adm-metric-value">{fmt(data.totalRevenue)}</div>
            <div className="adm-metric-label">Total revenue</div>
          </div>
          <div className="adm-metric-card">
            <div className="adm-metric-value">{data.payments.length}</div>
            <div className="adm-metric-label">Payments (last 50)</div>
          </div>
        </div>

        <section className="adm-section">
          <h2 className="adm-section-title">Coaches</h2>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Business</th>
                  <th>Plan</th>
                  <th>Stripe</th>
                  <th>Offerings</th>
                  <th>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {data.coaches.map((c) => {
                  const stripe = stripeMap[c.id];
                  const offerings = offeringsByCoach[c.id] ?? [];
                  return (
                    <tr key={c.id}>
                      <td className="adm-td-name">{c.full_name ?? "—"}</td>
                      <td className="adm-td-email">{c.email}</td>
                      <td>{c.business_name ?? "—"}</td>
                      <td>
                        <select
                          className="adm-select"
                          value={c.plan}
                          disabled={updatingTier === c.id}
                          onChange={(e) => updatePlan(c.id, e.target.value)}
                        >
                          <option value="founding">founding</option>
                          <option value="standard">standard</option>
                          <option value="premium">premium</option>
                        </select>
                      </td>
                      <td>
                        {stripe ? (
                          <span className={`adm-badge ${stripe.charges_enabled ? "adm-badge-success" : "adm-badge-warning"}`}>
                            {stripe.charges_enabled ? "active" : "pending"}
                          </span>
                        ) : (
                          <span className="adm-badge adm-badge-neutral">none</span>
                        )}
                      </td>
                      <td>{offerings.length}</td>
                      <td>{ago(c.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="adm-section">
          <h2 className="adm-section-title">Recent Payments</h2>
          {data.payments.length === 0 ? (
            <p className="adm-empty">No payments yet.</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="adm-td-email">{p.customer_email ?? "—"}</td>
                      <td>{fmt(p.amount_cents)}</td>
                      <td>
                        <span className={`adm-badge ${p.status === "completed" ? "adm-badge-success" : "adm-badge-warning"}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>{ago(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

const adminStyles = `
  .adm-loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    color: var(--text);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: var(--t-body);
  }
  .adm-page {
    min-height: 100vh;
    background: var(--surface);
    color: var(--text);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  }
  .adm-header {
    border-bottom: 1px solid var(--border);
    padding: var(--s3) var(--s5);
    background: var(--surface-elevated);
  }
  .adm-header-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .adm-header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .adm-header-title {
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .adm-back-link {
    font-size: var(--t-caption);
    color: var(--text-muted);
    text-decoration: none;
  }
  .adm-back-link:hover { color: var(--text); }

  .adm-metrics {
    max-width: 1200px;
    margin: var(--s5) auto;
    padding: 0 var(--s5);
    display: flex;
    gap: var(--s3);
    flex-wrap: wrap;
  }
  .adm-metric-card {
    flex: 1 1 160px;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: var(--s4) var(--s4);
  }
  .adm-metric-value {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--navy);
    letter-spacing: -0.03em;
  }
  .adm-metric-label {
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }

  .adm-section {
    max-width: 1200px;
    margin: var(--s5) auto;
    padding: 0 var(--s5);
  }
  .adm-section-title {
    font-size: var(--t-h2);
    font-weight: 700;
    margin-bottom: var(--s3);
    letter-spacing: -0.01em;
    color: var(--text);
  }

  .adm-table-wrap {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--surface-elevated);
  }
  .adm-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--t-caption);
  }
  .adm-table thead th {
    text-align: left;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
  .adm-table tbody td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-faint);
    white-space: nowrap;
    color: var(--text);
  }
  .adm-table tbody tr:hover {
    background: var(--surface-deep);
  }
  .adm-td-name { font-weight: 600; }
  .adm-td-email {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .adm-select {
    background: var(--surface-deep);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 0.3rem 0.5rem;
    font-size: 0.8rem;
    cursor: pointer;
    font-family: inherit;
  }
  .adm-select:focus {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }

  .adm-badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .adm-badge-success {
    background: var(--success-soft);
    color: var(--success);
  }
  .adm-badge-warning {
    background: #FFF3D6;
    color: #B45309;
  }
  .adm-badge-neutral {
    background: var(--surface-deep);
    color: var(--text-faint);
  }

  .adm-empty {
    color: var(--text-muted);
    font-size: var(--t-body);
    padding: var(--s5) 0;
  }

  @media (max-width: 768px) {
    .adm-metrics { padding: 0 var(--s3); gap: 0.5rem; }
    .adm-metric-card { flex: 1 1 calc(50% - 0.5rem); }
    .adm-section { padding: 0 var(--s3); }
    .adm-header { padding: var(--s3); }
  }
`;
