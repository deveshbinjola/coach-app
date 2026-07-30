import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import ClientsWorkspace from "@/components/clients/ClientsWorkspace";
import OfferingsWorkspace, { type OfferingCard } from "@/components/clients/OfferingsWorkspace";
import SessionsListClient from "@/components/sessions/SessionsListClient";
import InsightPanel from "@/components/sessions/InsightPanel";
import { enforceOnboardingGate } from "@/lib/onboarding";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";
import type { CoachingSession } from "@/lib/session-intelligence";
import type {
  ClientEvent,
  ClientResource,
  ClientRoom,
  ClientSession,
  ClientTask,
  Lead,
  Offering,
} from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const gateRedirect = await enforceOnboardingGate(supabase, user.id);
  if (gateRedirect) redirect(gateRedirect);
  const [headerEmphasis, navUnlocks] = await Promise.all([
    loadHeaderEmphasis(supabase, user.id),
    loadNavUnlocks(supabase, user.id),
  ]);
  try { cookies().set("nav-unlocks", JSON.stringify(navUnlocks), { path: "/", sameSite: "lax", maxAge: 86400 }); } catch {}

  const validTabs = ["clients", "offerings", "sessions"] as const;
  type TabId = (typeof validTabs)[number];
  const rawTab = searchParams?.tab;
  const tab: TabId = validTabs.includes(rawTab as TabId) ? (rawTab as TabId) : "clients";

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <TabBar active={tab} />
        {tab === "offerings" ? (
          <OfferingsTab coachId={user.id} />
        ) : tab === "sessions" ? (
          <SessionsTab coachId={user.id} />
        ) : (
          <ClientsTab coachId={user.id} />
        )}
      </main>
    </div>
  );
}

// ───────────────────────── Tab bar ──────────────────────────────────────

function TabBar({ active }: { active: "clients" | "offerings" | "sessions" }) {
  const tabs: Array<{ id: "clients" | "offerings" | "sessions"; label: string; href: string }> = [
    { id: "clients",   label: "Clients",   href: "/clients" },
    { id: "offerings", label: "Offerings", href: "/clients?tab=offerings" },
    { id: "sessions",  label: "Sessions",  href: "/clients?tab=sessions" },
  ];
  return (
    <nav className="mb-5 flex items-center gap-1 border-b border-[var(--border)]" aria-label="Clients sections">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`-mb-px px-4 py-2.5 text-[length:var(--t-body)] font-bold border-b-2 transition ${
              on
                ? "border-[var(--brand-strong)] text-[color:var(--text)]"
                : "border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ───────────────────────── Tab content ──────────────────────────────────

async function ClientsTab({ coachId }: { coachId: string }) {
  const supabase = createClient();
  const [leadsRes, roomsRes, sessionsRes, tasksRes, resourcesRes, eventsRes] = await Promise.all([
    supabase
      .from("cp_leads")
      .select("*")
      .eq("coach_id", coachId)
      .eq("status", "client")
      .order("updated_at", { ascending: false }),
    supabase
      .from("cp_client_rooms")
      .select("*")
      .eq("coach_id", coachId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("cp_client_sessions")
      .select("*")
      .eq("coach_id", coachId)
      .order("session_at", { ascending: false })
      .limit(100),
    supabase
      .from("cp_client_tasks")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("cp_client_resources")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("cp_client_events")
      .select("*")
      .eq("coach_id", coachId)
      .order("starts_at", { ascending: true })
      .limit(100),
  ]);

  return (
    <ClientsWorkspace
      coachId={coachId}
      leads={(leadsRes.data ?? []) as Lead[]}
      rooms={(roomsRes.data ?? []) as ClientRoom[]}
      sessions={(sessionsRes.data ?? []) as ClientSession[]}
      tasks={(tasksRes.data ?? []) as ClientTask[]}
      resources={(resourcesRes.data ?? []) as ClientResource[]}
      events={(eventsRes.data ?? []) as ClientEvent[]}
    />
  );
}

async function OfferingsTab({ coachId }: { coachId: string }) {
  const supabase = createClient();
  const [offeringsRes, membersRes] = await Promise.all([
    supabase
      .from("cp_offerings")
      .select("*")
      .eq("coach_id", coachId)
      .order("status", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("cp_offering_members")
      .select("offering_id, status"),
  ]);
  const offerings = (offeringsRes.data ?? []) as Offering[];
  const memberRows = (membersRes.data ?? []) as Array<{ offering_id: string; status: string }>;
  const counts: Record<string, number> = {};
  for (const m of memberRows) {
    if (m.status === "active") counts[m.offering_id] = (counts[m.offering_id] ?? 0) + 1;
  }
  const cards: OfferingCard[] = offerings.map((o) => ({
    ...o,
    member_count: counts[o.id] ?? 0,
  }));

  return <OfferingsWorkspace offerings={cards} />;
}

async function SessionsTab({ coachId }: { coachId: string }) {
  const supabase = createClient();
  const [sessionsRes, clientsRes] = await Promise.all([
    supabase
      .from("cp_coaching_sessions")
      .select("*")
      .eq("coach_id", coachId)
      .order("session_date", { ascending: false })
      .limit(50),
    supabase
      .from("cp_leads")
      .select("id, full_name")
      .eq("coach_id", coachId)
      .eq("status", "client")
      .order("full_name", { ascending: true }),
  ]);

  const sessions = (sessionsRes.data ?? []) as CoachingSession[];
  const clients = (clientsRes.data ?? []) as Array<Pick<Lead, "id" | "full_name">>;

  const clientMap: Record<string, string> = {};
  for (const c of clients) {
    clientMap[c.id] = c.full_name;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)]">
            Capture, reflect, notice patterns.
          </p>
        </div>
        <Link
          href="/sessions/new"
          className="inline-flex items-center gap-2 bg-[var(--brand)] text-[color:var(--text-inverse)] font-bold text-sm px-5 py-2.5 rounded-[var(--r-md)] hover:bg-[var(--brand-strong)] hover:-translate-y-px transition"
        >
          + New session
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <SessionsListClient sessions={sessions} clientMap={clientMap} />
        <aside className="space-y-4">
          <InsightPanel />
        </aside>
      </div>
    </div>
  );
}
