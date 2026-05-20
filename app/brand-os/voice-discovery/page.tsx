import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import VoiceDiscovery from "@/components/brand-os/VoiceDiscovery";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function VoiceDiscoveryPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: coach } = await supabase
    .from("cp_coaches")
    .select("audience_serves")
    .eq("id", user.id)
    .maybeSingle();

  const audience = (coach?.audience_serves as string) ?? "";

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="px-3 py-6 sm:px-6 sm:py-10">
        <VoiceDiscovery audience={audience} />
      </main>
    </div>
  );
}
