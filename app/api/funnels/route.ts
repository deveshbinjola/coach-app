// GET  /api/funnels       — list coach's funnels
// POST /api/funnels       — (unused; generation goes through /api/funnels/generate)
// PATCH /api/funnels      — update funnel (slug, title, config, published)
// DELETE /api/funnels     — delete a funnel
//
// All endpoints require authenticated coach session.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { validateSlug, generateFunnelSlug } from "@/lib/funnel-slug";
import { createAdminClient } from "@/lib/supabase-admin";
import { validateFunnelConfigShape, type FunnelConfig } from "@/lib/funnel-config";

export const runtime = "edge";

// ── Config validation ───────────────────────────────────

function validateFunnelConfig(config: unknown): { valid: boolean; reason?: string } {
  if (!config || typeof config !== "object") {
    return { valid: false, reason: "Config must be an object." };
  }

  const c = config as Record<string, unknown>;

  // Intro
  const intro = c.intro as Record<string, unknown> | undefined;
  if (!intro || typeof intro !== "object") {
    return { valid: false, reason: "Config must have an intro object." };
  }
  if (!intro.headline || typeof intro.headline !== "string") {
    return { valid: false, reason: "Intro must have a headline string." };
  }
  if (!intro.subhead || typeof intro.subhead !== "string") {
    return { valid: false, reason: "Intro must have a subhead string." };
  }

  // Questions
  const questions = c.questions;
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 20) {
    return { valid: false, reason: "Config must have 1-20 questions." };
  }
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== "object" || !q.text || !Array.isArray(q.choices)) {
      return { valid: false, reason: `Question ${i + 1} is malformed.` };
    }
    if (q.choices.length < 2 || q.choices.length > 6) {
      return { valid: false, reason: `Question ${i + 1} must have 2-6 choices.` };
    }
    for (const ch of q.choices) {
      if (!ch || typeof ch !== "object" || !ch.key || !ch.text || typeof ch.scores !== "object") {
        return { valid: false, reason: `Question ${i + 1} has a malformed choice.` };
      }
    }
  }

  // Results
  const results = c.results;
  if (!Array.isArray(results) || results.length < 2 || results.length > 10) {
    return { valid: false, reason: "Config must have 2-10 results." };
  }
  for (const r of results) {
    if (!r || typeof r !== "object" || !r.key || !r.headline || !r.body) {
      return { valid: false, reason: "Each result must have key, headline, and body." };
    }
  }

  // Branding
  const branding = c.branding as Record<string, unknown> | undefined;
  if (!branding || typeof branding !== "object") {
    return { valid: false, reason: "Config must have a branding object." };
  }
  if (!branding.primary_hex || typeof branding.primary_hex !== "string") {
    return { valid: false, reason: "Branding must have a primary_hex color." };
  }

  return { valid: true };
}

// ── GET: list funnels ────────────────────────────────────

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("cp_funnels")
    .select("id, slug, type, title, published, view_count, start_count, complete_count, email_count, created_at, updated_at")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load funnels." }, { status: 500 });
  }

  return NextResponse.json({ funnels: data });
}

// ── POST: persist a reviewed quiz draft ─────────────────

type CreateBody = {
  title?: string;
  type?: string;
  config?: FunnelConfig;
  generated_from_run_id?: string | null;
  brief?: string;
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.config) return NextResponse.json({ error: "Missing config." }, { status: 400 });
  const shape = validateFunnelConfigShape(body.config);
  if (!shape.valid) {
    return NextResponse.json({ error: `Invalid quiz config: ${shape.error}` }, { status: 400 });
  }

  const title = (body.title || body.config.intro.headline || "Your Brand Quiz").trim().slice(0, 120);
  const brief = body.brief ? body.brief.trim().slice(0, 500) : null;
  const runId = body.generated_from_run_id ?? null;

  const admin = createAdminClient();

  const insertRow = (slug: string) =>
    admin.from("cp_funnels").insert({
      coach_id: user.id,
      slug,
      type: "resonance",
      title,
      config: body.config,
      published: false,
      generated_from_run_id: runId,
      creation_brief: brief,
    }).select("id, slug, title").single();

  let { data: funnel, error } = await insertRow(generateFunnelSlug(title));
  if (error && (error as { code?: string }).code === "23505") {
    ({ data: funnel, error } = await insertRow(generateFunnelSlug(title)));
  }
  if (error || !funnel) {
    return NextResponse.json({ error: "Failed to save quiz." }, { status: 500 });
  }

  return NextResponse.json({ funnel });
}

// ── PATCH: update funnel ─────────────────────────────────

type PatchBody = {
  id: string;
  slug?: string;
  title?: string;
  config?: unknown;
  published?: boolean;
};

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Missing funnel id." }, { status: 400 });
  }

  // Build update payload (only include fields that were sent)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.slug !== undefined) {
    const check = validateSlug(body.slug);
    if (!check.valid) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
    updates.slug = body.slug;
  }

  if (body.title !== undefined) {
    if (!body.title || body.title.length > 200) {
      return NextResponse.json({ error: "Title must be 1-200 characters." }, { status: 400 });
    }
    updates.title = body.title;
  }

  if (body.config !== undefined) {
    const configCheck = validateFunnelConfig(body.config);
    if (!configCheck.valid) {
      return NextResponse.json({ error: configCheck.reason }, { status: 400 });
    }
    updates.config = body.config;
  }

  if (body.published !== undefined) {
    updates.published = !!body.published;
  }

  const { data, error } = await supabase
    .from("cp_funnels")
    .update(updates)
    .eq("id", body.id)
    .eq("coach_id", user.id)
    .select("id, slug, title, config, published, view_count, start_count, complete_count, email_count, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That slug is already taken. Try another." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update funnel." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Funnel not found." }, { status: 404 });
  }

  return NextResponse.json({ funnel: data });
}

// ── DELETE: remove funnel ────────────────────────────────

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing funnel id." }, { status: 400 });
  }

  const { error } = await supabase
    .from("cp_funnels")
    .delete()
    .eq("id", id)
    .eq("coach_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete funnel." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
