import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import FunnelsWorkspace from "@/components/funnels/FunnelsWorkspace";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export type FunnelRow = {
  id: string;
  slug: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  published: boolean;
  view_count: number;
  start_count: number;
  complete_count: number;
  email_count: number;
  created_at: string;
  updated_at: string;
};

export default async function FunnelsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [navUnlocks, { data: funnels }, { data: brandOsRuns }] =
    await Promise.all([
      loadNavUnlocks(supabase, user.id),
      supabase
        .from("cp_funnels")
        .select(
          "id, slug, type, title, config, published, view_count, start_count, complete_count, email_count, created_at, updated_at"
        )
        .eq("coach_id", user.id)
        .order("created_at", { ascending: false }),
      // Check if coach has a completed Brand OS run (needed to generate)
      supabase
        .from("cp_brand_os_runs")
        .select("id")
        .eq("coach_id", user.id)
        .eq("state", "complete")
        .not("synthesis_json", "is", null)
        .limit(1),
    ]);

  try {
    cookies().set("nav-unlocks", JSON.stringify(navUnlocks), {
      path: "/",
      sameSite: "lax",
      maxAge: 86400,
    });
  } catch {}

  const hasBrandOs = (brandOsRuns?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-5xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <FunnelsWorkspace
          funnels={(funnels as FunnelRow[] | null) ?? []}
          hasBrandOs={hasBrandOs}
        />
      </main>
    </div>
  );
}
