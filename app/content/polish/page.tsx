// app/content/polish/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userDisplayName, userAvatarUrl } from "@/lib/user-display";
import Header from "@/components/Header";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import PolishPanel from "@/components/content/PolishPanel";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function PolishPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [headerEmphasis, navUnlocks, { data: profile }] = await Promise.all([
    loadHeaderEmphasis(supabase, user.id),
    loadNavUnlocks(supabase, user.id),
    supabase
      .from("cp_voice_profiles")
      .select("voice_json")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const hasVoice = profile !== null;
  const training = (profile?.voice_json as { training_signal?: { fallback?: boolean; interview_answers?: number } } | null)?.training_signal;
  const weakVoice = Boolean(training?.fallback) || (typeof training?.interview_answers === "number" && training.interview_answers < 3);

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
        <PolishPanel hasVoice={hasVoice} weakVoice={weakVoice} />
      </main>
    </div>
  );
}
