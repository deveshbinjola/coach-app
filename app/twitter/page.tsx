import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import type { Content } from "@/lib/types";
import { TwitterDashboard } from "@/components/twitter/TwitterDashboard";
import { hasTwitterCredentials } from "@/lib/twitter-poster";

export default async function TwitterPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: drafts } = await supabase
    .from("cp_content")
    .select("*")
    .eq("coach_id", user.id)
    .eq("platform", "twitter")
    .in("status", ["draft", "scheduled"])
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: published } = await supabase
    .from("cp_content")
    .select("*")
    .eq("coach_id", user.id)
    .eq("platform", "twitter")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <TwitterDashboard
        initialDrafts={(drafts as Content[]) ?? []}
        initialPublished={(published as Content[]) ?? []}
        hasApiKeys={hasTwitterCredentials()}
      />
    </div>
  );
}
