// /onboarding — post-Brand-OS reality questions.
//
// Server component guards the gate: if Brand OS MVP not done yet, bounce
// to /brand-os. If onboarding already complete, bounce to /home. Otherwise
// render the 4-card OnboardingFlow.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import { resolveOnboardingGate, loadOnboardingState } from "@/lib/onboarding";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const gate = await resolveOnboardingGate(supabase, user.id);

  // Already done — go home.
  if (gate.phase === "complete") {
    redirect("/content");
  }

  // Pre-fill any partial answers if the coach skipped before.
  const existing = await loadOnboardingState(supabase, user.id);

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-2xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <OnboardingFlow
          initial={{
            has_past_content:         existing?.has_past_content ?? null,
            has_leads_to_import:      existing?.has_leads_to_import ?? null,
            has_active_clients:       existing?.has_active_clients ?? null,
            creates_content_actively: existing?.creates_content_actively ?? null,
          }}
        />
      </main>
    </div>
  );
}
