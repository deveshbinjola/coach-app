// Edge Function: draft-message
// Deployed to Supabase via MCP. POST /functions/v1/draft-message with { lead_id }.
// Returns { draft: string }, a voice-matched reply suggestion using the coach's
// active cp_voice_profiles row + last 10 messages on the lead.
//
// Required secrets (set via `supabase secrets set` or dashboard):
//   ANTHROPIC_API_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const VALID_PURPOSES = ["first_response", "follow_up", "rewarm", "ad_hoc"] as const;
type MessagePurpose = typeof VALID_PURPOSES[number];

const ALLOWED_ORIGIN = Deno.env.get("APP_URL") || "https://app.elevateaisystem.com";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Use the user's JWT so RLS scopes everything to this coach automatically.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const lead_id = body?.lead_id;
    if (!lead_id) return json({ error: "lead_id required" }, 400);
    const requestedPurpose =
      typeof body?.purpose === "string" && VALID_PURPOSES.includes(body.purpose)
        ? body.purpose as MessagePurpose
        : null;
    const persist = body?.persist !== false;
    const segmentSize =
      typeof body?.segment_size === "number" && Number.isFinite(body.segment_size)
        ? Math.max(1, Math.floor(body.segment_size))
        : 1;

    // Fetch lead, last 10 messages, and active voice profile in parallel
    const [{ data: lead }, { data: messages }, { data: voiceProfile }] = await Promise.all([
      supabase.from("cp_leads").select("*").eq("id", lead_id).single(),
      supabase
        .from("cp_lead_messages")
        .select("*")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("cp_voice_profiles")
        .select("*")
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!lead) return json({ error: "Lead not found or RLS blocked" }, 404);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const systemPrompt = buildSystemPrompt(voiceProfile);
    const purpose = requestedPurpose ?? inferPurpose(lead, (messages ?? []).reverse());
    const userPrompt = buildUserPrompt(lead, (messages ?? []).reverse(), purpose, segmentSize);

    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const text = await anthropicRes.text();
      return json({ error: `Anthropic API ${anthropicRes.status}: ${text}` }, 502);
    }

    const result = await anthropicRes.json();
    const draft = result?.content?.[0]?.text ?? "";

    // Persist lead-detail drafts so they stay visible if the coach navigates
    // away. Segment drafts from Compose pass persist=false because they are
    // templates for several leads, not a pending message on the representative
    // lead.
    if (persist) {
      await supabase.from("cp_lead_messages").insert({
        lead_id,
        coach_id: user.id,
        channel: "email",
        direction: "draft",
        content: draft,
        ai_drafted: true,
        purpose,
      });
    }

    // Audit
    await supabase.from("cp_lead_activities").insert({
      lead_id,
      coach_id: user.id,
      activity_type: "ai_draft_generated",
      metadata: {
        model: MODEL,
        voice_profile_id: voiceProfile?.id ?? null,
        purpose,
        persisted: persist,
        segment_size: segmentSize,
      },
    });

    return json({ draft, purpose });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function buildSystemPrompt(voiceProfile: any): string {
  if (!voiceProfile?.voice_json) {
    return [
      "You are a coach replying to a lead. Match the coach's communication style.",
    "Be warm but direct. Short sentences. No corporate language. No emoji unless they used one.",
    "Before returning, silently remove generic AI filler and inflated excitement.",
    "Suggest one concrete next step (a call, a free session, a question back).",
      "Output the message body only. No greetings header, no signature.",
      "Do not use em dash characters. Use periods, commas, colons, or parentheses instead.",
    ].join(" ");
  }
  const v = voiceProfile.voice_json;
  const approvedMemory = Array.isArray(v?.memory?.approved_rules)
    ? v.memory.approved_rules
        .map((rule: any) => typeof rule?.text === "string" ? rule.text : "")
        .filter(Boolean)
    : [];
  return [
    "You are drafting a reply on behalf of a coach. Match their voice exactly.",
    `\n\nVOICE PROFILE:\n${JSON.stringify(v, null, 2)}`,
    approvedMemory.length
      ? `\n\nAPPROVED VOICE MEMORY:\n${approvedMemory.map((rule: string) => `- ${rule}`).join("\n")}`
      : "",
    voiceProfile.sample_messages?.length
      ? `\n\nSAMPLES OF HOW THIS COACH WRITES:\n${voiceProfile.sample_messages.slice(0, 5).map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}`
      : "",
    "\n\nRULES:",
    "- Output the message body only. No greetings header, no signature.",
    "- Match sentence rhythm, vocabulary, and emotional register from the samples.",
    "- Follow approved voice memory as higher priority than generic style advice.",
    "- Before returning, silently check the draft against the voice profile. Remove generic AI filler, avoid words, and inflated excitement.",
    "- Use the coach's saved vocabulary and CTA patterns when natural.",
    "- Suggest exactly one concrete next step (call, free session, a sharp question back).",
    "- If unsure, ask one clarifying question rather than assuming.",
    "- Do NOT use em dash characters. Use periods, commas, colons, or parentheses instead. Em-dashes are an AI tell that breaks voice fidelity.",
  ].join(" ");
}

function inferPurpose(lead: any, messages: any[]): MessagePurpose {
  if (lead.status === "new") return "first_response";
  if (lead.temperature === "dormant") return "rewarm";
  const latestOutbound = [...messages]
    .reverse()
    .find((m: any) => m.direction === "outbound" && (m.sent_at || m.created_at));
  if (latestOutbound) {
    const iso = latestOutbound.sent_at ?? latestOutbound.created_at;
    const daysSilent = (Date.now() - new Date(iso).getTime()) / 86_400_000;
    if (Number.isFinite(daysSilent) && daysSilent >= 7) return "rewarm";
  }
  return "follow_up";
}

function purposeInstructions(purpose: MessagePurpose, segmentSize: number): string {
  const segmentNote =
    segmentSize > 1
      ? `This draft may become a reusable template for ${segmentSize} selected leads. Use [FIRST_NAME] if you need the person's first name.`
      : "This draft is for one lead.";

  if (purpose === "first_response") {
    return [
      "Purpose: first response.",
      "Goal: acknowledge their signal, create safety, and invite one simple next step.",
      "Do not over-sell. Do not sound excited just because they are new.",
      segmentNote,
    ].join(" ");
  }
  if (purpose === "rewarm") {
    return [
      "Purpose: rewarm.",
      "Goal: restart a quiet conversation without guilt, pressure, or fake urgency.",
      "Name the silence lightly. Offer an easy off-ramp or one grounded next question.",
      segmentNote,
    ].join(" ");
  }
  if (purpose === "ad_hoc") {
    return [
      "Purpose: ad hoc.",
      "Goal: write the most useful next message based on the lead context.",
      segmentNote,
    ].join(" ");
  }
  return [
    "Purpose: follow-up.",
    "Goal: move the conversation one honest step forward.",
    "Reference what is known. Ask one direct question or offer one clear next step.",
    segmentNote,
  ].join(" ");
}

function buildUserPrompt(
  lead: any,
  messages: any[],
  purpose: MessagePurpose,
  segmentSize: number
): string {
  const history = messages.length === 0
    ? "(No prior messages. This is the first outreach.)"
    : messages
        .map((m: any) => `[${m.direction}] ${m.content}`)
        .join("\n\n");
  const leadMemory = (lead.tags ?? [])
    .filter((tag: string) => typeof tag === "string" && tag.startsWith("memory:"))
    .map((tag: string) => tag.slice("memory:".length).trim())
    .filter(Boolean);

  return `LEAD:
Name: ${lead.full_name}
Source: ${lead.source}
Status: ${lead.status}
Temperature: ${lead.temperature}
Next Honest Action: ${lead.next_honest_action ?? "(none)"}
Pain Signals: ${(lead.pain_signal ?? []).join(", ") || "(none)"}
Tags: ${(lead.tags ?? []).join(", ") || "(none)"}
Notes: ${lead.notes ?? "(none)"}

APPROVED LEAD MEMORY:
${leadMemory.length ? leadMemory.map((item: string) => `- ${item}`).join("\n") : "(none)"}

CONVERSATION (oldest -> newest):
${history}

TASK:
${purposeInstructions(purpose, segmentSize)}

Draft the next message to send. Match the coach's voice exactly. One concrete next step. Body only.`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
