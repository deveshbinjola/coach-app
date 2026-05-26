// GET   /api/funnels/public?slug=xxx   — fetch published funnel by slug (public, no auth)
// POST  /api/funnels/public            — submit quiz response + create lead (public, no auth)
// PATCH /api/funnels/public            — increment start count (public, no auth)
//
// GET uses the anon client — RLS policy "public reads published funnels"
// allows SELECT where published = true. No service-role key needed.
//
// POST/PATCH use the admin client (bypasses RLS) because they write data
// (create leads, insert responses, increment counters) that anon can't do.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";

// Lightweight anon client for public reads. No auth session needed —
// just the public anon key + RLS policy on published = true.
function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export const runtime = "edge";

// ── GET: fetch published funnel by slug ──────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter." }, { status: 400 });
  }

  // Use anon client — RLS allows SELECT on published funnels.
  const anon = createAnonClient();
  const { data, error } = await anon
    .from("cp_funnels")
    .select("id, slug, title, config, type")
    .eq("slug", slug)
    .eq("published", true)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
  }

  // Increment view count (fire and forget). Uses admin if available,
  // falls back silently — views are a nice-to-have metric, not critical path.
  try {
    const admin = createAdminClient();
    admin.rpc("increment_funnel_view", { funnel_id: data.id }).then(() => {});
  } catch {}

  return NextResponse.json({
    funnel: {
      id: data.id,
      slug: data.slug,
      title: data.title,
      config: data.config,
      type: data.type,
    },
  });
}

// ── POST: submit quiz response ───────────────────────────

type SubmitBody = {
  funnel_id: string;
  answers: Array<{ q_id: string; choice: string }>;
  result_key: string;
  email?: string;
  name?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

export async function POST(request: NextRequest) {
  let body: SubmitBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.funnel_id || !body.answers || !body.result_key) {
    return NextResponse.json({ error: "Missing required fields: funnel_id, answers, result_key" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up the funnel to get coach_id
  const { data: funnel, error: funnelErr } = await admin
    .from("cp_funnels")
    .select("id, coach_id, published, config")
    .eq("id", body.funnel_id)
    .eq("published", true)
    .single();

  if (funnelErr || !funnel) {
    return NextResponse.json({ error: "Quiz not found or not published." }, { status: 404 });
  }

  // Get the result archetype name for tagging
  const config = funnel.config as { results?: Array<{ key: string; pillar_name: string }> };
  const resultMatch = config.results?.find((r) => r.key === body.result_key);
  const archetypeName = resultMatch?.pillar_name || body.result_key;

  const userAgent = request.headers.get("user-agent") || undefined;

  // Create lead if email provided
  let leadId: string | undefined;

  if (body.email) {
    const email = body.email.trim().toLowerCase();

    // Check for existing lead with same email for this coach
    const { data: existingLead } = await admin
      .from("cp_leads")
      .select("id")
      .eq("coach_id", funnel.coach_id)
      .eq("email", email)
      .limit(1)
      .single();

    if (existingLead) {
      // Update existing lead with quiz archetype tag
      leadId = existingLead.id;
      const { data: currentLead } = await admin
        .from("cp_leads")
        .select("tags")
        .eq("id", leadId)
        .single();

      const existingTags = Array.isArray(currentLead?.tags) ? currentLead.tags : [];
      const quizTag = `quiz:${archetypeName}`;
      if (!existingTags.includes(quizTag)) {
        await admin
          .from("cp_leads")
          .update({
            tags: [...existingTags, quizTag],
            source: "funnel",
          })
          .eq("id", leadId);
      }
    } else {
      // Create new lead
      const { data: newLead } = await admin
        .from("cp_leads")
        .insert({
          coach_id: funnel.coach_id,
          email,
          name: body.name?.trim() || null,
          source: "funnel",
          tags: [`quiz:${archetypeName}`],
          warmth: "warm",
        })
        .select("id")
        .single();

      leadId = newLead?.id;
    }
  }

  // Save the response
  const { data: response, error: responseErr } = await admin
    .from("cp_funnel_responses")
    .insert({
      funnel_id: body.funnel_id,
      coach_id: funnel.coach_id,
      answers: body.answers,
      result_key: body.result_key,
      email: body.email?.trim().toLowerCase() || null,
      name: body.name?.trim() || null,
      lead_id: leadId || null,
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      user_agent: userAgent || null,
    })
    .select("id")
    .single();

  if (responseErr) {
    return NextResponse.json({ error: "Failed to save response." }, { status: 500 });
  }

  // Counter increments handled by trg_funnel_response_counters trigger in DB.
  // No manual update needed here.

  return NextResponse.json({ ok: true, response_id: response?.id });
}

// ── PATCH: increment start count ────────────────────────

export async function PATCH(request: NextRequest) {
  let body: { funnel_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.funnel_id) {
    return NextResponse.json({ error: "Missing funnel_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin.rpc("increment_funnel_start", { funnel_id: body.funnel_id });

  return NextResponse.json({ ok: true });
}
