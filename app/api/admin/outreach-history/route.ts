// GET /api/admin/outreach-history
//
// Returns up to 100 recent outreach sends with their downstream status:
//   - Did they sign up? (cp_coaches row by email match)
//   - Which drip day are they on? (onboarding_email_step)
//   - Snapshot started / completed? (cp_brand_os_runs)
//
// Sunny sees who's been touched, who's converted, who's drifting.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";

const ADMIN_EMAIL = "sunny.binjola@gmail.com";

export async function GET(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Recent outreach.
  const { data: outreach, error: outreachErr } = await admin
    .from("cp_outreach_log")
    .select("id, email, first_name, kind, note, snapshot_link, sent_at, claimed_coach_id, claimed_at, referred_by_email, referred_by_first_name")
    .order("sent_at", { ascending: false })
    .limit(100);

  if (outreachErr) {
    return NextResponse.json({ error: outreachErr.message }, { status: 500 });
  }
  if (!outreach || outreach.length === 0) {
    return NextResponse.json({ outreach: [] });
  }

  const emails = Array.from(new Set(outreach.map((o) => o.email)));

  // 2. Coaches who signed up with these emails.
  const { data: coaches } = await admin
    .from("cp_coaches")
    .select("id, email, full_name, onboarding_email_step, last_onboarding_email_at, created_at")
    .in("email", emails);

  const coachByEmail = new Map<string, {
    id: string;
    onboarding_email_step: number;
    last_onboarding_email_at: string | null;
    created_at: string;
  }>();
  (coaches ?? []).forEach((c) => coachByEmail.set(c.email as string, {
    id: c.id as string,
    onboarding_email_step: (c.onboarding_email_step as number) ?? 0,
    last_onboarding_email_at: c.last_onboarding_email_at as string | null,
    created_at: c.created_at as string,
  }));

  // 3. Brand OS runs by email_for_claim (anonymous) OR coach_id (signed up).
  const coachIds = (coaches ?? []).map((c) => c.id as string);

  const { data: anonRuns } = await admin
    .from("cp_brand_os_runs")
    .select("id, email_for_claim, coach_id, archetype, current_question_id, current_module, tier, variant_v, state")
    .in("email_for_claim", emails);

  const { data: authedRuns } = coachIds.length > 0
    ? await admin
        .from("cp_brand_os_runs")
        .select("id, email_for_claim, coach_id, archetype, current_question_id, current_module, tier, variant_v, state")
        .in("coach_id", coachIds)
    : { data: [] };

  type RunRow = {
    id: string;
    email_for_claim: string | null;
    coach_id: string | null;
    archetype: string | null;
    current_question_id: string | null;
    current_module: string | null;
    tier: string | null;
    variant_v: string | null;
    state: string;
  };
  const allRuns: RunRow[] = [
    ...((anonRuns ?? []) as RunRow[]),
    ...((authedRuns ?? []) as RunRow[]),
  ];

  // Index runs by email (either email_for_claim or coach_id → email).
  const coachIdToEmail = new Map<string, string>();
  (coaches ?? []).forEach((c) => coachIdToEmail.set(c.id as string, c.email as string));

  const runsByEmail = new Map<string, RunRow[]>();
  allRuns.forEach((r) => {
    const email = r.email_for_claim ?? (r.coach_id ? coachIdToEmail.get(r.coach_id) ?? null : null);
    if (!email) return;
    const arr = runsByEmail.get(email) ?? [];
    arr.push(r);
    runsByEmail.set(email, arr);
  });

  // 4. Build the response.
  const rows = outreach.map((o) => {
    const coach = coachByEmail.get(o.email);
    const runs = runsByEmail.get(o.email) ?? [];
    const latestV5 = runs
      .filter((r) => r.variant_v === "v5")
      .sort((a, b) => (a.id < b.id ? 1 : -1))[0]; // any v5 run

    const hasSignedUp = Boolean(coach);
    const dripStep = coach?.onboarding_email_step ?? 0;
    const archetype = latestV5?.archetype ?? null;
    const snapshotState =
      latestV5
        ? (latestV5.archetype ? "completed" : "in_progress")
        : "none";

    return {
      id: o.id,
      sent_at: o.sent_at,
      email: o.email,
      first_name: o.first_name,
      kind: o.kind,
      note: o.note,
      referred_by_email: o.referred_by_email ?? null,
      referred_by_first_name: o.referred_by_first_name ?? null,
      signed_up: hasSignedUp,
      coach_id: coach?.id ?? null,
      signed_up_at: coach?.created_at ?? null,
      drip_step: dripStep, // 0-5 (or 99 stopped)
      last_drip_at: coach?.last_onboarding_email_at ?? null,
      snapshot_state: snapshotState as "none" | "in_progress" | "completed",
      archetype,
      snapshot_run_id: latestV5?.id ?? null,
    };
  });

  // Aggregate referrers · top of leaderboard
  const referrers = new Map<string, { email: string; first_name: string | null; count: number; signups: number; snapshots: number }>();
  rows.forEach((r) => {
    if (!r.referred_by_email) return;
    const cur = referrers.get(r.referred_by_email) ?? {
      email: r.referred_by_email,
      first_name: r.referred_by_first_name,
      count: 0,
      signups: 0,
      snapshots: 0,
    };
    cur.count += 1;
    if (r.signed_up) cur.signups += 1;
    if (r.snapshot_state === "completed") cur.snapshots += 1;
    referrers.set(r.referred_by_email, cur);
  });

  const referrerLeaderboard = Array.from(referrers.values())
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    outreach: rows,
    total: rows.length,
    signed_up_count: rows.filter((r) => r.signed_up).length,
    snapshot_done_count: rows.filter((r) => r.snapshot_state === "completed").length,
    referral_count: rows.filter((r) => r.kind === "referral").length,
    referrer_leaderboard: referrerLeaderboard,
  });
}
