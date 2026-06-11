import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import { enforceOnboardingGate } from "@/lib/onboarding";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";
import SessionDetailClient from "@/components/sessions/SessionDetailClient";
import SessionBrief from "@/components/sessions/SessionBrief";
import SessionDistillStatus from "@/components/sessions/SessionDistillStatus";
import CoachingPrepCard from "@/components/coaching/CoachingPrepCard";
import { getCoachingPrep } from "@/lib/coaching-prep";
import type { CoachingSession } from "@/lib/session-intelligence";
import type { Lead } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
}: {
  params: { id: string };
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
  try {
    cookies().set("nav-unlocks", JSON.stringify(navUnlocks), {
      path: "/",
      sameSite: "lax",
      maxAge: 86400,
    });
  } catch {}

  // Fetch session + client info
  const { data: session } = await supabase
    .from("cp_coaching_sessions")
    .select("*")
    .eq("id", params.id)
    .eq("coach_id", user.id)
    .maybeSingle();

  if (!session) notFound();

  const typedSession = session as CoachingSession;

  const { data: clientLead } = await supabase
    .from("cp_leads")
    .select("id, full_name")
    .eq("id", typedSession.client_id)
    .eq("coach_id", user.id)
    .maybeSingle();

  const clientName = (clientLead as Pick<Lead, "id" | "full_name"> | null)?.full_name ?? "Unknown client";

  const prep = typedSession.client_id
    ? await getCoachingPrep(supabase, user.id, typedSession.client_id)
    : null;

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
        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          <Link
            href="/sessions"
            className="hover:text-[color:var(--text)] transition"
          >
            Sessions
          </Link>
          <span>/</span>
          <span className="text-[color:var(--text)] font-bold truncate">
            {clientName}
          </span>
        </nav>

        <div className="mb-6 space-y-4">
          <SessionDistillStatus sessionId={typedSession.id} clientName={clientName} />
          {prep && <CoachingPrepCard prep={prep} clientName={clientName} />}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main session detail */}
          <SessionDetailClient
            session={typedSession}
            clientName={clientName}
          />

          {/* Pre-session brief sidebar */}
          <aside className="space-y-4">
            <SessionBrief
              clientId={typedSession.client_id}
              clientName={clientName}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
