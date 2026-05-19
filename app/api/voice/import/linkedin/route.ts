import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import type { VoiceProfile, VoiceTrainingSource } from "@/lib/types";
import {
  SYSTEM_RULE_HEADER,
  SYSTEM_RULE_FOOTER,
  safeParseJson,
  detectGenericPhrases,
} from "@/lib/voice/extract-rules";

export const runtime = 'edge';

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const IMPORT_SOURCE_TYPES = ["instagram", "linkedin", "newsletter"] as const;
const APIFY_TIMEOUT_MS = 55_000;

type LinkedInPost = {
  text: string;
  url?: string;
  timestamp?: string;
  reactions?: number;
  comments?: number;
};

type ExtractedRule = VoiceTrainingSource["extracted_rules"][number];

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimitByUser(user.id, "voice/import/linkedin", 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const profileUrl = normalizeLinkedInProfileUrl(body?.handle ?? body?.url);
  const limit = normalizeLimit(body?.limit);

  if (!profileUrl) {
    return NextResponse.json({ error: "LinkedIn handle or profile URL required." }, { status: 400 });
  }

  const paid = await hasPaidImportAccess(user.id);
  const importUsage = await getMonthlyImportUsage(user.id);
  if (!paid && importUsage.used >= importUsage.limit) {
    return NextResponse.json(
      {
        error: "Monthly free import used.",
        upgrade_required: true,
        upgrade_url: "/settings?upgrade=voice-imports",
        usage: importUsage,
      },
      { status: 402 }
    );
  }

  const imported = await importLinkedInPosts(profileUrl, limit);
  if (!imported.ok) {
    return NextResponse.json({ error: imported.error }, { status: imported.status });
  }

  const posts = imported.posts;
  if (posts.length === 0) {
    return NextResponse.json(
      { error: "No usable LinkedIn posts found. Try paste mode or a public profile URL." },
      { status: 422 }
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
  const activeProfile = (profile as VoiceProfile | null) ?? null;

  const title = `LinkedIn import · ${profileUrl.replace(/^https:\/\/(www\.)?linkedin\.com\//, "")}`;
  const transcript = buildLinkedInTranscript(profileUrl, posts);
  const rules = await extractRules(transcript, activeProfile);
  const nextVoiceJson = mergeLinkedInSignal(activeProfile?.voice_json ?? {}, {
    profileUrl,
    postsUsed: posts.length,
    rules,
    transcript,
  });
  const nextSamples = [
    ...posts.slice(0, 5).map((item) => item.text),
    ...(activeProfile?.sample_messages ?? []),
  ].filter(Boolean).slice(0, 12);

  const workingProfile = activeProfile ?? await createStarterProfile({
    coachId: user.id,
    voiceJson: nextVoiceJson,
    sampleMessages: nextSamples,
  });
  if (!workingProfile) {
    return NextResponse.json({ error: "Could not create voice profile for import." }, { status: 500 });
  }

  const { data: source, error: sourceError } = await supabase
    .from("cp_voice_training_sources")
    .insert({
      coach_id: user.id,
      voice_profile_id: workingProfile.id,
      source_type: "linkedin",
      title,
      transcript,
      audio_filename: null,
      audio_mime_type: null,
      duration_minutes: 0,
      extracted_rules: rules,
      approved_rule_ids: [],
    })
    .select("*")
    .single();

  if (sourceError || !source) {
    return NextResponse.json(
      { error: sourceError?.message ?? "Could not save LinkedIn import." },
      { status: 500 }
    );
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from("cp_voice_profiles")
    .update({
      voice_json: nextVoiceJson,
      sample_messages: nextSamples,
    })
    .eq("id", workingProfile.id)
    .eq("coach_id", user.id)
    .select("*")
    .single();

  if (profileError || !updatedProfile) {
    return NextResponse.json(
      { error: profileError?.message ?? "Could not update voice profile." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    profile: updatedProfile as VoiceProfile,
    source: source as VoiceTrainingSource,
    source_type: "linkedin",
    imported_units: posts.length,
    extracted_rules: rules,
    learned_patterns: summarizeLearnedPatterns(rules, transcript),
    usage: { ...importUsage, used: importUsage.used + 1 },
  });
}

async function importLinkedInPosts(
  profileUrl: string,
  limit: number
): Promise<
  | { ok: true; posts: LinkedInPost[] }
  | { ok: false; error: string; status: number }
> {
  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_LINKEDIN_ACTOR;
  if (!token) {
    return {
      ok: false,
      status: 501,
      error: "APIFY_TOKEN is not configured. Use paste mode for LinkedIn for now.",
    };
  }
  if (!actorId) {
    return {
      ok: false,
      status: 501,
      error: "APIFY_LINKEDIN_ACTOR is not configured. Use paste mode or add a LinkedIn posts actor.",
    };
  }

  const actor = actorId.replace("/", "~");
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&clean=true`;
  const body = buildLinkedInActorInput(profileUrl, limit);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 504,
      error: String(err).includes("TimeoutError")
        ? "LinkedIn import took too long. Try fewer posts or use paste mode."
        : "LinkedIn import could not reach Apify. Try paste mode for now.",
    };
  }

  if (!response.ok) {
    const message = await response.text();
    return {
      ok: false,
      status: response.status,
      error: friendlyLinkedInError(message, response.status),
    };
  }

  const items = (await response.json()) as unknown;
  return { ok: true, posts: normalizeApifyItems(items).slice(0, limit) };
}

function buildLinkedInActorInput(profileUrl: string, limit: number): Record<string, unknown> {
  const template = process.env.APIFY_LINKEDIN_INPUT_TEMPLATE;
  if (template) {
    try {
      return JSON.parse(
        template
          .replaceAll("{{url}}", profileUrl)
          .replaceAll("{{limit}}", String(limit))
      ) as Record<string, unknown>;
    } catch {
      return defaultLinkedInActorInput(profileUrl, limit);
    }
  }
  return defaultLinkedInActorInput(profileUrl, limit);
}

function defaultLinkedInActorInput(profileUrl: string, limit: number): Record<string, unknown> {
  return {
    startUrls: [{ url: profileUrl }],
    profileUrls: [profileUrl],
    urls: [profileUrl],
    maxItems: limit,
    maxPosts: limit,
    resultsLimit: limit,
  };
}

function normalizeApifyItems(items: unknown): LinkedInPost[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  return items
    .map((item) => {
      const row = isRecord(item) ? item : {};
      const text = stringValue(
        row.text ??
          row.postText ??
          row.content ??
          row.commentary ??
          row.description ??
          row.caption
      );
      return {
        text: text.replace(/\s+\n/g, "\n").trim(),
        url: stringValue(row.url ?? row.postUrl ?? row.link),
        timestamp: stringValue(row.timestamp ?? row.date ?? row.createdAt),
        reactions: numberValue(row.reactionsCount ?? row.likesCount ?? row.reactions ?? row.likes),
        comments: numberValue(row.commentsCount ?? row.comments),
      };
    })
    .filter((item) => item.text.length >= 35)
    .filter((item) => {
      const key = item.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function getMonthlyImportUsage(coachId: string): Promise<{
  used: number;
  limit: number;
  resets_at: string;
}> {
  const supabase = createClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const { count, error } = await supabase
    .from("cp_voice_training_sources")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coachId)
    .in("source_type", IMPORT_SOURCE_TYPES)
    .gte("created_at", monthStart.toISOString());

  if (error) return { used: 0, limit: 1, resets_at: nextMonth.toISOString() };
  return { used: count ?? 0, limit: 1, resets_at: nextMonth.toISOString() };
}

async function hasPaidImportAccess(coachId: string): Promise<boolean> {
  const supabase = createClient();
  const { data: coach } = await supabase
    .from("cp_coaches")
    .select("plan")
    .eq("id", coachId)
    .maybeSingle();
  if (coach?.plan === "standard") return true;

  const { data, error } = await supabase
    .from("cp_subscriptions")
    .select("status")
    .eq("coach_id", coachId)
    .in("status", ["active", "trialing"])
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function extractRules(
  transcript: string,
  profile: VoiceProfile | null
): Promise<ExtractedRule[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackRules(transcript);

  const system = [
    SYSTEM_RULE_HEADER,
    "The source is LinkedIn posts written by this coach.",
    "Rules must help future LinkedIn drafts sound like THIS coach, not like a generic LinkedIn thought-leader.",
    "Use only the provided LinkedIn posts and the active voice profile.",
    SYSTEM_RULE_FOOTER,
  ].join("\n");

  const prompt = [
    "ACTIVE VOICE PROFILE:",
    JSON.stringify(profile?.voice_json ?? {}, null, 2),
    "",
    "LINKEDIN POSTS:",
    transcript.slice(0, 14_000),
    "",
    "Extract 6 specific voice rules. Focus on hooks, story rhythm, CTA style, beliefs, offer language, and what the coach avoids.",
  ].join("\n");

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.warn("[voice/linkedin] Anthropic HTTP", response.status, "— using fallback");
      return fallbackRules(transcript);
    }
    const data = await response.json();
    const raw = String(data?.content?.[0]?.text ?? "");
    const parsed = safeParseJson<{ rules?: Array<{ text?: unknown; confidence?: unknown; category?: unknown; evidence?: unknown }> }>(raw);
    if (!parsed?.rules) {
      console.warn("[voice/linkedin] Could not parse rules JSON — using fallback. Raw head:", raw.slice(0, 200));
      return fallbackRules(transcript);
    }
    for (const r of parsed.rules) {
      const hits = detectGenericPhrases(String(r?.text ?? ""));
      if (hits.length > 0) {
        console.warn("[voice/linkedin] generic rule produced:", { text: r.text, hits });
      }
    }
    return normalizeRules(parsed.rules);
  } catch (err) {
    console.warn("[voice/linkedin] extract threw — using fallback:", err);
    return fallbackRules(transcript);
  }
}

async function createStarterProfile({
  coachId,
  voiceJson,
  sampleMessages,
}: {
  coachId: string;
  voiceJson: Record<string, unknown>;
  sampleMessages: string[];
}): Promise<VoiceProfile | null> {
  const supabase = createClient();
  const { data: latest } = await supabase
    .from("cp_voice_profiles")
    .select("version")
    .eq("coach_id", coachId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("cp_voice_profiles")
    .update({ active: false })
    .eq("coach_id", coachId)
    .eq("active", true);

  const { data, error } = await supabase
    .from("cp_voice_profiles")
    .insert({
      coach_id: coachId,
      voice_json: {
        tone: ["specific", "direct", "conversational"],
        sentence_rhythm: "Imported from LinkedIn posts. Refine with the five questions when needed.",
        vocabulary: {
          use: topWords(JSON.stringify(voiceJson)).slice(0, 6),
          avoid: ["generic AI phrasing", "corporate filler"],
        },
        openers: ["Start from a real observation."],
        closers: ["Use the coach's existing CTA pattern."],
        ctas: extractCtas(JSON.stringify(voiceJson)),
        do_nots: ["Do not flatten the coach into generic LinkedIn content."],
        ...voiceJson,
      },
      sample_messages: sampleMessages,
      version: (latest?.version ?? 0) + 1,
      active: true,
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return data as VoiceProfile;
}

function mergeLinkedInSignal(
  voiceJson: Record<string, unknown>,
  {
    profileUrl,
    postsUsed,
    rules,
    transcript,
  }: {
    profileUrl: string;
    postsUsed: number;
    rules: ExtractedRule[];
    transcript: string;
  }
): Record<string, unknown> {
  const currentTraining = recordValue(voiceJson.training_signal);
  const currentSources = recordValue(voiceJson.source_counts);
  const currentModes = recordValue(voiceJson.voice_modes);
  const oldMode = recordValue(currentModes.linkedin);
  const learnedPatterns = summarizeLearnedPatterns(rules, transcript);

  return {
    ...voiceJson,
    voice_modes: {
      ...currentModes,
      linkedin: {
        ...oldMode,
        profile_url: profileUrl,
        imported_units: numericSignal(oldMode.imported_units) + postsUsed,
        updated_at: new Date().toISOString(),
        fingerprint: {
          frequent_words: topWords(transcript),
          cta_patterns: extractCtas(transcript),
          extracted_rules: rules.map((rule) => rule.text),
          learned_patterns: learnedPatterns,
        },
      },
    },
    training_signal: {
      ...currentTraining,
      posts: numericSignal(currentTraining.posts) + postsUsed,
      linkedin_imports: numericSignal(currentTraining.linkedin_imports) + 1,
      transcripts_added: numericSignal(currentTraining.transcripts_added) + 1,
    },
    source_counts: {
      ...currentSources,
      linkedin: numericSignal(currentSources.linkedin) + postsUsed,
      posts: numericSignal(currentSources.posts) + postsUsed,
    },
  };
}

function buildLinkedInTranscript(profileUrl: string, posts: LinkedInPost[]): string {
  const rows = posts.map((item, index) => {
    const meta = [
      item.timestamp ? `date: ${item.timestamp}` : null,
      typeof item.reactions === "number" ? `reactions: ${item.reactions}` : null,
      typeof item.comments === "number" ? `comments: ${item.comments}` : null,
      item.url ? `url: ${item.url}` : null,
    ].filter(Boolean);
    return [`LINKEDIN POST ${index + 1}${meta.length ? ` (${meta.join(", ")})` : ""}:`, item.text].join("\n");
  });
  return [`LinkedIn posts imported from ${profileUrl}.`, "", ...rows].join("\n\n");
}

function fallbackRules(transcript: string): ExtractedRule[] {
  const lower = transcript.toLowerCase();
  const rules = [
    { text: "Open with a concrete tension, claim, or lived observation before explaining.", category: "hook" as const },
    lower.includes("comment") || lower.includes("dm")
      ? { text: "Use direct CTAs that tell the reader exactly what to comment or send.", category: "cta" as const }
      : { text: "Keep CTAs simple and conversational instead of sounding like a funnel.", category: "cta" as const },
    { text: "Use short, scannable lines when making the core point.", category: "rhythm" as const },
    lower.includes("client") || lower.includes("student")
      ? { text: "Use client moments as proof, but keep the lesson bigger than the example.", category: "story" as const }
      : null,
    { text: "Avoid generic motivational phrasing when a sharper, more specific sentence is available.", category: "avoid" as const },
  ].filter(Boolean) as Array<{ text: string; category: ExtractedRule["category"] }>;

  return rules.slice(0, 5).map(({ text, category }) => ({
    id: ruleId(`linkedin:${text}`),
    text,
    category,
    confidence: "preliminary",
  }));
}

function normalizeRules(input: Array<{ text?: unknown; confidence?: unknown; category?: unknown }> | undefined): ExtractedRule[] {
  return (input ?? [])
    .map((item) => ({
      text: typeof item.text === "string" ? item.text.trim().replace(/\u2014/g, ",") : "",
      confidence: item.confidence === "real" ? "real" as const : "preliminary" as const,
      category: normalizeCategory(item.category),
    }))
    .filter((item) => item.text.length >= 12)
    .slice(0, 6)
    .map((rule) => ({
      ...rule,
      id: ruleId(`linkedin:${rule.text}`),
    }));
}

function summarizeLearnedPatterns(rules: ExtractedRule[], transcript: string): Array<{
  label: string;
  text: string;
}> {
  const byCategory = new Map<string, ExtractedRule>();
  rules.forEach((rule) => {
    if (rule.category && !byCategory.has(rule.category)) byCategory.set(rule.category, rule);
  });
  fallbackRules(transcript).forEach((rule) => {
    if (rule.category && !byCategory.has(rule.category)) byCategory.set(rule.category, rule);
  });

  return [
    ["hook", "Hook style"],
    ["story", "Story style"],
    ["cta", "CTA style"],
    ["belief", "Beliefs"],
    ["offer", "Offer language"],
    ["avoid", "Avoid"],
  ]
    .map(([key, label]) => {
      const rule = byCategory.get(key);
      return rule ? { label, text: rule.text } : null;
    })
    .filter(Boolean)
    .slice(0, 4) as Array<{ label: string; text: string }>;
}

function normalizeLinkedInProfileUrl(value: unknown): string {
  const raw = stringValue(value)
    .trim()
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9._%-]+\/?$/i.test(raw)) return raw;
  if (/^https:\/\/(www\.)?linkedin\.com\/company\/[a-zA-Z0-9._%-]+\/?$/i.test(raw)) return raw;
  if (/^[a-zA-Z0-9._%-]{2,120}$/.test(raw)) return `https://www.linkedin.com/in/${raw}`;
  return "";
}

function normalizeLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(stringValue(value));
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(3, Math.min(30, Math.round(parsed)));
}

function friendlyLinkedInError(message: string, status: number): string {
  const lower = message.toLowerCase();
  if (status === 401 || lower.includes("token")) {
    return "LinkedIn import is not configured correctly. Check the Apify token.";
  }
  if (lower.includes("input") || lower.includes("schema")) {
    return "The LinkedIn actor input does not match this route yet. Use paste mode or set APIFY_LINKEDIN_INPUT_TEMPLATE.";
  }
  if (lower.includes("login") || lower.includes("private") || lower.includes("captcha")) {
    return "LinkedIn blocked this import. Use paste mode for this profile.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "LinkedIn import took too long. Try fewer posts or use paste mode.";
  }
  return "LinkedIn import failed. Use paste mode or try a public profile URL.";
}

function normalizeCategory(value: unknown): ExtractedRule["category"] | undefined {
  return value === "hook" ||
    value === "story" ||
    value === "cta" ||
    value === "belief" ||
    value === "offer" ||
    value === "avoid" ||
    value === "rhythm"
    ? value
    : undefined;
}

function topWords(value: string): string[] {
  const stop = new Set([
    "the", "and", "you", "that", "this", "with", "for", "your", "are", "but",
    "not", "from", "have", "was", "they", "then", "when", "what", "can", "just",
  ]);
  const counts = new Map<string, number>();
  value
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stop.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function extractCtas(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(dm|comment|reply|send|save|share|follow|click|join)\b/i.test(line))
    .slice(0, 5);
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numericSignal(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function ruleId(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `li-${hash.toString(16)}`;
}
