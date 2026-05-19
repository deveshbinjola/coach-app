import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import FrameworkGenerator from "@/components/FrameworkGenerator";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type FrameworkRow = {
  id: string;
  acronym: string;
  name: string;
  tagline: string | null;
  pillars: Array<{ letter: string; title: string; description: string }>;
  lead_magnet_type: string | null;
  is_primary: boolean;
  created_at: string;
};

export default async function FrameworkPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: frameworks } = await supabase
    .from("cp_frameworks")
    .select("*")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <FrameworkGenerator
          existing={(frameworks as FrameworkRow[] | null) ?? []}
        />
      </main>
    </div>
  );
}
