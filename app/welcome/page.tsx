// /welcome — first 5–30 minutes of a new coach's life in this app.
//
// The bet: a coach who has built voice + watched it draft a message in
// their voice has felt the product. That's the activation moment. Until
// they hit it, every other surface looks like an empty CRM.
//
// Flow (4 steps):
//   1. Hello       — what we're about to do, why it matters, ~2 minutes total
//   2. Voice       — the 5-question VoiceSetupFlow
//   3. Magic       — paste a message a lead might send, AI replies in their voice
//   4. Done        — "this fires automatically every time a lead lands"
//
// Server checks if the coach already has a voice profile + leads. If yes,
// they're past activation — bounce them to /command-center. The whole
// onboarding is also skippable (top-right "Skip for now") for power users.
//
// Middleware-level redirect from /command-center / /inbox / / on first
// login is wired in middleware.ts.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import WelcomeFlow from "@/components/WelcomeFlow";
import type { VoiceProfile } from "@/lib/types";

export const runtime = 'edge';

export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: { force?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If the coach has finished activation already, send them home — unless
  // they came back here intentionally (?force=1) to redo voice or replay
  // the magic moment.
  const [{ data: profile }, { count: leadCount }] = await Promise.all([
    supabase
      .from("cp_voice_profiles")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cp_leads")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", user.id),
  ]);

  const hasProfile = !!profile;
  const hasLeads = (leadCount ?? 0) > 0;
  const force = searchParams.force === "1";

  if (hasProfile && hasLeads && !force) {
    redirect("/command-center");
  }

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-6xl mx-auto px-3 py-4 sm:px-8 sm:py-8 overflow-hidden">
        <WelcomeFlow
          startingProfile={(profile as VoiceProfile | null) ?? null}
          coachFirstName={firstName(user.email ?? "", user.user_metadata)}
        />
      </main>
    </div>
  );
}

function firstName(
  email: string,
  metadata: Record<string, unknown> | undefined
): string {
  const full =
    (metadata?.full_name as string | undefined) ??
    (metadata?.name as string | undefined);
  if (full) return full.split(" ")[0] ?? full;
  const prefix = email.split("@")[0] ?? "";
  return prefix.charAt(0).toUpperCase() + prefix.slice(1).split(/[._\-+]/)[0];
}
