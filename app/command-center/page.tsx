// app/command-center/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName, userFirstName } from "@/lib/user-display";
import Header from "@/components/Header";
import ClaimVoiceProfile from "@/components/ClaimVoiceProfile";
import CommandCenterView from "@/components/command-center/CommandCenterView";
import { getBusinessPulse } from "@/lib/ambient";
import { enforceOnboardingGate } from "@/lib/onboarding";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";
import { getAdminDashboard } from "@/lib/admin-dashboard";
import AdminDashboardView from "@/components/command-center/admin/AdminDashboardView";
import ModeToggleBar from "@/components/command-center/ModeToggleBar";
import type { Mode } from "@/components/command-center/ModeToggle";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const gateRedirect = await enforceOnboardingGate(supabase, user.id);
  if (gateRedirect) redirect(gateRedirect);
  const [headerEmphasis, navUnlocks] = await Promise.all([
    loadHeaderEmphasis(supabase, user.id),
    loadNavUnlocks(supabase, user.id),
  ]);
  try { cookies().set("nav-unlocks", JSON.stringify(navUnlocks), { path: "/", sameSite: "lax", maxAge: 86400 }); } catch {}

  const mode: Mode = cookies().get("cc-mode")?.value === "admin" ? "admin" : "coach";
  const now = Date.now();
  const toggle = <ModeToggleBar mode={mode} />;

  if (mode === "admin") {
    const dashboard = await getAdminDashboard(user.id, now);
    return (
      <div className="min-h-screen">
        <Header
          email={user.email ?? ""}
          name={userDisplayName(user.user_metadata)}
          avatarUrl={userAvatarUrl(user.user_metadata)}
          emphasis={headerEmphasis}
          navUnlocks={navUnlocks}
        />
        <main className="max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
          <ClaimVoiceProfile />
          <AdminDashboardView data={dashboard} toggle={toggle} />
        </main>
      </div>
    );
  }

  const pulse = await getBusinessPulse(user.id, now);
  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <ClaimVoiceProfile />
        <CommandCenterView
          pulse={pulse}
          coachFirstName={userFirstName(user.email, user.user_metadata)}
          toggle={toggle}
        />
      </main>
    </div>
  );
}
