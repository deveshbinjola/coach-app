// Edge Function: voice-mine
//
// Two input modes, same downstream pipeline:
//   1. CAPTIONS — coach pastes 10-30 captions/posts they wrote in their own
//      voice. Pattern-mine across the samples → voice profile.
//   2. INTERVIEW — coach answers 5 voice-revealing questions in their own
//      words. Treat the answers AS writing samples (because that's what they
//      are: the coach typing/speaking in their voice). Same model, same
//      schema, fewer datapoints — but it's the fastest possible on-ramp
//      and doubles as the in-app replacement for the Brand OS iframe.
//
// Both branches return: { voice_json, sample_messages, captions_used }
// with the same JSON schema, so the caller saves identically.
//
// Auth: user JWT only.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

const MIN_CAPTIONS = 5;   // below this, the signal is too noisy to trust
const MAX_CAPTIONS = 50;  // above this, we'd just be paying for tokens
const MIN_INTERVIEW_ANSWERS = 3; // need at least 3 of 5 to extract meaningful patterns

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

type InterviewAnswer = { q: string; a: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing Authorization header" }, 401);

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: "Invalid auth token" }, 401);

    const body = (await req.json()) as {
      captions?: string[];
      interview?: InterviewAnswer[];
    };

    const mode: "captions" | "interview" =
      Array.isArray(body.interview) && body.interview.length > 0
        ? "interview"
        : "captions";

    let userPrompt: string;
    let normalized: string[]; // used for sample_messages selection

    if (mode === "interview") {
      const answers = (body.interview ?? [])
        .filter(
          (item): item is InterviewAnswer =>
            !!item &&
            typeof item.q === "string" &&
            typeof item.a === "string" &&
            item.a.trim().length >= 10
        )
        .map((item) => ({ q: item.q.trim(), a: item.a.trim() }))
        .slice(0, 10);

      if (answers.length < MIN_INTERVIEW_ANSWERS) {
        return json(
          {
            error: `Need at least ${MIN_INTERVIEW_ANSWERS} substantive answers; got ${answers.length}.`,
          },
          400
        );
      }

      userPrompt = buildInterviewPrompt(answers);
      // Save the answers themselves as sample_messages — they're the most
      // authentic signal of how the coach actually writes/speaks.
      normalized = answers.map((a) => a.a);
    } else {
      const captions = Array.isArray(body.captions) ? body.captions : [];

      // Normalize: trim, drop empties, dedupe, cap.
      normalized = Array.from(
        new Set(
          captions
            .map((c) => (typeof c === "string" ? c.trim() : ""))
            .filter((c) => c.length >= 10)
        )
      ).slice(0, MAX_CAPTIONS);

      if (normalized.length < MIN_CAPTIONS) {
        return json(
          {
            error: `Need at least ${MIN_CAPTIONS} non-trivial captions; got ${normalized.length}.`,
          },
          400
        );
      }

      userPrompt = buildCaptionsPrompt(normalized);
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
    const raw = result?.content?.[0]?.text ?? "";

    const json_str = extractJson(raw);
    if (!json_str) {
      return json({ error: "Model returned no JSON", raw }, 502);
    }
    let voice_json: unknown;
    try {
      voice_json = JSON.parse(json_str);
    } catch (err) {
      return json({ error: "Model JSON didn't parse", details: String(err), raw }, 502);
    }

    const sample_messages = pickTopSamples(normalized, 5);

    return json({
      voice_json,
      sample_messages,
      captions_used: normalized.length,
      mode,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ---------- helpers ----------

function buildSystemPrompt(): string {
  return [
    "You analyze a coach's writing samples (Instagram captions, LinkedIn",
    "posts, or answers to voice-revealing interview questions) and produce a",
    "structured voice profile that another AI can use to draft messages in",
    "this coach's voice.",
    "",
    "Your job: pattern-match across the samples, find what's distinctive,",
    "and output JSON matching the schema below. Be specific. Generic",
    'descriptors like "friendly" or "professional" are useless — name the',
    "actual habits.",
    "",
    "OUTPUT JSON SCHEMA (use these exact keys):",
    "{",
    '  "tone": [string, ...],                   // 3-5 specific descriptors',
    '  "sentence_rhythm": string,               // one-line description of cadence',
    '  "vocabulary": {',
    '    "use": [string, ...],                  // 8-12 words/phrases they actually use',
    '    "avoid": [string, ...]                 // 5-10 jargon they notably do NOT use',
    "  },",
    '  "openers": [string, ...],                // 3-5 typical opener patterns',
    '  "closers": [string, ...],                // 3-5 typical closer patterns',
    '  "ctas": [string, ...],                   // 2-4 typical calls to action',
    '  "emotional_register": string,            // one-line description',
    '  "do_nots": [string, ...],                // 4-6 specific anti-patterns',
    '  "ig_specific": {',
    '    "hook_pattern": string,                // how they open posts to stop the scroll',
    '    "hashtag_style": string,               // none, sparse, dense, branded',
    '    "post_length": string                  // short / medium / long, with rationale',
    "  }",
    "}",
    "",
    "RULES:",
    "- Output the JSON inside a single ```json fenced code block. Nothing else.",
    "- Vocabulary `avoid` should be inferred from what they DON'T say — list",
    "  things like \"hustle\", \"crushing it\", \"10x\" only if their writing makes",
    "  the absence noticeable. If they DO use those, leave them out.",
    "- Quote actual phrases from the samples in `openers` and `closers` when",
    "  there's a clear pattern. Don't paraphrase.",
    "- `do_nots` should be specific (e.g., \"no \\\"I hope this finds you well\\\"\")",
    "  not vague (e.g., \"don't be too formal\").",
    "- For interview-style input (answers to voice questions), `ig_specific`",
    "  may be inferred conservatively or left with brief defaults — captions",
    "  are the better signal there.",
  ].join("\n");
}

function buildCaptionsPrompt(captions: string[]): string {
  return `Here are ${captions.length} captions/posts written by the coach in their own voice. Mine the patterns and produce the voice profile JSON.

CAPTIONS:

${captions.map((c, i) => `--- ${i + 1} ---\n${c}`).join("\n\n")}

Output the JSON profile now.`;
}

function buildInterviewPrompt(answers: InterviewAnswer[]): string {
  return `The coach answered the following voice-revealing questions in their own words. Treat each answer AS a writing sample — these are the coach speaking/typing in their natural voice. Mine the patterns across all answers and produce the voice profile JSON.

INTERVIEW:

${answers
  .map(
    (item, i) =>
      `--- Q${i + 1} ---\n${item.q}\n\n--- A${i + 1} ---\n${item.a}`
  )
  .join("\n\n")}

Output the JSON profile now.`;
}

/** Strip a ```json ... ``` fence (or plain ``` ... ```) and return the
 *  inner JSON text. Falls back to the raw string if no fence is found. */
function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return null;
}

/** Pick the most "useful" samples to save as sample_messages on the voice
 *  profile. Strategy: medium-length samples are most signal-rich (super
 *  short = no rhythm visible; super long = exhausting in the prompt). */
function pickTopSamples(samples: string[], n: number): string[] {
  const scored = samples
    .map((s) => ({
      s,
      // Sweet spot ~150-400 chars. Penalize away from that range.
      score: -Math.abs(s.length - 275),
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((x) => x.s);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
