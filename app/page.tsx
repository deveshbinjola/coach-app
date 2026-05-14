// Root — gate check before sending the coach into the platform.
//
// Order of operations:
//   1. Not logged in → /login
//   2. Brand OS MVP not done → /brand-os (or resume current run)
//   3. Onboarding reality questions not done → /onboarding
//   4. Otherwise → /command-center

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { enforceOnboardingGate } from "@/lib/onboarding";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const redirectTo = await enforceOnboardingGate(supabase, user.id);
  if (redirectTo) redirect(redirectTo);

  redirect("/command-center");
}
