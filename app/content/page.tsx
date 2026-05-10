import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import ContentWorkspace from "@/components/content/ContentWorkspace";
import type { CoachSettings, Content, Lead, VoiceProfile, VoiceTrainingSource } from "@/lib/types";

export const runtime = 'edge';

export const dynamic = "force-dynamic";

export default async function ContentPage({
  searchParams,
}: {
  searchParams?: { lead?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileRes, leadsRes, contentRes, trainingSourcesRes, settingsRes] = await Promise.all([
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
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("cp_content")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("cp_voice_training_sources")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("ensure_coach_settings").single(),
  ]);

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <ContentWorkspace
          profile={(profileRes.data as VoiceProfile | null) ?? null}
          leads={(leadsRes.data as Lead[] | null) ?? []}
          content={(contentRes.data as Content[] | null) ?? []}
          trainingSources={(trainingSourcesRes.data as VoiceTrainingSource[] | null) ?? []}
          seedLeadId={searchParams?.lead ?? ""}
          settings={(settingsRes.data as CoachSettings | null) ?? null}
        />
      </main>
    </div>
  );
}
