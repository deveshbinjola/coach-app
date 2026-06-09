import type { VoiceProfile, ContentPillar } from "@/lib/types";
import type { BrandVoiceOverlay } from "@/lib/brand-os/voice-overlay";
import { renderOverlayPromptBlock } from "@/lib/brand-os/voice-overlay";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export type TweetCategory =
  | "breath_prompt"
  | "somatic_tip"
  | "coaching_wisdom"
  | "one_liner"
  | "thread"
  | "hot_take"
  | "soma_positioning";

export type TweetMode = "auto" | "review";

export const CATEGORY_META: Record<TweetCategory, { label: string; mode: TweetMode; pillar: ContentPillar }> = {
  breath_prompt:    { label: "Breath prompt",     mode: "auto",   pillar: "engagement" },
  somatic_tip:      { label: "Somatic tip",       mode: "auto",   pillar: "authority" },
  coaching_wisdom:  { label: "Coaching wisdom",   mode: "auto",   pillar: "story" },
  one_liner:        { label: "One-liner",          mode: "auto",   pillar: "engagement" },
  thread:           { label: "Thread",             mode: "review", pillar: "authority" },
  hot_take:         { label: "Hot take",           mode: "review", pillar: "story" },
  soma_positioning: { label: "Soma positioning",  mode: "review", pillar: "offer" },
};

const AUTO_CATEGORIES: TweetCategory[] = ["breath_prompt", "somatic_tip", "coaching_wisdom", "one_liner"];
const REVIEW_CATEGORIES: TweetCategory[] = ["thread", "hot_take", "soma_positioning"];

export type GeneratedTweet = {
  category: TweetCategory;
  mode: TweetMode;
  title: string;
  body: string;
  pillar: ContentPillar;
  content_type: "post" | "thread";
};

export type GenerateBatchRequest = {
  count: number;
  categories?: TweetCategory[];
  angle?: string;
};

export async function generateTweetBatch({
  count,
  categories,
  angle,
  profile,
  brandOverlay,
  recentTweets,
}: {
  count: number;
  categories?: TweetCategory[];
  angle?: string;
  profile: VoiceProfile | null;
  brandOverlay: BrandVoiceOverlay | null;
  recentTweets: string[];
}): Promise<GeneratedTweet[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const cats = categories?.length ? categories : pickCategories(count);
  if (!apiKey) return cats.map((c) => deterministicTweet(c, angle));

  const overlayBlock = renderOverlayPromptBlock(brandOverlay);
  const baseSystem = [
    "You write tweets and threads for a men's embodiment coach.",
    "The voice is direct, somatic, grounded. Not motivational-poster. Not corporate.",
    "Short sentences. Periods over commas. Body-first language.",
    "Never use em dash characters. Never use hashtags.",
    "Never invent claims, testimonials, or credentials.",
    "Threads: each tweet stands alone but builds an arc. Number them 1/, 2/, etc.",
    "Single tweets: 280 characters max. Punchy. One idea.",
    "Return JSON array only.",
  ].join(" ");

  const system = overlayBlock ? `${overlayBlock}\n\n${baseSystem}` : baseSystem;

  const categoryInstructions = cats.map((c) => categoryPrompt(c)).join("\n\n");

  const prompt = [
    `Generate ${cats.length} tweets. Each tweet matches one category below.`,
    "",
    "CATEGORIES:",
    categoryInstructions,
    "",
    "COACH ANGLE:",
    angle || "(use voice profile and embodiment coaching lens)",
    "",
    "VOICE PROFILE:",
    JSON.stringify(profile?.voice_json ?? {}, null, 2).slice(0, 800),
    "",
    "VOICE SAMPLES:",
    (profile?.sample_messages ?? []).slice(0, 3).join("\n\n") || "(none)",
    "",
    "RECENT TWEETS (avoid repeating themes):",
    recentTweets.length ? recentTweets.slice(0, 5).join("\n---\n") : "(none yet)",
    "",
    "Return a JSON array of objects with: category, title, body, content_type.",
    "content_type is 'thread' for threads, 'post' for single tweets.",
    "For threads, body should have each tweet on its own line prefixed with 1/, 2/, etc.",
    "For single tweets, body is the tweet text (280 chars max).",
    "title is a short internal label (not published).",
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
        max_tokens: 2400,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return cats.map((c) => deterministicTweet(c, angle));
    const json = await res.json();
    const text = String(json?.content?.[0]?.text ?? "").trim();
    return parseBatch(text, cats, angle);
  } catch {
    return cats.map((c) => deterministicTweet(c, angle));
  }
}

function categoryPrompt(category: TweetCategory): string {
  const meta = CATEGORY_META[category];
  switch (category) {
    case "breath_prompt":
      return `[${meta.label}] A short breath or body-awareness prompt. Invitational, not instructional. Under 280 chars. Example tone: "Before your next session: 3 breaths. Feet on the ground. Feel the weight of your body. Now you're ready."`;
    case "somatic_tip":
      return `[${meta.label}] A body-based insight about coaching, relationships, or masculine growth. Points to something the reader can feel right now. Under 280 chars.`;
    case "coaching_wisdom":
      return `[${meta.label}] A single coaching insight. The kind of thing a coach says that makes the room go quiet. Under 280 chars.`;
    case "one_liner":
      return `[${meta.label}] A sharp, quotable single sentence. Counterintuitive or pattern-interrupting. Under 200 chars.`;
    case "thread":
      return `[${meta.label}] A 5-7 tweet thread. Each tweet numbered (1/, 2/, etc). Each stands alone but builds an arc. Could be a framework breakdown, a story, or a teaching sequence. Each tweet under 280 chars.`;
    case "hot_take":
      return `[${meta.label}] A strong opinion about coaching, men's work, or the wellness industry. Not rage-bait, but genuinely contrarian. Under 280 chars.`;
    case "soma_positioning":
      return `[${meta.label}] Positions Soma (AI platform for embodiment coaches) through the lens of a real problem coaches face. Not salesy. Shows the gap between scattered tools and one integrated system. Under 280 chars.`;
  }
}

function pickCategories(count: number): TweetCategory[] {
  const all = [...AUTO_CATEGORIES, ...AUTO_CATEGORIES, ...REVIEW_CATEGORIES];
  const shuffled = all.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, 10));
}

function parseBatch(text: string, fallbackCats: TweetCategory[], angle?: string): GeneratedTweet[] {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("not array");

    return parsed.map((item: Record<string, unknown>, i: number) => {
      const cat = validateCategory(item.category) ?? fallbackCats[i] ?? "one_liner";
      const meta = CATEGORY_META[cat];
      return {
        category: cat,
        mode: meta.mode,
        title: stripEmDash(String(item.title ?? `${meta.label} draft`)).slice(0, 160),
        body: stripEmDash(String(item.body ?? "")),
        pillar: meta.pillar,
        content_type: (item.content_type === "thread" ? "thread" : "post") as "post" | "thread",
      };
    });
  } catch {
    return fallbackCats.map((c) => deterministicTweet(c, angle));
  }
}

function validateCategory(value: unknown): TweetCategory | null {
  if (typeof value !== "string") return null;
  return value in CATEGORY_META ? (value as TweetCategory) : null;
}

function deterministicTweet(category: TweetCategory, angle?: string): GeneratedTweet {
  const meta = CATEGORY_META[category];
  const fallbacks: Record<TweetCategory, string> = {
    breath_prompt: "Before your next conversation: pause. Three breaths. Feel the ground under your feet. Now speak.",
    somatic_tip: "Your chest tightens before you say the hard thing. That's not anxiety. That's your body telling you this matters.",
    coaching_wisdom: "The most powerful question a coach can ask is the one that creates silence.",
    one_liner: "You don't need more strategy. You need to feel what's already here.",
    thread: "1/ Most coaches burn out not because the work is hard, but because the business is.\n\n2/ You hold space for transformation. Then you close the session and open 6 tabs.\n\n3/ Calendly. ConvertKit. Kajabi. Buffer. Canva. HoneyBook.\n\n4/ None of them talk to each other. None of them know your clients. None of them sound like you.\n\n5/ The real cost isn't the $300/month. It's the 10 hours a week you lose to admin instead of coaching.\n\n6/ What if one system knew your voice, your clients, and your pipeline? That's what we're building.\n\n7/ Your gift is transformation. You shouldn't have to be an IT department too.",
    hot_take: "The coaching industry doesn't have a marketing problem. It has a depth problem. Too many coaches optimizing funnels who haven't done their own work.",
    soma_positioning: "You're a somatic practitioner paying $300/mo for 5 tools that don't know your name. What if one AI learned how you coach and ran the rest?",
  };

  const body = angle
    ? `${fallbacks[category].split(".")[0]}. ${angle}`
    : fallbacks[category];

  return {
    category,
    mode: meta.mode,
    title: `${meta.label}: ${(angle || "daily").slice(0, 60)}`,
    body: stripEmDash(body),
    pillar: meta.pillar,
    content_type: category === "thread" ? "thread" : "post",
  };
}

function stripEmDash(value: string): string {
  return value.replaceAll("—", ",");
}
