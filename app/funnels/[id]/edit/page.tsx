import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import QuizBuilder from "@/components/funnels/QuizBuilder";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function EditFunnelPage({ params }: PageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [navUnlocks, { data: funnel }] = await Promise.all([
    loadNavUnlocks(supabase, user.id),
    supabase
      .from("cp_funnels")
      .select("id, slug, title, config, published, type")
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
      <QuizBuilder
        funnel={{
          id: funnel.id,
          slug: funnel.slug,
          title: funnel.title,
          config: funnel.config as QuizBuilderConfig,
          published: funnel.published,
        }}
      />
    </div>
  );
}

// Re-export the config type so the server component can cast properly
type QuizBuilderConfig = {
  intro: { headline: string; subhead: string; cta_label: string };
  questions: Array<{
    id: string;
    text: string;
    choices: Array<{ key: string; text: string; scores: Record<string, number> }>;
  }>;
  results: Array<{
    key: string;
    pillar_name: string;
    headline: string;
    body: string;
    cta_text: string;
    cta_url: string;
  }>;
  branding: {
    primary_hex: string;
    accent_hex: string;
    background_hex: string;
    font_family: string;
  };
};
