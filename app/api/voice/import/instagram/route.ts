import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { VoiceProfile, VoiceTrainingSource } from "@/lib/types";

export const runtime = 'edge';

const APIFY_DEFAULT_ACTOR = "apify/instagram-scraper";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const IMPORT_SOURCE_TYPES = ["instagram", "linkedin", "newsletter"] as const;
const APIFY_TIMEOUT_MS = 55_000;

type InstagramCaption = {
  caption: string;
  url?: string;
  timestamp?: string;
  likes?: number;
  comments?: number;
};

type ExtractedRule = {
  id: string;
  text: string;
  confidence: "preliminary" | "real";
  category?: "hook" | "story" | "cta" | "belief" | "offer" | "avoid" | "rhythm";
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const handle = normalizeInstagramHandle(body?.handle);
  const limit = normalizeLimit(body?.limit);

  if (!handle) {
    return NextResponse.json({ error: "Instagram handle required." }, { status: 400 });
  }

  const paid = await hasPaidImportAccess(user.id);
  const importUsage = await getMonthlyInstagramUsage(user.id);
  if (!paid && importUsage.used >= importUsage.limit) {
    return NextResponse.json(
      {
        error: "Monthly free Instagram import used.",
        upgrade_required: true,
        upgrade_url: "/settings?upgrade=voice-imports",
        usage: importUsage,
      },
      { status: 402 }
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

  const imported = await importInstagramCaptions(handle, limit);
  if (!imported.ok) {
    return NextResponse.json({ error: imported.error }, { status: imported.status });
  }

  const captions = imported.captions;
  if (captions.length === 0) {
    return NextResponse.json(
      { error: "No usable captions found. Try a public profile or lower the import size." },
      { status: 422 }
    );
  }

  const transcript = buildInstagramTranscript(handle, captions);
  const rules = await extractInstagramRules(transcript, activeProfile);
  const nextVoiceJson = mergeInstagramSignal(activeProfile?.voice_json ?? {}, {
    handle,
    captionsUsed: captions.length,
    rules,
    transcript,
  });
  const nextSamples = [
    ...captions.slice(0, 5).map((item) => item.caption),
    ...(activeProfile?.sample_messages ?? []),
  ].filter(Boolean).slice(0, 12);

  const workingProfile = activeProfile ?? await createStarterProfile({
    coachId: user.id,
    voiceJson: nextVoiceJson,
    sampleMessages: nextSamples,
  });

  if (!workingProfile) {
    return NextResponse.json(
      { error: "Could not create voice profile for import." },
      { status: 500 }
    );
  }

  const { data: source, error: sourceError } = await supabase
    .from("cp_voice_training_sources")
    .insert({
      coach_id: user.id,
      voice_profile_id: workingProfile.id,
      source_type: "instagram",
      title: `Instagram import · @${handle}`,
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
      { error: sourceError?.message ?? "Could not save Instagram import." },
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
    captions_used: captions.length,
    handle,
    extracted_rules: rules,
    learned_patterns: summarizeLearnedPatterns(rules, transcript),
    usage: { ...importUsage, used: importUsage.used + 1 },
  });
}

async function getMonthlyInstagramUsage(coachId: string): Promise<{
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

async function importInstagramCaptions(
  handle: string,
  limit: number
): Promise<
  | { ok: true; captions: InstagramCaption[] }
  | { ok: false; error: string; status: number }
> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 501,
      error: "APIFY_TOKEN is not configured. Add it to your environment first.",
    };
  }

  const actor = (process.env.APIFY_INSTAGRAM_ACTOR ?? APIFY_DEFAULT_ACTOR).replace("/", "~");
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&clean=true`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: "posts",
        resultsLimit: limit,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      status: 504,
      error: String(err).includes("TimeoutError")
        ? "Instagram import took too long. Try fewer posts or import again later."
        : "Instagram import could not reach Apify. Try again later.",
    };
  }

  if (!response.ok) {
    const message = await response.text();
    return {
      ok: false,
      status: response.status,
      error: friendlyApifyError(message, response.status),
    };
  }

  const items = (await response.json()) as unknown;
  const captions = normalizeApifyItems(items).slice(0, limit);
  return { ok: true, captions };
}

function friendlyApifyError(message: string, status: number): string {
  const lower = message.toLowerCase();
  if (status === 401 || lower.includes("token")) {
    return "Instagram import is not configured correctly. Check the Apify token.";
  }
  if (lower.includes("private") || lower.includes("login") || lower.includes("not found")) {
    return "Could not read that profile. Try a public Instagram profile.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Instagram import took too long. Try fewer posts or import again later.";
  }
  return "Instagram import failed. Try fewer posts or a public profile.";
}

async function extractInstagramRules(
  transcript: string,
  profile: VoiceProfile | null
): Promise<ExtractedRule[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackInstagramRules(transcript);

  const system = [
    "You extract Instagram voice rules for a coach AI assistant.",
    "Use only the provided captions and active voice profile.",
    "Rules must help future Instagram drafts sound like the coach.",
    "Return JSON only with this shape: {\"rules\":[{\"text\":\"...\",\"confidence\":\"preliminary\"|\"real\",\"category\":\"hook\"|\"story\"|\"cta\"|\"belief\"|\"offer\"|\"avoid\"|\"rhythm\"}]}",
    "No em dash characters.",
  ].join(" ");

  const prompt = [
    "ACTIVE VOICE PROFILE:",
    JSON.stringify(profile?.voice_json ?? {}, null, 2),
    "",
    "INSTAGRAM CAPTION CORPUS:",
    transcript.slice(0, 14_000),
    "",
    "Extract 6 specific voice rules. Include categories across hook, story, cta, belief, offer, avoid, and rhythm when evidence exists.",
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

    if (!response.ok) return fallbackInstagramRules(transcript);
    const data = await response.json();
    const text = String(data?.content?.[0]?.text ?? "").trim();
    const parsed = JSON.parse(text) as { rules?: Array<{ text?: unknown; confidence?: unknown }> };
    return normalizeRules(parsed.rules);
  } catch {
    return fallbackInstagramRules(transcript);
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
        sentence_rhythm: "Imported from real Instagram captions. Refine with the five questions when needed.",
        vocabulary: {
          use: topWords(JSON.stringify(voiceJson)).slice(0, 6),
          avoid: ["generic AI phrasing", "corporate filler"],
        },
        openers: ["Start from a real observation."],
        closers: ["Use the coach's existing CTA pattern."],
        ctas: extractCtas(JSON.stringify(voiceJson)),
        do_nots: ["Do not flatten the coach into generic motivational content."],
        ...voiceJson,
        training_signal: {
          ...recordValue(voiceJson.training_signal),
          instagram_started_profile: 1,
        },
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

function normalizeApifyItems(items: unknown): InstagramCaption[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  return items
    .map((item) => {
      const row = isRecord(item) ? item : {};
      const caption = stringValue(
        row.caption ??
          row.text ??
          row.description ??
          row.alt ??
          row.firstComment
      );
      return {
        caption: caption.replace(/\s+\n/g, "\n").trim(),
        url: stringValue(row.url ?? row.postUrl ?? row.shortCode),
        timestamp: stringValue(row.timestamp ?? row.date ?? row.createdAt),
        likes: numberValue(row.likesCount ?? row.likes),
        comments: numberValue(row.commentsCount ?? row.comments),
      };
    })
    .filter((item) => item.caption.length >= 35)
    .filter((item) => {
      const key = item.caption.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildInstagramTranscript(handle: string, captions: InstagramCaption[]): string {
  const rows = captions.map((item, index) => {
    const meta = [
      item.timestamp ? `date: ${item.timestamp}` : null,
      typeof item.likes === "number" ? `likes: ${item.likes}` : null,
      typeof item.comments === "number" ? `comments: ${item.comments}` : null,
      item.url ? `url: ${item.url}` : null,
    ].filter(Boolean);

    return [
      `CAPTION ${index + 1}${meta.length ? ` (${meta.join(", ")})` : ""}:`,
      item.caption,
    ].join("\n");
  });

  return [`Instagram captions imported for @${handle}.`, "", ...rows].join("\n\n");
}

function mergeInstagramSignal(
  voiceJson: Record<string, unknown>,
  {
    handle,
    captionsUsed,
    rules,
    transcript,
  }: {
    handle: string;
    captionsUsed: number;
    rules: ExtractedRule[];
    transcript: string;
  }
): Record<string, unknown> {
  const currentTraining = recordValue(voiceJson.training_signal);
  const currentSources = recordValue(voiceJson.source_counts);
  const currentModes = recordValue(voiceJson.voice_modes);
  const oldInstagram = recordValue(currentModes.instagram);

  const nextPosts = numericSignal(currentTraining.posts) + captionsUsed;
  const frequentWords = topWords(transcript);
  const ctaPatterns = extractCtas(transcript);
  const learnedPatterns = summarizeLearnedPatterns(rules, transcript);

  return {
    ...voiceJson,
    voice_modes: {
      ...currentModes,
      instagram: {
        ...oldInstagram,
        handle,
        captions_used: numericSignal(oldInstagram.captions_used) + captionsUsed,
        updated_at: new Date().toISOString(),
        fingerprint: {
          frequent_words: frequentWords,
          cta_patterns: ctaPatterns,
          extracted_rules: rules.map((rule) => rule.text),
          learned_patterns: learnedPatterns,
        },
      },
    },
    training_signal: {
      ...currentTraining,
      posts: nextPosts,
      captions_used: numericSignal(currentTraining.captions_used) + captionsUsed,
      instagram_imports: numericSignal(currentTraining.instagram_imports) + 1,
      transcripts_added: numericSignal(currentTraining.transcripts_added) + 1,
    },
    source_counts: {
      ...currentSources,
      posts: numericSignal(currentSources.posts) + captionsUsed,
      instagram: numericSignal(currentSources.instagram) + captionsUsed,
    },
  };
}

function fallbackInstagramRules(transcript: string): ExtractedRule[] {
  const lower = transcript.toLowerCase();
  const rules = [
    { text: "Open with a concrete tension, claim, or lived observation before explaining.", category: "hook" as const },
    lower.includes("dm ") || lower.includes("comment ")
      ? { text: "Use direct CTAs that tell the reader exactly what to send or comment.", category: "cta" as const }
      : { text: "Keep CTAs simple and conversational instead of sounding like a funnel.", category: "cta" as const },
    lower.includes("client") || lower.includes("student")
      ? { text: "Use client moments as proof, but keep the lesson bigger than the case study.", category: "story" as const }
      : null,
    transcript.split(/\n+/).filter((line) => line.trim().length > 0).length > 16
      ? { text: "Use line breaks to create pacing and make posts easy to scan.", category: "rhythm" as const }
      : null,
    { text: "Avoid generic motivational phrasing when a sharper, more specific sentence is available.", category: "avoid" as const },
  ].filter(Boolean) as Array<{ text: string; category: ExtractedRule["category"] }>;

  return rules.slice(0, 5).map(({ text, category }) => ({
    id: ruleId(`instagram:${text}`),
    text,
    category,
    confidence: "preliminary",
  }));
}

function normalizeRules(input: Array<{ text?: unknown; confidence?: unknown; category?: unknown }> | undefined): ExtractedRule[] {
  const rules = (input ?? [])
    .map((item) => ({
      text: typeof item.text === "string" ? item.text.trim().replace(/\u2014/g, ",") : "",
      confidence: item.confidence === "real" ? "real" as const : "preliminary" as const,
      category: normalizeCategory(item.category),
    }))
    .filter((item) => item.text.length >= 12)
    .slice(0, 6);

  return rules.map((rule) => ({
    ...rule,
    id: ruleId(`instagram:${rule.text}`),
  }));
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

function summarizeLearnedPatterns(rules: ExtractedRule[], transcript: string): Array<{
  label: string;
  text: string;
}> {
  const byCategory = new Map<string, ExtractedRule>();
  rules.forEach((rule) => {
    if (rule.category && !byCategory.has(rule.category)) byCategory.set(rule.category, rule);
  });
  fallbackInstagramRules(transcript).forEach((rule) => {
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

function normalizeInstagramHandle(value: unknown): string {
  const raw = stringValue(value)
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
  return /^[a-zA-Z0-9._]{1,30}$/.test(raw) ? raw : "";
}

function normalizeLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(stringValue(value));
  if (!Number.isFinite(parsed)) return 18;
  return Math.max(3, Math.min(50, Math.round(parsed)));
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
    .filter((line) => /^(dm|comment|reply|send|save|share|follow)\b/i.test(line))
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
  return `ig-${hash.toString(16)}`;
}
