// Edge Function: auto-draft-response
//
// The heart of the Auto-Response Engine. POST { lead_id, coach_id } →
// reads coach voice + lead context → drafts a personalized first-touch
// message in the coach's voice → inserts a draft row into cp_lead_messages.
//
// Invoked by:
//   1. Phase 1 — application code right after creating a lead (/leads/new,
//      ImportWizard for single-add, manual form submissions).
//   2. Phase 2 — Postgres trigger on cp_leads INSERT via pg_net (see
//      STEP-7-AUTO-RESPONSE-ENGINE.md). Trigger payload matches Phase 1.
//
// Auth model:
//   - Uses SERVICE_ROLE_KEY because the Postgres trigger has no user JWT.
//   - We don't trust the caller-supplied coach_id; it's re-verified against
//     the lead row, which has its coach_id set by the original insert
//     (RLS-protected, can't be spoofed at insert time).
//
// Required secrets (already configured for draft-message; same project):
//   ANTHROPIC_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Idempotency:
//   - Returns 200 with `{ skipped: "already_drafted" }` if a first-response
//     draft already exists for the lead (uq_first_response_per_lead unique
//     index also enforces this at the DB level — second insert silently
//     no-ops via on-conflict-do-nothing).
//   - Returns 200 with `{ skipped: "auto_draft_disabled" }` if the coach
//     has turned auto-draft off in settings.
//   - Returns 200 with `{ skipped: "no_voice_profile" }` if Brand OS hasn't
//     been completed — we don't draft generic-sounding fallbacks.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 600; // first responses should be short, not essays

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const { lead_id, coach_id: claimedCoachId } = await req.json();
    if (!lead_id) return json({ error: "lead_id required" }, 400);

    // Service-role client — bypasses RLS, used because the trigger has no
    // user JWT. We compensate by trusting only DB state, not client input.
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) return json({ error: "Server misconfigured" }, 500);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    // ---------- Auth ----------
    // Two valid callers:
    //   1. Postgres trigger (Phase 2) → uses service role key. Trust DB state.
    //   2. Authenticated user (Phase 1 client invoke) → JWT in Authorization
    //      header. Verify and ensure they own the lead.
    // Anything else → 401.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    let callerCoachId: string | null = null;
    if (token === serviceRoleKey) {
      // Trigger / admin path. callerCoachId stays null → trust lead row.
    } else if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "Invalid auth token" }, 401);
      callerCoachId = user.id;
    } else {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // 1. Load the lead. Source of truth for coach_id. If the caller passed
    //    a different coach_id, we ignore it and use the lead's.
    const { data: lead, error: leadErr } = await supabase
      .from("cp_leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadErr || !lead) {
      return json({ error: "Lead not found", details: leadErr?.message }, 404);
    }

    const coachId = lead.coach_id;

    // If a user JWT identified the caller, ensure they own this lead.
    // Trigger calls bypass this because callerCoachId is null.
    if (callerCoachId && callerCoachId !== coachId) {
      return json({ error: "Cannot auto-draft for another coach's lead" }, 403);
    }
    if (claimedCoachId && claimedCoachId !== coachId) {
      console.warn(
        `coach_id payload mismatch: payload=${claimedCoachId} lead.coach_id=${coachId}`
      );
    }

    // 2. Eligibility checks. Each returns 200 with a `skipped` reason so
    //    the trigger / caller can log without treating skips as errors.
    if (!lead.auto_draft_eligible) {
      return json({ skipped: "not_eligible", lead_id });
    }
    if (lead.status !== "new") {
      return json({ skipped: "lead_not_new", lead_id, status: lead.status });
    }

    // Idempotent: if a first-response draft already exists, no-op.
    const { data: existingDraft } = await supabase
      .from("cp_lead_messages")
      .select("id")
      .eq("lead_id", lead_id)
      .eq("purpose", "first_response")
      .eq("direction", "draft")
      .maybeSingle();

    if (existingDraft) {
      return json({ skipped: "already_drafted", lead_id });
    }

    // 3. Coach settings — ensure row exists, then check the toggle.
    const settings = await ensureCoachSettings(supabase, coachId);
    if (!settings.auto_draft_on_new_lead) {
      return json({ skipped: "auto_draft_disabled", coach_id: coachId });
    }

    // 4. Voice profile — must exist for the auto-draft to be on-brand.
    //    Without it, the message would sound generic and undermine trust.
    const { data: voiceProfile } = await supabase
      .from("cp_voice_profiles")
      .select("*")
      .eq("coach_id", coachId)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!voiceProfile?.voice_json) {
      return json({ skipped: "no_voice_profile", coach_id: coachId });
    }

    // 5. Build the prompt + call Anthropic.
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const systemPrompt = buildFirstResponseSystemPrompt(voiceProfile);
    const userPrompt = buildFirstResponseUserPrompt(lead);

    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const text = await anthropicRes.text();
      return json(
        { error: `Anthropic API ${anthropicRes.status}: ${text}` },
        502
      );
    }

    const result = await anthropicRes.json();
    const draft = result?.content?.[0]?.text?.trim() ?? "";
    if (!draft) {
      return json({ error: "Empty draft from Anthropic" }, 502);
    }

    // 6. Pick a default channel based on lead source. Coach can change it
    //    before sending. Forms / quizzes lean email; IG/LinkedIn DMs use
    //    their respective channels; everything else defaults to email.
    const channel = pickDefaultChannel(lead.source);

    // 7. Insert the draft. Unique index prevents duplicates if this fires
    //    twice; on conflict, we silently no-op via the if-not-exists check
    //    we already did above.
    const { error: insertErr } = await supabase
      .from("cp_lead_messages")
      .insert({
        lead_id,
        coach_id: coachId,
        channel,
        direction: "draft",
        purpose: "first_response",
        synced_from: "auto_response",
        content: draft,
        ai_drafted: true,
      });

    if (insertErr) {
      // The unique index might have caught a race. Treat as already-drafted.
      if (insertErr.code === "23505") {
        return json({ skipped: "already_drafted_race", lead_id });
      }
      return json(
        { error: "Failed to insert draft", details: insertErr.message },
        500
      );
    }

    // 8. Activity log — useful for analytics ("how often does auto-draft fire").
    await supabase.from("cp_lead_activities").insert({
      lead_id,
      coach_id: coachId,
      activity_type: "auto_draft_generated",
      metadata: {
        model: MODEL,
        voice_profile_id: voiceProfile.id,
        channel,
      },
    });

    // 9. Notification email is wired in Phase 2 (Resend integration).
    //    For Phase 1, the coach sees the draft in the /today "Just landed"
    //    band on next page load. That's enough to test the loop.

    return json({
      ok: true,
      lead_id,
      coach_id: coachId,
      channel,
      draft_length: draft.length,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ---------- helpers ----------

async function ensureCoachSettings(
  supabase: any,
  coachId: string
): Promise<{
  auto_draft_on_new_lead: boolean;
  auto_draft_email_notification: boolean;
  reach_target_per_week: number;
}> {
  // Service-role insert with on-conflict-do-nothing, then read.
  await supabase
    .from("cp_coach_settings")
    .upsert({ coach_id: coachId }, { onConflict: "coach_id", ignoreDuplicates: true });

  const { data } = await supabase
    .from("cp_coach_settings")
    .select("*")
    .eq("coach_id", coachId)
    .single();

  return data;
}

function pickDefaultChannel(source: string | null): string {
  switch (source) {
    case "ig":
      return "dm_ig";
    case "linkedin":
      return "dm_linkedin";
    case "in_person":
    case "podcast":
      // No DM channel makes sense for these; coach probably emails or texts.
      return "email";
    default:
      return "email";
  }
}

function buildFirstResponseSystemPrompt(voiceProfile: any): string {
  const v = voiceProfile.voice_json ?? {};
  const samples = (voiceProfile.sample_messages ?? []).slice(0, 5);

  return [
    "You are drafting the FIRST response to a brand-new lead. A stranger who",
    "just signaled interest. The coach has 5 minutes to land before this lead",
    "moves on. Your job: draft one short, alive, voice-true message that",
    "starts a real conversation.",
    "",
    "VOICE PROFILE:",
    JSON.stringify(v, null, 2),
    "",
    samples.length > 0
      ? `SAMPLES OF HOW THIS COACH WRITES (mirror this rhythm exactly):\n${samples
          .map((s: string, i: number) => `${i + 1}. ${s}`)
          .join("\n")}`
      : "",
    "",
    "RULES:",
    "- Output the message body only. No greeting header, no signature, no subject line.",
    "- Maximum 4 sentences. First-touch messages should be short.",
    "- Match sentence rhythm, vocabulary, openers, and emotional register from the voice profile and samples.",
    "- Reference what brought them (the source, the pain signal, the form data) naturally. Don't recite it back like a robot.",
    "- End with ONE question that invites a real reply. Not a CTA. A question.",
    "- Do NOT promise a call unless the lead explicitly asked for one.",
    "- Do NOT say 'I hope this finds you well', 'I noticed you signed up', 'Thanks for reaching out', or any template-tone opener.",
    "- Do NOT use emoji unless the coach uses them in their samples.",
    "- Do NOT use em-dashes (—). Use periods, commas, colons, or parentheses instead. Em-dashes are an AI tell that breaks voice fidelity.",
    "- This is the FIRST message. No conversation history exists. Don't pretend there is one.",
  ].join("\n");
}

function buildFirstResponseUserPrompt(lead: any): string {
  return `LEAD CONTEXT:

Name: ${lead.full_name}
Source: ${lead.source} ${lead.source_detail ? `(${lead.source_detail})` : ""}
Email: ${lead.email ?? "(unknown)"}
Pain signals: ${(lead.pain_signal ?? []).join(", ") || "(none)"}
Temperature: ${lead.temperature}
Tags: ${(lead.tags ?? []).join(", ") || "(none)"}
Notes from coach: ${lead.notes ?? "(none)"}
Income band: ${lead.income_band ?? "unknown"}
Readiness: ${lead.readiness_signal ?? "unknown"}

TASK: Draft the first response. Body only. Match the coach's voice exactly. End with one question that opens a real conversation.`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
