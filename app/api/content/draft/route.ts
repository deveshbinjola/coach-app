import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  PAIN_SIGNAL_LABEL,
  type Content,
  type ContentPillar,
  type ContentPlatform,
  type ContentType,
  type Lead,
  type PainSignal,
  type VoiceProfile,
  type VoiceTrainingSource,
} from "@/lib/types";

export const runtime = 'edge';

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

type DraftKind = "instagram_caption" | "linkedin_post" | "newsletter" | "carousel";
type CarouselOutcome = "saves" | "conversations" | "authority";
type CarouselFramework = "listicle" | "mistake_fix" | "framework";
type CarouselStyle = "onyx_gold" | "forest_sand" | "editorial_gold" | "hard_facts" | "imported";
type CarouselHook = "curiosity_gap" | "contrarian" | "identity_callout" | "number_outcome" | "pain_question";

type DraftBody = {
  kind?: unknown;
  angle?: unknown;
  audienceSignal?: unknown;
  sourceContentId?: unknown;
  sourceLeadId?: unknown;
  sourceLabel?: unknown;
  carouselBrandName?: unknown;
  carouselHandle?: unknown;
  carouselAccentColor?: unknown;
  carouselCustomStyle?: unknown;
  carouselOutcome?: unknown;
  carouselHook?: unknown;
  carouselFramework?: unknown;
  carouselStyle?: unknown;
};

type DraftSpec = {
  kind: DraftKind;
  label: string;
  platform: ContentPlatform;
  contentType: ContentType;
  pillar: ContentPillar;
  prompt: string;
};

const SPECS: Record<DraftKind, DraftSpec> = {
  instagram_caption: {
    kind: "instagram_caption",
    label: "Instagram caption",
    platform: "instagram",
    contentType: "post",
    pillar: "engagement",
    prompt:
      "Write an Instagram caption with a sharp hook, personal insight, practical shift, and soft reply CTA.",
  },
  linkedin_post: {
    kind: "linkedin_post",
    label: "LinkedIn post",
    platform: "linkedin",
    contentType: "post",
    pillar: "authority",
    prompt:
      "Write a LinkedIn post that opens with a clear point of view, teaches one useful distinction, and ends with a conversational CTA.",
  },
  newsletter: {
    kind: "newsletter",
    label: "Newsletter",
    platform: "newsletter",
    contentType: "newsletter",
    pillar: "story",
    prompt:
      "Write a concise newsletter with a subject line, a personal opening, one useful idea, one coaching reframe, and a clear next step.",
  },
  carousel: {
    kind: "carousel",
    label: "Carousel",
    platform: "instagram",
    contentType: "carousel",
    pillar: "authority",
    // Base prompt — augmented at compose-time with strategy + (when the
    // source is a newsletter) a translation framework. See the
    // CAROUSEL STRATEGY block below for the actual rules.
    prompt:
      "Write an 8-slide Instagram carousel. Each slide is one beat that earns the swipe to the next. Slide 1 is the hook; slide 8 is one CTA.",
  },
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: DraftBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = normalizeKind(body.kind);
  if (!kind) {
    return NextResponse.json({ error: "Unknown content type" }, { status: 400 });
  }

  const angle = cleanText(body.angle, 240);
  const audienceSignal = cleanText(body.audienceSignal, 500);
  const sourceContentId = typeof body.sourceContentId === "string" ? body.sourceContentId : "";
  const sourceLeadId = typeof body.sourceLeadId === "string" ? body.sourceLeadId : "";
  const sourceLabel = cleanText(body.sourceLabel, 180);
  const carouselBrandName = cleanText(body.carouselBrandName, 80);
  const carouselHandle = cleanText(body.carouselHandle, 80);
  const carouselAccentColor = normalizeHex(body.carouselAccentColor);
  const carouselOutcome = normalizeCarouselOutcome(body.carouselOutcome);
  const carouselHook = normalizeCarouselHook(body.carouselHook);
  const carouselFramework = normalizeCarouselFramework(body.carouselFramework);
  const carouselStyle = normalizeCarouselStyle(body.carouselStyle);
  const spec = SPECS[kind];

  const [profileRes, leadsRes, sourcesRes, sourceContentRes] = await Promise.all([
    supabase
      .from("cp_voice_profiles")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cp_leads")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("cp_voice_training_sources")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    sourceContentId
      ? supabase
          .from("cp_content")
          .select("*")
          .eq("coach_id", user.id)
          .eq("id", sourceContentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const profile = (profileRes.data as VoiceProfile | null) ?? null;
  const leads = (leadsRes.data as Lead[] | null) ?? [];
  const sources = (sourcesRes.data as VoiceTrainingSource[] | null) ?? [];
  const sourceContent = (sourceContentRes.data as Content | null) ?? null;
  const marketSignals = summarizeLeadSignals(leads);
  const sourceSummary = summarizeTrainingSources(sources);
  const sourceMeta =
    sourceContent
      ? {
          source_type: "content",
          source_id: sourceContent.id,
          source_label: `Repurposed from ${sourceContent.platform}: ${sourceContent.title}`,
        }
      : sourceLeadId
        ? {
            source_type: "lead",
            source_id: sourceLeadId,
            source_label: sourceLabel || "Created from lead signal",
          }
        : {
            source_type: "manual",
            source_label: sourceLabel || "Created from manual content signal",
          };
  const fallback = deterministicDraft({
    spec,
    angle,
    audienceSignal,
    profile,
    marketSignals,
    sourceSummary,
    sourceContent,
    carouselOutcome,
    carouselHook,
    carouselFramework,
    carouselStyle,
  });
  const draft = await modelDraft({
    spec,
    angle,
    audienceSignal,
    profile,
    marketSignals,
    sourceSummary,
    sourceContent,
    carouselOutcome,
    carouselHook,
    carouselFramework,
    carouselStyle,
    fallback,
  });

  const { data: inserted, error } = await supabase
    .from("cp_content")
    .insert({
      coach_id: user.id,
      title: draft.title,
      body: draft.body,
      platform: spec.platform,
      content_type: spec.contentType,
      status: "draft",
      pillar: draft.pillar,
      performance: {
        ...sourceMeta,
        carousel_style: kind === "carousel" ? carouselStyle : undefined,
        carousel_hook: kind === "carousel" ? carouselHook : undefined,
        carousel_brand_name: kind === "carousel" ? carouselBrandName : undefined,
        carousel_handle: kind === "carousel" ? carouselHandle : undefined,
        carousel_accent_color: kind === "carousel" ? carouselAccentColor : undefined,
        carousel_custom_style: kind === "carousel" && carouselStyle === "imported" ? body.carouselCustomStyle : undefined,
      },
      brand_os_generated: true,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    content: inserted as Content,
    used: {
      format: spec.label,
      sourceSummary,
      marketSignals,
      voiceActive: Boolean(profile),
    },
  });
}

async function modelDraft({
  spec,
  angle,
  audienceSignal,
  profile,
  marketSignals,
  sourceSummary,
  sourceContent,
  carouselOutcome,
  carouselHook,
  carouselFramework,
  carouselStyle,
  fallback,
}: {
  spec: DraftSpec;
  angle: string;
  audienceSignal: string;
  profile: VoiceProfile | null;
  marketSignals: string[];
  sourceSummary: string;
  sourceContent: Content | null;
  carouselOutcome: CarouselOutcome;
  carouselHook: CarouselHook;
  carouselFramework: CarouselFramework;
  carouselStyle: CarouselStyle;
  fallback: { title: string; body: string; pillar: ContentPillar };
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  const system = [
    "You draft content for a coach.",
    "Use the coach voice profile as the source of truth.",
    "Use lead signals as market input, not as private client gossip.",
    "Do not invent claims, testimonials, client results, dates, revenue, or credentials.",
    "Do not use em dash characters.",
    "Return compact JSON only with title, body, and pillar.",
    "pillar must be one of authority, story, offer, engagement.",
  ].join(" ");

  const isNewsletterSource = sourceContent?.platform === "newsletter";

  const carouselStrategyBlock =
    spec.kind === "carousel"
      ? [
          "",
          "CAROUSEL STRATEGY:",
          `Outcome: ${CAROUSEL_OUTCOME_COPY[carouselOutcome]}`,
          `Hook type: ${CAROUSEL_HOOK_COPY[carouselHook]}`,
          `Framework: ${CAROUSEL_FRAMEWORK_COPY[carouselFramework]}`,
          `Visual system: ${CAROUSEL_STYLE_COPY[carouselStyle]}`,
          "",
          "STRUCTURE (8 slides, every slide earns the next swipe):",
          "  Slide 1 — COVER HOOK. The strongest single line. Under 10 words.",
          "  Slide 2 — SECOND HOOK. Restate the promise from a different angle.",
          "  Slides 3-6 — VALUE STACK. One beat per slide: proof, example, contrast, or unfolding.",
          "  Slide 7 — PAYOFF. The synthesis sentence the reader will remember.",
          "  Slide 8 — ONE CTA. Match the outcome above.",
          "",
          "COVER HOOK ARCHETYPES (pick one and commit to it):",
          "  - CURIOSITY GAP: 'The one thing nobody tells you about [X]'",
          "  - CONTRARIAN: 'Stop doing [common advice]. Here is why.'",
          "  - IDENTITY CALLOUT: 'If you are a [audience], read this.'",
          "  - NUMBER OUTCOME: 'How I [specific result] in [timeframe]'",
          "  - PAIN QUESTION: 'Tired of [specific pain]?'",
          "  - DISBELIEF: 'I was wrong about [common belief].'",
          "Cover does 60% of the swipe-through work. Generic 'tips' headlines fail.",
          "",
          `CTA FOR THIS POST (${carouselOutcome}):`,
          `  ${CAROUSEL_CTA_BY_OUTCOME[carouselOutcome]}`,
          "",
          "HARD RULES:",
          "  - No slide title over 12 words.",
          "  - One idea per slide. If a slide has two ideas, split it.",
          "  - No em dash characters.",
          "  - Final slide is exactly one CTA. No stacked asks.",
          "  - Do not print visual system names, template names, slide roles, framework names, or strategy notes inside the slide copy.",
        ].join("\n")
      : "";

  const newsletterTranslationBlock =
    spec.kind === "carousel" && isNewsletterSource
      ? [
          "",
          "NEWSLETTER → CAROUSEL TRANSLATION (this overrides the source content's structure):",
          "Newsletters are tuned for inbox open-rate and reflective reading.",
          "Carousels are tuned for feed scroll-stop and one-beat-per-tap rhythm.",
          "Translate, do not summarize.",
          "",
          "DO:",
          "  - Pull the SINGLE sharpest sentence from the newsletter as the cover hook.",
          "  - Reshape the long-form arc into 8 distinct beats.",
          "  - Each slide leaves something open or builds anticipation.",
          "  - Slide 7 should be the payoff line the newsletter built toward.",
          "",
          "DO NOT:",
          "  - Do NOT summarize the newsletter section by section into 8 slides.",
          "  - Do NOT lift the newsletter subject line as the cover hook (it was tuned for inbox open rate, not feed scroll-stop — use the sharpest body line instead).",
          "  - Do NOT include reflective transitions ('In this issue...', 'Today I want to...', 'Until next week').",
          "  - Do NOT include multiple CTAs even if the newsletter had several links.",
        ].join("\n")
      : "";

  const prompt = [
    `FORMAT: ${spec.label}`,
    spec.prompt,
    carouselStrategyBlock,
    newsletterTranslationBlock,
    "",
    "COACH ANGLE:",
    angle || "(choose the strongest angle from the signals)",
    "",
    "USER ADDED SIGNAL:",
    audienceSignal || "(none)",
    "",
    "VOICE PROFILE:",
    JSON.stringify(profile?.voice_json ?? {}, null, 2),
    "",
    "VOICE SAMPLES:",
    (profile?.sample_messages ?? []).slice(0, 5).join("\n\n") || "(none)",
    "",
    "IMPORTED VOICE SOURCES:",
    sourceSummary,
    "",
    "LEAD SIGNALS:",
    marketSignals.length ? marketSignals.join("\n") : "(none yet)",
    "",
    "SOURCE CONTENT TO REPURPOSE:",
    sourceContent
      ? JSON.stringify(
          {
            title: sourceContent.title,
            body: sourceContent.body,
            platform: sourceContent.platform,
            content_type: sourceContent.content_type,
          },
          null,
          2
        )
      : "(none)",
    "",
    "FALLBACK DRAFT:",
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
        max_tokens: 1800,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return fallback;
    const json = await res.json();
    const text = String(json?.content?.[0]?.text ?? "").trim();
    return parseDraft(text) ?? fallback;
  } catch {
    return fallback;
  }
}

function parseDraft(text: string): { title: string; body: string; pillar: ContentPillar } | null {
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
    const title = cleanText(parsed.title, 160);
    const body = cleanText(parsed.body, 5000);
    const pillar = cleanText(parsed.pillar, 40) as ContentPillar;
    if (!title || !body || !["authority", "story", "offer", "engagement"].includes(pillar)) {
      return null;
    }
    return {
      title: stripEmDash(title),
      body: stripEmDash(body),
      pillar,
    };
  } catch {
    return null;
  }
}

function deterministicDraft({
  spec,
  angle,
  audienceSignal,
  profile,
  marketSignals,
  sourceSummary,
  sourceContent,
  carouselOutcome,
  carouselHook,
  carouselFramework,
  carouselStyle,
}: {
  spec: DraftSpec;
  angle: string;
  audienceSignal: string;
  profile: VoiceProfile | null;
  marketSignals: string[];
  sourceSummary: string;
  sourceContent: Content | null;
  carouselOutcome: CarouselOutcome;
  carouselHook: CarouselHook;
  carouselFramework: CarouselFramework;
  carouselStyle: CarouselStyle;
}) {
  const opener = firstString((profile?.voice_json as Record<string, unknown> | undefined)?.openers) ??
    "Here is the thing I keep noticing:";
  const cta = firstString((profile?.voice_json as Record<string, unknown> | undefined)?.ctas) ??
    "If this is where you are, reply with one word: ready.";
  const topic =
    angle ||
    sourceContent?.title ||
    audienceSignal ||
    marketSignals[0]?.replace(/^- /, "") ||
    "the conversation your market keeps starting";

  const body =
    spec.kind === "carousel"
      ? [
          `Slide 1: ${carouselCover(topic, carouselFramework, carouselHook)}`,
          "",
          `Slide 2: ${carouselSecondHook(carouselHook)}`,
          "The real problem is usually one layer deeper.",
          "",
          `Slide 3: ${carouselValueOne(carouselFramework)}`,
          "Name the pattern clearly.",
          "",
          "Slide 4: The cost compounds quietly",
          "Avoiding it does not keep it neutral.",
          "",
          "Slide 5: Try this cleaner move",
          "Make the next step smaller and more honest.",
          "",
          "Slide 6: Repeat it until it sticks",
          "Consistency beats another complex system.",
          "",
          "Slide 7: The reframe",
          "You do not need more pressure. You need cleaner signal.",
          "",
          `Slide 8: ${cta}`,
        ].join("\n")
      : [
          opener,
          "",
          topic,
          "",
          marketSignals[0]
            ? `The signal: ${marketSignals[0].replace(/^- /, "")}`
            : sourceContent?.body
              ? `The signal: ${sourceContent.body.slice(0, 240)}`
            : "The signal: your audience needs a clearer next step.",
          "",
          "The move is not more volume. The move is sharper language, cleaner timing, and saying the thing your best-fit client already feels.",
          "",
          cta,
          "",
          `Built from ${sourceSummary}.`,
        ].join("\n");

  return {
    title: stripEmDash(`${spec.label}: ${topic}`).slice(0, 150),
    body: stripEmDash(body),
    pillar: spec.pillar,
  };
}

function summarizeLeadSignals(leads: Lead[]): string[] {
  const painCounts = new Map<string, number>();
  for (const lead of leads) {
    for (const pain of lead.pain_signal ?? []) {
      const label = PAIN_SIGNAL_LABEL[pain as PainSignal] ?? pain;
      painCounts.set(label, (painCounts.get(label) ?? 0) + 1);
    }
  }

  const painSignals = [...painCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => `- ${label} is showing up across ${count} ${count === 1 ? "lead" : "leads"}.`);

  const noteSignals = leads
    .map((lead) => cleanText(lead.notes, 180))
    .filter(Boolean)
    .slice(0, 3)
    .map((note) => `- Lead note: ${note}`);

  return [...painSignals, ...noteSignals].slice(0, 5);
}

function summarizeTrainingSources(sources: VoiceTrainingSource[]): string {
  if (sources.length === 0) return "no imported sources yet";
  const counts = sources.reduce<Record<string, number>>((acc, source) => {
    acc[source.source_type] = (acc[source.source_type] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([type, count]) => `${count} ${type.replaceAll("_", " ")}`)
    .join(", ");
}

function normalizeKind(value: unknown): DraftKind | null {
  if (typeof value !== "string") return null;
  return Object.prototype.hasOwnProperty.call(SPECS, value) ? (value as DraftKind) : null;
}

const CAROUSEL_OUTCOME_COPY: Record<CarouselOutcome, string> = {
  saves: "Get saves",
  conversations: "Start conversations",
  authority: "Build authority",
};

// Outcome → CTA mapping. The model is told to use the matching CTA verbatim
// so slide 8 stops being a generic "follow for more" — it actually drives
// the result the coach picked when composing.
const CAROUSEL_CTA_BY_OUTCOME: Record<CarouselOutcome, string> = {
  saves:
    "Save this so the next time the pattern shows up, you have the move ready.",
  conversations:
    "Reply with the word that lands hardest. Tell me which slide you're sitting with.",
  authority:
    "Follow for the next post in this thread. Same lens, sharper edges.",
};

const CAROUSEL_FRAMEWORK_COPY: Record<CarouselFramework, string> = {
  listicle: "Listicle, save magnet with numbered useful points",
  mistake_fix: "Mistake / Fix, contrarian point of view with a better move",
  framework: "Framework, named system that creates proprietary IP",
};

const CAROUSEL_HOOK_COPY: Record<CarouselHook, string> = {
  curiosity_gap: "Curiosity gap, an unfinished idea that makes the reader swipe",
  contrarian: "Contrarian, a useful belief reversal",
  identity_callout: "Identity callout, names the exact reader",
  number_outcome: "Number plus outcome, clear count and clear promise",
  pain_question: "Pain question, opens with the objection or ache the lead already has",
};

const CAROUSEL_STYLE_COPY: Record<CarouselStyle, string> = {
  onyx_gold: "Onyx + Gold, premium high-ticket authority",
  forest_sand: "Forest + Sand, grounded organic coaching",
  editorial_gold: "Editorial Gold, poster blocks and bold feed contrast",
  hard_facts: "Hard Facts, gray editorial truth-post system",
  imported: "Imported coach style from a reference carousel",
};

function normalizeCarouselOutcome(value: unknown): CarouselOutcome {
  return value === "conversations" || value === "authority" || value === "saves"
    ? value
    : "saves";
}

function normalizeCarouselHook(value: unknown): CarouselHook {
  return value === "curiosity_gap" ||
    value === "contrarian" ||
    value === "identity_callout" ||
    value === "number_outcome" ||
    value === "pain_question"
    ? value
    : "contrarian";
}

function normalizeCarouselFramework(value: unknown): CarouselFramework {
  return value === "mistake_fix" || value === "framework" || value === "listicle"
    ? value
    : "mistake_fix";
}

function normalizeCarouselStyle(value: unknown): CarouselStyle {
  if (value === "onyx_gold" || value === "forest_sand" || value === "editorial_gold" || value === "hard_facts" || value === "imported") {
    return value;
  }
  if (value === "clean_cream") return "forest_sand";
  if (value === "accent_flash" || value === "midnight_citron") return "editorial_gold";
  if (value === "black_gold") return "hard_facts";
  return "onyx_gold";
}

function carouselCover(topic: string, framework: CarouselFramework, hook: CarouselHook): string {
  if (hook === "pain_question") return `Why ${topic} keeps happening`.slice(0, 80);
  if (hook === "identity_callout") return `For coaches stuck in ${topic}`.slice(0, 80);
  if (hook === "number_outcome") return `7 ways to fix ${topic}`.slice(0, 80);
  if (hook === "curiosity_gap") return `The hidden cost of ${topic}`.slice(0, 80);
  if (framework === "framework") return `The ${topic} framework`.slice(0, 80);
  return `Stop forcing ${topic}`.slice(0, 80);
}

function carouselSecondHook(hook: CarouselHook): string {
  if (hook === "pain_question") return "The question underneath it";
  if (hook === "identity_callout") return "This is probably you";
  if (hook === "number_outcome") return "Start with the first move";
  if (hook === "curiosity_gap") return "Here is what changes everything";
  return "The opposite is usually true";
}

function carouselValueOne(framework: CarouselFramework): string {
  if (framework === "listicle") return "01, Start with the pattern";
  if (framework === "framework") return "Step 1, Name the signal";
  return "Mistake, treating pressure as proof";
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return stripEmDash(value).trim().slice(0, maxLength);
}

function normalizeHex(value: unknown): string {
  if (typeof value !== "string") return "#00FF41";
  const trimmed = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : "#00FF41";
}

function stripEmDash(value: string): string {
  return value.replaceAll("\u2014", ",");
}

function firstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const first = value.find((item) => typeof item === "string" && item.trim());
  return typeof first === "string" ? first.trim() : null;
}
