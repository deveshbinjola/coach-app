// /api/coach/onboarding
//
// GET    → current onboarding state + gate phase
// POST   → save the 4 reality-question answers, derive emphasis flags,
//          mark completed_at
// DELETE → reset (used by /settings "redo onboarding" link, if shipped)

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  loadOnboardingState,
  resolveOnboardingGate,
  saveOnboardingAnswers,
  type OnboardingAnswers,
} from "@/lib/onboarding";

export const runtime = "edge";

export async function GET(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await resolveOnboardingGate(supabase, user.id);
  const state = await loadOnboardingState(supabase, user.id);
  return NextResponse.json({ gate, state });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<OnboardingAnswers>;
  try {
    body = (await request.json()) as Partial<OnboardingAnswers>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // All four must be answered (true/false). Null = skipped is fine — we
  // store it and let the coach return later — but we won't mark
  // onboarding_completed_at unless they explicitly chose for each.
  const answers: OnboardingAnswers = {
    has_past_content:         normalizeBool(body.has_past_content),
    has_leads_to_import:      normalizeBool(body.has_leads_to_import),
    has_active_clients:       normalizeBool(body.has_active_clients),
    creates_content_actively: normalizeBool(body.creates_content_actively),
  };

  const state = await saveOnboardingAnswers(supabase, user.id, answers);
  return NextResponse.json({ ok: true, state });
}

export async function DELETE(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("cp_coaches")
    .update({
      onboarding_completed_at: null,
      has_past_content: null,
      has_leads_to_import: null,
      has_active_clients: null,
      creates_content_actively: null,
      emphasize_content: true,
      emphasize_leads: true,
      emphasize_clients: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}

function normalizeBool(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}
