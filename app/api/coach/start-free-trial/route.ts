// POST /api/coach/start-free-trial
//
// Flips a trial-tier coach (someone who bought the $7 Brand OS Quick
// Start) up to plan='standard' with a 10-day free trial window. They
// now have full platform access — Content, Leads, Clients, all of it.
//
// On day 10+1, a separate downgrade check (called from
// enforceOnboardingGate on next page load) will move them back to
// plan='trial' if they haven't converted to a paid subscription.
//
// Idempotent: if already standard, returns current state.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";

// 14-day standard SaaS trial. Long enough to actually use the platform
// for two real content cycles, short enough that the conversion moment
// stays present.
const TRIAL_DAYS = 14;

export async function POST(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pull current coach row — needs admin client because plan upgrade
  // crosses RLS (trial users can't normally write their own plan field).
  const admin = createAdminClient();
  const { data: coach } = await admin
    .from("cp_coaches")
    .select("plan, trial_started_at, trial_ends_at, upgraded_from_tripwire_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!coach) return NextResponse.json({ error: "coach_not_found" }, { status: 404 });

  // Already on a full plan (and not yet expired) → no-op.
  const now = new Date();
  if (coach.plan !== "trial") {
    return NextResponse.json({
      ok: true,
      already_active: true,
      plan: coach.plan,
      trial_ends_at: coach.trial_ends_at,
    });
  }

  // Upgrade. Plan flips to 'standard', timestamps set, attribution stamped
  // if this is their first upgrade from the tripwire path.
  const trialStart = now.toISOString();
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const patch: Record<string, unknown> = {
    plan: "standard",
    trial_started_at: trialStart,
    trial_ends_at: trialEnd,
    updated_at: trialStart,
  };
  if (!coach.upgraded_from_tripwire_at) {
    patch.upgraded_from_tripwire_at = trialStart;
  }

  const { error: upErr } = await admin
    .from("cp_coaches")
    .update(patch)
    .eq("id", user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Also stamp the tripwire purchase row for attribution analytics.
  await admin
    .from("cp_tripwire_purchases")
    .update({ upgraded_at: trialStart })
    .eq("coach_id", user.id)
    .is("upgraded_at", null);

  return NextResponse.json({
    ok: true,
    plan: "standard",
    trial_started_at: trialStart,
    trial_ends_at: trialEnd,
    days: TRIAL_DAYS,
  });
}
