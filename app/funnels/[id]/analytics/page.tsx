// /funnels/[id]/analytics — per-question analytics for a quiz funnel.
//
// Shows drop-off per question, choice distribution bars, and result
// archetype breakdown. Data comes from /api/funnels/[id]/analytics.

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";
import AnalyticsClient from "./AnalyticsClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function AnalyticsPage({ params }: PageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [navUnlocks, { data: funnel }] = await Promise.all([
    loadNavUnlocks(supabase, user.id),
    supabase
      .from("cp_funnels")
      .select("id, title, slug, published")
      .eq("id", params.id)
      .eq("coach_id", user.id)
      .single(),
  ]);

  if (!funnel) notFound();

  try {
    cookies().set("nav-unlocks", JSON.stringify(navUnlocks), {
      path: "/",
      sameSite: "lax",
      maxAge: 86400,
    });
  } catch {}

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-4xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <AnalyticsClient
          funnelId={funnel.id}
          funnelTitle={funnel.title}
          funnelSlug={funnel.slug}
        />
      </main>
    </div>
  );
}
