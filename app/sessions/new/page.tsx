import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import { enforceOnboardingGate } from "@/lib/onboarding";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";
import NewSessionForm from "@/components/sessions/NewSessionForm";
import type { Lead } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
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

  // Fetch clients for selector
  const { data: clientsData } = await supabase
    .from("cp_leads")
    .select("id, full_name")
    .eq("coach_id", user.id)
    .eq("status", "client")
    .order("full_name", { ascending: true });

  const clients = (clientsData ?? []) as Array<Pick<Lead, "id" | "full_name">>;

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-8">
        <NewSessionForm clients={clients} />
      </main>
    </div>
  );
}
