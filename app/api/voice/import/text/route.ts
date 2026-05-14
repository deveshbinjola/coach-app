import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import type { VoiceProfile, VoiceTrainingSource } from "@/lib/types";

export const runtime = 'edge';

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const IMPORT_SOURCE_TYPES = ["instagram", "linkedin", "newsletter"] as const;
const NEWSLETTER_FETCH_TIMEOUT_MS = 25_000;

type TextSourceType = "linkedin" | "newsletter";
type ExtractedRule = VoiceTrainingSource["extracted_rules"][number];

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimitByUser(user.id, "voice/import/text", 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const sourceType = normalizeSourceType(body?.source_type);
  const url = normalizeUrl(body?.url);
  let title = stringValue(body?.title).slice(0, 120) || defaultTitle(sourceType);
  let text = stringValue(body?.text);

  if (!sourceType) {
    return NextResponse.json({ error: "Import source must be LinkedIn or newsletter." }, { status: 400 });
  }
  if (sourceType === "newsletter" && url && text.length < 120) {
    const imported = await importNewsletterUrl(url);
    if (!imported.ok) {
      return NextResponse.json({ error: imported.error }, { status: imported.status });
    }
    title = stringValue(body?.title).slice(0, 120) || imported.title || defaultTitle(sourceType);
    text = imported.text;
  }
  if (text.length < 120) {
    return NextResponse.json(
      {
        error:
          sourceType === "newsletter"
            ? "Paste a newsletter or add a public beehiiv/RSS URL with published posts."
            : "Paste at least a few real paragraphs so the app can learn the voice.",
      },
      { status: 400 }
    );
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

  const { data: profile } = await supabase
    .from("cp_voice_profiles")
    .select("*")
    .eq("coach_id", user.id)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const activeProfile = (profile as VoiceProfile | null) ?? null;

  const transcript = buildTranscript(sourceType, title, text);
  const rules = await extractRules(sourceType, transcript, activeProfile);
  const nextVoiceJson = mergeTextSignal(activeProfile?.voice_json ?? {}, {
    sourceType,
    title,
    unitsUsed: countUnits(text),
    rules,
    transcript,
  });
  const nextSamples = [
    compactSample(text),
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
      source_type: sourceType,
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
      { error: sourceError?.message ?? "Could not save import." },
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
    source_type: sourceType,
    imported_units: countUnits(text),
    imported_url: url || null,
    extracted_rules: rules,
    learned_patterns: summarizeLearnedPatterns(rules, transcript),
    usage: { ...importUsage, used: importUsage.used + 1 },
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

async function importNewsletterUrl(url: string): Promise<
  | { ok: true; title: string; text: string }
  | { ok: false; error: string; status: number }
> {
  const fetched = await fetchText(url);
  if (!fetched.ok) return fetched;

  const discoveredFeed = discoverFeedUrl(fetched.text, url);
  if (discoveredFeed && discoveredFeed !== url) {
    const feed = await fetchText(discoveredFeed);
    if (feed.ok) {
      const parsedFeed = parseRssFeed(feed.text);
      if (parsedFeed.text.length >= 120) return parsedFeed;
    }
  }

  const directFeed = parseRssFeed(fetched.text);
  if (directFeed.text.length >= 120) return directFeed;

  const archive = await importArchiveLinks(fetched.text, url);
  if (archive.text.length >= 120) return archive;

  const pageText = htmlToText(fetched.text);
  return {
    ok: true,
    title: pageTitle(fetched.text) || "Newsletter import",
    text: pageText,
  };
}

async function fetchText(url: string): Promise<
  | { ok: true; text: string }
  | { ok: false; error: string; status: number }
> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
        "User-Agent": "CoachPlatformVoiceImporter/1.0",
      },
      signal: AbortSignal.timeout(NEWSLETTER_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: "Could not read that newsletter URL. Try the RSS feed URL or paste the newsletter.",
      };
    }
    return { ok: true, text: await response.text() };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      error: String(err).includes("TimeoutError")
        ? "Newsletter import took too long. Try the RSS feed URL or paste the newsletter."
        : "Could not reach that newsletter URL. Try paste mode.",
    };
  }
}

async function importArchiveLinks(html: string, baseUrl: string): Promise<{ ok: true; title: string; text: string }> {
  const links = extractArchiveLinks(html, baseUrl).slice(0, 8);
  const articles: string[] = [];
  for (const link of links) {
    const fetched = await fetchText(link);
    if (!fetched.ok) continue;
    const text = htmlToText(extractArticleHtml(fetched.text));
    if (text.length >= 120) articles.push([`ISSUE ${articles.length + 1}: ${pageTitle(fetched.text) || link}`, text].join("\n"));
    if (articles.length >= 5) break;
  }
  return {
    ok: true,
    title: pageTitle(html) || "Newsletter archive import",
    text: articles.join("\n\n"),
  };
}

async function extractRules(
  sourceType: TextSourceType,
  transcript: string,
  profile: VoiceProfile | null
): Promise<ExtractedRule[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackRules(sourceType, transcript);

  const system = [
    "You extract voice memory rules for a coach AI assistant.",
    `The source is ${sourceType}.`,
    "Use only the provided imported writing and active voice profile.",
    "Return JSON only with this shape: {\"rules\":[{\"text\":\"...\",\"confidence\":\"preliminary\"|\"real\",\"category\":\"hook\"|\"story\"|\"cta\"|\"belief\"|\"offer\"|\"avoid\"|\"rhythm\"}]}",
    "No em dash characters.",
  ].join(" ");

  const prompt = [
    "ACTIVE VOICE PROFILE:",
    JSON.stringify(profile?.voice_json ?? {}, null, 2),
    "",
    "IMPORTED WRITING:",
    transcript.slice(0, 14_000),
    "",
    "Extract 6 specific voice rules. Focus on openings, story rhythm, CTA style, sentence length, beliefs, offer language, and what the coach avoids.",
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

    if (!response.ok) return fallbackRules(sourceType, transcript);
    const data = await response.json();
    const parsed = JSON.parse(String(data?.content?.[0]?.text ?? "").trim()) as {
      rules?: Array<{ text?: unknown; confidence?: unknown; category?: unknown }>;
    };
    return normalizeRules(parsed.rules);
  } catch {
    return fallbackRules(sourceType, transcript);
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
        sentence_rhythm: "Imported from real writing. Refine with the five questions when needed.",
        vocabulary: {
          use: topWords(JSON.stringify(voiceJson)).slice(0, 6),
          avoid: ["generic AI phrasing", "corporate filler"],
        },
        openers: ["Start from a real observation."],
        closers: ["Use the coach's existing CTA pattern."],
        ctas: extractCtas(JSON.stringify(voiceJson)),
        do_nots: ["Do not flatten the coach into generic content."],
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

function mergeTextSignal(
  voiceJson: Record<string, unknown>,
  {
    sourceType,
    title,
    unitsUsed,
    rules,
    transcript,
  }: {
    sourceType: TextSourceType;
    title: string;
    unitsUsed: number;
    rules: ExtractedRule[];
    transcript: string;
  }
): Record<string, unknown> {
  const currentTraining = recordValue(voiceJson.training_signal);
  const currentSources = recordValue(voiceJson.source_counts);
  const currentModes = recordValue(voiceJson.voice_modes);
  const oldMode = recordValue(currentModes[sourceType]);
  const learnedPatterns = summarizeLearnedPatterns(rules, transcript);

  return {
    ...voiceJson,
    voice_modes: {
      ...currentModes,
      [sourceType]: {
        ...oldMode,
        title,
        imported_units: numericSignal(oldMode.imported_units) + unitsUsed,
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
      posts: numericSignal(currentTraining.posts) + unitsUsed,
      [`${sourceType}_imports`]: numericSignal(currentTraining[`${sourceType}_imports`]) + 1,
      transcripts_added: numericSignal(currentTraining.transcripts_added) + 1,
    },
    source_counts: {
      ...currentSources,
      [sourceType]: numericSignal(currentSources[sourceType]) + unitsUsed,
      posts: numericSignal(currentSources.posts) + unitsUsed,
    },
  };
}

function fallbackRules(sourceType: TextSourceType, transcript: string): ExtractedRule[] {
  const lower = transcript.toLowerCase();
  const rules = [
    { text: "Open with a concrete tension, claim, or lived observation before explaining.", category: "hook" as const },
    lower.includes("reply") || lower.includes("comment") || lower.includes("dm")
      ? { text: "Use direct CTAs that tell the reader exactly what to do next.", category: "cta" as const }
      : { text: "Keep CTAs simple and conversational instead of sounding like a funnel.", category: "cta" as const },
    sourceType === "newsletter"
      ? { text: "Let the idea breathe longer before moving into the invitation.", category: "rhythm" as const }
      : { text: "Use short, scannable lines when making the core point.", category: "rhythm" as const },
    lower.includes("client") || lower.includes("student")
      ? { text: "Use client moments as proof, but keep the lesson bigger than the example.", category: "story" as const }
      : null,
    { text: "Avoid generic motivational phrasing when a sharper, more specific sentence is available.", category: "avoid" as const },
  ].filter(Boolean) as Array<{ text: string; category: ExtractedRule["category"] }>;

  return rules.slice(0, 5).map(({ text, category }) => ({
    id: ruleId(`${sourceType}:${text}`),
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
      id: ruleId(`text:${rule.text}`),
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
  fallbackRules("newsletter", transcript).forEach((rule) => {
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

function buildTranscript(sourceType: TextSourceType, title: string, text: string): string {
  return [`${sourceLabel(sourceType)} imported writing: ${title}`, "", text.trim()].join("\n\n");
}

function parseRssFeed(xml: string): { ok: true; title: string; text: string } {
  const title = decodeEntities(stripTags(firstMatch(xml, /<title[^>]*>([\s\S]*?)<\/title>/i))) || "Newsletter RSS import";
  const itemMatches = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  const entryMatches = itemMatches.length > 0 ? itemMatches : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)];
  const issues = entryMatches.slice(0, 8).map((match, index) => {
    const item = match[0];
    const itemTitle = decodeEntities(stripTags(
      firstMatch(item, /<title[^>]*>([\s\S]*?)<\/title>/i)
    )) || `Issue ${index + 1}`;
    const rawContent =
      firstMatch(item, /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) ||
      firstMatch(item, /<content[^>]*>([\s\S]*?)<\/content>/i) ||
      firstMatch(item, /<description[^>]*>([\s\S]*?)<\/description>/i) ||
      firstMatch(item, /<summary[^>]*>([\s\S]*?)<\/summary>/i);
    const text = htmlToText(rawContent);
    return text.length >= 80 ? [`ISSUE ${index + 1}: ${itemTitle}`, text].join("\n") : "";
  }).filter(Boolean);

  return { ok: true, title, text: issues.join("\n\n") };
}

function discoverFeedUrl(html: string, baseUrl: string): string {
  const linkMatches = [...html.matchAll(/<link\b[^>]*>/gi)];
  for (const match of linkMatches) {
    const tag = match[0];
    const type = attr(tag, "type").toLowerCase();
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (href && rel.includes("alternate") && (type.includes("rss") || type.includes("atom") || type.includes("xml"))) {
      return absoluteUrl(href, baseUrl);
    }
  }
  return "";
}

function extractArchiveLinks(html: string, baseUrl: string): string[] {
  const seen = new Set<string>();
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => absoluteUrl(match[1] ?? "", baseUrl))
    .filter((link) => {
      if (!link || seen.has(link)) return false;
      seen.add(link);
      const baseHost = new URL(baseUrl).host.replace(/^www\./, "");
      const linkHost = new URL(link).host.replace(/^www\./, "");
      if (linkHost !== baseHost) return false;
      if (link === baseUrl || link.includes("/authors/") || link.includes("/subscribe")) return false;
      return true;
    });
}

function extractArticleHtml(html: string): string {
  return firstMatch(html, /<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    firstMatch(html, /<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    html;
}

function htmlToText(value: string): string {
  return decodeEntities(
    stripTags(
      value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, "\n")
    )
  )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function pageTitle(html: string): string {
  return decodeEntities(stripTags(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i))).trim();
}

function firstMatch(value: string, regex: RegExp): string {
  return value.match(regex)?.[1]?.trim() ?? "";
}

function attr(tag: string, name: string): string {
  return tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1]?.trim() ?? "";
}

function absoluteUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function compactSample(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 900);
}

function countUnits(value: string): number {
  const blocks = value.split(/\n{2,}/).filter((block) => block.trim().length >= 40).length;
  return Math.max(1, blocks);
}

function defaultTitle(sourceType: TextSourceType | null): string {
  if (sourceType === "linkedin") return "LinkedIn writing import";
  if (sourceType === "newsletter") return "Newsletter import";
  return "Writing import";
}

function sourceLabel(sourceType: TextSourceType): string {
  return sourceType === "linkedin" ? "LinkedIn" : "Newsletter";
}

function normalizeSourceType(value: unknown): TextSourceType | null {
  return value === "linkedin" || value === "newsletter" ? value : null;
}

function normalizeUrl(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
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
  return !!value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numericSignal(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function ruleId(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `text-${hash.toString(16)}`;
}
