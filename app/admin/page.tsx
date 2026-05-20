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
type Theme = "dark" | "light";

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

/* ─── SVG donut chart ─── */

function DonutChart({ pct, size = 120, stroke = 10, color = "#00FF41", trackColor }: { pct: number; size?: number; stroke?: number; color?: string; trackColor?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor ?? "rgba(255,255,255,0.06)"} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
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
    <div className="adm-content">
      <div className="adm-sop-intro">
        <h2 className="adm-h2">Standard Operating Procedures</h2>
        <p className="adm-subtitle">12 playbooks covering platform operations, sales, content, and support.</p>
      </div>
      {SOP_CATEGORIES.map((cat) => (
        <div key={cat.label} className="adm-sop-category">
          <div className="adm-sop-category-header">
            <div className="adm-sop-category-dot" style={{ background: cat.color }} />
            <h3 className="adm-sop-category-label">{cat.label}</h3>
            <span className="adm-count-pill">{cat.items.length}</span>
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
    <div className="adm-content">
      <div className="adm-sop-intro">
        <h2 className="adm-h2">Agent Squad</h2>
        <p className="adm-subtitle">5 AI agents running operations, content, research, customer intel, and QA.</p>
      </div>
      <div className="adm-squad-grid">
        {AGENTS.map((a) => (
          <div key={a.name} className="adm-agent-card" style={{ borderTopColor: a.color }}>
            <div className="adm-agent-header">
              <div className="adm-agent-avatar" style={{ background: a.color }}>{a.icon}</div>
              <div>
                <div className="adm-agent-name">{a.name}</div>
                <span className={`adm-badge ${a.status === "live" ? "adm-badge-success" : "adm-badge-neutral"}`}>{a.status}</span>
              </div>
            </div>
            <p className="adm-agent-role">{a.role}</p>
            <div className="adm-agent-cadence">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              {a.cadence}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Overview tab ─── */

function OverviewTab({
  data,
  updatingTier,
  updatePlan,
  theme,
}: {
  data: AdminData;
  updatingTier: string | null;
  updatePlan: (id: string, plan: string) => void;
  theme: Theme;
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

  const bosRate = data.coaches.length > 0
    ? Math.round((bosComplete.length / data.coaches.length) * 100)
    : 0;

  const isLight = theme === "light";
  const donutTrack = isLight ? "#E2E8F0" : undefined;
  const donutColor = isLight ? "#0B6E23" : "#00FF41";

  return (
    <div className="adm-content">
      {/* ── Hero ── */}
      <div className="adm-hero">
        <div className="adm-hero-text">
          <div className="adm-hero-eyebrow">PLATFORM OVERVIEW</div>
          <h1 className="adm-hero-title">
            Your <span className="adm-green">ElevateAI</span><br/>at a glance.
          </h1>
          <p className="adm-hero-desc">Every coach tracked, every Brand OS run monitored, every dollar accounted for.</p>
        </div>
        <div className="adm-hero-focus">
          <div className="adm-hero-focus-eyebrow">BRAND OS COMPLETION</div>
          <div className="adm-hero-focus-row">
            <DonutChart pct={bosRate} size={80} stroke={8} color={donutColor} trackColor={donutTrack} />
            <div className="adm-hero-focus-detail">
              <div className="adm-hero-focus-pct">{bosRate}%</div>
              <div className="adm-hero-focus-sub">{bosComplete.length} of {data.coaches.length} coaches</div>
            </div>
          </div>
          <div className="adm-hero-focus-bar">
            <div className="adm-hero-focus-fill" style={{ width: `${bosRate}%` }} />
          </div>
        </div>
      </div>

      {/* ── Metric strip ── */}
      <div className="adm-metric-strip">
        <div className="adm-kpi adm-kpi-primary">
          <div className="adm-kpi-label">Total Coaches</div>
          <div className="adm-kpi-num">{data.coaches.length}</div>
          <div className="adm-kpi-trend adm-kpi-trend-up">+{activeThisWeek} this week</div>
        </div>
        <div className="adm-kpi" style={{ borderTopColor: "#0EA5E9" }}>
          <div className="adm-kpi-label">Total Leads</div>
          <div className="adm-kpi-num" style={{ color: "#0EA5E9" }}>{data.totalLeads.toLocaleString()}</div>
        </div>
        <div className="adm-kpi" style={{ borderTopColor: "#00FF41" }}>
          <div className="adm-kpi-label">Revenue</div>
          <div className="adm-kpi-num" style={{ color: "#00FF41" }}>{fmt(data.totalRevenue)}</div>
        </div>
        <div className="adm-kpi" style={{ borderTopColor: "#7C3AED" }}>
          <div className="adm-kpi-label">Brand OS Runs</div>
          <div className="adm-kpi-num" style={{ color: "#7C3AED" }}>{data.brandOsRuns.length}</div>
        </div>
        <div className="adm-kpi" style={{ borderTopColor: "#F59E0B" }}>
          <div className="adm-kpi-label">Payments</div>
          <div className="adm-kpi-num" style={{ color: "#F59E0B" }}>{data.payments.length}</div>
        </div>
        <div className="adm-kpi" style={{ borderTopColor: "#EF4444" }}>
          <div className="adm-kpi-label">Stripe Active</div>
          <div className="adm-kpi-num" style={{ color: "#EF4444" }}>{stripeActive}</div>
        </div>
      </div>

      {/* ── Active stack ── */}
      <div className="adm-stack-row">
        <span className="adm-stack-label">ACTIVE STACK</span>
        {AGENTS.map((a) => (
          <span key={a.name} className="adm-stack-pill" style={{ borderColor: a.color }}>
            <span className="adm-stack-dot" style={{ background: a.color }} />
            {a.name}
            <span className="adm-stack-role">{a.role.split("—")[0].trim().toLowerCase()}</span>
          </span>
        ))}
      </div>

      {/* ── Dashboard grid: Brand OS + Coaches + Payments ── */}
      <div className="adm-dash-grid">
        {/* Brand OS breakdown */}
        <div className="adm-card adm-card-brandos">
          <div className="adm-card-header">
            <h3 className="adm-card-title">Brand OS Progress</h3>
            <span className="adm-count-pill">{data.brandOsRuns.length} runs</span>
          </div>
          <div className="adm-brandos-chart">
            <div className="adm-brandos-donut">
              <DonutChart pct={bosRate} size={140} stroke={14} color={donutColor} trackColor={donutTrack} />
              <div className="adm-brandos-center">
                <div className="adm-brandos-center-pct">{bosRate}%</div>
                <div className="adm-brandos-center-label">Complete</div>
              </div>
            </div>
            <div className="adm-brandos-legend">
              <div className="adm-legend-item"><span className="adm-legend-dot" style={{ background: "#00FF41" }} /><span>Complete</span><strong>{bosComplete.length}</strong></div>
              <div className="adm-legend-item"><span className="adm-legend-dot" style={{ background: "#F59E0B" }} /><span>In Progress</span><strong>{bosInProgress.length}</strong></div>
              <div className="adm-legend-item"><span className="adm-legend-dot" style={{ background: "#7C3AED" }} /><span>MVP</span><strong>{bosMvp.length}</strong></div>
              <div className="adm-legend-item"><span className="adm-legend-dot" style={{ background: "#EF4444" }} /><span>Abandoned</span><strong>{bosAbandoned.length}</strong></div>
              <div className="adm-legend-item"><span className="adm-legend-dot" style={{ background: "#64748B" }} /><span>Never Started</span><strong>{coachesNoRun.length}</strong></div>
            </div>
          </div>
        </div>

        {/* Recent coaches */}
        <div className="adm-card">
          <div className="adm-card-header">
            <h3 className="adm-card-title">Coaches</h3>
            <span className="adm-count-pill">{data.coaches.length}</span>
          </div>
          <div className="adm-card-list">
            {data.coaches.slice(0, 6).map((c) => {
              const stripe = stripeMap[c.id];
              return (
                <div key={c.id} className="adm-list-row">
                  <div className="adm-list-avatar">{(c.full_name ?? c.email)[0].toUpperCase()}</div>
                  <div className="adm-list-info">
                    <div className="adm-list-name">{c.full_name ?? "—"}</div>
                    <div className="adm-list-sub">{c.business_name ?? c.email}</div>
                  </div>
                  <div className="adm-list-right">
                    <span className={`adm-badge ${stripe?.charges_enabled ? "adm-badge-success" : c.plan === "founding" ? "adm-badge-brand" : "adm-badge-neutral"}`}>
                      {c.plan}
                    </span>
                    <span className="adm-list-date">{ago(c.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payments */}
        <div className="adm-card">
          <div className="adm-card-header">
            <h3 className="adm-card-title">Recent Payments</h3>
            <span className="adm-count-pill">{fmt(data.totalRevenue)}</span>
          </div>
          {data.payments.length === 0 ? (
            <p className="adm-empty">No payments yet.</p>
          ) : (
            <div className="adm-card-list">
              {data.payments.slice(0, 6).map((p) => (
                <div key={p.id} className="adm-list-row">
                  <div className="adm-list-avatar" style={{ background: p.status === "completed" ? "#0B6E23" : "#B45309" }}>$</div>
                  <div className="adm-list-info">
                    <div className="adm-list-name">{p.customer_email ?? "—"}</div>
                    <div className="adm-list-sub">{ago(p.created_at)}</div>
                  </div>
                  <div className="adm-list-right">
                    <span className={`adm-badge ${p.status === "completed" ? "adm-badge-success" : "adm-badge-warning"}`}>{p.status}</span>
                    <span className="adm-list-amount">{fmt(p.amount_cents)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Full tables (collapsible) ── */}
      {data.brandOsRuns.length > 0 && (
        <div className="adm-card adm-card-full">
          <div className="adm-card-header">
            <h3 className="adm-card-title">All Brand OS Runs</h3>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Coach</th><th>Email</th><th>Variant</th><th>Status</th><th>Module</th><th>Started</th><th>Completed</th></tr>
              </thead>
              <tbody>
                {data.brandOsRuns.map((r) => {
                  const coach = coachMap[r.coach_id];
                  return (
                    <tr key={r.id}>
                      <td className="adm-td-name">{coach?.full_name ?? r.label ?? "—"}</td>
                      <td className="adm-td-email">{coach?.email ?? "—"}</td>
                      <td><span className={`adm-badge ${r.variant === "full" ? "adm-badge-brand" : "adm-badge-neutral"}`}>{r.variant}</span></td>
                      <td><span className={`adm-badge ${r.state === "complete" ? "adm-badge-success" : r.state === "in_progress" ? "adm-badge-warning" : "adm-badge-danger"}`}>{r.state === "in_progress" ? "in progress" : r.state}</span></td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem" }}>{r.state === "complete" ? "—" : r.current_module}</td>
                      <td>{ago(r.started_at)}</td>
                      <td>{r.completed_at ? ago(r.completed_at) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="adm-card adm-card-full">
        <div className="adm-card-header">
          <h3 className="adm-card-title">All Coaches</h3>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Business</th><th>Plan</th><th>Stripe</th><th>Offerings</th><th>Signed up</th></tr>
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
                      <select className="adm-select" value={c.plan} disabled={updatingTier === c.id} onChange={(e) => updatePlan(c.id, e.target.value)}>
                        <option value="founding">founding</option>
                        <option value="standard">standard</option>
                        <option value="premium">premium</option>
                      </select>
                    </td>
                    <td>{stripe ? <span className={`adm-badge ${stripe.charges_enabled ? "adm-badge-success" : "adm-badge-warning"}`}>{stripe.charges_enabled ? "active" : "pending"}</span> : <span className="adm-badge adm-badge-neutral">none</span>}</td>
                    <td>{offerings.length}</td>
                    <td>{ago(c.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("adm-theme") as Theme | null;
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("adm-theme", next);
      return next;
    });
  }, []);

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

  if (loading) return <div className="adm-loading"><div className="adm-loading-spinner" /><span>Loading admin data...</span></div>;
  if (error) return <div className="adm-loading"><span>{error}</span></div>;
  if (!data) return null;

  return (
    <>
      <style>{adminStyles}</style>
      <div className={`adm-page ${theme === "light" ? "adm-light" : ""}`}>
        <header className="adm-header">
          <div className="adm-header-inner">
            <div className="adm-header-left">
              <svg width="24" height="24" viewBox="0 0 100 120" fill="none">
                <path d="M50 0C50 0 20 30 20 65c0 22 13.5 40 30 48c16.5-8 30-26 30-48C80 30 50 0 50 0z" fill={theme === "light" ? "#0B6E23" : "#00FF41"} />
                <path d="M50 20c0 0-15 20-15 40c0 12 7 22 15 26c8-4 15-14 15-26C65 40 50 20 50 20z" fill={theme === "light" ? "#F5F3EF" : "#0A0F1C"} opacity="0.3" />
              </svg>
              <span className="adm-header-title">ElevateAI Admin</span>
            </div>
            <div className="adm-tabs">
              {(["overview", "squad", "sops"] as Tab[]).map((t) => (
                <button key={t} className={`adm-tab ${tab === t ? "adm-tab-active" : ""}`} onClick={() => { setTab(t); setActiveSop(null); }}>
                  {t === "overview" ? "Overview" : t === "squad" ? "Squad" : "SOPs"}
                  {t === "sops" && <span className="adm-tab-count">12</span>}
                  {t === "squad" && <span className="adm-tab-count">{AGENTS.length}</span>}
                </button>
              ))}
            </div>
            <div className="adm-header-right">
              <button className="adm-theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
                {theme === "dark" ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.36 10.06a5.5 5.5 0 01-7.42-7.42A5.5 5.5 0 108 14a5.48 5.48 0 005.36-3.94z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
              </button>
              <a href="/command-center" className="adm-back-link">Back to app</a>
            </div>
          </div>
        </header>

        {tab === "overview" && <OverviewTab data={data} updatingTier={updatingTier} updatePlan={updatePlan} theme={theme} />}
        {tab === "squad" && <SquadTab />}
        {tab === "sops" && (activeSop ? <SopViewer sop={activeSop} onBack={() => setActiveSop(null)} /> : <SopGrid onSelect={setActiveSop} />)}
      </div>
    </>
  );
}

const adminStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  .adm-page {
    min-height: 100vh;
    background: #0A0F1C;
    color: #E2E8F0;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  }
  .adm-loading {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0A0F1C;
    color: #94A3B8;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    gap: 1rem;
  }
  .adm-loading-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(0,255,65,0.15);
    border-top-color: #00FF41;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Header ── */
  .adm-header {
    border-bottom: 1px solid rgba(255,255,255,0.06);
    padding: 0.75rem 2rem;
    background: rgba(10,15,28,0.95);
    backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .adm-header-inner {
    max-width: 1280px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
  }
  .adm-header-left { display: flex; align-items: center; gap: 0.75rem; }
  .adm-header-title { font-size: 1rem; font-weight: 700; color: #F1F5F9; letter-spacing: -0.02em; }
  .adm-header-right { display: flex; align-items: center; gap: 0.75rem; }
  .adm-back-link { font-size: 0.78rem; color: #64748B; text-decoration: none; transition: color 0.15s; }
  .adm-back-link:hover { color: #CBD5E1; }
  .adm-theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: #94A3B8;
    cursor: pointer;
    transition: all 0.2s;
  }
  .adm-theme-toggle:hover { background: rgba(255,255,255,0.08); color: #F1F5F9; }

  /* ── Tabs ── */
  .adm-tabs {
    display: flex;
    gap: 2px;
    background: rgba(255,255,255,0.04);
    border-radius: 10px;
    padding: 3px;
  }
  .adm-tab {
    padding: 0.45rem 1.1rem;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    color: #64748B;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .adm-tab:hover { color: #CBD5E1; }
  .adm-tab-active {
    background: rgba(255,255,255,0.08);
    color: #F1F5F9;
  }
  .adm-tab-count {
    background: rgba(255,255,255,0.06);
    padding: 0.1rem 0.45rem;
    border-radius: 10px;
    font-size: 0.66rem;
    font-weight: 700;
    color: #64748B;
  }
  .adm-tab-active .adm-tab-count {
    background: rgba(0,255,65,0.15);
    color: #00FF41;
  }

  /* ── Content area ── */
  .adm-content {
    max-width: 1280px;
    margin: 0 auto;
    padding: 2rem;
  }

  /* ── Hero ── */
  .adm-hero {
    background: linear-gradient(135deg, rgba(0,255,65,0.04) 0%, rgba(10,15,28,0) 60%);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 20px;
    padding: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 1.5rem;
  }
  .adm-hero-eyebrow {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #00FF41;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .adm-hero-eyebrow::before {
    content: '';
    width: 20px;
    height: 2px;
    background: #00FF41;
  }
  .adm-hero-title {
    font-size: 2rem;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.03em;
    color: #F1F5F9;
    margin: 0 0 0.75rem;
  }
  .adm-green { color: #00FF41; }
  .adm-hero-desc {
    font-size: 0.85rem;
    color: #64748B;
    max-width: 380px;
    line-height: 1.5;
    margin: 0;
  }
  .adm-hero-focus {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 1.25rem 1.5rem;
    min-width: 280px;
  }
  .adm-hero-focus-eyebrow {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #00FF41;
    margin-bottom: 0.75rem;
  }
  .adm-hero-focus-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .adm-hero-focus-pct {
    font-size: 2rem;
    font-weight: 800;
    color: #F1F5F9;
    letter-spacing: -0.03em;
  }
  .adm-hero-focus-sub {
    font-size: 0.75rem;
    color: #64748B;
  }
  .adm-hero-focus-detail { display: flex; flex-direction: column; }
  .adm-hero-focus-bar {
    height: 6px;
    background: rgba(255,255,255,0.06);
    border-radius: 3px;
    overflow: hidden;
  }
  .adm-hero-focus-fill {
    height: 100%;
    background: linear-gradient(90deg, #00FF41, #0B6E23);
    border-radius: 3px;
    transition: width 0.6s ease;
  }

  /* ── Metric strip (Memory OS style) ── */
  .adm-metric-strip {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }
  .adm-kpi {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-top: 3px solid #64748B;
    border-radius: 12px;
    padding: 1rem 1.25rem;
    transition: border-color 0.15s, background 0.15s;
  }
  .adm-kpi:hover {
    background: rgba(255,255,255,0.05);
  }
  .adm-kpi-primary {
    background: linear-gradient(135deg, #0B6E23 0%, #064E16 100%);
    border-top-color: #00FF41 !important;
    border-color: rgba(0,255,65,0.2);
  }
  .adm-kpi-primary .adm-kpi-num { color: #00FF41; }
  .adm-kpi-primary .adm-kpi-label { color: rgba(255,255,255,0.8); }
  .adm-kpi-label {
    font-size: 0.66rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #64748B;
    margin-bottom: 0.35rem;
  }
  .adm-kpi-num {
    font-size: 1.65rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #F1F5F9;
    line-height: 1;
  }
  .adm-kpi-trend {
    font-size: 0.68rem;
    font-weight: 600;
    margin-top: 0.35rem;
  }
  .adm-kpi-trend-up { color: #00FF41; }
  .adm-kpi-trend-up::before { content: '\\25B2 '; font-size: 0.55rem; }

  /* ── Active stack strip ── */
  .adm-stack-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }
  .adm-stack-label {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #64748B;
    margin-right: 0.25rem;
  }
  .adm-stack-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #CBD5E1;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    transition: background 0.15s;
  }
  .adm-stack-pill:hover { background: rgba(255,255,255,0.08); }
  .adm-stack-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .adm-stack-role { color: #475569; font-weight: 500; font-size: 0.65rem; }

  /* ── Dashboard grid ── */
  .adm-dash-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  /* ── Cards ── */
  .adm-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    padding: 1.5rem;
    transition: border-color 0.15s;
  }
  .adm-card:hover { border-color: rgba(255,255,255,0.12); }
  .adm-card-full { margin-bottom: 1.25rem; }
  .adm-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.25rem;
  }
  .adm-card-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #F1F5F9;
    letter-spacing: -0.01em;
  }
  .adm-count-pill {
    font-size: 0.66rem;
    font-weight: 600;
    color: #64748B;
    background: rgba(255,255,255,0.06);
    padding: 0.2rem 0.6rem;
    border-radius: 10px;
  }

  /* ── Brand OS donut card ── */
  .adm-brandos-chart {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  .adm-brandos-donut {
    position: relative;
    flex-shrink: 0;
  }
  .adm-brandos-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transform: rotate(0deg);
  }
  .adm-brandos-center-pct {
    font-size: 1.5rem;
    font-weight: 800;
    color: #F1F5F9;
    letter-spacing: -0.03em;
  }
  .adm-brandos-center-label {
    font-size: 0.62rem;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .adm-brandos-legend { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; }
  .adm-legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.78rem;
    color: #94A3B8;
  }
  .adm-legend-item strong {
    margin-left: auto;
    color: #F1F5F9;
    font-size: 0.85rem;
  }
  .adm-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  /* ── List rows (coaches, payments) ── */
  .adm-card-list { display: flex; flex-direction: column; gap: 0.1rem; }
  .adm-list-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .adm-list-row:last-child { border-bottom: none; }
  .adm-list-avatar {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: rgba(0,255,65,0.12);
    color: #00FF41;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.75rem;
    flex-shrink: 0;
  }
  .adm-list-info { flex: 1; min-width: 0; }
  .adm-list-name {
    font-size: 0.82rem;
    font-weight: 600;
    color: #F1F5F9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .adm-list-sub {
    font-size: 0.7rem;
    color: #475569;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .adm-list-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
  }
  .adm-list-date { font-size: 0.66rem; color: #475569; }
  .adm-list-amount { font-size: 0.82rem; font-weight: 700; color: #00FF41; }

  /* ── Tables ── */
  .adm-table-wrap {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .adm-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }
  .adm-table thead th {
    text-align: left;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    color: #475569;
    font-weight: 600;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .adm-table tbody td {
    padding: 0.65rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    white-space: nowrap;
    color: #CBD5E1;
  }
  .adm-table tbody tr:hover { background: rgba(255,255,255,0.03); }
  .adm-td-name { font-weight: 600; color: #F1F5F9; }
  .adm-td-email { font-size: 0.75rem; color: #64748B; }

  .adm-select {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: #CBD5E1;
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
    font-family: inherit;
  }
  .adm-select:focus { outline: 2px solid #00FF41; outline-offset: 1px; }

  /* ── Badges ── */
  .adm-badge {
    display: inline-block;
    padding: 0.2rem 0.55rem;
    border-radius: 20px;
    font-size: 0.66rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .adm-badge-success { background: rgba(0,255,65,0.12); color: #00FF41; }
  .adm-badge-warning { background: rgba(245,158,11,0.15); color: #F59E0B; }
  .adm-badge-neutral { background: rgba(255,255,255,0.06); color: #64748B; }
  .adm-badge-brand { background: rgba(0,255,65,0.08); color: #00FF41; }
  .adm-badge-danger { background: rgba(239,68,68,0.15); color: #EF4444; }

  .adm-empty { color: #475569; font-size: 0.82rem; padding: 2rem 0; text-align: center; }

  /* ── Shared ── */
  .adm-h2 {
    font-size: 1.35rem;
    font-weight: 700;
    color: #F1F5F9;
    letter-spacing: -0.02em;
    margin: 0 0 0.35rem;
  }
  .adm-subtitle {
    color: #64748B;
    font-size: 0.82rem;
    line-height: 1.5;
    margin: 0;
    max-width: 500px;
  }
  .adm-sop-intro { margin-bottom: 2rem; }

  /* ── Squad ── */
  .adm-squad-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.75rem;
  }
  .adm-agent-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-top: 3px solid #64748B;
    border-radius: 14px;
    padding: 1.5rem;
    transition: border-color 0.15s, background 0.15s;
  }
  .adm-agent-card:hover { background: rgba(255,255,255,0.05); }
  .adm-agent-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
  .adm-agent-avatar {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.85rem;
    color: #0A0F1C;
    flex-shrink: 0;
  }
  .adm-agent-name { font-size: 1rem; font-weight: 700; color: #F1F5F9; letter-spacing: -0.01em; }
  .adm-agent-role { font-size: 0.78rem; color: #94A3B8; line-height: 1.4; margin: 0; }
  .adm-agent-cadence {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.68rem;
    color: #475569;
    margin-top: 0.75rem;
    font-weight: 600;
  }

  /* ── SOP Grid ── */
  .adm-sop-category { margin-bottom: 2rem; }
  .adm-sop-category-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
  .adm-sop-category-dot { width: 8px; height: 8px; border-radius: 50%; }
  .adm-sop-category-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; }
  .adm-sop-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.75rem; }
  .adm-sop-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 1.25rem;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    color: inherit;
    transition: all 0.15s;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .adm-sop-card:hover { border-color: rgba(0,255,65,0.3); background: rgba(0,255,65,0.03); transform: translateY(-1px); }
  .adm-sop-card-top { display: flex; align-items: center; justify-content: space-between; }
  .adm-sop-card-num { font-size: 0.68rem; font-weight: 700; color: #475569; }
  .adm-sop-card-title { font-size: 0.9rem; font-weight: 700; color: #F1F5F9; line-height: 1.3; }
  .adm-sop-card-meta { display: flex; flex-direction: column; gap: 0.15rem; margin-top: auto; }
  .adm-sop-card-owner { font-size: 0.68rem; color: #94A3B8; font-weight: 600; }
  .adm-sop-card-trigger { font-size: 0.68rem; color: #475569; }

  /* ── SOP Viewer ── */
  .adm-sop-viewer {
    max-width: 1280px;
    margin: 0 auto;
    padding: 1.5rem 2rem;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 56px);
  }
  .adm-sop-back {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    color: #64748B;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    margin-bottom: 0.75rem;
    transition: color 0.15s;
  }
  .adm-sop-back:hover { color: #CBD5E1; }
  .adm-sop-viewer-header { margin-bottom: 0.75rem; }
  .adm-sop-viewer-title { font-size: 1.25rem; font-weight: 800; color: #F1F5F9; display: flex; align-items: baseline; gap: 0.5rem; }
  .adm-sop-viewer-num { font-size: 0.78rem; font-weight: 700; color: #475569; }
  .adm-sop-viewer-meta { font-size: 0.75rem; color: #64748B; margin-top: 0.25rem; display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }
  .adm-sop-viewer-sep { color: #334155; }
  .adm-sop-iframe { flex: 1; width: 100%; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; background: white; min-height: 0; }

  /* ── Responsive ── */
  @media (max-width: 1100px) {
    .adm-dash-grid { grid-template-columns: 1fr 1fr; }
    .adm-card-brandos { grid-column: span 2; }
    .adm-metric-strip { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 768px) {
    .adm-content { padding: 1rem; }
    .adm-hero { flex-direction: column; padding: 1.5rem; }
    .adm-hero-focus { min-width: 0; width: 100%; }
    .adm-hero-title { font-size: 1.5rem; }
    .adm-metric-strip { grid-template-columns: repeat(2, 1fr); }
    .adm-dash-grid { grid-template-columns: 1fr; }
    .adm-card-brandos { grid-column: span 1; }
    .adm-brandos-chart { flex-direction: column; }
    .adm-header { padding: 0.75rem 1rem; }
    .adm-header-inner { flex-wrap: wrap; gap: 0.75rem; }
    .adm-sop-viewer { padding: 1rem; }
    .adm-squad-grid { grid-template-columns: 1fr; }
    .adm-sop-cards { grid-template-columns: 1fr; }
    .adm-stack-row { display: none; }
  }

  /* ═══════════════════════════════════════════
     LIGHT THEME OVERRIDES
     ═══════════════════════════════════════════ */

  .adm-light { background: #F5F3EF; color: #1E293B; }
  .adm-light .adm-loading { background: #F5F3EF; color: #64748B; }
  .adm-light .adm-loading-spinner { border-color: rgba(11,110,35,0.15); border-top-color: #0B6E23; }

  .adm-light .adm-header {
    background: rgba(245,243,239,0.95);
    border-bottom-color: #E2E8F0;
  }
  .adm-light .adm-header-title { color: #0F172A; }
  .adm-light .adm-back-link { color: #94A3B8; }
  .adm-light .adm-back-link:hover { color: #475569; }

  .adm-light .adm-theme-toggle {
    border-color: #E2E8F0;
    background: #fff;
    color: #64748B;
  }
  .adm-light .adm-theme-toggle:hover { background: #F1F5F9; color: #0F172A; }

  .adm-light .adm-tabs { background: rgba(0,0,0,0.04); }
  .adm-light .adm-tab { color: #94A3B8; }
  .adm-light .adm-tab:hover { color: #475569; }
  .adm-light .adm-tab-active { background: #fff; color: #0F172A; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .adm-light .adm-tab-count { background: rgba(0,0,0,0.05); color: #94A3B8; }
  .adm-light .adm-tab-active .adm-tab-count { background: rgba(11,110,35,0.1); color: #0B6E23; }

  .adm-light .adm-hero {
    background: linear-gradient(135deg, rgba(11,110,35,0.04) 0%, rgba(245,243,239,0) 60%);
    border-color: #E2E8F0;
  }
  .adm-light .adm-hero-eyebrow { color: #0B6E23; }
  .adm-light .adm-hero-eyebrow::before { background: #0B6E23; }
  .adm-light .adm-hero-title { color: #0F172A; }
  .adm-light .adm-green { color: #0B6E23; }
  .adm-light .adm-hero-desc { color: #64748B; }
  .adm-light .adm-hero-focus {
    background: #fff;
    border-color: #E2E8F0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .adm-light .adm-hero-focus-eyebrow { color: #0B6E23; }
  .adm-light .adm-hero-focus-pct { color: #0F172A; }
  .adm-light .adm-hero-focus-sub { color: #64748B; }
  .adm-light .adm-hero-focus-bar { background: #E2E8F0; }
  .adm-light .adm-hero-focus-fill { background: linear-gradient(90deg, #0B6E23, #15803d); }

  .adm-light .adm-kpi {
    background: #fff;
    border-color: #E2E8F0;
    border-top: 3px solid #CBD5E1;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .adm-light .adm-kpi:hover { background: #FAFAF8; }
  .adm-light .adm-kpi-primary {
    background: linear-gradient(135deg, #0B6E23 0%, #064E16 100%);
    border-color: rgba(11,110,35,0.2);
    border-top-color: #00FF41 !important;
  }
  .adm-light .adm-kpi-primary .adm-kpi-num { color: #fff; }
  .adm-light .adm-kpi-primary .adm-kpi-label { color: rgba(255,255,255,0.8); }
  .adm-light .adm-kpi-primary .adm-kpi-trend { color: rgba(255,255,255,0.9); }
  .adm-light .adm-kpi-label { color: #64748B; }
  .adm-light .adm-kpi-num { color: #0F172A; }
  .adm-light .adm-kpi-trend-up { color: #0B6E23; }

  .adm-light .adm-stack-label { color: #94A3B8; }
  .adm-light .adm-stack-pill {
    background: #fff;
    border-color: #E2E8F0;
    color: #334155;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  .adm-light .adm-stack-pill:hover { background: #F1F5F9; }
  .adm-light .adm-stack-role { color: #94A3B8; }

  .adm-light .adm-card {
    background: #fff;
    border-color: #E2E8F0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .adm-light .adm-card:hover { border-color: #CBD5E1; }
  .adm-light .adm-card-title { color: #0F172A; }
  .adm-light .adm-count-pill { background: #F1F5F9; color: #64748B; }

  .adm-light .adm-brandos-center-pct { color: #0F172A; }
  .adm-light .adm-brandos-center-label { color: #94A3B8; }
  .adm-light .adm-legend-item { color: #64748B; }
  .adm-light .adm-legend-item strong { color: #0F172A; }

  .adm-light .adm-list-row { border-bottom-color: #F1F5F9; }
  .adm-light .adm-list-avatar { background: rgba(11,110,35,0.08); color: #0B6E23; }
  .adm-light .adm-list-name { color: #0F172A; }
  .adm-light .adm-list-sub { color: #94A3B8; }
  .adm-light .adm-list-date { color: #94A3B8; }
  .adm-light .adm-list-amount { color: #0B6E23; }

  .adm-light .adm-table-wrap { border-color: #E2E8F0; }
  .adm-light .adm-table thead th {
    border-bottom-color: #E2E8F0;
    color: #94A3B8;
    background: #FAFAF8;
  }
  .adm-light .adm-table tbody td { border-bottom-color: #F1F5F9; color: #334155; }
  .adm-light .adm-table tbody tr:hover { background: #FAFAF8; }
  .adm-light .adm-td-name { color: #0F172A; }
  .adm-light .adm-td-email { color: #94A3B8; }

  .adm-light .adm-select {
    background: #F1F5F9;
    border-color: #E2E8F0;
    color: #334155;
  }
  .adm-light .adm-select:focus { outline-color: #0B6E23; }

  .adm-light .adm-badge-success { background: rgba(11,110,35,0.08); color: #0B6E23; }
  .adm-light .adm-badge-warning { background: rgba(245,158,11,0.1); color: #B45309; }
  .adm-light .adm-badge-neutral { background: #F1F5F9; color: #94A3B8; }
  .adm-light .adm-badge-brand { background: rgba(11,110,35,0.06); color: #0B6E23; }
  .adm-light .adm-badge-danger { background: rgba(239,68,68,0.08); color: #DC2626; }

  .adm-light .adm-empty { color: #94A3B8; }
  .adm-light .adm-h2 { color: #0F172A; }
  .adm-light .adm-subtitle { color: #64748B; }

  .adm-light .adm-agent-card {
    background: #fff;
    border-color: #E2E8F0;
    border-top: 3px solid #CBD5E1;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .adm-light .adm-agent-card:hover { background: #FAFAF8; }
  .adm-light .adm-agent-name { color: #0F172A; }
  .adm-light .adm-agent-role { color: #64748B; }
  .adm-light .adm-agent-cadence { color: #94A3B8; }

  .adm-light .adm-sop-card {
    background: #fff;
    border-color: #E2E8F0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .adm-light .adm-sop-card:hover { border-color: rgba(11,110,35,0.3); background: rgba(11,110,35,0.02); }
  .adm-light .adm-sop-card-num { color: #94A3B8; }
  .adm-light .adm-sop-card-title { color: #0F172A; }
  .adm-light .adm-sop-card-owner { color: #64748B; }
  .adm-light .adm-sop-card-trigger { color: #94A3B8; }
  .adm-light .adm-sop-category-label { color: #94A3B8; }

  .adm-light .adm-sop-back { color: #94A3B8; }
  .adm-light .adm-sop-back:hover { color: #475569; }
  .adm-light .adm-sop-viewer-title { color: #0F172A; }
  .adm-light .adm-sop-viewer-num { color: #94A3B8; }
  .adm-light .adm-sop-viewer-meta { color: #94A3B8; }
  .adm-light .adm-sop-viewer-sep { color: #CBD5E1; }
  .adm-light .adm-sop-iframe { border-color: #E2E8F0; }
`;
