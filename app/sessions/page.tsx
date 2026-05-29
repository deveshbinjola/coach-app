import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import { enforceOnboardingGate } from "@/lib/onboarding";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";
import SessionsListClient from "@/components/sessions/SessionsListClient";
import InsightPanel from "@/components/sessions/InsightPanel";
import type { CoachingSession } from "@/lib/session-intelligence";
import type { Lead } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SessionsPage() {
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
  try {
    cookies().set("nav-unlocks", JSON.stringify(navUnlocks), {
      path: "/",
      sameSite: "lax",
      maxAge: 86400,
    });
  } catch {}

  // Fetch recent sessions + client names
  const [sessionsRes, clientsRes] = await Promise.all([
    supabase
      .from("cp_coaching_sessions")
      .select("*")
      .eq("coach_id", user.id)
      .order("session_date", { ascending: false })
      .limit(50),
    supabase
      .from("cp_leads")
      .select("id, full_name")
      .eq("coach_id", user.id)
      .eq("status", "client")
      .order("full_name", { ascending: true }),
  ]);

  const sessions = (sessionsRes.data ?? []) as CoachingSession[];
  const clients = (clientsRes.data ?? []) as Array<Pick<Lead, "id" | "full_name">>;

  // Build client name lookup
  const clientMap: Record<string, string> = {};
  for (const c of clients) {
    clientMap[c.id] = c.full_name;
  }

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-5xl mx-auto px-3 py-4 sm:px-6 sm:py-8">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[length:var(--t-h1)] font-extrabold text-[color:var(--text)]">
              Sessions
            </h1>
            <p className="mt-1 text-[length:var(--t-body)] text-[color:var(--text-muted)]">
              Capture, reflect, notice patterns.
            </p>
          </div>
          <Link
            href="/sessions/new"
            className="inline-flex items-center gap-2 bg-[var(--brand)] text-[color:var(--navy)] font-bold text-sm px-5 py-2.5 rounded-[var(--r-md)] hover:bg-[var(--brand-strong)] hover:-translate-y-px transition"
          >
            + New session
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Session list */}
          <SessionsListClient
            sessions={sessions}
            clientMap={clientMap}
          />

          {/* Insights sidebar */}
          <aside className="space-y-4">
            <InsightPanel />
          </aside>
        </div>
      </main>
    </div>
  );
}
