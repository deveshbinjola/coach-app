// Edge Function: voice-leads-parse
//
// Two input modes, same downstream pipeline:
//   1. TEXT — coach speaks (via Wispr Flow / Mac dictation / browser STT /
//      typing) a freeform paragraph about one or more new leads.
//   2. IMAGE — coach drops a screenshot (IG inbox, email thread, Calendly
//      booking, Notion table — anything visual containing lead data).
//      Claude vision extracts the same structured JSON.
//
// Both branches hand the model the same system prompt + return the same
// `{ leads: ParsedLead[] }` JSON. Coach reviews + edits the preview, hits
// Save All, batch insert into cp_leads. Auto-Response Engine fires per
// inserted lead (Phase 7).
//
// Auth: user JWT only.
// Input (text mode):  { transcript: string }
// Input (image mode): { image_base64: string, mime_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif" }
// Output: { leads: ParsedLead[], count: number, mode: "text" | "image" }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 3000;
const MAX_TRANSCRIPT_CHARS = 8000; // ~1500 words, plenty for one capture session
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — Anthropic vision limit ~5MB
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

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
    const srkKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!srkKey) return json({ error: "Server misconfigured" }, 500);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      srkKey
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing Authorization header" }, 401);

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: "Invalid auth token" }, 401);

    const body = (await req.json()) as {
      transcript?: string;
      image_base64?: string;
      mime_type?: string;
    };

    // Decide mode by which input is present. Image takes precedence if both
    // are sent — caller shouldn't send both, but the explicit branch makes
    // the behavior predictable.
    const mode: "text" | "image" = body.image_base64 ? "image" : "text";

    let userContent: AnthropicContent;

    if (mode === "image") {
      const { image_base64, mime_type } = body;
      if (typeof image_base64 !== "string" || image_base64.length < 64) {
        return json({ error: "image_base64 required (base64-encoded image)" }, 400);
      }
      if (typeof mime_type !== "string" || !ALLOWED_MIME_TYPES.has(mime_type)) {
        return json(
          {
            error: `mime_type must be one of: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
          },
          400
        );
      }
      // Rough byte-size guard: base64 expands ~4/3, so cents/3 = bytes.
      const approxBytes = Math.floor(image_base64.length * 0.75);
      if (approxBytes > MAX_IMAGE_BYTES) {
        return json(
          { error: `Image too large (~${Math.round(approxBytes / 1024)}KB). Max ${MAX_IMAGE_BYTES / 1024 / 1024}MB.` },
          400
        );
      }
      userContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mime_type,
            data: image_base64,
          },
        },
        {
          type: "text",
          text:
            "This screenshot contains lead data the coach wants to capture. " +
            "Extract every distinct person visible into the JSON schema. " +
            "If the image shows a list (IG inbox, email thread, Calendly bookings, " +
            "spreadsheet), each row = one lead. " +
            "If unclear what the source is, infer from visual cues (Instagram chrome → " +
            "source 'ig'; Gmail chrome → notes mention email; Calendly → 'in_person' or " +
            "'quiz' depending on flow). Output JSON now.",
        },
      ];
    } else {
      const { transcript } = body;
      if (typeof transcript !== "string" || transcript.trim().length < 10) {
        return json(
          { error: "transcript required (at least a sentence) — or send image_base64" },
          400
        );
      }
      const cleaned = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
      userContent = buildUserPrompt(cleaned);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const systemPrompt = buildSystemPrompt();

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
        messages: [{ role: "user", content: userContent }],
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
    const raw = result?.content?.[0]?.text ?? "";

    const json_str = extractJson(raw);
    if (!json_str) return json({ error: "Model returned no JSON", raw }, 502);

    let parsed: { leads?: unknown };
    try {
      parsed = JSON.parse(json_str);
    } catch (err) {
      return json(
        { error: "Model JSON didn't parse", details: String(err), raw },
        502
      );
    }

    const leads = Array.isArray(parsed.leads) ? parsed.leads : [];
    return json({ leads, count: leads.length, mode });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// Anthropic Messages API content shape — text-only string OR an array of
// content blocks (used for vision). Loose typing intentionally; the request
// body sent over the wire is plain JSON.
type AnthropicContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: { type: "base64"; media_type: string; data: string };
        }
    >;

// ---------- helpers ----------

function buildSystemPrompt(): string {
  return [
    "You parse freeform coach notes (typed or spoken) about new leads into",
    "structured CRM records. Each distinct person mentioned becomes one",
    "lead object. The coach is dictating quickly — extract intent, don't",
    "demand precision.",
    "",
    "OUTPUT JSON SCHEMA (use these exact keys, exact enum values):",
    "{",
    '  "leads": [',
    "    {",
    '      "full_name": string,                              // REQUIRED',
    '      "email": string | null,',
    '      "phone": string | null,',
    '      "source": "ig" | "linkedin" | "referral" | "quiz" | "in_person" | "podcast" | "newsletter" | "other",',
    '      "source_detail": string | null,                    // e.g. "AMLT retreat", "Reel: masculine leadership"',
    '      "temperature": "on_fire" | "hot" | "warm" | "cold" | "dormant",',
    '      "pain_signal": array of any: "heartbreak" | "relationship_conflict" | "purpose_confusion" | "emotional_numbness" | "masculinity_identity" | "business_pressure" | "burnout",',
    '      "notes": string,                                   // verbatim coach context — useful for follow-up',
    '      "next_honest_action": "invite_to_call" | "follow_up_soft" | "send_resource" | "waiting_on_them" | "hold" | "close_loop" | null',
    "    }",
    "  ]",
    "}",
    "",
    "RULES:",
    "- One person → one lead. If the coach says 'three new leads', expect three objects.",
    "- Default temperature: 'warm'. Use 'hot' if coach uses words like 'definitely qualified', 'ready', 'on fire'. Use 'cold' for 'just exploring'.",
    "- Default source: 'other'. Map mentions of Instagram → 'ig', LinkedIn → 'linkedin', a referrer → 'referral', a quiz/funnel → 'quiz', a retreat/meetup → 'in_person', podcast → 'podcast', newsletter/Signal → 'newsletter'.",
    "- source_detail: capture specifics. 'IG quiz' → source 'quiz', source_detail 'IG quiz'. 'Met at AMLT retreat' → source 'in_person', source_detail 'AMLT retreat'.",
    "- Pain signals: only include if EXPLICITLY mentioned or strongly implied. Don't fabricate. 'Heartbreak' / 'breakup' → heartbreak. 'Lost' / 'no purpose' → purpose_confusion. 'Relationship trouble' → relationship_conflict. 'Numb' / 'flat' → emotional_numbness. 'Masculinity' / 'identity as a man' → masculinity_identity. 'Business pressure' / 'income stress' → business_pressure. 'Burnout' / 'exhausted' → burnout.",
    "- next_honest_action: 'invite_to_call' if coach says 'wants a call' or 'follow up Tuesday'; 'send_resource' if coach mentions sending something; otherwise null.",
    "- Notes: preserve the coach's exact phrasing about what the lead said or wants. This is the highest-signal field.",
    "- If the coach mentions an email like 'john at example dot com' or 'john@example.com', extract it as 'john@example.com'. If unsure, leave email null.",
    "- Output the JSON inside a SINGLE ```json fenced code block. Nothing else. No prose before or after.",
    "",
    "EXAMPLE INPUT:",
    "Three new leads. Maria Garcia, came in through the IG quiz, talked about heartbreak, no email yet, hot lead. Then John Smith, referred by Steve from the men's circle, asked about embodiment work, john at example dot com. And that guy I met at the AMLT retreat, Tom Riley, looking for purpose coaching, definitely qualified, follow up Tuesday.",
    "",
    "EXAMPLE OUTPUT:",
    "```json",
    "{",
    '  "leads": [',
    "    {",
    '      "full_name": "Maria Garcia",',
    '      "email": null,',
    '      "phone": null,',
    '      "source": "quiz",',
    '      "source_detail": "IG quiz",',
    '      "temperature": "hot",',
    '      "pain_signal": ["heartbreak"],',
    '      "notes": "Came in through the IG quiz, talked about heartbreak, no email yet.",',
    '      "next_honest_action": null',
    "    },",
    "    {",
    '      "full_name": "John Smith",',
    '      "email": "john@example.com",',
    '      "phone": null,',
    '      "source": "referral",',
    '      "source_detail": "Steve from men\'s circle",',
    '      "temperature": "warm",',
    '      "pain_signal": [],',
    '      "notes": "Referred by Steve from the men\'s circle, asked about embodiment work.",',
    '      "next_honest_action": null',
    "    },",
    "    {",
    '      "full_name": "Tom Riley",',
    '      "email": null,',
    '      "phone": null,',
    '      "source": "in_person",',
    '      "source_detail": "AMLT retreat",',
    '      "temperature": "hot",',
    '      "pain_signal": ["purpose_confusion"],',
    '      "notes": "Met at AMLT retreat. Looking for purpose coaching. Definitely qualified, follow up Tuesday.",',
    '      "next_honest_action": "invite_to_call"',
    "    }",
    "  ]",
    "}",
    "```",
  ].join("\n");
}

function buildUserPrompt(transcript: string): string {
  return `Coach said (typed or spoken):

"""
${transcript}
"""

Extract structured leads. Output JSON now.`;
}

function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
