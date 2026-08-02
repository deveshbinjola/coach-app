// POST  /api/win   — record a scorecard completion (public, no auth).
// PATCH /api/win    — attach an email/name to a completion (public, no auth).
//
// Writes go through the service-role admin client because cp_scorecard_leads
// has RLS enabled with no public policies (locked by default). A completion is
// stored even without an email — it is still a signal. The email is patched on
// when the coach asks for their moves. Rate-limited by IP to deter spam.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "edge";

type Tier = "positioned_to_win" | "at_risk" | "commodity_zone";
type AxisKey = "pov" | "methodology" | "niche" | "proof" | "audience" | "category";

const TIERS: Tier[] = ["positioned_to_win", "at_risk", "commodity_zone"];
const AXES: AxisKey[] = ["pov", "methodology", "niche", "proof", "audience", "category"];

type PostBody = {
  answers: Array<{ q_id: string; choice: string; points: number }>;
  axis_scores: Record<string, number>;
  total: number;
  tier: Tier;
  gap_axis: AxisKey;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
};

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(`win/submit:${clientIp(request)}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many submissions. Please wait a moment." }, { status: 429 });
  }

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate the scored payload before it touches the DB.
  if (
    !Array.isArray(body.answers) ||
    typeof body.axis_scores !== "object" || body.axis_scores === null ||
    typeof body.total !== "number" || body.total < 0 || body.total > 100 ||
    !TIERS.includes(body.tier) ||
    !AXES.includes(body.gap_axis)
  ) {
    return NextResponse.json({ error: "Malformed scorecard payload." }, { status: 400 });
  }

  // If a logged-in coach takes it, link them. Cold public traffic stays null.
  let coachId: string | null = null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    coachId = user?.id ?? null;
  } catch {
    /* anon visitor */
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_scorecard_leads")
    .insert({
      answers: body.answers,
      axis_scores: body.axis_scores,
      total: Math.round(body.total),
      tier: body.tier,
      gap_axis: body.gap_axis,
      coach_id: coachId,
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      referrer: body.referrer || null,
      user_agent: request.headers.get("user-agent") || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to save result." }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

type PatchBody = { id?: string; email?: string; name?: string };

export async function PATCH(request: NextRequest) {
  const rl = rateLimit(`win/email:${clientIp(request)}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!body.id || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Missing id or valid email." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("cp_scorecard_leads")
    .update({ email, name: body.name?.trim() || null })
    .eq("id", body.id);

  if (error) {
    return NextResponse.json({ error: "Could not save email." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
