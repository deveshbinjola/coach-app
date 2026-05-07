import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { repairContentDraft } from "@/lib/pushback";
import type { Content, ContentPillar, VoiceProfile } from "@/lib/types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const PILLARS: ContentPillar[] = ["authority", "story", "offer", "engagement"];

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { data: contentRow, error: contentError } = await supabase
    .from("cp_content")
    .select("*")
    .eq("id", id)
    .eq("coach_id", user.id)
    .maybeSingle();

  if (contentError) {
    return NextResponse.json({ error: contentError.message }, { status: 500 });
  }
  if (!contentRow) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  const content = contentRow as Content;
  if (content.status === "published") {
    return NextResponse.json(
      { error: "Published posts are read-only. Create a new draft from this idea instead." },
      { status: 409 }
    );
  }

  const { data: profile } = await supabase
    .from("cp_voice_profiles")
    .select("*")
    .eq("coach_id", user.id)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const voiceProfile = (profile as VoiceProfile | null) ?? null;
  const fallback = repairContentDraft(content, voiceProfile);
  const repair = await modelRepair(content, voiceProfile, fallback);

  const { data: updated, error: updateError } = await supabase
    .from("cp_content")
    .update({
      title: repair.title,
      body: repair.body,
      pillar: repair.pillar,
    })
    .eq("id", content.id)
    .eq("coach_id", user.id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    content: updated,
    source: repair === fallback ? "deterministic" : "model",
  });
}

async function modelRepair(
  content: Content,
  voiceProfile: VoiceProfile | null,
  fallback: ReturnType<typeof repairContentDraft>
): Promise<ReturnType<typeof repairContentDraft>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  const system = [
    "You repair coach content before it is published.",
    "Make it sharper, more specific, and more likely to create a reply or lead.",
    "Keep the coach's meaning. Do not add fake results, claims, prices, dates, or credentials.",
    "Return compact JSON only with title, body, and pillar.",
    "pillar must be one of authority, story, offer, engagement.",
    "No em dash characters.",
  ].join(" ");

  const prompt = [
    "VOICE PROFILE:",
    JSON.stringify(voiceProfile?.voice_json ?? {}, null, 2),
    "",
    "SAMPLES:",
    (voiceProfile?.sample_messages ?? []).slice(0, 5).join("\n\n") || "(none)",
    "",
    "CONTENT:",
    JSON.stringify(
      {
        title: content.title,
        body: content.body,
        platform: content.platform,
        content_type: content.content_type,
        pillar: content.pillar,
      },
      null,
      2
    ),
    "",
    "FALLBACK REPAIR:",
    JSON.stringify(fallback, null, 2),
  ].join("\n");

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return fallback;
    const json = await res.json();
    const text = String(json?.content?.[0]?.text ?? "").trim();
    const parsed = parseRepair(text);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseRepair(text: string): ReturnType<typeof repairContentDraft> | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      title?: unknown;
      body?: unknown;
      pillar?: unknown;
    };
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    const pillar = typeof parsed.pillar === "string" ? parsed.pillar : "";

    if (!title || !body || !PILLARS.includes(pillar as ContentPillar)) {
      return null;
    }

    return {
      title: title.replaceAll("\u2014", ","),
      body: body.replaceAll("\u2014", ","),
      pillar: pillar as ContentPillar,
    };
  } catch {
    return null;
  }
}
