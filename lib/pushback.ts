import type { Content, ContentPillar, VoiceProfile } from "@/lib/types";
import type { VoiceFitScore } from "@/lib/voice-trust";

export type PushBackSeverity = "blocker" | "warning" | "opportunity" | "clear";

export type PushBackItem = {
  severity: PushBackSeverity;
  title: string;
  detail: string;
  action: string;
};

export type PushBackSummary = {
  verdict: string;
  tone: PushBackSeverity;
  items: PushBackItem[];
};

export type ContentRepair = {
  title: string;
  body: string;
  pillar: ContentPillar;
};

const GENERIC_TITLE_WORDS = [
  "tips",
  "secrets",
  "things",
  "hack",
  "hacks",
  "mistakes",
  "truth",
  "ultimate",
];

const CLEAR_CTA_PATTERNS = [
  "?",
  "comment",
  "dm ",
  "message me",
  "book",
  "apply",
  "reply",
  "send me",
  "join",
  "save this",
  "share this",
];

export function getVoicePushBack(fit: VoiceFitScore | null): PushBackSummary | null {
  if (!fit) return null;

  const items: PushBackItem[] = [];

  if (fit.label === "weak") {
    items.push({
      severity: "blocker",
      title: "Do not send this yet",
      detail: "The draft is too far from the saved voice asset.",
      action: fit.fixes[0] ?? "Rewrite it around one specific observation and one next step.",
    });
  } else if (fit.label === "needs_edit") {
    items.push({
      severity: "warning",
      title: "Tighten before sending",
      detail: "The draft has usable intent, but it still needs a voice pass.",
      action: fit.fixes[0] ?? "Cut generic language and add one phrase the coach actually uses.",
    });
  }

  for (const reason of fit.reasons.slice(0, 2)) {
    if (reason.toLowerCase().includes("enough voice signal")) continue;
    items.push({
      severity: fit.label === "weak" ? "blocker" : "warning",
      title: normalizeReasonTitle(reason),
      detail: reason,
      action: matchingAction(reason, fit.fixes),
    });
  }

  if (fit.label === "strong" && items.length === 0) {
    items.push({
      severity: "clear",
      title: "Worth sending",
      detail: "The draft carries enough saved voice signal to review quickly.",
      action: "Check the facts, then send it.",
    });
  }

  return {
    verdict:
      fit.label === "strong"
        ? "Worth sending"
        : fit.label === "needs_edit"
          ? "Tighten first"
          : "Push back",
    tone: items[0]?.severity ?? "clear",
    items: dedupePushBack(items).slice(0, 3),
  };
}

export function getContentPushBack(item: Content): PushBackSummary {
  const body = (item.body ?? "").trim();
  const title = item.title.trim();
  const combined = `${title}\n${body}`.toLowerCase();
  const items: PushBackItem[] = [];

  if (item.status === "failed") {
    items.push({
      severity: "blocker",
      title: "Publishing failed",
      detail: "This post is not doing any work until the channel issue is fixed.",
      action: "Open the post, fix the publishing error, then reschedule it.",
    });
  }

  if (!body) {
    items.push({
      severity: "blocker",
      title: "No body copy",
      detail: "The post has a title, but no message for the audience.",
      action: "Write the core belief, the proof, and one clear next step.",
    });
  } else if (body.length < 220 && item.content_type !== "story") {
    items.push({
      severity: "warning",
      title: "Too thin to convert",
      detail: "The idea may not have enough proof, tension, or story to create demand.",
      action: "Add one lived example or one sharper contrarian point.",
    });
  }

  if (!item.pillar) {
    items.push({
      severity: "warning",
      title: "No content job",
      detail: "Without a pillar, the post is harder to judge or improve.",
      action: "Assign it to authority, story, offer, or engagement before publishing.",
    });
  }

  if (!hasClearCta(combined) && item.status !== "published") {
    items.push({
      severity: "warning",
      title: "No next step",
      detail: "The reader may agree, then leave without raising their hand.",
      action: "End with a question, DM prompt, or call invite.",
    });
  }

  if (looksGenericTitle(title)) {
    items.push({
      severity: "opportunity",
      title: "Title feels generic",
      detail: "The idea may sound like common advice instead of a coach-specific point of view.",
      action: "Rename it around the actual enemy, belief, or moment.",
    });
  }

  if (item.status === "published") {
    const views = item.performance?.views ?? 0;
    const comments = item.performance?.comments ?? 0;
    const clicks = item.performance?.clicks ?? 0;
    if (views > 500 && comments + clicks === 0) {
      items.push({
        severity: "opportunity",
        title: "Attention without intent",
        detail: "People saw it, but there is not enough visible conversion signal.",
        action: "Turn the strongest line into an offer post with a clearer ask.",
      });
    }
  }

  if (items.length === 0) {
    items.push({
      severity: "clear",
      title: "Clear to move",
      detail: "The post has a job, a body, and a next step.",
      action: item.status === "draft" ? "Schedule it or make one final voice pass." : "Watch for replies and leads.",
    });
  }

  const first = items[0];
  return {
    verdict: first.title,
    tone: first.severity,
    items: dedupePushBack(items).slice(0, 3),
  };
}

export function getContentPushBackQueue(items: Content[], limit = 4): Array<{
  content: Content;
  pushBack: PushBackSummary;
}> {
  return items
    .map((content) => ({ content, pushBack: getContentPushBack(content) }))
    .filter(({ pushBack }) => pushBack.tone !== "clear")
    .sort((a, b) => severityRank(a.pushBack.tone) - severityRank(b.pushBack.tone))
    .slice(0, limit);
}

export function repairContentDraft(
  item: Content,
  voiceProfile?: VoiceProfile | null
): ContentRepair {
  const originalBody = (item.body ?? "").trim();
  const title = sharpenTitle(item.title);
  const pillar = item.pillar ?? inferPillar(`${item.title}\n${originalBody}`);
  const voice = (voiceProfile?.voice_json ?? {}) as {
    vocabulary?: { use?: string[] };
    ctas?: string[];
  };
  const anchorWord = cleanList(voice.vocabulary?.use)[0] ?? "real";
  const cta = cleanList(voice.ctas)[0] ?? defaultCtaForPillar(pillar);

  let body = originalBody || [
    `${title}.`,
    "",
    `The problem is not that people need more information. The problem is that the next step is still too abstract to act on.`,
    "",
    `Make it ${anchorWord}: name the moment, name the cost of staying there, then choose the next honest move.`,
    "",
    cta,
  ].join("\n");

  if (body.length < 220 && item.content_type !== "story") {
    body = [
      body.replace(/\s+$/g, ""),
      "",
      "A useful test: if the idea does not change what someone does today, it is probably still too vague.",
      "",
      "Bring it down to the moment they can recognize in their own life.",
    ].join("\n");
  }

  if (!hasClearCta(`${title}\n${body}`.toLowerCase())) {
    body = `${body.replace(/[.!?]*$/g, "").trim()}.\n\n${cta}`;
  }

  return {
    title,
    body: body.replaceAll("\u2014", ",").replace(/\n{3,}/g, "\n\n").trim(),
    pillar,
  };
}

function matchingAction(reason: string, fixes: string[]): string {
  const lower = reason.toLowerCase();
  const direct = fixes.find((fix) => {
    const fixLower = fix.toLowerCase();
    return (
      lower.includes("generic") && fixLower.includes("filler") ||
      lower.includes("next step") && (fixLower.includes("question") || fixLower.includes("call")) ||
      lower.includes("avoid") && fixLower.includes("avoid") ||
      lower.includes("long") && fixLower.includes("cut") ||
      lower.includes("thin") && fixLower.includes("specific")
    );
  });
  return direct ?? fixes[0] ?? "Make one specific edit before sending.";
}

function normalizeReasonTitle(reason: string): string {
  const lower = reason.toLowerCase();
  if (lower.includes("generic")) return "Sounds generic";
  if (lower.includes("next step")) return "No clear next step";
  if (lower.includes("avoid")) return "Uses avoid language";
  if (lower.includes("long")) return "Too long";
  if (lower.includes("thin")) return "Needs more context";
  if (lower.includes("em dash")) return "Breaks punctuation rule";
  return "Voice issue";
}

function hasClearCta(text: string): boolean {
  return CLEAR_CTA_PATTERNS.some((pattern) => text.includes(pattern));
}

function looksGenericTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return GENERIC_TITLE_WORDS.some((word) => new RegExp(`\\b${word}\\b`, "i").test(lower));
}

function sharpenTitle(title: string): string {
  const clean = title.trim() || "The next honest move";
  if (!looksGenericTitle(clean)) return clean;
  return clean
    .replace(/\b\d+\s*/g, "")
    .replace(/\b(tips|secrets|things|hack|hacks|mistakes|ultimate)\b/gi, "truths")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function inferPillar(text: string): ContentPillar {
  const lower = text.toLowerCase();
  if (lower.includes("book") || lower.includes("apply") || lower.includes("call")) {
    return "offer";
  }
  if (lower.includes("story") || lower.includes("when i") || lower.includes("i used to")) {
    return "story";
  }
  if (lower.includes("?") || lower.includes("comment") || lower.includes("reply")) {
    return "engagement";
  }
  return "authority";
}

function defaultCtaForPillar(pillar: ContentPillar): string {
  switch (pillar) {
    case "offer":
      return "If this is the work you need, message me and I will point you to the next step.";
    case "story":
      return "What part of this feels familiar right now?";
    case "engagement":
      return "What would you do next if you were being honest?";
    case "authority":
      return "Save this for the next time the old pattern shows up.";
  }
}

function cleanList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function dedupePushBack(items: PushBackItem[]): PushBackItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title}:${item.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function severityRank(severity: PushBackSeverity): number {
  switch (severity) {
    case "blocker": return 0;
    case "warning": return 1;
    case "opportunity": return 2;
    case "clear": return 3;
  }
}
