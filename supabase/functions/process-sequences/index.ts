// Edge Function: process-sequences
//
// The execution engine for automation sequences. Called by pg_cron every
// 5 minutes (or manually for testing). Processes up to 50 due enrollments
// per invocation.
//
// Flow per enrollment:
//   1. Load step + lead
//   2. Resolve content (template merge tags OR AI draft)
//   3. Resolve sender (coach BYOK Resend → platform fallback)
//   4. Send email via Resend
//   5. Log result to cp_sequence_step_logs
//   6. Advance to next step or mark complete
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

Deno.serve(async (_req: Request) => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    return json({ error: "Missing SUPABASE config" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. Fetch due enrollments.
  const { data: enrollments, error: fetchErr } = await supabase
    .from("cp_sequence_enrollments")
    .select("*")
    .eq("status", "active")
    .lte("execute_at", new Date().toISOString())
    .order("execute_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) return json({ error: fetchErr.message }, 500);
  if (!enrollments || enrollments.length === 0) {
    return json({ processed: 0, message: "No due enrollments" });
  }

  let processed = 0;
  let failed = 0;

  for (const enrollment of enrollments) {
    try {
      await processEnrollment(supabase, enrollment);
      processed++;
    } catch (err) {
      console.error("[process-sequences] enrollment error:", enrollment.id, err);
      failed++;
    }
  }

  return json({ processed, failed, total: enrollments.length });
});

async function processEnrollment(supabase: any, enrollment: any) {
  // Skip if current_step_id is null (step was deleted mid-run).
  if (!enrollment.current_step_id) {
    await advanceToNextStep(supabase, enrollment, null);
    return;
  }

  // Load the step.
  const { data: step } = await supabase
    .from("cp_sequence_steps")
    .select("*")
    .eq("id", enrollment.current_step_id)
    .maybeSingle();

  if (!step) {
    // Step deleted — skip and advance.
    await logStepResult(supabase, enrollment, null, "skipped", null, "Step deleted");
    await advanceToNextStep(supabase, enrollment, step);
    return;
  }

  // Load the lead.
  const { data: lead } = await supabase
    .from("cp_leads")
    .select("id, full_name, email, status, coach_id")
    .eq("id", enrollment.lead_id)
    .maybeSingle();

  if (!lead || !lead.email) {
    await logStepResult(supabase, enrollment, step.id, "skipped", null, "Lead missing or no email");
    await advanceToNextStep(supabase, enrollment, step);
    return;
  }

  // Resolve content.
  let subject: string;
  let bodyHtml: string;
  let replyTo: string | undefined;

  if (step.content_mode === "template") {
    const config = step.action_config ?? {};
    const coachName = await getCoachName(supabase, enrollment.coach_id);
    subject = resolveTags(config.subject ?? "", lead, coachName);
    bodyHtml = resolveTags(config.body_html ?? "", lead, coachName);
    replyTo = config.reply_to;
  } else if (step.content_mode === "ai_draft") {
    try {
      const drafted = await generateAiDraft(supabase, enrollment.coach_id, lead, step.ai_prompt);
      subject = drafted.subject;
      bodyHtml = drafted.bodyHtml;
    } catch (err) {
      // AI draft failure: skip step, log, advance.
      await logStepResult(supabase, enrollment, step.id, "skipped", null, `AI draft failed: ${err}`);
      await advanceToNextStep(supabase, enrollment, step);
      return;
    }
  } else {
    await logStepResult(supabase, enrollment, step.id, "skipped", null, `Unknown content_mode: ${step.content_mode}`);
    await advanceToNextStep(supabase, enrollment, step);
    return;
  }

  // Resolve sender.
  const sender = await resolveResendSender(supabase, enrollment.coach_id);
  if (!sender) {
    await handleSendFailure(supabase, enrollment, step, "No Resend sender configured");
    return;
  }

  // Send email.
  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sender.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender.from,
        to: lead.email,
        subject,
        html: bodyHtml,
        reply_to: replyTo,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      throw new Error(`Resend ${resendRes.status}: ${detail.slice(0, 300)}`);
    }

    const result = await resendRes.json();
    const messageId = result?.id ?? null;

    await logStepResult(supabase, enrollment, step.id, "sent", messageId, null);
    await advanceToNextStep(supabase, enrollment, step);
  } catch (err) {
    await handleSendFailure(supabase, enrollment, step, String(err));
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function advanceToNextStep(supabase: any, enrollment: any, currentStep: any | null) {
  if (!currentStep) {
    // No current step — mark complete.
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_step_id: null,
        execute_at: null,
        last_step_executed_at: new Date().toISOString(),
      })
      .eq("id", enrollment.id);
    return;
  }

  // Find next step by position.
  const { data: nextStep } = await supabase
    .from("cp_sequence_steps")
    .select("id, delay_minutes")
    .eq("sequence_id", enrollment.sequence_id)
    .gt("position", currentStep.position)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextStep) {
    const delayMs = (nextStep.delay_minutes ?? 0) * 60 * 1000;
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        current_step_id: nextStep.id,
        execute_at: new Date(Date.now() + delayMs).toISOString(),
        last_step_executed_at: new Date().toISOString(),
        retry_count: 0,
        error: null,
      })
      .eq("id", enrollment.id);
  } else {
    // No more steps — mark complete.
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_step_id: null,
        execute_at: null,
        last_step_executed_at: new Date().toISOString(),
      })
      .eq("id", enrollment.id);
  }
}

async function handleSendFailure(supabase: any, enrollment: any, step: any, errorMsg: string) {
  const newRetry = (enrollment.retry_count ?? 0) + 1;

  if (newRetry >= MAX_RETRIES) {
    // Max retries exceeded — mark enrollment as failed.
    await logStepResult(supabase, enrollment, step.id, "failed", null, errorMsg);
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        status: "failed",
        error: errorMsg,
        retry_count: newRetry,
      })
      .eq("id", enrollment.id);
  } else {
    // Increment retry, leave execute_at unchanged (retry next cycle).
    await logStepResult(supabase, enrollment, step.id, "failed", null, `Retry ${newRetry}/${MAX_RETRIES}: ${errorMsg}`);
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        retry_count: newRetry,
        error: errorMsg,
      })
      .eq("id", enrollment.id);
  }
}

async function logStepResult(
  supabase: any,
  enrollment: any,
  stepId: string | null,
  status: string,
  resendMessageId: string | null,
  error: string | null
) {
  await supabase.from("cp_sequence_step_logs").insert({
    enrollment_id: enrollment.id,
    step_id: stepId,
    coach_id: enrollment.coach_id,
    lead_id: enrollment.lead_id,
    status,
    error,
    resend_message_id: resendMessageId,
  });
}

// ── Merge tags (duplicated from lib/sequence-merge.ts for edge function
//    isolation — edge functions can't import from the Next.js app) ─────

function resolveTags(template: string, lead: any, coachName: string): string {
  const firstName = (lead.full_name ?? "").split(" ")[0] ?? "";
  const values: Record<string, string> = {
    first_name: firstName,
    full_name: lead.full_name ?? "",
    email: lead.email ?? "",
    coach_name: coachName,
    status: lead.status ?? "",
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match: string, tag: string) => {
    return tag in values ? values[tag]! : match;
  });
}

async function getCoachName(supabase: any, coachId: string): Promise<string> {
  const { data } = await supabase.auth.admin.getUserById(coachId);
  return data?.user?.user_metadata?.full_name ?? data?.user?.email ?? "Your Coach";
}

// ── Resend sender resolution (duplicated from lib/email/coach-resend.ts
//    for edge function isolation) ──────────────────────────────────────

type Sender = { apiKey: string; from: string };

async function resolveResendSender(supabase: any, coachId: string): Promise<Sender | null> {
  // Try coach BYOK first.
  const { data: settings } = await supabase
    .from("cp_coach_settings")
    .select("resend_api_key_ciphertext, resend_api_key_iv, resend_from_email, resend_from_name")
    .eq("coach_id", coachId)
    .maybeSingle();

  // Coach BYOK requires decryption — skip for edge function simplicity.
  // In v1, the edge function always uses the platform key.
  // TODO: Add decryption support if BYOK is needed from edge functions.

  const platformKey = Deno.env.get("RESEND_API_KEY");
  if (platformKey) {
    return {
      apiKey: platformKey,
      from: Deno.env.get("RESEND_FROM") ?? "Brand OS <brand-os@elevateaisystem.com>",
    };
  }

  return null;
}

// ── AI Draft ────────────────────────────────────────────────────────────

async function generateAiDraft(
  supabase: any,
  coachId: string,
  lead: any,
  prompt: string
): Promise<{ subject: string; bodyHtml: string }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  // Load coach's voice profile for tone matching.
  const { data: voiceProfile } = await supabase
    .from("cp_voice_profiles")
    .select("voice_json, sample_messages")
    .eq("coach_id", coachId)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const voiceCtx = voiceProfile
    ? `VOICE PROFILE:\n${JSON.stringify(voiceProfile.voice_json, null, 2)}\n\nSAMPLES:\n${(voiceProfile.sample_messages ?? []).slice(0, 3).join("\n")}`
    : "No voice profile available. Write in a warm, professional coaching tone.";

  const coachName = await getCoachName(supabase, coachId);

  const systemPrompt = [
    "You are drafting a follow-up email in a coach's voice as part of an automated sequence.",
    "Output JSON with two fields: { \"subject\": \"...\", \"body_html\": \"...\" }",
    "The body_html should use simple HTML (p tags, br tags). No complex formatting.",
    "Do NOT use em-dashes. Keep it under 200 words.",
    "",
    voiceCtx,
  ].join("\n");

  const userPrompt = [
    `INSTRUCTION: ${prompt}`,
    "",
    `LEAD: ${lead.full_name} (${lead.email}), status: ${lead.status}`,
    `COACH: ${coachName}`,
  ].join("\n");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  }

  const result = await res.json();
  const content = result?.content?.[0]?.text ?? "";

  // Parse JSON from response.
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI response not valid JSON");

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.subject || !parsed.body_html) {
    throw new Error("AI response missing subject or body_html");
  }

  return { subject: parsed.subject, bodyHtml: parsed.body_html };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
