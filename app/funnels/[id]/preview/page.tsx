// /funnels/[id]/preview — authenticated preview using the REAL QuizPlayer.
//
// Unlike the inline sidebar preview (which is a lightweight HTML approximation),
// this renders the actual QuizPlayer component. Works for unpublished quizzes.
// Only accessible to the quiz owner.

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import PreviewClient from "./PreviewClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

type FunnelConfig = {
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

export default async function PreviewFunnelPage({ params }: PageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: funnel } = await supabase
    .from("cp_funnels")
    .select("id, slug, title, config, published")
    .eq("id", params.id)
    .eq("coach_id", user.id)
    .single();

  if (!funnel) notFound();

  return (
    <PreviewClient
      funnelId={funnel.id}
      config={funnel.config as FunnelConfig}
      title={funnel.title}
      published={funnel.published}
      slug={funnel.slug}
    />
  );
}
