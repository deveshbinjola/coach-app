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

interface BrandOsRun {
  id: string;
  coach_id: string;
  state: "in_progress" | "complete" | "abandoned";
  variant: "mvp" | "full";
  audience: "M" | "W" | "X";
  current_module: string;
  started_at: string;
  completed_at: string | null;
  label: string | null;
}

interface AdminData {
  coaches: Coach[];
  payments: Payment[];
  stripeAccounts: StripeAccount[];
  offerings: Offering[];
  brandOsRuns: BrandOsRun[];
  totalLeads: number;
  totalRevenue: number;
}

type Tab = "overview" | "squad" | "sops";

interface SopItem {
  id: string;
  title: string;
  owner: string;
  trigger: string;
  file: string;
  visual?: boolean;
}

interface SopCategory {
  label: string;
  color: string;
  items: SopItem[];
}

interface AgentDef {
  name: string;
  role: string;
  cadence: string;
  status: "live" | "proposed";
  color: string;
  icon: string;
}

const AGENTS: AgentDef[] = [
  { name: "Jarvis", role: "Chief of Staff — strategy, planning, coordination", cadence: "Daily", status: "live", color: "#00FF41", icon: "J" },
  { name: "Loki", role: "Content Engine — blog, Signal, carousels, reels", cadence: "Daily / Weekly", status: "live", color: "#7C3AED", icon: "L" },
  { name: "Athena", role: "Research — psychology, philosophy, men's work", cadence: "On-demand + weekly", status: "live", color: "#0EA5E9", icon: "A" },
  { name: "Mira", role: "Voice of Customer — DMs, sales calls, cohort feedback", cadence: "Weekly + monthly", status: "live", color: "#F59E0B", icon: "M" },
  { name: "Atlas", role: "Ops + QA — systems, automations, coach-app health", cadence: "Daily QA + weekly", status: "live", color: "#EF4444", icon: "At" },
];

const SOP_CATEGORIES: SopCategory[] = [
  {
    label: "Platform Operations",
    color: "#0B6E23",
    items: [
      { id: "01", title: "New Coach Onboarding", owner: "Sunny", trigger: "Coach pays", file: "/sops/01-onboarding.html", visual: true },
      { id: "02", title: "Churn & Cancellation", owner: "Sunny", trigger: "Coach cancels or goes silent", file: "/sops/02-churn-cancellation.html" },
      { id: "03", title: "Bug Report Triage", owner: "Atlas / Sunny", trigger: "Bug reported", file: "/sops/03-bug-report-triage.html" },
      { id: "04", title: "Dunning & Billing Failure", owner: "Atlas / Sunny", trigger: "Payment fails", file: "/sops/04-dunning-billing-failure.html" },
    ],
  },
  {
    label: "Sales & Growth",
    color: "#B45309",
    items: [
      { id: "05", title: "Inbound Lead → Close", owner: "Sunny", trigger: "New lead enters funnel", file: "/sops/05-lead-to-close.html", visual: true },
      { id: "06", title: "Cohort Launch Playbook", owner: "Sunny", trigger: "New cohort cycle", file: "/sops/06-cohort-launch.html", visual: true },
      { id: "07", title: "Testimonial & Case Study", owner: "Sunny / Loki", trigger: "Coach hits milestone", file: "/sops/07-testimonial-case-study.html" },
    ],
  },
  {
    label: "Content Engine",
    color: "#7C3AED",
    items: [
      { id: "08", title: "Weekly Signal Newsletter", owner: "Loki / Sunny", trigger: "Every Monday", file: "/sops/08-weekly-signal-newsletter.html" },
      { id: "09", title: "Daily Blog Publishing", owner: "Loki / Atlas", trigger: "Every weekday", file: "/sops/09-daily-blog-publishing.html" },
      { id: "10", title: "Carousel → Publish", owner: "Loki / Cassie / Sunny", trigger: "2–3× per week", file: "/sops/10-carousel-publish.html" },
    ],
  },
  {
    label: "Support & Retention",
    color: "#0369A1",
    items: [
      { id: "11", title: "Feature Request Intake", owner: "Sunny / Atlas", trigger: "Coach requests feature", file: "/sops/11-feature-request-intake.html" },
      { id: "12", title: "Coach Success Milestones", owner: "Atlas / Sunny", trigger: "Coach hits milestone", file: "/sops/12-coach-success-milestones.html" },
    ],
  },
];

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

/* ─── SOP viewer ─── */

function SopViewer({ sop, onBack }: { sop: SopItem; onBack: () => void }) {
  return (
    <div className="adm-sop-viewer">
      <button className="adm-sop-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        All SOPs
      </button>
      <div className="adm-sop-viewer-header">
        <div>
          <h2 className="adm-sop-viewer-title">
            <span className="adm-sop-viewer-num">#{sop.id}</span>
            {sop.title}
          </h2>
          <div className="adm-sop-viewer-meta">
            <span>Owner: <strong>{sop.owner}</strong></span>
            <span className="adm-sop-viewer-sep">·</span>
            <span>Trigger: {sop.trigger}</span>
            {sop.visual && <span className="adm-badge adm-badge-success" style={{ marginLeft: "0.5rem" }}>Visual</span>}
          </div>
        </div>
      </div>
      <iframe className="adm-sop-iframe" src={sop.file} title={sop.title} />
    </div>
  );
}

function SopGrid({ onSelect }: { onSelect: (sop: SopItem) => void }) {
  return (
    <div className="adm-sop-grid">
      <div className="adm-sop-intro">
        <h2 className="adm-section-title">Standard Operating Procedures</h2>
        <p className="adm-sop-subtitle">
          12 playbooks covering platform operations, sales, content, and support.
          Share this admin page with new team members for instant access.
        </p>
      </div>
      {SOP_CATEGORIES.map((cat) => (
        <div key={cat.label} className="adm-sop-category">
          <div className="adm-sop-category-header">
            <div className="adm-sop-category-dot" style={{ background: cat.color }} />
            <h3 className="adm-sop-category-label">{cat.label}</h3>
            <span className="adm-sop-category-count">{cat.items.length}</span>
          </div>
          <div className="adm-sop-cards">
            {cat.items.map((sop) => (
              <button key={sop.id} className="adm-sop-card" onClick={() => onSelect(sop)}>
                <div className="adm-sop-card-top">
                  <span className="adm-sop-card-num">#{sop.id}</span>
                  {sop.visual && <span className="adm-badge adm-badge-success">Visual</span>}
                </div>
                <h4 className="adm-sop-card-title">{sop.title}</h4>
                <div className="adm-sop-card-meta">
                  <span className="adm-sop-card-owner">{sop.owner}</span>
                  <span className="adm-sop-card-trigger">{sop.trigger}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Squad tab ─── */

function SquadTab() {
  return (
    <div className="adm-squad">
      <div className="adm-sop-intro">
        <h2 className="adm-section-title">Agent Squad</h2>
        <p className="adm-sop-subtitle">
          5 AI agents running operations, content, research, customer intel, and QA.
        </p>
      </div>
      <div className="adm-squad-grid">
        {AGENTS.map((a) => (
          <div key={a.name} className="adm-agent-card">
            <div className="adm-agent-header">
              <div className="adm-agent-avatar" style={{ background: a.color }}>
                {a.icon}
              </div>
              <div className="adm-agent-meta">
                <div className="adm-agent-name">{a.name}</div>
                <span className={`adm-badge ${a.status === "live" ? "adm-badge-success" : "adm-badge-neutral"}`}>{a.status}</span>
              </div>
            </div>
            <p className="adm-agent-role">{a.role}</p>
            <div className="adm-agent-cadence">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              {a.cadence}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Bento overview ─── */

function BentoIcon({ type }: { type: string }) {
  const icons: Record<string, JSX.Element> = {
    coaches: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    leads: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    revenue: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    brandos: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
    payments: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    onboarded: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    offerings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
    stripe: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>,
  };
  return icons[type] ?? null;
}

function OverviewTab({
  data,
  updatingTier,
  updatePlan,
}: {
  data: AdminData;
  updatingTier: string | null;
  updatePlan: (id: string, plan: string) => void;
}) {
  const stripeMap = Object.fromEntries(data.stripeAccounts.map((s) => [s.coach_id, s]));
  const offeringsByCoach: Record<string, Offering[]> = {};
  data.offerings.forEach((o) => { (offeringsByCoach[o.coach_id] ??= []).push(o); });

  const activeThisWeek = data.coaches.filter((c) => {
    if (!c.onboarded_at) return false;
    return new Date().getTime() - new Date(c.onboarded_at).getTime() < 7 * 86400000;
  }).length;

  const coachMap = Object.fromEntries(data.coaches.map((c) => [c.id, c]));
  const bosInProgress = data.brandOsRuns.filter((r) => r.state === "in_progress");
  const bosComplete = data.brandOsRuns.filter((r) => r.state === "complete");
  const bosMvp = bosComplete.filter((r) => r.variant === "mvp");
  const bosFull = bosComplete.filter((r) => r.variant === "full");
  const bosAbandoned = data.brandOsRuns.filter((r) => r.state === "abandoned");
  const coachesWithRuns = new Set(data.brandOsRuns.map((r) => r.coach_id));
  const coachesNoRun = data.coaches.filter((c) => !coachesWithRuns.has(c.id));

  const stripeActive = data.stripeAccounts.filter((s) => s.charges_enabled).length;
  const totalOfferings = data.offerings.length;

  const bosRate = data.coaches.length > 0
    ? Math.round((bosComplete.length / data.coaches.length) * 100)
    : 0;

  return (
    <>
      {/* ── Bento metrics grid ── */}
      <div className="adm-bento">
        <div className="adm-bento-card adm-bento-wide">
          <div className="adm-bento-icon"><BentoIcon type="coaches" /></div>
          <div className="adm-bento-num">{data.coaches.length}</div>
          <div className="adm-bento-label">Total Coaches</div>
          <div className="adm-bento-sub">{activeThisWeek} onboarded this week</div>
        </div>
        <div className="adm-bento-card">
          <div className="adm-bento-icon"><BentoIcon type="leads" /></div>
          <div className="adm-bento-num">{data.totalLeads.toLocaleString()}</div>
          <div className="adm-bento-label">Total Leads</div>
        </div>
        <div className="adm-bento-card">
          <div className="adm-bento-icon" style={{ color: "#0B6E23" }}><BentoIcon type="revenue" /></div>
          <div className="adm-bento-num" style={{ color: "var(--success)" }}>{fmt(data.totalRevenue)}</div>
          <div className="adm-bento-label">Total Revenue</div>
        </div>
        <div className="adm-bento-card adm-bento-wide">
          <div className="adm-bento-icon" style={{ color: "#7C3AED" }}><BentoIcon type="brandos" /></div>
          <div className="adm-bento-num">{data.brandOsRuns.length}</div>
          <div className="adm-bento-label">Brand OS Runs</div>
          <div className="adm-bento-sub">{bosRate}% completion rate</div>
          <div className="adm-bento-pills">
            <span className="adm-pill adm-pill-warning">{bosInProgress.length} in progress</span>
            <span className="adm-pill adm-pill-brand">{bosMvp.length} MVP</span>
            <span className="adm-pill adm-pill-success">{bosFull.length} full</span>
            {bosAbandoned.length > 0 && <span className="adm-pill adm-pill-danger">{bosAbandoned.length} abandoned</span>}
            {coachesNoRun.length > 0 && <span className="adm-pill adm-pill-neutral">{coachesNoRun.length} never started</span>}
          </div>
        </div>
        <div className="adm-bento-card">
          <div className="adm-bento-icon"><BentoIcon type="payments" /></div>
          <div className="adm-bento-num">{data.payments.length}</div>
          <div className="adm-bento-label">Recent Payments</div>
        </div>
        <div className="adm-bento-card">
          <div className="adm-bento-icon"><BentoIcon type="offerings" /></div>
          <div className="adm-bento-num">{totalOfferings}</div>
          <div className="adm-bento-label">Offerings</div>
        </div>
        <div className="adm-bento-card">
          <div className="adm-bento-icon"><BentoIcon type="stripe" /></div>
          <div className="adm-bento-num">{stripeActive}</div>
          <div className="adm-bento-label">Stripe Active</div>
          <div className="adm-bento-sub">{data.stripeAccounts.length} connected</div>
        </div>
      </div>

      {/* ── Brand OS runs table ── */}
      {data.brandOsRuns.length > 0 && (
        <section className="adm-section">
          <h2 className="adm-section-title">Brand OS Runs</h2>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Coach</th>
                  <th>Email</th>
                  <th>Variant</th>
                  <th>Status</th>
                  <th>Current Module</th>
                  <th>Started</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {data.brandOsRuns.map((r) => {
                  const coach = coachMap[r.coach_id];
                  return (
                    <tr key={r.id}>
                      <td className="adm-td-name">{coach?.full_name ?? r.label ?? "—"}</td>
                      <td className="adm-td-email">{coach?.email ?? "—"}</td>
                      <td>
                        <span className={`adm-badge ${r.variant === "full" ? "adm-badge-brand" : "adm-badge-neutral"}`}>
                          {r.variant}
                        </span>
                      </td>
                      <td>
                        <span className={`adm-badge ${
                          r.state === "complete" ? "adm-badge-success" :
                          r.state === "in_progress" ? "adm-badge-warning" :
                          "adm-badge-danger"
                        }`}>
                          {r.state === "in_progress" ? "in progress" : r.state}
                        </span>
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem" }}>
                        {r.state === "complete" ? "—" : r.current_module}
                      </td>
                      <td>{ago(r.started_at)}</td>
                      <td>{r.completed_at ? ago(r.completed_at) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {coachesNoRun.length > 0 && (
            <div style={{ marginTop: "var(--s4)" }}>
              <h3 className="adm-section-subtitle">Never Started Brand OS</h3>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Signed up</th></tr>
                  </thead>
                  <tbody>
                    {coachesNoRun.map((c) => (
                      <tr key={c.id}>
                        <td className="adm-td-name">{c.full_name ?? "—"}</td>
                        <td className="adm-td-email">{c.email}</td>
                        <td>{ago(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Coaches table ── */}
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

      {/* ── Recent payments ── */}
      <section className="adm-section">
        <h2 className="adm-section-title">Recent Payments</h2>
        {data.payments.length === 0 ? (
          <p className="adm-empty">No payments yet.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th></tr>
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
    </>
  );
}

/* ─── Main ─── */

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTier, setUpdatingTier] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [activeSop, setActiveSop] = useState<SopItem | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin");
      if (!res.ok) {
        if (res.status === 403) { setError("Access denied."); return; }
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
            <div className="adm-tabs">
              {(["overview", "squad", "sops"] as Tab[]).map((t) => (
                <button
                  key={t}
                  className={`adm-tab ${tab === t ? "adm-tab-active" : ""}`}
                  onClick={() => { setTab(t); setActiveSop(null); }}
                >
                  {t === "overview" ? "Overview" : t === "squad" ? "Squad" : "SOPs"}
                  {t === "sops" && <span className="adm-tab-count">12</span>}
                  {t === "squad" && <span className="adm-tab-count">{AGENTS.length}</span>}
                </button>
              ))}
            </div>
            <a href="/command-center" className="adm-back-link">Back to app</a>
          </div>
        </header>

        {tab === "overview" && <OverviewTab data={data} updatingTier={updatingTier} updatePlan={updatePlan} />}
        {tab === "squad" && <SquadTab />}
        {tab === "sops" && (activeSop ? <SopViewer sop={activeSop} onBack={() => setActiveSop(null)} /> : <SopGrid onSelect={setActiveSop} />)}
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

  /* ── Header ── */
  .adm-header {
    border-bottom: 1px solid var(--border);
    padding: var(--s3) var(--s5);
    background: var(--surface-elevated);
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .adm-header-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
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

  /* ── Tabs ── */
  .adm-tabs {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-deep);
    border-radius: 8px;
    padding: 3px;
  }
  .adm-tab {
    padding: 0.4rem 1rem;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .adm-tab:hover { color: var(--text); }
  .adm-tab-active {
    background: var(--surface-elevated);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .adm-tab-count {
    background: var(--surface-deep);
    padding: 0.1rem 0.45rem;
    border-radius: 10px;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-faint);
  }
  .adm-tab-active .adm-tab-count {
    background: var(--success-soft);
    color: var(--success);
  }

  /* ── Bento grid ── */
  .adm-bento {
    max-width: 1200px;
    margin: var(--s5) auto;
    padding: 0 var(--s5);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--s3);
  }
  .adm-bento-card {
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1.25rem 1.5rem;
    position: relative;
    overflow: hidden;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .adm-bento-card:hover {
    border-color: var(--border);
    box-shadow: 0 4px 20px rgba(0,0,0,0.04);
  }
  .adm-bento-wide {
    grid-column: span 2;
  }
  .adm-bento-icon {
    color: var(--text-faint);
    margin-bottom: 0.75rem;
    opacity: 0.7;
  }
  .adm-bento-num {
    font-size: 2rem;
    font-weight: 800;
    color: var(--navy);
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .adm-bento-label {
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .adm-bento-sub {
    font-size: 0.78rem;
    color: var(--text-faint);
    margin-top: 0.25rem;
  }
  .adm-bento-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.75rem;
  }
  .adm-pill {
    display: inline-block;
    padding: 0.2rem 0.55rem;
    border-radius: 20px;
    font-size: 0.68rem;
    font-weight: 600;
  }
  .adm-pill-warning { background: #FFF3D6; color: #B45309; }
  .adm-pill-brand { background: rgba(0,255,65,0.1); color: var(--brand); }
  .adm-pill-success { background: var(--success-soft); color: var(--success); }
  .adm-pill-danger { background: #FEE2E2; color: #DC2626; }
  .adm-pill-neutral { background: var(--surface-deep); color: var(--text-faint); }

  /* ── Sections & tables ── */
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
  .adm-section-subtitle {
    font-size: var(--t-body);
    font-weight: 600;
    margin-bottom: var(--s2);
    color: var(--text-muted);
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
  .adm-table tbody tr:hover { background: var(--surface-deep); }
  .adm-td-name { font-weight: 600; }
  .adm-td-email { font-size: 0.8rem; color: var(--text-muted); }

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
  .adm-select:focus { outline: 2px solid var(--brand); outline-offset: 1px; }

  .adm-badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .adm-badge-success { background: var(--success-soft); color: var(--success); }
  .adm-badge-warning { background: #FFF3D6; color: #B45309; }
  .adm-badge-neutral { background: var(--surface-deep); color: var(--text-faint); }
  .adm-badge-brand { background: rgba(0,255,65,0.1); color: var(--brand); }
  .adm-badge-danger { background: #FEE2E2; color: #DC2626; }

  .adm-empty {
    color: var(--text-muted);
    font-size: var(--t-body);
    padding: var(--s5) 0;
  }

  /* ── Squad ── */
  .adm-squad {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--s5);
  }
  .adm-squad-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--s3);
  }
  .adm-agent-card {
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1.5rem;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .adm-agent-card:hover {
    border-color: var(--border);
    box-shadow: 0 4px 20px rgba(0,0,0,0.04);
  }
  .adm-agent-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .adm-agent-avatar {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.9rem;
    color: #0A0F1C;
    flex-shrink: 0;
  }
  .adm-agent-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .adm-agent-name {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .adm-agent-role {
    font-size: 0.82rem;
    color: var(--text-muted);
    line-height: 1.45;
    margin: 0;
  }
  .adm-agent-cadence {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: var(--text-faint);
    margin-top: 0.75rem;
    font-weight: 600;
  }

  /* ── SOP Grid ── */
  .adm-sop-grid {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--s5);
  }
  .adm-sop-intro { margin-bottom: var(--s5); }
  .adm-sop-subtitle {
    color: var(--text-muted);
    font-size: var(--t-body);
    margin-top: 0.25rem;
    max-width: 600px;
    line-height: 1.5;
  }
  .adm-sop-category { margin-bottom: var(--s5); }
  .adm-sop-category-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: var(--s3);
  }
  .adm-sop-category-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .adm-sop-category-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .adm-sop-category-count {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--text-faint);
    background: var(--surface-deep);
    padding: 0.1rem 0.5rem;
    border-radius: 10px;
  }
  .adm-sop-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--s3);
  }
  .adm-sop-card {
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: all 0.15s;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .adm-sop-card:hover {
    border-color: var(--brand);
    box-shadow: 0 2px 12px rgba(0,255,65,0.08);
    transform: translateY(-1px);
  }
  .adm-sop-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .adm-sop-card-num {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-faint);
    letter-spacing: 0.02em;
  }
  .adm-sop-card-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.01em;
    line-height: 1.3;
  }
  .adm-sop-card-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-top: auto;
  }
  .adm-sop-card-owner {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-weight: 600;
  }
  .adm-sop-card-trigger {
    font-size: 0.72rem;
    color: var(--text-faint);
  }

  /* ── SOP Viewer ── */
  .adm-sop-viewer {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--s4) var(--s5);
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
  }
  .adm-sop-back {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    margin-bottom: var(--s3);
    transition: color 0.15s;
  }
  .adm-sop-back:hover { color: var(--text); }
  .adm-sop-viewer-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--s3);
  }
  .adm-sop-viewer-title {
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--text);
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .adm-sop-viewer-num {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-faint);
  }
  .adm-sop-viewer-meta {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }
  .adm-sop-viewer-sep { color: var(--text-faint); }
  .adm-sop-iframe {
    flex: 1;
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: white;
    min-height: 0;
  }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .adm-bento { grid-template-columns: repeat(2, 1fr); }
    .adm-bento-wide { grid-column: span 2; }
  }
  @media (max-width: 768px) {
    .adm-bento { padding: 0 var(--s3); grid-template-columns: 1fr; gap: 0.5rem; }
    .adm-bento-wide { grid-column: span 1; }
    .adm-section { padding: 0 var(--s3); }
    .adm-header { padding: var(--s3); }
    .adm-header-inner { flex-wrap: wrap; gap: 0.75rem; }
    .adm-sop-grid { padding: var(--s3); }
    .adm-sop-cards { grid-template-columns: 1fr; }
    .adm-sop-viewer { padding: var(--s3); }
    .adm-squad { padding: var(--s3); }
    .adm-squad-grid { grid-template-columns: 1fr; }
  }
`;
