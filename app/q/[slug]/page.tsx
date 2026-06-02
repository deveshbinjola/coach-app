// /q/[slug] — public quiz page. No auth required.
//
// Server component: fetches the published funnel on the server (anon client,
// RLS allows reads where published = true) and passes it straight to the
// client. This eliminates the client-side re-fetch + loading spinner that
// made the quiz "load, then pop in." Edge runtime for Cloudflare Pages.

import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import QuizPageClient, { type FunnelData } from "./QuizPageClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PageProps = {
  params: { slug: string };
};

export default async function QuizPage({ params }: PageProps) {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data } = await anon
    .from("cp_funnels")
    .select("id, slug, title, config, type")
    .eq("slug", params.slug)
    .eq("published", true)
    .single();

  const funnel = (data as FunnelData | null) ?? null;

  // View count (best-effort). Awaited so the edge runtime doesn't cancel it,
  // but never allowed to block or break the page.
  if (funnel) {
    try {
      const admin = createAdminClient();
      await admin.rpc("increment_funnel_view", { funnel_id: funnel.id });
    } catch {}
  }

  return <QuizPageClient funnel={funnel} />;
}
