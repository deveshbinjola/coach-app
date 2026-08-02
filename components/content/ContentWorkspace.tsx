"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  Archive,
  Check,
  Copy,
  FileText,
  Instagram,
  Linkedin,
  PanelsTopLeft,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import SparkButton from "@/components/spark/SparkButton";
import { createClient } from "@/lib/supabase-browser";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import {
  PAIN_SIGNAL_LABEL,
  PLATFORM_LABEL,
  PILLAR_LABEL,
  type CoachSettings,
  type Content,
  type Lead,
  type PainSignal,
  type VoiceProfile,
  type VoiceTrainingSource,
} from "@/lib/types";
import { getVoiceAssetStats } from "@/lib/voice-asset";
import { DEFAULT_ACCENT_HEX, brandKitFromSettings, fontFamilyStack, googleFontsHref, readableTextOn, type BrandKit } from "@/lib/brand-kit";
import BrandOsPillarStrip, { type ResonanceHook, type StripPillar } from "@/components/content/BrandOsPillarStrip";
import BuyerMirrorBanner, { type BuyerMirror } from "@/components/content/BuyerMirrorBanner";
import VoiceRetuneBanner from "@/components/content/VoiceRetuneBanner";
import VoiceCompose from "@/components/VoiceCompose";
import EditorialSectionHeader from "@/components/content/EditorialSectionHeader";
import SacredZonesInline from "@/components/content/SacredZonesInline";
import ContentTabBar from "@/components/content/ContentTabBar";
import type { ContentTab } from "@/components/content/ContentTabBar";

type DraftKind = "instagram_caption" | "linkedin_post" | "newsletter" | "carousel";
type CarouselOutcome = "saves" | "conversations" | "authority";
type CarouselFramework = "listicle" | "mistake_fix" | "framework";
type CarouselStyle = "onyx_gold" | "forest_sand" | "editorial_gold" | "hard_facts" | "imported" | "brand_kit";
type CarouselHook = "curiosity_gap" | "contrarian" | "identity_callout" | "number_outcome" | "pain_question" | "framework_reveal";

type CarouselCustomStyle = {
  name: string;
  kind?: "palette" | "kit" | "dna";
  colors: string[];
  background: string;
  text: string;
  accent: string;
  layout: "quote" | "poster" | "hard_facts" | "minimal";
  dna?: CarouselStyleDna;
  templates?: CarouselKitTemplate[];
  imported_at: string;
};

type CarouselKitRole = "cover" | "teaching" | "quote" | "cta";
type CarouselFontFamily = "sans" | "serif" | "mono";
type CarouselBackgroundMood = "solid" | "editorial_gradient" | "paper" | "poster_blocks" | "night_texture";
type CarouselHighlightMode = "none" | "accent_words" | "italic_accent" | "marker";
type ContentLibraryView = "best" | "recent" | "archived";

type CarouselStyleDna = {
  backgroundMood: CarouselBackgroundMood;
  fontFamily: CarouselFontFamily;
  titleWeight: number;
  bodyWeight: number;
  align: "left" | "center";
  titleCase: "none" | "uppercase" | "sentence";
  tracking: "normal" | "wide" | "tight";
  highlightMode: CarouselHighlightMode;
  highlightColor: string;
  titleColor: string;
  bodyColor: string;
  handleColor: string;
  handlePlacement: "top" | "bottom" | "hidden";
  ornament: "none" | "diamond" | "asterisk" | "rule" | "capsule";
  titleZone: CarouselKitZone;
  bodyZone: CarouselKitZone;
};

type CarouselKitZone = {
  x: number;
  y: number;
  w: number;
  h: number;
  align: "left" | "center";
  family: CarouselFontFamily;
  weight: number;
  maxFont: number;
  minFont: number;
  color?: string;
  panel?: boolean;
};

type CarouselKitTemplate = {
  role: CarouselKitRole;
  background: string;
  text: string;
  accent: string;
  layout: CarouselCustomStyle["layout"];
  dna: CarouselStyleDna;
  zones: {
    title: CarouselKitZone;
    body?: CarouselKitZone;
    identity?: CarouselKitZone;
    progress?: CarouselKitZone;
  };
};

type DraftOption = {
  kind: DraftKind;
  title: string;
  description: string;
  icon: typeof Instagram;
};

const DRAFT_OPTIONS: DraftOption[] = [
  {
    kind: "instagram_caption",
    title: "Instagram caption",
    description: "Short, sharp, reply-worthy.",
    icon: Instagram,
  },
  {
    kind: "linkedin_post",
    title: "LinkedIn post",
    description: "Point of view plus teaching.",
    icon: Linkedin,
  },
  {
    kind: "newsletter",
    title: "Newsletter",
    description: "Deeper idea with a clear next step.",
    icon: FileText,
  },
  {
    kind: "carousel",
    title: "Carousel",
    description: "Eight editable, export-ready slides.",
    icon: PanelsTopLeft,
  },
];

const CAROUSEL_OUTCOMES: Array<{
  id: CarouselOutcome;
  label: string;
  description: string;
}> = [
  { id: "saves", label: "Get saves", description: "Best for tutorials, cheat sheets, and repeat reference." },
  { id: "conversations", label: "Start conversations", description: "Best for comments, DMs, objections, and identity tension." },
  { id: "authority", label: "Build authority", description: "Best for teaching your proprietary point of view." },
];

const CAROUSEL_FRAMEWORKS: Array<{
  id: CarouselFramework;
  label: string;
  description: string;
  bestFor: string;
}> = [
  { id: "listicle", label: "Listicle", description: "Numbered ideas that are easy to save.", bestFor: "save magnet" },
  { id: "mistake_fix", label: "Mistake / Fix", description: "A contrarian pattern interrupt with a cleaner move.", bestFor: "strong POV" },
  { id: "framework", label: "Framework", description: "A named system that turns your method into IP.", bestFor: "authority" },
];

const CAROUSEL_HOOKS: Array<{
  id: CarouselHook;
  label: string;
  description: string;
  bestFor: string;
}> = [
  {
    id: "curiosity_gap",
    label: "Curiosity gap",
    description: "Make them swipe because the answer is unfinished.",
    bestFor: "cold audience",
  },
  {
    id: "contrarian",
    label: "Contrarian",
    description: "Say the useful thing most coaches are afraid to say.",
    bestFor: "strong POV",
  },
  {
    id: "identity_callout",
    label: "Identity callout",
    description: "Name the reader so they feel the post was made for them.",
    bestFor: "niche fit",
  },
  {
    id: "number_outcome",
    label: "Number + outcome",
    description: "Promise a clear result with a simple count.",
    bestFor: "saves",
  },
  {
    id: "pain_question",
    label: "Pain question",
    description: "Open with the question their lead is already carrying.",
    bestFor: "lead objection",
  },
  {
    id: "framework_reveal",
    label: "Framework reveal",
    description: "Tease a named system. The acronym drops on Slide 2.",
    bestFor: "framework carousels",
  },
];

const CAROUSEL_STYLES: Array<{
  id: CarouselStyle;
  label: string;
  description: string;
  bestFor: string;
}> = [
  {
    id: "onyx_gold",
    label: "Onyx + Gold",
    description: "Premium, grounded, high-ticket authority.",
    bestFor: "offers",
  },
  {
    id: "forest_sand",
    label: "Forest + Sand",
    description: "Warm, organic, grounded coaching and embodied work.",
    bestFor: "trust",
  },
  {
    id: "editorial_gold",
    label: "Editorial Gold",
    description: "Poster blocks, bold type, and strong feed contrast.",
    bestFor: "covers",
  },
  {
    id: "hard_facts",
    label: "Hard Facts",
    description: "Gray editorial gradient with oversized black type.",
    bestFor: "truth posts",
  },
  {
    id: "brand_kit",
    label: "Brand kit",
    description: "Your colors, your font, your logo — from /settings.",
    bestFor: "any",
  },
];

const CAROUSEL_STEPS = ["Goal", "Hook", "Framework", "System", "Brand", "Input", "Review"] as const;

const CAROUSEL_SLIDE_ROLES = [
  { role: "Cover hook", rule: "Under 12 words. Big enough to read fast." },
  { role: "Second hook", rule: "Must work alone if Instagram reopens here." },
  { role: "Value stack", rule: "One idea. One clean sentence." },
  { role: "Value stack", rule: "Keep the practical move obvious." },
  { role: "Pattern break", rule: "Wake up the deck with the sharpest line." },
  { role: "Value stack", rule: "Make the method feel repeatable." },
  { role: "Payoff", rule: "The reframe they remember." },
  { role: "CTA close", rule: "One ask only: save, comment, DM, follow, or book." },
] as const;

export default function ContentWorkspace({
  profile,
  leads,
  content,
  trainingSources,
  seedLeadId = "",
  settings,
  brandPillars = [],
  brandHooks = [],
  hasRunBrandOs = false,
  buyerMirror = null,
  voiceRetune = null,
  untappedTopics,
}: {
  profile: VoiceProfile | null;
  leads: Lead[];
  content: Content[];
  trainingSources: VoiceTrainingSource[];
  seedLeadId?: string;
  settings: CoachSettings | null;
  /** Pillars from coach's latest Brand OS run — drives the pillar strip. */
  brandPillars?: StripPillar[];
  /** Resonance hooks from the run — click-to-draft. */
  brandHooks?: ResonanceHook[];
  /** False if no Brand OS run completed yet — strip shows soft prompt. */
  hasRunBrandOs?: boolean;
  /** Buyer Mirror from synthesis — pinned at top of Draft room. */
  buyerMirror?: BuyerMirror | null;
  /** Voice corpus delta — when new samples warrant a re-tune, this is set. */
  voiceRetune?: { newSources: number; newChars: number } | null;
  /** Topics clients discuss in sessions that the coach hasn't written about yet. */
  untappedTopics?: Array<{ topic: string; sessionCount: number }>;
}) {
  const supabase = createClient();
  const seedLead = leads.find((lead) => lead.id === seedLeadId) ?? null;
  // Brand kit comes from cp_coach_settings (set in /settings → Brand kit).
  // Drives carousel rendering when style === "brand_kit". Stable per render.
  const brandKit = useMemo(() => brandKitFromSettings(settings as CoachSettings | null | undefined), [settings]);
  const [selectedKind, setSelectedKind] = useState<DraftKind>("instagram_caption");
  // Voice-learned toast (surfaces when edit-as-feedback loop adds vocab).
  const [voiceLearnedToast, setVoiceLearnedToast] = useState<{ yes: string[]; no: string[]; at: number } | null>(null);
  useEffect(() => {
    if (!voiceLearnedToast) return;
    const t = setTimeout(() => setVoiceLearnedToast(null), 7000);
    return () => clearTimeout(t);
  }, [voiceLearnedToast]);
  const [angle, setAngle] = useState(() => seedLeadAngle(seedLead));
  const [audienceSignal, setAudienceSignal] = useState(() => seedLeadSignal(seedLead));
  const [carouselOutcome, setCarouselOutcome] = useState<CarouselOutcome>("conversations");
  const [carouselHook, setCarouselHook] = useState<CarouselHook>(() =>
    recommendCarouselHook(leads, "conversations")
  );
  const [carouselFramework, setCarouselFramework] = useState<CarouselFramework>(() =>
    recommendCarouselFramework(leads)
  );
  const [carouselStyle, setCarouselStyle] = useState<CarouselStyle>(
    normalizeCarouselStyleValue(settings?.carousel_default_style) ?? "onyx_gold"
  );
  const [carouselBrandName, setCarouselBrandName] = useState(
    settings?.carousel_brand_name || "Your Brand"
  );
  const [carouselHandle, setCarouselHandle] = useState(
    settings?.carousel_handle || "@yourhandle"
  );
  const [carouselAccentColor, setCarouselAccentColor] = useState(
    settings?.carousel_accent_color || DEFAULT_ACCENT_HEX
  );
  const [carouselCustomStyle, setCarouselCustomStyle] = useState<CarouselCustomStyle | null>(() =>
    parseCarouselCustomStyle(settings?.carousel_custom_style)
  );
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselStep, setCarouselStep] = useState(0);
  const [savingCarouselPrefs, setSavingCarouselPrefs] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [repurposing, setRepurposing] = useState<string | null>(null);
  const [repurposeOpenId, setRepurposeOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [items, setItems] = useState<Content[]>(content);
  const [latestDraft, setLatestDraft] = useState<Content | null>(content[0] ?? null);
  const [contentView, setContentView] = useState<ContentLibraryView>("best");
  const [contentTab, setContentTab] = useState<ContentTab>(() => {
    if (typeof window === "undefined") return "library";
    return (localStorage.getItem("content-tab") as ContentTab) ?? "library";
  });
  const [deleteTarget, setDeleteTarget] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleTabChange(tab: ContentTab) {
    setContentTab(tab);
    localStorage.setItem("content-tab", tab);
  }

  const voiceStats = useMemo(
    () => getVoiceAssetStats({ profile, content: items, leads }),
    [profile, items, leads]
  );
  const leadSignals = useMemo(() => getLeadSignals(leads), [leads]);
  const sourceSummary = useMemo(() => summarizeSources(trainingSources), [trainingSources]);
  const selected = DRAFT_OPTIONS.find((option) => option.kind === selectedKind) ?? DRAFT_OPTIONS[0];
  const carouselRecommendation = useMemo(
    () => getCarouselRecommendation(leads, carouselOutcome),
    [leads, carouselOutcome]
  );
  const libraryItems = useMemo(() => getVisibleLibraryItems(items, contentView), [items, contentView]);

  async function generateDraft(sourceContentId = "", kindOverride?: DraftKind) {
    const kindToGenerate = kindOverride ?? selectedKind;
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/content/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: kindToGenerate,
          angle,
          audienceSignal,
          sourceContentId,
          sourceLeadId: seedLead?.id ?? "",
          sourceLabel: seedLead ? `Created from ${seedLead.full_name}'s lead signal` : "",
          carouselBrandName,
          carouselHandle,
          carouselAccentColor,
          carouselCustomStyle,
          carouselOutcome,
          carouselHook,
          carouselFramework,
          carouselStyle,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.content) {
        setError(json.error ?? "Draft failed");
        return;
      }
      const next = json.content as Content;
      setLatestDraft(next);
      setItems((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      if (kindToGenerate === "carousel") {
        setCarouselStep(CAROUSEL_STEPS.length - 1);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  async function repurposeDraft(item: Content, kind: DraftKind) {
    setSelectedKind(kind);
    if (kind === "carousel") {
      setCarouselOpen(true);
      setCarouselStep(4);
    }
    setRepurposing(`${item.id}:${kind}`);
    setError(null);
    try {
      const res = await fetch("/api/content/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          angle: `Repurpose: ${item.title}`,
          audienceSignal,
          sourceContentId: item.id,
          sourceLabel: `Repurposed from ${PLATFORM_LABEL[item.platform]}: ${item.title}`,
          carouselBrandName,
          carouselHandle,
          carouselAccentColor,
          carouselCustomStyle,
          carouselOutcome,
          carouselHook,
          carouselFramework,
          carouselStyle,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.content) {
        setError(json.error ?? "Repurpose failed");
        return;
      }
      const next = json.content as Content;
      setLatestDraft(next);
      setItems((current) => [next, ...current.filter((contentItem) => contentItem.id !== next.id)]);
      setRepurposeOpenId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRepurposing(null);
    }
  }

  async function copyDraft(item: Content) {
    const text = [item.title, item.body].filter(Boolean).join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 1400);
  }

  async function downloadCarousel(item: Content) {
    const slides = parseCarouselSlides(item);
    if (slides.length === 0) return;
    for (const [index, slide] of slides.entries()) {
      const meta = getContentMeta(item);
      const url = await renderCarouselSlide(
        item.title,
        slide,
        index + 1,
        slides.length,
        normalizeCarouselStyleValue(meta.carousel_style) ?? carouselStyle,
        meta.carousel_brand_name ?? carouselBrandName,
        meta.carousel_handle ?? carouselHandle,
        meta.carousel_accent_color ?? carouselAccentColor,
        meta.carousel_custom_style ?? carouselCustomStyle
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slugify(item.title)}-slide-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2500);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
  }

  async function saveCarouselPreferences() {
    if (!settings?.coach_id) return;
    setSavingCarouselPrefs(true);
    try {
      await supabase
        .from("cp_coach_settings")
        .update({
          carousel_brand_name: carouselBrandName.trim() || null,
          carousel_handle: carouselHandle.trim() || null,
          carousel_default_style: carouselStyle,
          carousel_accent_color: isValidHex(carouselAccentColor) ? carouselAccentColor : DEFAULT_ACCENT_HEX,
          carousel_custom_style: carouselCustomStyle,
        })
        .eq("coach_id", settings.coach_id);
    } finally {
      setSavingCarouselPrefs(false);
    }
  }

  async function updateContentBody(item: Content, body: string) {
    setLatestDraft((current) => current?.id === item.id ? { ...current, body } : current);
    setItems((current) =>
      current.map((contentItem) =>
        contentItem.id === item.id ? { ...contentItem, body } : contentItem
      )
    );
    await supabase.from("cp_content").update({ body }).eq("id", item.id);
    // Edit-as-feedback loop. Debounced 2.5s — only fires once the coach
    // stops typing. Only fires for AI-generated drafts (ai_original_body
    // present, set in /api/content/draft). Toast surfaces what voice
    // signal we just learned, if any.
    scheduleLearnFromEdit(item);
  }

  /** Per-content debounce so multi-edit sessions only fire one learn call. */
  const learnTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function scheduleLearnFromEdit(item: Content) {
    if (!item.brand_os_generated && !item.ai_original_body) return;
    const existing = learnTimers.current[item.id];
    if (existing) clearTimeout(existing);
    learnTimers.current[item.id] = setTimeout(() => { void fireLearnFromEdit(item.id); }, 2500);
  }
  async function fireLearnFromEdit(contentId: string) {
    try {
      const res = await fetch("/api/brand-os/learn-from-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      if (!res.ok) return;
      const data = await res.json() as { added_yes?: string[]; added_no?: string[]; skipped?: string };
      if (data.skipped || (!data.added_yes?.length && !data.added_no?.length)) return;
      setVoiceLearnedToast({ yes: data.added_yes ?? [], no: data.added_no ?? [], at: Date.now() });
    } catch {
      // silent — learning is a bonus, never blocks the coach
    }
  }

  async function updateContentPerformance(item: Content, patch: Partial<ContentMeta>) {
    const performance = {
      ...(item.performance ?? {}),
      ...patch,
    };
    const updated = { ...item, performance };
    setLatestDraft((current) => current?.id === item.id ? updated : current);
    setItems((current) =>
      current.map((contentItem) =>
        contentItem.id === item.id ? updated : contentItem
      )
    );
    await supabase.from("cp_content").update({ performance }).eq("id", item.id);
  }

  async function toggleContentFavorite(item: Content) {
    await updateContentPerformance(item, { content_favorite: !isContentFavorite(item) });
  }

  async function archiveContent(item: Content) {
    await updateContentPerformance(item, { content_archived: true });
    if (contentView !== "archived") {
      setRepurposeOpenId(null);
    }
  }

  async function restoreContent(item: Content) {
    await updateContentPerformance(item, { content_archived: false });
  }

  async function deleteContent(item: Content) {
    setItems((current) => current.filter((contentItem) => contentItem.id !== item.id));
    setLatestDraft((current) => current?.id === item.id ? null : current);
    setRepurposeOpenId(null);
    setDeleteTarget(null);
    await supabase.from("cp_content").delete().eq("id", item.id);
  }

  async function updateCarouselStyleForDraft(item: Content, style: CarouselStyle) {
    setCarouselStyle(style);
    const performance = {
      ...(item.performance ?? {}),
      carousel_style: style,
      ...(carouselCustomStyle ? { carousel_custom_style: carouselCustomStyle } : {}),
    };
    const updated = { ...item, performance };
    setLatestDraft((current) => current?.id === item.id ? updated : current);
    setItems((current) =>
      current.map((contentItem) =>
        contentItem.id === item.id ? updated : contentItem
      )
    );
    await supabase.from("cp_content").update({ performance }).eq("id", item.id);
  }

  function openCarouselBuilder() {
    setSelectedKind("carousel");
    setCarouselOpen(true);
    setCarouselStep(0);
  }

  function updateCarouselOutcome(value: CarouselOutcome) {
    setCarouselOutcome(value);
    setCarouselHook(recommendCarouselHook(leads, value));
  }

  async function importCarouselStyle(files: File[], targetDraft?: Content | null) {
    const custom = await extractCarouselStyle(files);
    await applyCarouselCustomStyle(custom, targetDraft);
  }

  async function applyCarouselCustomStyle(custom: CarouselCustomStyle, targetDraft?: Content | null) {
    setCarouselCustomStyle(custom);
    setCarouselStyle("imported");
    if (settings?.coach_id) {
      await supabase
        .from("cp_coach_settings")
        .update({
          carousel_default_style: "imported",
          carousel_custom_style: custom,
        })
        .eq("coach_id", settings.coach_id);
    }
    if (targetDraft) {
      const performance = {
        ...(targetDraft.performance ?? {}),
        carousel_style: "imported" as const,
        carousel_custom_style: custom,
      };
      const updated = { ...targetDraft, performance };
      setLatestDraft((current) => current?.id === targetDraft.id ? updated : current);
      setItems((current) =>
        current.map((contentItem) =>
          contentItem.id === targetDraft.id ? updated : contentItem
        )
      );
      await supabase.from("cp_content").update({ performance }).eq("id", targetDraft.id);
    }
  }

  function updateCarouselDna(
    patch: Partial<CarouselStyleDna>,
    targetDraft?: Content | null,
    customPatch?: Partial<CarouselCustomStyle>
  ) {
    const base = carouselCustomStyle ?? fallbackCustomStyle("Imported style");
    const dna = {
      ...(base.dna ?? createCarouselStyleDna(base.background, base.text, base.accent, base.layout, [])),
      ...patch,
    };
    const background = customPatch?.background ?? base.background;
    const text = customPatch?.text ?? dna.titleColor;
    const accent = customPatch?.accent ?? dna.highlightColor;
    const next: CarouselCustomStyle = {
      ...base,
      ...customPatch,
      kind: "dna",
      dna,
      background,
      text,
      accent,
      colors: dedupeColors([background, text, dna.bodyColor, accent, dna.handleColor, ...base.colors]),
      templates: base.templates?.map((template) => ({ ...template, dna })) ?? [],
    };
    void applyCarouselCustomStyle(next, targetDraft);
  }

  /** Brand OS resonance hook → draft room. Fills the angle field with the
   *  full hook + headline so the model has both the framing AND the angle,
   *  defaults to instagram_caption (most coaches' easiest ship), then
   *  scrolls to the draft room. Coach can swap kind/format from there. */
  function handlePickBrandHook(hook: ResonanceHook) {
    const filled = `${hook.headline}\n\n${hook.angle}\n\n(Pillar: ${hook.pillar})`;
    setAngle(filled);
    setSelectedKind("instagram_caption");
    // Wait a tick so React commits the state before we scroll.
    setTimeout(() => {
      const el = typeof document !== "undefined" ? document.getElementById("draft-room") : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      {voiceRetune && (
        <VoiceRetuneBanner newSources={voiceRetune.newSources} newChars={voiceRetune.newChars} />
      )}
      {untappedTopics && untappedTopics.length > 0 && (
        <div className="mb-5 px-4 py-3 rounded-[var(--r-md)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          {untappedTopics.length === 1 ? (
            <>
              Your clients keep discussing{" "}
              <strong className="text-[color:var(--brand-strong)]">{untappedTopics[0].topic}</strong>
              {" — "}
              <a href={`/content?seed_topic=${encodeURIComponent(untappedTopics[0].topic)}`} className="font-bold text-[color:var(--text)] hover:underline">
                write about it →
              </a>
            </>
          ) : (
            <>
              <strong className="text-[color:var(--brand-strong)]">
                {untappedTopics.slice(0, 2).map((t) => t.topic).join(" and ")}
              </strong>
              {" keep coming up in sessions — "}
              <a href="/content" className="font-bold text-[color:var(--text)] hover:underline">
                write about them →
              </a>
            </>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ContentTabBar
          activeTab={contentTab}
          onTabChange={handleTabChange}
          draftCount={items.filter((item) => !isContentArchived(item)).length}
        />
        <a
          href="/content/polish"
          className="inline-flex items-center gap-2 h-9 px-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] transition"
        >
          ✎ Polish a rough draft
        </a>
      </div>

      {contentTab === "create" && (
      <>
      <EditorialSectionHeader
        number={1}
        kicker="The Desk"
        lede="Where today's piece is composed. Voice on the left, signal on the right."
        tone="accent"
      />

      {/* Pillars + hooks live INSIDE The Desk — inputs adjacent to the
          drafting surface so the click-to-prefill hook flow feels natural. */}
      <BrandOsPillarStrip
        pillars={brandPillars}
        hooks={brandHooks}
        hasRunBrandOs={hasRunBrandOs}
        onPickHook={handlePickBrandHook}
      />

      <div id="draft-room" className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] scroll-mt-4">
        <Card className="space-y-5">
          {/* Buyer Mirror — keeps every draft addressed to one person, not a "you" plural. */}
          {buyerMirror && <BuyerMirrorBanner mirror={buyerMirror} />}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
                Draft room
              </h2>
              <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                Pick one asset. The app pulls voice and market signal behind the scenes.
              </p>
            </div>
            <Sparkles size={18} className="text-[color:var(--brand-strong)]" aria-hidden />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {DRAFT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = selectedKind === option.kind;
              return (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => {
                    if (option.kind === "carousel") {
                      openCarouselBuilder();
                      return;
                    }
                    setSelectedKind(option.kind);
                  }}
                  className={`min-h-[92px] rounded-[var(--r-lg)] border p-3 text-left transition ${
                    active
                      ? "border-[color-mix(in_srgb,var(--brand)_55%,var(--border))] bg-[var(--brand-soft)] shadow-[var(--shadow-sm)]"
                      : "border-[var(--border-faint)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-deep)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-md)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] text-[color:var(--text)]">
                      <Icon size={17} aria-hidden />
                    </span>
                    {active ? <Check size={16} className="text-[color:var(--success)]" aria-hidden /> : null}
                  </div>
                  <p className="mt-3 text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                    {option.title}
                  </p>
                  <p className="mt-0.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>

          <Textarea
            label="Optional angle"
            value={angle}
            onChange={(event) => setAngle(event.target.value)}
            rows={3}
            placeholder="Example: why high-ticket coaching needs fewer, cleaner conversations."
          />
          <Textarea
            label="Audience signal"
            value={audienceSignal}
            onChange={(event) => setAudienceSignal(event.target.value)}
            rows={4}
            placeholder="Paste one objection, comment, DM, sales call note, or idea you want this draft to answer."
          />

          {error ? (
            <div className="rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--danger)]">
              {error}
            </div>
          ) : null}

          <Button
            onClick={() => {
              if (selectedKind === "carousel") {
                openCarouselBuilder();
                return;
              }
              generateDraft();
            }}
            disabled={drafting}
            trailingIcon={<ArrowRight size={15} aria-hidden />}
            block
          >
            {selectedKind === "carousel"
              ? "Open carousel builder"
              : drafting
                ? "Drafting"
                : `Draft ${selected.title}`}
          </Button>
          <VoiceCompose
            purpose={selectedKind === "instagram_caption" ? "caption" : selectedKind === "carousel" ? "carousel" : selectedKind === "newsletter" ? "newsletter" : "content"}
            context={angle}
            onDraft={(draft, transcript) => {
              setAngle(transcript);
              void generateDraft();
            }}
            label="Talk it"
            disabled={drafting}
          />
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
                  Signal stack
                </h2>
                <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                  The draft is not starting from a blank prompt.
                </p>
              </div>
              {profile ? (
                <Badge tone="brand" size="xs" uppercase>Voice active</Badge>
              ) : (
                <a href="/voice" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--warning)] transition hover:bg-[color-mix(in_srgb,var(--warning)_18%,transparent)]">
                  Voice needed — set up
                  <ArrowRight size={11} aria-hidden />
                </a>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SignalCard title="Voice memory" lines={voiceLines(voiceStats, sourceSummary.detail)} />
              <SignalCard title="Lead language" lines={leadSignals.length ? leadSignals : ["No lead patterns yet.", "Add leads to make drafts sharper."]} />
            </div>
          </Card>

          <Card padding="none" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[var(--border-faint)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
                  Latest draft
                </h2>
                <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                  Saved to your content library.
                </p>
              </div>
              {latestDraft ? (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  {isCarousel(latestDraft) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadCarousel(latestDraft)}
                      className="flex-1 sm:flex-none"
                    >
                      Download PNGs
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyDraft(latestDraft)}
                    leadingIcon={copiedId === latestDraft.id ? <Check size={14} /> : <Copy size={14} />}
                    className="flex-1 sm:flex-none"
                  >
                    {copiedId === latestDraft.id ? "Copied" : "Copy"}
                  </Button>
                </div>
              ) : null}
            </div>
            {latestDraft ? (
              isCarousel(latestDraft) ? (
                <CarouselDraftSummary
                  item={latestDraft}
                  onOpen={() => {
                    setCarouselOpen(true);
                    setCarouselStep(CAROUSEL_STEPS.length - 1);
                  }}
                />
              ) : (
                <DraftPreview
                  item={latestDraft}
                  carouselStyle={carouselStyle}
                  carouselCustomStyle={carouselCustomStyle}
                  brandName={carouselBrandName}
                  handle={carouselHandle}
                  accentColor={carouselAccentColor}
                  onBodyChange={(body) => updateContentBody(latestDraft, body)}
                  brandKit={brandKit}
                />
              )
            ) : (
              <div className="px-5 py-12 text-center">
                <p className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                  No draft yet.
                </p>
                <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                  Pick a format and generate the first one.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={carouselOpen}
        onClose={() => setCarouselOpen(false)}
        title="Carousel builder"
        description="A guided flow for turning lead signals and voice into an editable, export-ready carousel."
        size="xl"
      >
        <div className="grid min-w-0 gap-5 lg:grid-cols-[220px_1fr]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
            {CAROUSEL_STEPS.map((step, index) => (
              <button
                key={step}
                type="button"
                onClick={() => setCarouselStep(index)}
                className={`min-h-10 rounded-[var(--r-md)] border px-3 text-left text-[length:var(--t-caption)] font-extrabold transition ${
                  carouselStep === index
                    ? "border-[color-mix(in_srgb,var(--brand)_45%,var(--border))] bg-[var(--brand-soft)] text-[color:var(--text)]"
                    : "border-[var(--border-faint)] bg-[var(--surface)] text-[color:var(--text-muted)] hover:border-[var(--border-strong)]"
                }`}
              >
                {index + 1}. {step}
              </button>
            ))}
          </div>

          <div className="min-w-0">
            <CarouselWizardStep
              step={carouselStep}
              outcome={carouselOutcome}
              hook={carouselHook}
              framework={carouselFramework}
              style={carouselStyle}
              customStyle={carouselCustomStyle}
              recommendation={carouselRecommendation}
              brandName={carouselBrandName}
              handle={carouselHandle}
              accentColor={carouselAccentColor}
              angle={angle}
              audienceSignal={audienceSignal}
              savingPreferences={savingCarouselPrefs}
              drafting={drafting}
              latestDraft={latestDraft && isCarousel(latestDraft) ? latestDraft : null}
              copiedId={copiedId}
              onOutcomeChange={updateCarouselOutcome}
              onHookChange={setCarouselHook}
              onFrameworkChange={setCarouselFramework}
              onStyleChange={(style) => {
                const carouselDraft = latestDraft && isCarousel(latestDraft) ? latestDraft : null;
                if (carouselStep === CAROUSEL_STEPS.length - 1 && carouselDraft) {
                  void updateCarouselStyleForDraft(carouselDraft, style);
                  return;
                }
                setCarouselStyle(style);
              }}
              onImportStyle={(files) =>
                importCarouselStyle(files, latestDraft && isCarousel(latestDraft) ? latestDraft : null)
              }
              onCustomStyleChange={(patch, customPatch) =>
                updateCarouselDna(patch, latestDraft && isCarousel(latestDraft) ? latestDraft : null, customPatch)
              }
              onBrandNameChange={setCarouselBrandName}
              onHandleChange={setCarouselHandle}
              onAccentColorChange={setCarouselAccentColor}
              onAngleChange={setAngle}
              onAudienceSignalChange={setAudienceSignal}
              onSavePreferences={saveCarouselPreferences}
              onGenerate={() => generateDraft("", "carousel")}
              onDownload={downloadCarousel}
              onCopy={copyDraft}
              onBodyChange={(item, body) => updateContentBody(item, body)}
              brandKit={brandKit}
            />

            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[var(--border-faint)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="ghost"
                onClick={() => setCarouselStep((step) => Math.max(0, step - 1))}
                disabled={carouselStep === 0}
                className="w-full sm:w-auto"
              >
                Back
              </Button>
              {carouselStep < CAROUSEL_STEPS.length - 1 ? (
                <Button
                  onClick={() =>
                    setCarouselStep((step) => Math.min(CAROUSEL_STEPS.length - 1, step + 1))
                  }
                  className="w-full sm:w-auto"
                  trailingIcon={<ArrowRight size={15} aria-hidden />}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  onClick={() => generateDraft("", "carousel")}
                  disabled={drafting}
                  className="w-full sm:w-auto"
                  trailingIcon={<ArrowRight size={15} aria-hidden />}
                >
                  {drafting ? "Drafting" : "Generate carousel"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this draft?"
        description="This permanently removes it from the content library."
      >
        <div className="space-y-4">
          <div className="rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface)] p-4">
            <p className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
              {deleteTarget?.title ?? "Draft"}
            </p>
            <p className="mt-1 line-clamp-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              {deleteTarget?.body ?? "Empty draft"}
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="w-full sm:w-auto">
              Keep it
            </Button>
            <Button
              onClick={() => deleteTarget ? deleteContent(deleteTarget) : undefined}
              leadingIcon={<Trash2 size={14} aria-hidden />}
              className="w-full sm:w-auto"
            >
              Delete draft
            </Button>
          </div>
        </div>
      </Modal>

      {/* Sacred zones — toggles for the AI's "I won't write this from scratch"
          rule. Belongs here, adjacent to drafting, not buried in Settings. */}
      <SacredZonesInline />
      </>
      )}

      {contentTab === "library" && (
      <>
      <EditorialSectionHeader
        number={2}
        kicker="The Library"
        lede="The pieces worth keeping. Archive the noise — keep the five you would actually reuse."
      />

      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border-faint)] px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
              Content library
            </h2>
            <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Top drafts only. Archive the noise, keep the five you would actually reuse.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["best", "recent", "archived"] as ContentLibraryView[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setContentView(view)}
                className={`min-h-9 rounded-[var(--r-md)] border px-3 text-[length:var(--t-caption)] font-extrabold capitalize transition ${
                  contentView === view
                    ? "border-[color-mix(in_srgb,var(--brand)_55%,var(--border))] bg-[var(--brand-soft)] text-[color:var(--text)]"
                    : "border-[var(--border-faint)] bg-[var(--surface-elevated)] text-[color:var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[color:var(--text)]"
                }`}
              >
                {view}
              </button>
            ))}
            <Badge tone="muted" size="xs" uppercase>
              {items.filter((item) => !isContentArchived(item)).length} live
            </Badge>
          </div>
        </div>
        {libraryItems.length === 0 ? (
          <div className="px-5 py-12 text-center">
            {contentView === "archived" ? (
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">No archived drafts yet.</p>
            ) : (
              <div className="mx-auto max-w-sm space-y-3">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-soft)]">
                  <FileText size={18} className="text-[color:var(--brand-strong)]" aria-hidden />
                </div>
                <p className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                  No drafts yet
                </p>
                <p className="text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                  Head to The Desk above, pick a format, and generate your first draft. It lands here automatically.
                </p>
                <button
                  type="button"
                  onClick={() => handleTabChange("create")}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--brand)] px-4 py-2 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text-inverse)] transition hover:bg-[var(--brand-strong)]"
                >
                  <ArrowRight size={14} className="rotate-[-90deg]" aria-hidden />
                  Go to Create
                </button>
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-faint)]">
            {libraryItems.map((item) => (
              <li key={item.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="truncate text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                        {item.title}
                      </p>
                      <Badge tone="neutral" size="xs">
                        {PLATFORM_LABEL[item.platform]}
                      </Badge>
                      {isContentFavorite(item) ? (
                        <Badge tone="brand" size="xs">
                          Keeper
                        </Badge>
                      ) : null}
                      {item.pillar ? (
                        <Badge tone="muted" size="xs">
                          {PILLAR_LABEL[item.pillar]}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                      {item.body || "Empty draft"}
                    </p>
                  </div>
                  <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleContentFavorite(item)}
                      leadingIcon={<Star size={14} aria-hidden />}
                      className="sm:flex-none"
                    >
                      {isContentFavorite(item) ? "Kept" : "Keep"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRepurposeOpenId((openId) => (openId === item.id ? null : item.id))}
                      className="sm:flex-none"
                    >
                      Repurpose
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyDraft(item)}
                      leadingIcon={copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                      className="sm:flex-none"
                    >
                      {copiedId === item.id ? "Copied" : "Copy"}
                    </Button>
                    {isContentArchived(item) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => restoreContent(item)}
                        className="sm:flex-none"
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archiveContent(item)}
                        leadingIcon={<Archive size={14} aria-hidden />}
                        className="sm:flex-none"
                      >
                        Archive
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(item)}
                      leadingIcon={<Trash2 size={14} aria-hidden />}
                      className="sm:flex-none"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {repurposeOpenId === item.id ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {DRAFT_OPTIONS.map((option) => (
                      <button
                        key={option.kind}
                        type="button"
                        onClick={() => repurposeDraft(item, option.kind)}
                        disabled={Boolean(repurposing)}
                        className="min-h-10 rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] px-3 text-left text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-deep)] disabled:opacity-50"
                      >
                        {repurposing === `${item.id}:${option.kind}` ? "Working" : option.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      </>
      )}

      {voiceLearnedToast && (
        <VoiceLearnedToast toast={voiceLearnedToast} onDismiss={() => setVoiceLearnedToast(null)} />
      )}
    </div>
  );
}

function VoiceLearnedToast({
  toast, onDismiss,
}: {
  toast: { yes: string[]; no: string[]; at: number };
  onDismiss: () => void;
}) {
  return (
    <div
      // Dock slot 3. At bottom-4 right-4 this landed squarely on the Dhara
      // bar, and at z-50 against its z-40 it covered it.
      className="fixed bottom-[var(--dock-3)] right-[var(--dock-right)] z-50 max-w-sm rounded-[var(--r-lg)] border border-[var(--brand-strong)] bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] p-4 space-y-2 animate-in fade-in slide-in-from-bottom-2"
      role="status"
    >
      <div className="flex items-start justify-between gap-2">
        <Badge tone="brand" size="xs" uppercase>Voice learned</Badge>
        <button
          onClick={onDismiss}
          className="text-[color:var(--text-faint)] hover:text-[color:var(--text)] leading-none text-lg"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <p className="text-[length:var(--t-caption)] text-[color:var(--text)] leading-relaxed">
        Your edits taught the AI. Future drafts will pick this up automatically.
      </p>
      {toast.yes.length > 0 && (
        <div className="space-y-1">
          <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--brand-strong)]">
            Use ✓
          </p>
          <div className="flex flex-wrap gap-1">
            {toast.yes.map((v, i) => (
              <span key={i} className="font-mono text-[length:var(--t-caption)] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--brand-soft)] text-[color:var(--success)]">{v}</span>
            ))}
          </div>
        </div>
      )}
      {toast.no.length > 0 && (
        <div className="space-y-1">
          <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--danger)]">
            Never ✕
          </p>
          <div className="flex flex-wrap gap-1">
            {toast.no.map((v, i) => (
              <span key={i} className="font-mono text-[length:var(--t-caption)] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--danger-soft)] text-[color:var(--danger)] line-through">{v}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function seedLeadAngle(lead: Lead | null): string {
  if (!lead) return "";
  const pain = lead.pain_signal?.[0]
    ? PAIN_SIGNAL_LABEL[lead.pain_signal[0] as PainSignal]
    : "";
  return pain ? `What ${pain.toLowerCase()} is really asking for` : `What ${lead.full_name} is really asking for`;
}

function seedLeadSignal(lead: Lead | null): string {
  if (!lead) return "";
  const parts = [
    `Lead: ${lead.full_name}`,
    lead.notes ? `Notes: ${lead.notes}` : "",
    lead.next_honest_action ? `Next move: ${lead.next_honest_action.replaceAll("_", " ")}` : "",
    lead.source_detail ? `Source detail: ${lead.source_detail}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

function SignalTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[color-mix(in_srgb,var(--surface-elevated)_84%,transparent)] p-4 shadow-[var(--shadow-sm)]">
      <p className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
        {label}
      </p>
      <p className="mt-2 text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
        {value}
      </p>
      <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
        {detail}
      </p>
    </div>
  );
}

function SignalCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface)] p-4">
      <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {lines.slice(0, 4).map((line) => (
          <li key={line} className="flex gap-2 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-strong)]" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CarouselDraftSummary({ item, onOpen }: { item: Content; onOpen: () => void }) {
  const slides = parseCarouselSlides(item);
  const meta = getContentMeta(item);
  // Render the cover hook as a styled mini-thumbnail using the same
  // Fraunces display + dark-accent treatment the actual canvas cover
  // uses. Beats the old generic "12 slides ready" text — coaches see
  // their hook the way the audience will. Pure HTML, no canvas cost.
  const coverHook = slides[0]?.title?.trim() || item.title;
  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand" size="xs">Carousel</Badge>
        {meta.source_label ? (
          <Badge tone="info" size="xs" className="max-w-full whitespace-normal text-left">
            {meta.source_label}
          </Badge>
        ) : null}
      </div>

      {/* Cover thumbnail — 4:5 aspect, Fraunces hook, dark accent panel */}
      <div className="mt-4 aspect-[4/5] w-full max-w-[200px] overflow-hidden rounded-[var(--r-md)] bg-navy p-4 shadow-[var(--shadow-sm)] relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-[color-mix(in_srgb,var(--brand)_25%,transparent)] blur-xl"
        />
        <div className="relative flex h-full flex-col justify-end">
          <p className="font-display text-[15px] font-bold leading-[1.05] text-[color:var(--text-inverse)] line-clamp-6">
            {coverHook}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
        {slides.length || 0} slides ready. Open the builder to edit, score, and export.
      </p>
      <Button className="mt-4 w-full sm:w-auto" onClick={onOpen}>
        Open carousel builder
      </Button>
    </div>
  );
}

function CarouselWizardStep({
  step,
  outcome,
  hook,
  framework,
  style,
  customStyle,
  recommendation,
  brandName,
  handle,
  accentColor,
  angle,
  audienceSignal,
  savingPreferences,
  drafting,
  latestDraft,
  copiedId,
  onOutcomeChange,
  onHookChange,
  onFrameworkChange,
  onStyleChange,
  onImportStyle,
  onCustomStyleChange,
  onBrandNameChange,
  onHandleChange,
  onAccentColorChange,
  onAngleChange,
  onAudienceSignalChange,
  onSavePreferences,
  onGenerate,
  onDownload,
  onCopy,
  onBodyChange,
  brandKit,
}: {
  step: number;
  outcome: CarouselOutcome;
  hook: CarouselHook;
  framework: CarouselFramework;
  style: CarouselStyle;
  customStyle: CarouselCustomStyle | null;
  recommendation: { framework: CarouselFramework; style: CarouselStyle; reason: string };
  brandName: string;
  handle: string;
  accentColor: string;
  angle: string;
  audienceSignal: string;
  savingPreferences: boolean;
  drafting: boolean;
  latestDraft: Content | null;
  copiedId: string | null;
  onOutcomeChange: (value: CarouselOutcome) => void;
  onHookChange: (value: CarouselHook) => void;
  onFrameworkChange: (value: CarouselFramework) => void;
  onStyleChange: (value: CarouselStyle) => void;
  onImportStyle: (files: File[]) => void;
  onCustomStyleChange: (patch: Partial<CarouselStyleDna>, customPatch?: Partial<CarouselCustomStyle>) => void;
  onBrandNameChange: (value: string) => void;
  onHandleChange: (value: string) => void;
  onAccentColorChange: (value: string) => void;
  onAngleChange: (value: string) => void;
  onAudienceSignalChange: (value: string) => void;
  onSavePreferences: () => void;
  onGenerate: () => void;
  onDownload: (item: Content) => void;
  onCopy: (item: Content) => void;
  onBodyChange: (item: Content, body: string) => void;
  brandKit?: BrandKit | null;
}) {
  if (step === 0) {
    return (
      <WizardPanel
        eyebrow="Step 1"
        title="What should this carousel do?"
        description="The goal changes the structure. Saves need clarity. Conversations need tension. Authority needs a named method."
      >
        <ChoiceGroup title="Choose outcome" value={outcome} options={CAROUSEL_OUTCOMES} onChange={onOutcomeChange} />
      </WizardPanel>
    );
  }

  if (step === 1) {
    return (
      <WizardPanel
        eyebrow="Step 2"
        title="Pick the cover hook."
        description="The hook is the sales page for the swipe. Choose the pattern before the app writes the slides."
      >
        <ChoiceGroup title="Choose hook type" value={hook} options={CAROUSEL_HOOKS} onChange={onHookChange} />
      </WizardPanel>
    );
  }

  if (step === 2) {
    return (
      <WizardPanel
        eyebrow="Step 3"
        title="Choose the strongest framework."
        description="Keep the menu small. These three cover most high-performing coach carousels."
      >
        <RecommendationCard
          recommendation={recommendation}
          onUse={() => onFrameworkChange(recommendation.framework)}
          mode="framework"
        />
        <ChoiceGroup title="Choose framework" value={framework} options={CAROUSEL_FRAMEWORKS} onChange={onFrameworkChange} />
      </WizardPanel>
    );
  }

  if (step === 3) {
    return (
      <WizardPanel
        eyebrow="Step 4"
        title="Pick the visual system."
        description="This controls the preview and PNG export. Save one as your default when it feels like your room."
      >
        <RecommendationCard
          recommendation={recommendation}
          onUse={() => onStyleChange(recommendation.style)}
          mode="style"
        />
        <VisualSystemPicker
          value={style}
          customStyle={customStyle}
          onChange={onStyleChange}
          onImport={onImportStyle}
          brandKit={brandKit}
        />
        {style === "imported" && customStyle?.dna ? (
          <StyleDnaReview customStyle={customStyle} onChange={onCustomStyleChange} />
        ) : null}
      </WizardPanel>
    );
  }

  if (step === 4) {
    return (
      <WizardPanel
        eyebrow="Step 5"
        title="Brand the slides."
        description="This replaces the app name with the coach's brand, handle, and accent color."
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_110px]">
          <label className="space-y-1">
            <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">Brand name</span>
            <input value={brandName} onChange={(event) => onBrandNameChange(event.target.value)} className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]" />
          </label>
          <label className="space-y-1">
            <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">Handle</span>
            <input value={handle} onChange={(event) => onHandleChange(event.target.value)} className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]" />
          </label>
          <label className="space-y-1">
            <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">Accent</span>
            <input type="color" value={isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT_HEX} onChange={(event) => onAccentColorChange(event.target.value)} className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-1" />
          </label>
        </div>
        <Button variant="ghost" className="mt-4 w-full sm:w-auto" onClick={onSavePreferences} disabled={savingPreferences}>
          {savingPreferences ? "Saving" : "Save as default"}
        </Button>
      </WizardPanel>
    );
  }

  if (step === 5) {
    return (
      <WizardPanel
        eyebrow="Step 6"
        title="Give it the signal."
        description="Use a lead objection, a post idea, a sales call note, or a newsletter angle."
      >
        <div className="space-y-3">
          <Textarea label="Angle" value={angle} onChange={(event) => onAngleChange(event.target.value)} rows={3} />
          <Textarea label="Audience signal" value={audienceSignal} onChange={(event) => onAudienceSignalChange(event.target.value)} rows={5} />
        </div>
      </WizardPanel>
    );
  }

  return (
    <WizardPanel
      eyebrow="Step 7"
      title="Review, edit, export."
      description="Generate the deck, edit slide text, check the ship score, then export PNGs."
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onGenerate} disabled={drafting} className="w-full sm:w-auto">
          {drafting ? "Drafting" : latestDraft ? "Regenerate carousel" : "Generate carousel"}
        </Button>
        {latestDraft ? (
          <>
            <Button variant="ghost" onClick={() => onDownload(latestDraft)} className="w-full sm:w-auto">
              Download PNGs
            </Button>
            <Button
              variant="ghost"
              onClick={() => onCopy(latestDraft)}
              leadingIcon={copiedId === latestDraft.id ? <Check size={14} /> : <Copy size={14} />}
              className="w-full sm:w-auto"
            >
              {copiedId === latestDraft.id ? "Copied" : "Copy text"}
            </Button>
          </>
        ) : null}
      </div>
      {latestDraft ? (
        <div className="mb-4 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface)] p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                Try a different visual system
              </p>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                Pick a locked look. The preview and PNG export update together.
              </p>
            </div>
            <Badge tone="muted" size="xs" uppercase>
              Saved to draft
            </Badge>
          </div>
          <VisualSystemPicker
            value={style}
            customStyle={customStyle}
            onChange={onStyleChange}
            onImport={onImportStyle}
            brandKit={brandKit}
          />
          {style === "imported" && customStyle?.dna ? (
            <StyleDnaReview customStyle={customStyle} onChange={onCustomStyleChange} />
          ) : null}
        </div>
      ) : null}
      {latestDraft ? (
        <DraftPreview
          item={latestDraft}
          carouselStyle={style}
          carouselCustomStyle={customStyle}
          brandName={brandName}
          handle={handle}
          accentColor={accentColor}
          onBodyChange={(body) => onBodyChange(latestDraft, body)}
          brandKit={brandKit}
        />
      ) : (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface)] px-5 py-10 text-center">
          <p className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">No carousel yet.</p>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Generate one when the choices feel right.</p>
        </div>
      )}
    </WizardPanel>
  );
}

function WizardPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">{eyebrow}</div>
      <h3 className="mt-1 break-words text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">{title}</h3>
      <p className="mt-1 max-w-2xl text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function RecommendationCard({
  recommendation,
  onUse,
  mode,
}: {
  recommendation: { framework: CarouselFramework; style: CarouselStyle; reason: string };
  onUse: () => void;
  mode: "framework" | "style";
}) {
  return (
    <div className="mb-4 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_28%,transparent)] bg-[var(--brand-soft)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand" size="xs" uppercase>Recommended</Badge>
        <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
          {mode === "framework" ? frameworkLabel(recommendation.framework) : styleLabel(recommendation.style)}
        </p>
      </div>
      <p className="mt-1 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">{recommendation.reason}</p>
      <button type="button" onClick={onUse} className="mt-3 min-h-9 rounded-[var(--r-md)] bg-[var(--navy)] px-3 text-[length:var(--t-caption)] font-extrabold text-[color:var(--brand-bright)] transition hover:opacity-90">
        Use recommendation
      </button>
    </div>
  );
}

function VisualSystemPicker({
  value,
  customStyle,
  onChange,
  onImport,
  brandKit,
}: {
  value: CarouselStyle;
  customStyle: CarouselCustomStyle | null;
  onChange: (value: CarouselStyle) => void;
  onImport: (files: File[]) => void;
  brandKit?: BrandKit | null;
}) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {[...CAROUSEL_STYLES, ...(customStyle ? [{
        id: "imported" as CarouselStyle,
        label: customStyle.name,
        description: "Imported from your reference carousel.",
        bestFor: "your brand",
      }] : [])].map((system) => {
        const active = value === system.id;
        return (
          <button
            key={system.id}
            type="button"
            onClick={() => onChange(system.id)}
            className={`min-h-[108px] rounded-[var(--r-lg)] border p-3 text-left transition ${
              active
                ? "border-[color-mix(in_srgb,var(--brand)_55%,var(--border))] bg-[var(--brand-soft)]"
                : "border-[var(--border-faint)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-deep)]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-1">
                {visualSystemSwatches(system.id, customStyle, brandKit).map((color) => (
                  <span
                    key={color}
                    className="h-5 w-5 rounded-full border border-[color-mix(in_srgb,var(--border)_70%,transparent)]"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                ))}
              </div>
              {active ? <Check size={15} className="text-[color:var(--success)]" aria-hidden /> : null}
            </div>
            <p className="mt-3 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
              {system.label}
            </p>
            <p className="mt-1 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
              {system.description}
            </p>
          </button>
        );
      })}
      <label className="min-h-[108px] cursor-pointer rounded-[var(--r-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-elevated)] p-3 text-left transition hover:bg-[var(--surface-deep)]">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void onImport(files);
            event.target.value = "";
          }}
        />
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] text-[color:var(--text)]">
          <Upload size={16} aria-hidden />
        </span>
        <p className="mt-3 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
          Build custom kit
        </p>
        <p className="mt-1 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
          Upload 3-5 reference slides. We extract reusable color, type, spacing, and highlight rules.
        </p>
      </label>
    </div>
  );
}

function StyleDnaReview({
  customStyle,
  onChange,
}: {
  customStyle: CarouselCustomStyle;
  onChange: (patch: Partial<CarouselStyleDna>, customPatch?: Partial<CarouselCustomStyle>) => void;
}) {
  const dna = customStyle.dna ?? createCarouselStyleDna(
    customStyle.background,
    customStyle.text,
    customStyle.accent,
    customStyle.layout,
    customStyle.templates ?? []
  );

  return (
    <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
            Review imported style DNA
          </p>
          <p className="mt-1 max-w-2xl text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
            The image gives us a first pass. Correct the rules here so every future carousel uses the style, not the old screenshot.
          </p>
        </div>
        <Badge tone="brand" size="xs" uppercase>
          Editable kit
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <StyleSelect
            label="Font feel"
            value={dna.fontFamily}
            options={[
              ["sans", "Bold sans"],
              ["serif", "Editorial serif"],
              ["mono", "Mono"],
            ]}
            onChange={(value) => onChange({ fontFamily: value as CarouselFontFamily })}
          />
          <StyleSelect
            label="Background"
            value={dna.backgroundMood}
            options={[
              ["night_texture", "Black texture"],
              ["solid", "Solid"],
              ["paper", "Warm paper"],
              ["poster_blocks", "Poster blocks"],
              ["editorial_gradient", "Editorial gradient"],
            ]}
            onChange={(value) => onChange({ backgroundMood: value as CarouselBackgroundMood })}
          />
          <StyleSelect
            label="Highlight"
            value={dna.highlightMode}
            options={[
              ["none", "None"],
              ["accent_words", "Accent words"],
              ["italic_accent", "Italic accent"],
              ["marker", "Marker"],
            ]}
            onChange={(value) => onChange({ highlightMode: value as CarouselHighlightMode })}
          />
          <StyleSelect
            label="Handle"
            value={dna.handlePlacement}
            options={[
              ["top", "Top"],
              ["bottom", "Bottom"],
              ["hidden", "Hidden"],
            ]}
            onChange={(value) => onChange({ handlePlacement: value as CarouselStyleDna["handlePlacement"] })}
          />
          <StyleSelect
            label="Ornament"
            value={dna.ornament}
            options={[
              ["none", "None"],
              ["diamond", "Diamond"],
              ["asterisk", "Asterisk"],
              ["rule", "Rule"],
              ["capsule", "Capsule"],
            ]}
            onChange={(value) => onChange({ ornament: value as CarouselStyleDna["ornament"] })}
          />
          <StyleSelect
            label="Title case"
            value={dna.titleCase}
            options={[
              ["none", "As written"],
              ["uppercase", "Uppercase"],
              ["sentence", "Sentence"],
            ]}
            onChange={(value) => onChange({ titleCase: value as CarouselStyleDna["titleCase"] })}
          />
          <StyleSelect
            label="Alignment"
            value={dna.align}
            options={[
              ["left", "Left"],
              ["center", "Center"],
            ]}
            onChange={(value) => onChange({ align: value as CarouselStyleDna["align"] })}
          />
          <StyleSelect
            label="Weight"
            value={String(dna.titleWeight)}
            options={[
              ["500", "Elegant"],
              ["700", "Strong"],
              ["800", "Heavy"],
              ["900", "Poster"],
            ]}
            onChange={(value) => onChange({ titleWeight: Number(value) })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StyleColorInput label="Background" value={customStyle.background} onChange={(value) => onChange({}, { background: value })} />
          <StyleColorInput label="Title" value={dna.titleColor} onChange={(value) => onChange({ titleColor: value })} />
          <StyleColorInput label="Body" value={dna.bodyColor} onChange={(value) => onChange({ bodyColor: value })} />
          <StyleColorInput label="Highlight" value={dna.highlightColor} onChange={(value) => onChange({ highlightColor: value }, { accent: value })} />
          <StyleColorInput label="Handle" value={dna.handleColor} onChange={(value) => onChange({ handleColor: value })} />
          <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-3">
            <p className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
              Imported palette
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {customStyle.colors.slice(0, 6).map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onChange({ highlightColor: color })}
                  className="h-8 w-8 rounded-full border border-[var(--border)]"
                  style={{ backgroundColor: color }}
                  aria-label={`Use ${color} as highlight`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StyleSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function StyleColorInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
        {label}
      </span>
      <div className="flex min-h-10 items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5">
        <input
          type="color"
          value={isValidHex(value) ? value : "#111111"}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-9 rounded-[var(--r-sm)] border border-[var(--border-faint)] bg-transparent disabled:opacity-60"
          aria-label={`${label} color`}
        />
        <input
          value={value}
          disabled={disabled}
          onChange={(event) => isValidHex(event.target.value) ? onChange(event.target.value) : undefined}
          className="min-w-0 flex-1 bg-transparent px-1 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-elevated)] focus-visible:rounded-[var(--r-sm)] disabled:text-[color:var(--text-muted)]"
        />
      </div>
    </label>
  );
}

function CarouselBuilderControls({
  outcome,
  framework,
  style,
  recommendation,
  brandName,
  handle,
  accentColor,
  savingPreferences,
  onOutcomeChange,
  onFrameworkChange,
  onStyleChange,
  onBrandNameChange,
  onHandleChange,
  onAccentColorChange,
  onSavePreferences,
}: {
  outcome: CarouselOutcome;
  framework: CarouselFramework;
  style: CarouselStyle;
  recommendation: {
    framework: CarouselFramework;
    style: CarouselStyle;
    reason: string;
  };
  brandName: string;
  handle: string;
  accentColor: string;
  savingPreferences: boolean;
  onOutcomeChange: (value: CarouselOutcome) => void;
  onFrameworkChange: (value: CarouselFramework) => void;
  onStyleChange: (value: CarouselStyle) => void;
  onBrandNameChange: (value: string) => void;
  onHandleChange: (value: string) => void;
  onAccentColorChange: (value: string) => void;
  onSavePreferences: () => void;
}) {
  return (
    <div className="space-y-4 rounded-[var(--r-lg)] border border-[color-mix(in_srgb,var(--brand)_25%,var(--border))] bg-[var(--surface)] p-4">
      <div className="rounded-[var(--r-md)] bg-[var(--brand-soft)] border border-[color-mix(in_srgb,var(--brand)_28%,transparent)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand" size="xs" uppercase>
            Recommended
          </Badge>
          <p className="min-w-0 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
            {frameworkLabel(recommendation.framework)} + {styleLabel(recommendation.style)}
          </p>
        </div>
        <p className="mt-1 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
          {recommendation.reason}
        </p>
        <button
          type="button"
          onClick={() => {
            onFrameworkChange(recommendation.framework);
            onStyleChange(recommendation.style);
          }}
          className="mt-3 min-h-9 rounded-[var(--r-md)] bg-[var(--navy)] px-3 text-[length:var(--t-caption)] font-extrabold text-[color:var(--brand-bright)] transition hover:opacity-90"
        >
          Use recommendation
        </button>
      </div>

      <ChoiceGroup
        title="1. Choose outcome"
        value={outcome}
        options={CAROUSEL_OUTCOMES}
        onChange={onOutcomeChange}
      />
      <ChoiceGroup
        title="2. Choose framework"
        value={framework}
        options={CAROUSEL_FRAMEWORKS}
        onChange={onFrameworkChange}
      />
      <ChoiceGroup
        title="3. Choose style"
        value={style}
        options={CAROUSEL_STYLES}
        onChange={onStyleChange}
      />

      <div>
        <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
          4. Brand the slides
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_96px]">
          <label className="space-y-1">
            <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
              Brand name
            </span>
            <input
              value={brandName}
              onChange={(event) => onBrandNameChange(event.target.value)}
              className="min-h-10 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
              placeholder="Your brand"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
              Handle
            </span>
            <input
              value={handle}
              onChange={(event) => onHandleChange(event.target.value)}
              className="min-h-10 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
              placeholder="@handle"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
              Accent
            </span>
            <input
              type="color"
              value={isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT_HEX}
              onChange={(event) => onAccentColorChange(event.target.value)}
              className="min-h-10 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-1"
              aria-label="Carousel accent color"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onSavePreferences}
          disabled={savingPreferences}
          className="mt-3 min-h-9 rounded-[var(--r-md)] border border-[var(--border)] px-3 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-deep)] disabled:opacity-50"
        >
          {savingPreferences ? "Saving" : "Save as default"}
        </button>
      </div>
    </div>
  );
}

function ChoiceGroup<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: T;
  options: Array<{ id: T; label: string; description: string; bestFor?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
        {title}
      </p>
      <div className="mt-2 grid gap-2">
        {options.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`min-h-[72px] rounded-[var(--r-md)] border px-3 py-2 text-left transition ${
                active
                  ? "border-[color-mix(in_srgb,var(--brand)_55%,var(--border))] bg-[var(--brand-soft)]"
                  : "border-[var(--border-faint)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-deep)]"
              }`}
            >
              <span className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                  {option.label}
                </span>
                {option.bestFor ? (
                  <span className="rounded-full bg-[var(--surface-deep)] px-2 py-0.5 text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
                    {option.bestFor}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DraftPreview({
  item,
  carouselStyle,
  carouselCustomStyle,
  brandName,
  handle,
  accentColor,
  onBodyChange,
  brandKit,
}: {
  item: Content;
  carouselStyle: CarouselStyle;
  carouselCustomStyle: CarouselCustomStyle | null;
  brandName: string;
  handle: string;
  accentColor: string;
  onBodyChange: (body: string) => void;
  brandKit?: BrandKit | null;
}) {
  const carouselSlides = isCarousel(item) ? parseCarouselSlides(item) : [];
  const meta = getContentMeta(item);
  const sourceLabel = meta.source_label;
  const resolvedStyle = normalizeCarouselStyleValue(meta.carousel_style) ?? carouselStyle;
  const resolvedCustomStyle = meta.carousel_custom_style ?? carouselCustomStyle;
  return (
    <article className="min-w-0 px-4 py-5 sm:px-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="brand" size="xs">
          {PLATFORM_LABEL[item.platform]}
        </Badge>
        {item.pillar ? (
          <Badge tone="muted" size="xs">
            {PILLAR_LABEL[item.pillar]}
          </Badge>
        ) : null}
        {sourceLabel ? (
          <Badge tone="info" size="xs" className="max-w-full whitespace-normal text-left leading-[var(--leading-base)]">
            {sourceLabel}
          </Badge>
        ) : null}
      </div>
      <h3 className="mt-3 break-words text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)]">
        {item.title}
      </h3>
      {carouselSlides.length > 0 ? (
        <>
          <CarouselChecklist slides={carouselSlides} />
          <CarouselPreview
            slides={carouselSlides}
            style={resolvedStyle}
            customStyle={resolvedCustomStyle}
            brandName={meta.carousel_brand_name ?? brandName}
            handle={meta.carousel_handle ?? handle}
            accentColor={meta.carousel_accent_color ?? accentColor}
            brandKit={brandKit}
          />
          <CarouselSlideEditor
            slides={carouselSlides}
            onChange={(slides) => onBodyChange(serializeCarouselSlides(slides))}
          />
        </>
      ) : (
        <>
          <div className="mt-3 flex justify-end">
            <SparkButton text={`${item.title}\n\n${item.body}`} brandKit={brandKit} />
          </div>
          <pre className="mt-2 max-h-[420px] whitespace-pre-wrap rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-4 font-sans text-[length:var(--t-body)] leading-[var(--leading-relaxed)] text-[color:var(--text)] overflow-auto">
            {item.body}
          </pre>
        </>
      )}
    </article>
  );
}

function CarouselSlideEditor({
  slides,
  onChange,
}: {
  slides: CarouselSlide[];
  onChange: (slides: CarouselSlide[]) => void;
}) {
  const [localSlides, setLocalSlides] = useState(slides);

  useEffect(() => {
    setLocalSlides(slides);
  }, [slides]);

  function updateSlide(index: number, patch: Partial<CarouselSlide>) {
    const next = localSlides.map((slide, slideIndex) =>
      slideIndex === index ? { ...slide, ...patch } : slide
    );
    setLocalSlides(next);
    onChange(next);
  }

  return (
    <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
          Edit slides before export
        </p>
        <Badge tone="muted" size="xs" uppercase>
          Autosaves
        </Badge>
      </div>
      <div className="mt-3 grid gap-3">
        {localSlides.map((slide, index) => (
          <div
            key={index}
            className="grid min-w-0 gap-2 rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
                  Slide {index + 1} · {CAROUSEL_SLIDE_ROLES[index]?.role ?? "Slide"}
                </span>
                <p className="mt-0.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                  {CAROUSEL_SLIDE_ROLES[index]?.rule ?? "Keep it simple."}
                </p>
              </div>
              <span className="text-[10px] font-bold text-[color:var(--text-faint)]">
                {countWords(slide.title)} title words
              </span>
            </div>
            <input
              value={slide.title}
              onChange={(event) => updateSlide(index, { title: event.target.value })}
              className="min-h-10 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
            />
            <textarea
              value={slide.body}
              onChange={(event) => updateSlide(index, { body: event.target.value })}
              rows={2}
              className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CarouselChecklist({ slides }: { slides: CarouselSlide[] }) {
  const checks = getCarouselChecks(slides);
  const passed = checks.filter((check) => check.pass).length;
  return (
    <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
          Ship score
        </p>
        <Badge tone={passed >= 8 ? "brand" : "warning"} size="xs" uppercase>
          {passed}/{checks.length}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {checks.map((check) => (
          <div
            key={check.label}
            className="flex items-center gap-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)]"
          >
            <span
              className={`h-4 w-4 rounded-[var(--r-sm)] border text-[10px] flex items-center justify-center ${
                check.pass
                  ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[color:var(--success)]"
                  : "border-[var(--border)] bg-[var(--surface-deep)] text-[color:var(--text-faint)]"
              }`}
            >
              {check.pass ? "✓" : ""}
            </span>
            <span>{check.label}</span>
          </div>
        ))}
      </div>
      {/* Swipe-rate target chip — sets a visible bar from the carousel
          research (50%+ swipe-through, 5-10% saves) so the coach knows
          what "good" looks like when they ship. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border-faint)] pt-3">
        <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
          After publish, aim for:
        </span>
        <Badge tone="brand" size="xs" uppercase>
          50%+ swipe-through
        </Badge>
        <Badge tone="brand" size="xs" uppercase>
          5%+ saves
        </Badge>
      </div>
    </div>
  );
}

function CarouselPreview({
  slides,
  style,
  customStyle,
  brandName,
  handle,
  accentColor,
  brandKit,
}: {
  slides: CarouselSlide[];
  style: CarouselStyle;
  customStyle: CarouselCustomStyle | null;
  brandName: string;
  handle: string;
  accentColor: string;
  brandKit?: BrandKit | null;
}) {
  const identity = carouselIdentity(brandName, handle);

  // Brand kit drives the typography and palette when style === "brand_kit".
  // Hot-load the Google Font on the preview so the font visibly applies.
  useBrandFontLoader(style === "brand_kit" ? brandKit?.fontFamily : null);

  return (
    <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2">
      {slides.map((slide, index) => {
        const kitTemplate = style === "imported" ? pickCarouselKitTemplate(customStyle, index + 1, slides.length) : null;
        const dna = kitTemplate?.dna ?? customStyle?.dna;
        const previewStyle = carouselPreviewStyle(style, customStyle, dna, brandKit ?? null);
        const useBrandKit = style === "brand_kit" && !!brandKit;
        const titleFontFamily = useBrandKit
          ? fontFamilyStack(brandKit!.fontFamily)
          : dna?.fontFamily === "serif" ? "'Fraunces', Georgia, serif"
          : dna?.fontFamily === "mono" ? "monospace"
          : "'Plus Jakarta Sans', sans-serif";
        const titleWeight = useBrandKit ? Number(brandKit!.fontWeight) : (dna?.titleWeight ?? 800);
        const titleColor  = useBrandKit ? brandKit!.textHex : dna?.titleColor;
        const bodyColor   = useBrandKit ? brandKit!.textHex : dna?.bodyColor;
        const identityColor = useBrandKit ? brandKit!.primaryHex : undefined;
        const barColor = kitTemplate?.accent ?? carouselPreviewAccent(style, customStyle, accentColor, brandKit ?? null);
        return (
          <div
            key={`${slide.title}-${index}`}
            className={`relative snap-start shrink-0 w-[min(220px,78vw)] aspect-[4/5] overflow-hidden rounded-[var(--r-lg)] border p-4 shadow-[var(--shadow-sm)] flex flex-col ${carouselPreviewClass(style, index)}`}
            style={previewStyle}
          >
            <div
              className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-wider opacity-70"
              style={identityColor ? { color: identityColor } : undefined}
            >
              <span className="min-w-0 truncate flex items-center gap-1.5">
                {useBrandKit && brandKit!.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brandKit!.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />
                ) : null}
                {identity}
              </span>
              <span>{index + 1}/{slides.length}</span>
            </div>
            <div className="mt-auto mb-auto">
              <h4
                className="text-[22px] leading-[1.05] tracking-tight"
                style={{
                  fontFamily: titleFontFamily,
                  fontWeight: titleWeight,
                  textAlign: dna?.align ?? "left",
                  color: titleColor,
                }}
              >
                {slide.title}
              </h4>
              {slide.body ? (
                <p
                  className="mt-3 text-[13px] leading-[1.45] opacity-70"
                  style={{
                    fontFamily: titleFontFamily,
                    textAlign: dna?.align ?? "left",
                    color: bodyColor,
                  }}
                >
                  {slide.body}
                </p>
              ) : null}
            </div>
            <div
              className="mt-4 h-1.5 w-12 rounded-full"
              style={{ backgroundColor: barColor }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Hot-load a Google Font by injecting a <link rel="stylesheet">. Idempotent
 *  per family. Pass null to leave whatever's currently loaded. */
function useBrandFontLoader(family: string | null | undefined): void {
  useEffect(() => {
    if (!family || typeof document === "undefined") return;
    const id = `brand-kit-carousel-font-${family.replace(/\s+/g, "-").toLowerCase()}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = googleFontsHref(family);
    document.head.appendChild(link);
  }, [family]);
}

type CarouselSlide = {
  title: string;
  body: string;
};

type ContentMeta = {
  source_label?: string;
  source_type?: Content["performance"]["source_type"];
  source_id?: string;
  carousel_style?: Content["performance"]["carousel_style"];
  carousel_hook?: Content["performance"]["carousel_hook"];
  carousel_brand_name?: string;
  carousel_handle?: string;
  carousel_accent_color?: string;
  carousel_custom_style?: CarouselCustomStyle;
  content_favorite?: boolean;
  content_archived?: boolean;
};

function isCarousel(item: Content): boolean {
  return item.content_type === "carousel";
}

function getCarouselRecommendation(
  leads: Lead[],
  outcome: CarouselOutcome
): { framework: CarouselFramework; style: CarouselStyle; reason: string } {
  const leadSignalCount = getLeadSignals(leads).length;
  const hasEmotionalSignal = leads.some((lead) =>
    (lead.pain_signal ?? []).some((pain) =>
      ["heartbreak", "relationship_conflict", "emotional_numbness"].includes(pain)
    )
  );

  if (outcome === "authority") {
    return {
      framework: "framework",
      style: "onyx_gold",
      reason: "Authority content should make the coach's method feel ownable. A named framework creates the strongest memory.",
    };
  }

  if (outcome === "saves") {
    return {
      framework: "listicle",
      style: "forest_sand",
      reason: "Save-focused carousels win by being easy to scan later. A clean listicle gives the reader a useful reference.",
    };
  }

  if (hasEmotionalSignal || leadSignalCount > 0) {
    return {
      framework: "mistake_fix",
      style: "hard_facts",
      reason: "Your lead signals contain tension. A mistake/fix deck turns that tension into a strong point of view.",
    };
  }

  return {
    framework: "mistake_fix",
    style: "editorial_gold",
    reason: "When the market signal is still early, a contrarian mistake/fix deck gives the post the clearest reason to swipe.",
  };
}

function recommendCarouselFramework(leads: Lead[]): CarouselFramework {
  return getCarouselRecommendation(leads, "conversations").framework;
}

function recommendCarouselHook(leads: Lead[], outcome: CarouselOutcome): CarouselHook {
  if (outcome === "saves") return "number_outcome";
  if (outcome === "authority") return "identity_callout";
  const hasPain = leads.some((lead) => (lead.pain_signal ?? []).length > 0 || Boolean(lead.notes));
  return hasPain ? "pain_question" : "contrarian";
}

function frameworkLabel(value: CarouselFramework): string {
  return CAROUSEL_FRAMEWORKS.find((framework) => framework.id === value)?.label ?? "Mistake / Fix";
}

function styleLabel(value: CarouselStyle): string {
  return CAROUSEL_STYLES.find((style) => style.id === value)?.label ?? "Onyx + Gold";
}

function visualSystemSwatches(
  style: CarouselStyle,
  customStyle?: CarouselCustomStyle | null,
  brandKit?: BrandKit | null
): string[] {
  if (style === "imported" && customStyle) return customStyle.colors.slice(0, 4);
  if (style === "brand_kit" && brandKit) {
    return [brandKit.backgroundHex, brandKit.textHex, brandKit.primaryHex, brandKit.accentHex];
  }
  // ── Carousel artwork, NOT app chrome ────────────────────────────────
  // Every hex below this line describes a slide a coach publishes to
  // Instagram, not a surface in this app. They are deliberately outside the
  // token system: a carousel in "onyx gold" has to stay onyx gold when the
  // product's own paper changes. A design sweep should leave them alone.
  // The audit that flagged this file as the worst drift offender was
  // counting these; the file's actual UI is fully tokenised.
  if (style === "forest_sand") return ["#F6F1E8", "#172116", "#386641", "#D7C5A5"];
  if (style === "editorial_gold") return ["#B8892E", "#FFF8E8", "#151515", "#F7C46C"];
  if (style === "hard_facts") return ["#B1B5BE", "#111111", "#F8F8F8", "#C8A16A"];
  return ["#111111", "#FAFAF8", "#D4A24C", "#2A2A2A"];
}

function normalizeCarouselStyleValue(value: unknown): CarouselStyle | null {
  if (
    value === "onyx_gold" || value === "forest_sand" || value === "editorial_gold" ||
    value === "hard_facts" || value === "imported" || value === "brand_kit"
  ) {
    return value;
  }
  if (value === "clean_cream") return "forest_sand";
  if (value === "accent_flash" || value === "midnight_citron") return "editorial_gold";
  if (value === "black_gold") return "hard_facts";
  if (value === "dark_authority") return "onyx_gold";
  return null;
}

function carouselPreviewClass(style: CarouselStyle, index: number): string {
  if (style === "forest_sand") {
    return "border-[#E7DCCB] bg-[#F6F1E8] text-[#172116]";
  }
  if (style === "editorial_gold") {
    return index <= 1
      ? "border-[#9B7022] bg-[#B8892E] text-[#FFF8E8]"
      : "border-[#D9C9A7] bg-[#F6F1E8] text-[#151515]";
  }
  if (style === "hard_facts") {
    return "border-[#6F7480] bg-[#B1B5BE] text-[#050505]";
  }
  if (style === "imported" || style === "brand_kit") {
    return "border-[var(--border)] text-[color:var(--text)]";
  }
  return "border-[#2A2A2A] bg-[#111111] text-[#F5F1EA]";
}

function carouselPreviewStyle(
  style: CarouselStyle,
  customStyle: CarouselCustomStyle | null,
  dna?: CarouselStyleDna,
  brandKit?: BrandKit | null
): CSSProperties | undefined {
  if (style === "brand_kit" && brandKit) {
    return {
      background: brandKit.backgroundHex,
      color: brandKit.textHex,
      borderColor: brandKit.primaryHex,
    };
  }
  if (style !== "imported" || !customStyle) return undefined;
  const background =
    dna?.backgroundMood === "editorial_gradient"
      ? `linear-gradient(160deg, ${customStyle.background}, ${colorWithAlpha(customStyle.accent, 0.28)})`
      : dna?.backgroundMood === "paper"
        ? `radial-gradient(circle at 30% 20%, ${colorWithAlpha(customStyle.accent, 0.22)}, transparent 32%), ${customStyle.background}`
        : customStyle.background;
  return {
    background,
    color: dna?.titleColor ?? customStyle.text,
    borderColor: customStyle.accent,
  };
}

function carouselPreviewAccent(
  style: CarouselStyle,
  customStyle: CarouselCustomStyle | null,
  accentColor: string,
  brandKit?: BrandKit | null
): string {
  if (style === "brand_kit" && brandKit) return brandKit.accentHex;
  if (style === "imported" && customStyle) return customStyle.accent;
  if (style === "forest_sand") return "#386641";
  if (style === "editorial_gold") return "#151515";
  if (style === "hard_facts") return "#C8A16A";
  if (style === "onyx_gold") return "#D4A24C";
  return isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT_HEX;
}

function getCarouselChecks(slides: CarouselSlide[]): Array<{ label: string; pass: boolean }> {
  const coverWords = countWords(slides[0]?.title ?? "");
  const slideTwoWords = countWords(slides[1]?.title ?? "");
  const hasCta = /reply|dm|comment|save|share|follow|book|send/i.test(
    `${slides.at(-1)?.title ?? ""} ${slides.at(-1)?.body ?? ""}`
  );
  const finalText = `${slides.at(-1)?.title ?? ""} ${slides.at(-1)?.body ?? ""}`.toLowerCase();
  const ctaMatches = ["reply", "dm", "comment", "save", "share", "follow", "book", "send"].filter((word) =>
    finalText.includes(word)
  );
  return [
    { label: "8 slides", pass: slides.length === 8 },
    { label: "Cover under 12 words", pass: coverWords > 0 && coverWords <= 12 },
    { label: "Slide 2 works as second hook", pass: Boolean(slides[1]?.title) && slideTwoWords <= 12 },
    { label: "One idea per slide", pass: slides.every((slide) => countWords(`${slide.title} ${slide.body}`) <= 28) },
    { label: "Slides 3-6 carry the value stack", pass: slides.slice(2, 6).every((slide) => Boolean(slide.title && slide.body)) },
    { label: "Slide 5 creates a pattern break", pass: Boolean(slides[4]?.title) && countWords(`${slides[4]?.title ?? ""} ${slides[4]?.body ?? ""}`) <= 24 },
    { label: "Slide 7 has a memorable payoff", pass: Boolean(slides[6]?.title) && countWords(`${slides[6]?.title ?? ""} ${slides[6]?.body ?? ""}`) <= 24 },
    { label: "Final slide has one CTA", pass: hasCta && ctaMatches.length <= 1 },
    { label: "No slide feels like a paragraph", pass: slides.every((slide) => (slide.body ?? "").length <= 150) },
    { label: "No em dash characters", pass: slides.every((slide) => !`${slide.title} ${slide.body}`.includes("\u2014")) },
  ];
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function serializeCarouselSlides(slides: CarouselSlide[]): string {
  return slides
    .map((slide, index) =>
      [`Slide ${index + 1}: ${slide.title.trim()}`, slide.body.trim()]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function getContentMeta(item: Content): ContentMeta {
  return (item.performance ?? {}) as ContentMeta;
}

function isContentFavorite(item: Content): boolean {
  return Boolean(getContentMeta(item).content_favorite);
}

function isContentArchived(item: Content): boolean {
  return Boolean(getContentMeta(item).content_archived);
}

function getVisibleLibraryItems(items: Content[], view: ContentLibraryView): Content[] {
  const pool = items.filter((item) => view === "archived" ? isContentArchived(item) : !isContentArchived(item));
  const sorted = [...pool].sort((a, b) => {
    if (view === "recent") return timestampScore(b) - timestampScore(a);
    return libraryScore(b) - libraryScore(a);
  });
  return sorted.slice(0, view === "archived" ? 12 : 5);
}

function libraryScore(item: Content): number {
  const meta = getContentMeta(item);
  let score = timestampScore(item) / 1_000_000_000;
  if (meta.content_favorite) score += 500;
  if (item.content_type === "carousel") score += 70;
  if (meta.source_type === "lead" || meta.source_label?.toLowerCase().includes("lead")) score += 50;
  if (item.status === "scheduled") score += 35;
  if (item.status === "published") score += 25;
  if ((item.body ?? "").length > 240) score += 12;
  return score;
}

function timestampScore(item: Content): number {
  return Date.parse(item.updated_at || item.created_at || "") || 0;
}

function dedupeColors(colors: string[]): string[] {
  return colors
    .filter((color) => isValidHex(color))
    .filter((color, index, all) => all.findIndex((other) => colorDistance(color, other) < 18) === index)
    .slice(0, 6);
}

function isValidHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function parseCarouselCustomStyle(value: unknown): CarouselCustomStyle | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<CarouselCustomStyle>;
  const colors = Array.isArray(maybe.colors) ? maybe.colors.filter((color) => typeof color === "string" && isValidHex(color)) : [];
  if (!colors.length || !maybe.background || !maybe.text || !maybe.accent) return null;
  const background = isValidHex(maybe.background) ? maybe.background : colors[0];
  const text = isValidHex(maybe.text) ? maybe.text : colors[1] ?? "#FFFFFF";
  const accent = isValidHex(maybe.accent) ? maybe.accent : colors[2] ?? "#D4A24C";
  const layout = isCarouselCustomLayout(maybe.layout)
    ? maybe.layout
    : inferCarouselLayout(background, colors);
  const dna = parseCarouselStyleDna(maybe.dna, {
    background,
    text,
    accent,
    layout,
  });
  const templates = parseCarouselKitTemplates(maybe.templates);
  return {
    name: typeof maybe.name === "string" && maybe.name.trim() ? maybe.name : "Imported style",
    kind: dna ? "dna" : templates.length ? "kit" : "palette",
    colors: colors.slice(0, 6),
    background,
    text,
    accent,
    layout,
    ...(dna ? { dna } : {}),
    ...(templates.length ? { templates } : {}),
    imported_at: typeof maybe.imported_at === "string" ? maybe.imported_at : new Date().toISOString(),
  };
}

function isCarouselCustomLayout(value: unknown): value is CarouselCustomStyle["layout"] {
  return value === "quote" || value === "poster" || value === "hard_facts" || value === "minimal";
}

function isCarouselKitRole(value: unknown): value is CarouselKitRole {
  return value === "cover" || value === "teaching" || value === "quote" || value === "cta";
}

function parseCarouselStyleDna(
  value: unknown,
  fallback: { background: string; text: string; accent: string; layout: CarouselCustomStyle["layout"] }
): CarouselStyleDna | null {
  if (!value || typeof value !== "object") return createCarouselStyleDna(fallback.background, fallback.text, fallback.accent, fallback.layout, []);
  const maybe = value as Partial<CarouselStyleDna>;
  const base = createCarouselStyleDna(fallback.background, fallback.text, fallback.accent, fallback.layout, []);
  return {
    ...base,
    backgroundMood: isBackgroundMood(maybe.backgroundMood) ? maybe.backgroundMood : base.backgroundMood,
    fontFamily: isCarouselFontFamily(maybe.fontFamily) ? maybe.fontFamily : base.fontFamily,
    titleWeight: typeof maybe.titleWeight === "number" ? maybe.titleWeight : base.titleWeight,
    bodyWeight: typeof maybe.bodyWeight === "number" ? maybe.bodyWeight : base.bodyWeight,
    align: maybe.align === "center" || maybe.align === "left" ? maybe.align : base.align,
    titleCase: maybe.titleCase === "uppercase" || maybe.titleCase === "sentence" || maybe.titleCase === "none" ? maybe.titleCase : base.titleCase,
    tracking: maybe.tracking === "wide" || maybe.tracking === "tight" || maybe.tracking === "normal" ? maybe.tracking : base.tracking,
    highlightMode: isHighlightMode(maybe.highlightMode) ? maybe.highlightMode : base.highlightMode,
    highlightColor: typeof maybe.highlightColor === "string" && isValidHex(maybe.highlightColor) ? maybe.highlightColor : base.highlightColor,
    titleColor: typeof maybe.titleColor === "string" && isValidHex(maybe.titleColor) ? maybe.titleColor : base.titleColor,
    bodyColor: typeof maybe.bodyColor === "string" && isValidHex(maybe.bodyColor) ? maybe.bodyColor : base.bodyColor,
    handleColor: typeof maybe.handleColor === "string" && isValidHex(maybe.handleColor) ? maybe.handleColor : base.handleColor,
    handlePlacement: maybe.handlePlacement === "top" || maybe.handlePlacement === "bottom" || maybe.handlePlacement === "hidden" ? maybe.handlePlacement : base.handlePlacement,
    ornament: maybe.ornament === "diamond" || maybe.ornament === "asterisk" || maybe.ornament === "rule" || maybe.ornament === "capsule" || maybe.ornament === "none" ? maybe.ornament : base.ornament,
    titleZone: base.titleZone,
    bodyZone: base.bodyZone,
  };
}

function isBackgroundMood(value: unknown): value is CarouselBackgroundMood {
  return value === "solid" || value === "editorial_gradient" || value === "paper" || value === "poster_blocks" || value === "night_texture";
}

function isCarouselFontFamily(value: unknown): value is CarouselFontFamily {
  return value === "sans" || value === "serif" || value === "mono";
}

function isHighlightMode(value: unknown): value is CarouselHighlightMode {
  return value === "none" || value === "accent_words" || value === "italic_accent" || value === "marker";
}

function parseCarouselKitTemplates(value: unknown): CarouselKitTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((template, index): CarouselKitTemplate | null => {
      if (!template || typeof template !== "object") return null;
      const maybe = template as Partial<CarouselKitTemplate>;
      const background = typeof maybe.background === "string" && isValidHex(maybe.background) ? maybe.background : "#111111";
      const text = typeof maybe.text === "string" && isValidHex(maybe.text) ? maybe.text : bestContrastColor(background, [background, "#F5F1EA", "#111111"]);
      const accent = typeof maybe.accent === "string" && isValidHex(maybe.accent) ? maybe.accent : "#D4A24C";
      const layout = isCarouselCustomLayout(maybe.layout) ? maybe.layout : inferCarouselLayout(background, [background, text, accent]);
      const dna = parseCarouselStyleDna(maybe.dna, { background, text, accent, layout }) ?? createCarouselStyleDna(background, text, accent, layout, []);
      return {
        role: isCarouselKitRole(maybe.role) ? maybe.role : defaultKitRole(index),
        background,
        text,
        accent,
        layout,
        dna,
        zones: defaultKitZones(layout, defaultKitRole(index)),
      };
    })
    .filter(Boolean)
    .slice(0, 8) as CarouselKitTemplate[];
}

async function extractCarouselStyle(files: File[]): Promise<CarouselCustomStyle> {
  const validFiles = files.filter((file) => file.type.startsWith("image/")).slice(0, 8);
  if (!validFiles.length) return fallbackCustomStyle("Imported kit");
  const templates = await Promise.all(validFiles.map((file, index) => extractCarouselTemplate(file, index)));
  const colors = templates.flatMap((template) => [template.background, template.text, template.accent])
    .filter((color, index, all) => all.findIndex((other) => colorDistance(color, other) < 34) === index)
    .slice(0, 6);
  const background = templates[0]?.background ?? "#111111";
  const text = templates[0]?.text ?? bestContrastColor(background, colors);
  const accent = templates.find((template) => colorDistance(template.accent, background) > 55)?.accent ?? templates[0]?.accent ?? "#D4A24C";
  const layout = templates[0]?.layout ?? inferCarouselLayout(background, colors);
  const dna = createCarouselStyleDna(background, text, accent, layout, templates);
  return {
    name: validFiles.length > 1 ? "Imported carousel kit" : validFiles[0].name.replace(/\.[a-z0-9]+$/i, "").slice(0, 24) || "Imported kit",
    kind: "dna",
    colors: [background, text, accent, ...colors.filter((color) => ![background, text, accent].includes(color))].slice(0, 6),
    background,
    text,
    accent,
    layout,
    dna,
    templates: templates.map((template) => ({ ...template, dna })),
    imported_at: new Date().toISOString(),
  };
}

async function extractCarouselTemplate(file: File, index: number): Promise<CarouselKitTemplate> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 144;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = fallbackCustomStyle(file.name);
    return {
      role: defaultKitRole(index),
      background: fallback.background,
      text: fallback.text,
      accent: fallback.accent,
      layout: fallback.layout,
      dna: fallback.dna ?? createCarouselStyleDna(fallback.background, fallback.text, fallback.accent, fallback.layout, []),
      zones: defaultKitZones(fallback.layout, defaultKitRole(index)),
    };
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<string, ColorBucket>();
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const pixelIndex = (y * canvas.width + x) * 4;
      const r = pixels[pixelIndex] ?? 0;
      const g = pixels[pixelIndex + 1] ?? 0;
      const b = pixels[pixelIndex + 2] ?? 0;
      const a = pixels[pixelIndex + 3] ?? 0;
      if (a < 220) continue;
      const qr = Math.round(r / 16) * 16;
      const qg = Math.round(g / 16) * 16;
      const qb = Math.round(b / 16) * 16;
      const color = rgbToHex(qr, qg, qb);
      const luma = colorLuma(color);
      const current = buckets.get(color);
      const edge = x < 18 || x > canvas.width - 20 || y < 22 || y > canvas.height - 24;
      const center = x > 28 && x < canvas.width - 28 && y > 32 && y < canvas.height - 32;
      buckets.set(color, {
        color,
        count: (current?.count ?? 0) + 1,
        edgeCount: (current?.edgeCount ?? 0) + (edge ? 1 : 0),
        centerCount: (current?.centerCount ?? 0) + (center ? 1 : 0),
        luma,
        saturation: colorSaturation(color),
      });
    }
  }
  const bucketList = [...buckets.values()];
  const colors = bucketList
    .sort((a, b) => b.count - a.count)
    .map((bucket) => bucket.color)
    .filter((color, colorIndex, all) => all.findIndex((other) => colorDistance(color, other) < 30) === colorIndex)
    .slice(0, 8);
  if (colors.length < 2) {
    const fallback = fallbackCustomStyle(file.name);
    return {
      role: defaultKitRole(index),
      background: fallback.background,
      text: fallback.text,
      accent: fallback.accent,
      layout: fallback.layout,
      dna: fallback.dna ?? createCarouselStyleDna(fallback.background, fallback.text, fallback.accent, fallback.layout, []),
      zones: defaultKitZones(fallback.layout, defaultKitRole(index)),
    };
  }
  const background = chooseBackgroundColor(bucketList) ?? colors[0];
  const text = chooseTextColor(background, bucketList) ?? bestContrastColor(background, colors);
  const accent = chooseAccentColor(background, text, bucketList) ?? colors.find((color) => color !== background && color !== text && colorDistance(color, background) > 55) ?? colors[1] ?? "#D4A24C";
  const layout = inferCarouselLayout(background, colors);
  return {
    role: defaultKitRole(index),
    background,
    text,
    accent,
    layout,
    dna: createCarouselStyleDna(background, text, accent, layout, []),
    zones: defaultKitZones(layout, defaultKitRole(index)),
  };
}

function fallbackCustomStyle(name: string): CarouselCustomStyle {
  return {
    name: name.replace(/\.[a-z0-9]+$/i, "").slice(0, 24) || "Imported style",
    colors: ["#111111", "#F5F1EA", "#D4A24C"],
    kind: "palette",
    background: "#111111",
    text: "#F5F1EA",
    accent: "#D4A24C",
    layout: "quote",
    dna: createCarouselStyleDna("#111111", "#F5F1EA", "#D4A24C", "quote", []),
    imported_at: new Date().toISOString(),
  };
}

type ColorBucket = {
  color: string;
  count: number;
  edgeCount: number;
  centerCount: number;
  luma: number;
  saturation: number;
};

function chooseBackgroundColor(buckets: ColorBucket[]): string | null {
  return [...buckets]
    .filter((bucket) => bucket.count > 2)
    .sort((a, b) => {
      const aScore = a.edgeCount * 3 + a.count * 0.65 - a.centerCount * 0.12;
      const bScore = b.edgeCount * 3 + b.count * 0.65 - b.centerCount * 0.12;
      return bScore - aScore;
    })[0]?.color ?? null;
}

function chooseTextColor(background: string, buckets: ColorBucket[]): string | null {
  const bgLuma = colorLuma(background);
  return [...buckets]
    .filter((bucket) => {
      const contrast = Math.abs(bucket.luma - bgLuma);
      return bucket.color !== background && contrast > 70 && bucket.centerCount > 0;
    })
    .sort((a, b) => {
      const aScore = Math.abs(a.luma - bgLuma) * 2.3 + a.centerCount * 1.5 + a.count * 0.2 - a.edgeCount * 0.35;
      const bScore = Math.abs(b.luma - bgLuma) * 2.3 + b.centerCount * 1.5 + b.count * 0.2 - b.edgeCount * 0.35;
      return bScore - aScore;
    })[0]?.color ?? null;
}

function chooseAccentColor(background: string, text: string, buckets: ColorBucket[]): string | null {
  const bgLuma = colorLuma(background);
  return [...buckets]
    .filter((bucket) => {
      const farFromBackground = colorDistance(bucket.color, background) > 45;
      const farFromText = colorDistance(bucket.color, text) > 35;
      const visible = Math.abs(bucket.luma - bgLuma) > 28;
      return farFromBackground && farFromText && visible && bucket.count > 1;
    })
    .sort((a, b) => {
      const aGoldBias = isGoldLike(a.color) ? 80 : 0;
      const bGoldBias = isGoldLike(b.color) ? 80 : 0;
      const aScore = a.saturation * 160 + a.centerCount * 0.8 + a.count * 0.2 + aGoldBias;
      const bScore = b.saturation * 160 + b.centerCount * 0.8 + b.count * 0.2 + bGoldBias;
      return bScore - aScore;
    })[0]?.color ?? null;
}

function createCarouselStyleDna(
  background: string,
  text: string,
  accent: string,
  layout: CarouselCustomStyle["layout"],
  templates: CarouselKitTemplate[]
): CarouselStyleDna {
  const bgLuma = colorLuma(background);
  const accentLuma = colorLuma(accent);
  const isDark = bgLuma < 80;
  const serifScore = templates.filter((template) => template.layout === "quote" || template.layout === "minimal").length;
  const fontFamily: CarouselFontFamily = layout === "quote" || serifScore > templates.length / 2 ? "serif" : "sans";
  const align = layout === "quote" ? "center" : "left";
  const backgroundMood: CarouselBackgroundMood =
    layout === "hard_facts" ? "editorial_gradient" :
    layout === "poster" ? "poster_blocks" :
    layout === "minimal" ? "paper" :
    isDark ? "night_texture" : "solid";
  const highlightMode: CarouselHighlightMode =
    Math.abs(accentLuma - bgLuma) > 55 ? (fontFamily === "serif" ? "italic_accent" : "accent_words") : "none";
  const titleColor = text;
  const bodyColor = text;

  return {
    backgroundMood,
    fontFamily,
    titleWeight: fontFamily === "serif" ? 500 : 900,
    bodyWeight: fontFamily === "serif" ? 500 : 500,
    align,
    titleCase: layout === "hard_facts" || layout === "poster" ? "uppercase" : "none",
    tracking: layout === "hard_facts" ? "tight" : layout === "quote" ? "normal" : "wide",
    highlightMode,
    highlightColor: accent,
    titleColor,
    bodyColor,
    handleColor: text,
    handlePlacement: layout === "quote" ? "bottom" : "top",
    ornament: layout === "poster" ? "asterisk" : layout === "hard_facts" ? "rule" : layout === "minimal" ? "capsule" : "diamond",
    titleZone: defaultKitZones(layout, "cover").title,
    bodyZone: defaultKitZones(layout, "cover").body ?? defaultKitZones("quote", "cover").body!,
  };
}

function defaultKitRole(index: number): CarouselKitRole {
  if (index === 0) return "cover";
  if (index === 4 || index === 6) return "quote";
  if (index >= 7) return "cta";
  return "teaching";
}

function defaultKitZones(layout: CarouselCustomStyle["layout"], role: CarouselKitRole): CarouselKitTemplate["zones"] {
  if (layout === "hard_facts") {
    return {
      title: { x: 0.06, y: 0.2, w: 0.86, h: 0.34, align: "left", family: "sans", weight: 900, maxFont: 102, minFont: 46, panel: true },
      body: { x: 0.54, y: 0.56, w: 0.37, h: 0.17, align: "left", family: "sans", weight: 500, maxFont: 36, minFont: 22, panel: true },
      identity: { x: 0.07, y: 0.86, w: 0.5, h: 0.05, align: "left", family: "sans", weight: 800, maxFont: 26, minFont: 18 },
      progress: { x: 0.78, y: 0.86, w: 0.14, h: 0.05, align: "center", family: "sans", weight: 800, maxFont: 26, minFont: 18 },
    };
  }

  if (layout === "poster") {
    return {
      title: { x: 0.06, y: role === "cover" ? 0.1 : 0.2, w: 0.74, h: role === "cover" ? 0.38 : 0.3, align: "left", family: "sans", weight: 900, maxFont: 96, minFont: 42, panel: true },
      body: { x: 0.07, y: 0.83, w: 0.82, h: 0.1, align: "left", family: "sans", weight: 500, maxFont: 34, minFont: 22, panel: true },
      identity: { x: 0.06, y: 0.04, w: 0.46, h: 0.05, align: "left", family: "sans", weight: 800, maxFont: 26, minFont: 16 },
      progress: { x: 0.82, y: 0.04, w: 0.12, h: 0.05, align: "center", family: "sans", weight: 800, maxFont: 24, minFont: 16 },
    };
  }

  if (layout === "minimal") {
    return {
      title: { x: 0.08, y: 0.38, w: 0.84, h: 0.28, align: "left", family: "serif", weight: 500, maxFont: 86, minFont: 36, panel: true },
      body: { x: 0.08, y: 0.68, w: 0.74, h: 0.14, align: "left", family: "sans", weight: 500, maxFont: 34, minFont: 22, panel: true },
      identity: { x: 0.08, y: 0.04, w: 0.56, h: 0.05, align: "left", family: "sans", weight: 700, maxFont: 26, minFont: 16 },
      progress: { x: 0.82, y: 0.04, w: 0.12, h: 0.05, align: "center", family: "sans", weight: 700, maxFont: 24, minFont: 16 },
    };
  }

  return {
    title: { x: 0.16, y: role === "cover" ? 0.42 : 0.48, w: 0.68, h: 0.22, align: "center", family: "serif", weight: 500, maxFont: role === "cover" ? 68 : 60, minFont: 30, panel: true },
    body: { x: 0.22, y: 0.66, w: 0.56, h: 0.14, align: "center", family: "serif", weight: 500, maxFont: 30, minFont: 20, panel: true },
    identity: { x: 0.18, y: 0.89, w: 0.64, h: 0.05, align: "center", family: "serif", weight: 600, maxFont: 24, minFont: 16 },
    progress: { x: 0.78, y: 0.07, w: 0.12, h: 0.05, align: "center", family: "sans", weight: 800, maxFont: 24, minFont: 16 },
  };
}

function inferCarouselLayout(background: string, colors: string[]): CarouselCustomStyle["layout"] {
  const bgLuma = colorLuma(background);
  const hasGold = colors.some((color) => {
    const [r, g, b] = hexToRgb(color);
    return r > 145 && g > 105 && b < 125;
  });
  const hasGray = colors.some((color) => {
    const [r, g, b] = hexToRgb(color);
    return Math.abs(r - g) < 24 && Math.abs(g - b) < 24 && r > 80 && r < 220;
  });

  if (hasGray && bgLuma > 65) return "hard_facts";
  if (hasGold && bgLuma > 125) return "poster";
  if (bgLuma > 150) return "minimal";
  return "quote";
}

function carouselIdentity(brandName: string, handle: string): string {
  const cleanBrand = brandName.trim();
  const cleanHandle = handle.trim();
  if (cleanHandle && cleanHandle !== "@yourhandle") return cleanHandle;
  if (cleanBrand && cleanBrand !== "Your Brand") return cleanBrand;
  return "@yourhandle";
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function colorLuma(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorSaturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function isGoldLike(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r > 120 && g > 80 && g < 210 && b < 145 && r >= g;
}

function colorDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

function bestContrastColor(background: string, colors: string[]): string {
  const bgLuma = colorLuma(background);
  return [...colors]
    .filter((color) => color !== background)
    .sort((a, b) => Math.abs(colorLuma(b) - bgLuma) - Math.abs(colorLuma(a) - bgLuma))[0] ?? (bgLuma > 130 ? "#111111" : "#F5F1EA");
}

function colorWithAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function parseCarouselSlides(item: Content): CarouselSlide[] {
  const body = item.body ?? "";
  const matches = [...body.matchAll(/(?:^|\n)\s*Slide\s+(\d+)\s*:\s*([^\n]+)([\s\S]*?)(?=\n\s*Slide\s+\d+\s*:|$)/gi)];
  const slides = matches
    .map((match) => ({
      title: cleanSlideText(match[2] ?? ""),
      body: cleanSlideText(match[3] ?? ""),
    }))
    .filter((slide) => slide.title);

  if (slides.length > 0) return slides.slice(0, 10);

  return body
    .split(/\n{2,}/)
    .map((chunk) => cleanSlideText(chunk))
    .filter(Boolean)
    .slice(0, 10)
    .map((chunk) => {
      const [title, ...rest] = chunk.split("\n").filter(Boolean);
      return {
        title: title ?? "",
        body: rest.join(" "),
      };
    })
    .filter((slide) => slide.title);
}

function cleanSlideText(value: string): string {
  return value
    .replace(/^[-*\s]+/gm, "")
    .replace(/^Visual system:\s*.+$/gim, "")
    .replace(/^Style:\s*.+$/gim, "")
    .replace(/^(Inverse Cover|Numbered Value|Accent Flash|Quote\s*\/\s*Payoff|CTA Close)\s*$/gim, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Web fonts have to be FontFace-loaded before canvas drawing or the text
// silently falls back to a generic sans-serif (which is what the Arial
// strings used to render as anyway). We await load on a representative
// set of weights once per export — subsequent slides hit the cache.
//
// Per Marketing Harry's playbook + 2026 carousel research: the whole
// app already pairs Plus Jakarta Sans (body / interior slides) with
// Fraunces (cover headlines). Carousels were the one surface still on
// Arial — the single biggest visual downgrade in the product.
let carouselFontsReadyPromise: Promise<void> | null = null;
async function ensureCarouselFontsLoaded(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  if (carouselFontsReadyPromise) return carouselFontsReadyPromise;
  carouselFontsReadyPromise = (async () => {
    const fontsToLoad = [
      // Plus Jakarta Sans — interior slides + body copy + UI labels
      "500 26px 'Plus Jakarta Sans'",
      "500 32px 'Plus Jakarta Sans'",
      "700 28px 'Plus Jakarta Sans'",
      "700 36px 'Plus Jakarta Sans'",
      "800 56px 'Plus Jakarta Sans'",
      "900 72px 'Plus Jakarta Sans'",
      // Fraunces — cover headlines (slide 1 of every style + the Onyx
      // payoff slide). Sizes mirror the actual fitWrappedText min/max.
      "700 56px 'Fraunces'",
      "700 110px 'Fraunces'",
      "800 120px 'Fraunces'",
    ];
    await Promise.all(
      fontsToLoad.map((spec) =>
        document.fonts.load(spec).catch(() => undefined)
      )
    );
    await document.fonts.ready;
  })();
  return carouselFontsReadyPromise;
}

async function renderCarouselSlide(
  deckTitle: string,
  slide: CarouselSlide,
  slideNumber: number,
  totalSlides: number,
  style: CarouselStyle,
  brandName: string,
  handle: string,
  accentColor: string,
  customStyle: CarouselCustomStyle | null
): Promise<string> {
  // Wait once per export so canvas.fillText uses the actual web font
  // rather than silently falling back to a system sans-serif.
  await ensureCarouselFontsLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const kitTemplate = style === "imported" ? pickCarouselKitTemplate(customStyle, slideNumber, totalSlides) : null;
  const theme = carouselCanvasTheme(style, slideNumber, accentColor, customStyle, kitTemplate);
  const identity = carouselIdentity(brandName, handle);
  drawCarouselLayout(ctx, {
    slide,
    slideNumber,
    totalSlides,
    style,
    identity,
    theme,
    customStyle,
    kitTemplate,
  });

  const dataUrl = canvas.toDataURL("image/png");
  const bytes = atob(dataUrl.split(",")[1] ?? "");
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "image/png" }));
}

type CarouselCanvasTheme = {
  bg: string;
  text: string;
  muted: string;
  subtle: string;
  accent: string;
};

function drawCarouselLayout(
  ctx: CanvasRenderingContext2D,
  {
    slide,
    slideNumber,
    totalSlides,
    style,
    identity,
    theme,
    customStyle,
    kitTemplate,
  }: {
    slide: CarouselSlide;
    slideNumber: number;
    totalSlides: number;
    style: CarouselStyle;
    identity: string;
    theme: CarouselCanvasTheme;
    customStyle?: CarouselCustomStyle | null;
    kitTemplate?: CarouselKitTemplate | null;
  }
) {
  if (style === "imported") {
    const dna = kitTemplate?.dna ?? customStyle?.dna;
    if (dna) {
      drawCarouselDnaSlide(ctx, slide, slideNumber, totalSlides, identity, theme, dna);
      return;
    }
    if (customStyle?.layout === "poster") {
      drawEditorialGoldSlide(ctx, slide, slideNumber, totalSlides, identity, theme);
      return;
    }
    if (customStyle?.layout === "hard_facts") {
      drawHardFactsSlide(ctx, slide, slideNumber, totalSlides, identity, theme);
      return;
    }
    if (customStyle?.layout === "minimal") {
      drawForestSandSlide(ctx, slide, slideNumber, totalSlides, identity, theme);
      return;
    }
    drawImportedQuoteSlide(ctx, slide, slideNumber, totalSlides, identity, theme);
    return;
  }
  if (style === "editorial_gold") {
    drawEditorialGoldSlide(ctx, slide, slideNumber, totalSlides, identity, theme);
    return;
  }
  if (style === "hard_facts") {
    drawHardFactsSlide(ctx, slide, slideNumber, totalSlides, identity, theme);
    return;
  }
  if (style === "forest_sand") {
    drawForestSandSlide(ctx, slide, slideNumber, totalSlides, identity, theme);
    return;
  }
  drawOnyxSlide(ctx, slide, slideNumber, totalSlides, identity, theme);
}

function drawOnyxSlide(
  ctx: CanvasRenderingContext2D,
  slide: CarouselSlide,
  slideNumber: number,
  totalSlides: number,
  identity: string,
  theme: CarouselCanvasTheme,
  imported = false,
  hasReferenceImage = false
) {
  if (!hasReferenceImage) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, 1080, 1350);
    drawNoise(ctx, imported ? 0.018 : 0.026);
  }

  ctx.fillStyle = theme.accent;
  drawDiamond(ctx, 540, slideNumber === totalSlides ? 470 : 155, slideNumber === totalSlides ? 70 : 38);

  ctx.fillStyle = theme.subtle;
  ctx.font = "600 28px 'Fraunces', Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(identity.slice(0, 34), 540, 1268);
  ctx.textAlign = "left";

  if (slideNumber === totalSlides || slideNumber === 7) {
    fitWrappedText(ctx, slide.title, {
      x: 170,
      y: 610,
      maxWidth: 740,
      maxHeight: 210,
      maxFontSize: 68,
      minFontSize: 42,
      lineHeightRatio: 1.12,
      weight: 500,
      color: theme.text,
      fontFamily: "'Fraunces', Georgia, serif",
      align: "center",
    });
    if (slide.body) {
      fitWrappedText(ctx, slide.body, {
        x: 230,
        y: 860,
        maxWidth: 620,
        maxHeight: 120,
        maxFontSize: 30,
        minFontSize: 22,
        lineHeightRatio: 1.3,
        weight: 600,
        color: theme.accent,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        align: "center",
      });
    }
    return;
  }

  // Slide counter dropped from cover (slide 1) per the carousel
  // research — looks instructional and competes with the hook.
  if (slideNumber !== 1) {
    ctx.fillStyle = theme.muted;
    ctx.font = "700 22px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(`${slideNumber}/${totalSlides}`, 72, 112);
  }

  fitWrappedText(ctx, slide.title, {
    x: 72,
    y: 310,
    maxWidth: 900,
    maxHeight: 510,
    maxFontSize: slideNumber === 1 ? 120 : 76,
    minFontSize: slideNumber === 1 ? 56 : 42,
    lineHeightRatio: 1.02,
    weight: 800,
    color: theme.text,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  });
  if (slide.body) {
    fitWrappedText(ctx, slide.body, {
      x: 72,
      y: 900,
      maxWidth: 790,
      maxHeight: 170,
      maxFontSize: 38,
      minFontSize: 26,
      lineHeightRatio: 1.28,
      weight: 500,
      color: theme.muted,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    });
  }
  ctx.fillStyle = theme.accent;
  roundRect(ctx, 72, 1176, 190, 12, 999);
  ctx.fill();
  // Swipe arrow on every slide except the last — universal carousel cue.
  if (slideNumber < totalSlides) {
    drawSwipeArrow(ctx, theme.accent);
  }
}

function drawImportedQuoteSlide(
  ctx: CanvasRenderingContext2D,
  slide: CarouselSlide,
  slideNumber: number,
  totalSlides: number,
  identity: string,
  theme: CarouselCanvasTheme
) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, 1080, 1350);
  drawNoise(ctx, 0.016);

  ctx.fillStyle = theme.accent;
  drawDiamond(ctx, 540, 320, 56);

  ctx.fillStyle = theme.subtle;
  ctx.font = "700 26px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${slideNumber}/${totalSlides}`, 540, 136);

  fitWrappedText(ctx, slide.title, {
    x: 160,
    y: 535,
    maxWidth: 760,
    maxHeight: 270,
    maxFontSize: slideNumber === 1 ? 72 : 66,
    minFontSize: 36,
    lineHeightRatio: 1.1,
    weight: 500,
    color: theme.text,
    fontFamily: "'Fraunces', Georgia, serif",
    align: "center",
  });

  if (slide.body) {
    fitWrappedText(ctx, slide.body, {
      x: 230,
      y: 850,
      maxWidth: 620,
      maxHeight: 160,
      maxFontSize: 32,
      minFontSize: 22,
      lineHeightRatio: 1.3,
      weight: 500,
      color: theme.muted,
      fontFamily: "'Fraunces', Georgia, serif",
      align: "center",
    });
  }

  ctx.fillStyle = theme.accent;
  ctx.font = "800 24px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(identity.slice(0, 34), 540, 1212);
  ctx.textAlign = "left";
}

function drawCarouselDnaSlide(
  ctx: CanvasRenderingContext2D,
  slide: CarouselSlide,
  slideNumber: number,
  totalSlides: number,
  identity: string,
  theme: CarouselCanvasTheme,
  dna: CarouselStyleDna
) {
  drawDnaBackground(ctx, theme, dna, slideNumber);
  drawDnaOrnament(ctx, dna, theme, slideNumber, totalSlides);

  // Slide counter dropped on cover (slide 1) per the carousel research —
  // the cover should be the hook only, not "1/8" instructional chrome.
  const progressLabel = slideNumber === 1 ? "" : `${slideNumber}/${totalSlides}`;

  if (dna.handlePlacement === "top") {
    drawDnaMeta(ctx, identity, progressLabel, dna, theme, 82);
  }

  const titleZone = roleAdjustedZone(dna.titleZone, slideNumber, totalSlides);
  const bodyZone = roleAdjustedZone(dna.bodyZone, slideNumber, totalSlides);

  drawDnaTextZone(ctx, titleZone, applyTitleCase(slide.title, dna.titleCase), theme, dna, "title");
  // Cover (slide 1) skips the body — let the headline carry alone.
  if (slide.body && slideNumber !== 1) {
    drawDnaTextZone(ctx, bodyZone, slide.body, theme, dna, "body");
  }

  if (dna.handlePlacement === "bottom") {
    drawDnaMeta(ctx, identity, progressLabel, dna, theme, 1212);
  }

  // Universal swipe arrow on every slide except the last.
  if (slideNumber < totalSlides) {
    drawSwipeArrow(ctx, theme.accent);
  }
}

function drawDnaBackground(
  ctx: CanvasRenderingContext2D,
  theme: CarouselCanvasTheme,
  dna: CarouselStyleDna,
  slideNumber: number
) {
  if (dna.backgroundMood === "editorial_gradient") {
    const gradient = ctx.createLinearGradient(0, 0, 0, 1350);
    gradient.addColorStop(0, colorWithAlpha(theme.text, 0.42));
    gradient.addColorStop(0.52, colorWithAlpha(theme.text, 0.18));
    gradient.addColorStop(1, theme.bg);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1350);
    drawNoise(ctx, 0.018);
    return;
  }

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, 1080, 1350);

  if (dna.backgroundMood === "poster_blocks") {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(845, 0, 235, 580);
    ctx.fillStyle = colorWithAlpha(theme.text, 0.12);
    ctx.fillRect(0, 1070, 1080, 280);
  }

  if (dna.backgroundMood === "paper") {
    const glow = ctx.createRadialGradient(280, 170, 20, 280, 170, 860);
    glow.addColorStop(0, colorWithAlpha(theme.accent, 0.24));
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1080, 1350);
  }

  if (dna.backgroundMood === "night_texture" || dna.backgroundMood === "solid") {
    drawNoise(ctx, dna.backgroundMood === "night_texture" ? 0.02 : 0.01);
  }

  if (slideNumber % 3 === 0 && dna.backgroundMood !== "poster_blocks") {
    ctx.fillStyle = colorWithAlpha(theme.accent, 0.12);
    roundRect(ctx, 72, 890, 260, 14, 999);
    ctx.fill();
  }
}

function drawDnaOrnament(
  ctx: CanvasRenderingContext2D,
  dna: CarouselStyleDna,
  theme: CarouselCanvasTheme,
  slideNumber: number,
  totalSlides: number
) {
  ctx.fillStyle = theme.accent;
  if (dna.ornament === "diamond") {
    drawDiamond(ctx, dna.align === "center" ? 540 : 92, slideNumber === totalSlides ? 390 : 155, slideNumber === totalSlides ? 58 : 38);
  } else if (dna.ornament === "asterisk") {
    drawAsterisk(ctx, 958, 455, theme.accent);
  } else if (dna.ornament === "rule") {
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(92, 780);
    ctx.lineTo(92, 1240);
    ctx.lineTo(520, 1240);
    ctx.stroke();
  } else if (dna.ornament === "capsule") {
    roundRect(ctx, 80, 188, 15, 790, 999);
    ctx.fill();
  }
}

function drawDnaMeta(
  ctx: CanvasRenderingContext2D,
  identity: string,
  progress: string,
  dna: CarouselStyleDna,
  theme: CarouselCanvasTheme,
  y: number
) {
  ctx.fillStyle = dna.handleColor;
  ctx.font = `${dna.titleWeight >= 800 ? 800 : 700} 26px ${dna.fontFamily === "serif" ? "'Fraunces', Georgia, serif" : dna.fontFamily === "mono" ? "monospace" : "'Plus Jakarta Sans', sans-serif"}`;
  if (dna.align === "center") {
    ctx.textAlign = "center";
    ctx.fillText(identity.slice(0, 34), 540, y);
    ctx.textAlign = "left";
    return;
  }
  ctx.fillText(identity.slice(0, 34), 72, y);
  ctx.fillText(progress, 910, y);
  ctx.fillStyle = theme.accent;
}

function roleAdjustedZone(zone: CarouselKitZone, slideNumber: number, totalSlides: number): CarouselKitZone {
  if (slideNumber === totalSlides) {
    return {
      ...zone,
      y: Math.max(0.34, zone.y),
      h: Math.min(0.26, zone.h + 0.04),
      maxFont: Math.min(zone.maxFont, 76),
    };
  }
  if (slideNumber === 1) {
    return {
      ...zone,
      h: Math.min(0.42, zone.h + 0.08),
      maxFont: zone.maxFont + 8,
    };
  }
  return zone;
}

function drawDnaTextZone(
  ctx: CanvasRenderingContext2D,
  zone: CarouselKitZone,
  text: string,
  theme: CarouselCanvasTheme,
  dna: CarouselStyleDna,
  tone: "title" | "body"
) {
  const x = zone.x * 1080;
  const y = zone.y * 1350;
  const w = zone.w * 1080;
  const h = zone.h * 1350;
  const fontFamily = dna.fontFamily === "serif" ? "'Fraunces', Georgia, serif" : dna.fontFamily === "mono" ? "monospace" : "'Plus Jakarta Sans', sans-serif";
  const color = zone.color ?? (tone === "body" ? dna.bodyColor : dna.titleColor);

  if (dna.highlightMode === "marker" && tone === "title") {
    ctx.fillStyle = colorWithAlpha(theme.accent, 0.24);
    roundRect(ctx, x - 14, y - 26, w * 0.82, Math.min(h, 120), 22);
    ctx.fill();
  }

  drawHighlightedWrappedText(ctx, text, {
    x,
    y,
    maxWidth: w,
    maxHeight: h,
    maxFontSize: zone.maxFont,
    minFontSize: zone.minFont,
    lineHeightRatio: tone === "title" ? 1.08 : 1.28,
    weight: tone === "title" ? dna.titleWeight : dna.bodyWeight,
    color,
    accentColor: dna.highlightColor,
    fontFamily,
    align: dna.align,
    highlightMode: tone === "title" ? dna.highlightMode : "accent_words",
    tracking: dna.tracking,
  });
}

function drawEditorialGoldSlide(
  ctx: CanvasRenderingContext2D,
  slide: CarouselSlide,
  slideNumber: number,
  totalSlides: number,
  identity: string,
  theme: CarouselCanvasTheme
) {
  // Cover treatment: slides 1 + 2 use the dark accent + ornament pattern.
  // Per the carousel research the cover headline is the single biggest
  // determinant of swipe-through; slide counter dropped on cover, body
  // skipped on the absolute cover (slide 1 only — slide 2 is "second
  // hook" and benefits from a body line restating from a different angle).
  const isAbsoluteCover = slideNumber === 1;
  const isCoverPair = slideNumber <= 2;
  const isPayoff = slideNumber === 7;

  ctx.fillStyle = isCoverPair ? theme.accent : "#F5F1EA";
  ctx.fillRect(0, 0, 1080, 1350);
  if (isCoverPair) {
    ctx.fillStyle = "#151515";
    ctx.fillRect(845, 0, 235, 345);
    ctx.fillStyle = "#F7C46C";
    ctx.fillRect(845, 345, 235, 235);
    drawHalfCircles(ctx, 960, 62, "#F5F1EA");
    drawAsterisk(ctx, 960, 462, "#B8892E");
    ctx.fillStyle = "#151515";
    ctx.fillRect(0, 1070, 1080, 280);
  }
  ctx.fillStyle = isCoverPair ? "#FFF8E8" : "#151515";
  ctx.font = "800 36px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(identity.slice(0, 34), 68, 86);
  if (!isAbsoluteCover) {
    ctx.font = "800 28px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(`${slideNumber}/${totalSlides}`, 920, 86);
  }

  fitWrappedText(ctx, slide.title, {
    x: 68,
    y: isCoverPair ? 165 : 315,
    maxWidth: isCoverPair ? 750 : 900,
    maxHeight: isCoverPair ? 700 : 420,
    maxFontSize: isCoverPair ? 120 : 78,
    minFontSize: isCoverPair ? 56 : 42,
    lineHeightRatio: isCoverPair ? 0.92 : 0.95,
    weight: isCoverPair ? 800 : 900,
    color: isCoverPair ? "#FFF8E8" : "#151515",
    fontFamily: isCoverPair
      ? "'Fraunces', 'Plus Jakarta Sans', serif"
      : "'Plus Jakarta Sans', sans-serif",
  });
  // Absolute cover (slide 1) skips the body — let the headline carry alone.
  if (slide.body && !isAbsoluteCover) {
    fitWrappedText(ctx, slide.body, {
      x: 68,
      y: isCoverPair ? 1138 : 830,
      maxWidth: 900,
      maxHeight: 145,
      maxFontSize: 40,
      minFontSize: isCoverPair ? 32 : 26,
      lineHeightRatio: 1.25,
      weight: 500,
      color: isCoverPair ? "#F5F1EA" : "rgba(21,21,21,0.68)",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    });
  }
  // SAVE THIS only on the payoff slide. Hard-sell on every interior
  // slide before this change.
  if (isPayoff) {
    ctx.fillStyle = theme.accent;
    ctx.font = "800 26px Arial";
    ctx.fillText("SAVE THIS", 68, 1010);
  }
  // Swipe-prompt arrow on every slide except the last.
  if (slideNumber < totalSlides) {
    drawSwipeArrow(ctx, isCoverPair ? "#FFF8E8" : "#151515");
  }
  // Subtle grain so the slide reads as a finished asset, not a flat
  // color block.
  drawNoise(ctx, 0.018);
}

function drawForestSandSlide(
  ctx: CanvasRenderingContext2D,
  slide: CarouselSlide,
  slideNumber: number,
  totalSlides: number,
  identity: string,
  theme: CarouselCanvasTheme
) {
  // Cover (slide 1) gets distinct treatment per the carousel research:
  // no slide counter, no body, oversized headline. Cover does 60% of
  // the swipe-through work — every pixel earns its keep.
  const isCover = slideNumber === 1;
  const isPayoff = slideNumber === 7;

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "rgba(56,102,65,0.08)";
  roundRect(ctx, 80, 188, 920, 790, 44);
  ctx.fill();
  ctx.fillStyle = theme.accent;
  roundRect(ctx, 80, 188, 15, 790, 999);
  ctx.fill();

  // Header chrome — handle on cover, full identity + slide counter on
  // interior slides for orientation. The slide counter on the cover
  // reads as instructional and was dropped per the research.
  ctx.fillStyle = theme.subtle;
  ctx.font = "700 28px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(identity.slice(0, 34), 80, 94);
  if (!isCover) {
    ctx.fillText(`${slideNumber}/${totalSlides}`, 900, 94);
  }

  // Forest Sand cover (slide 1) gets Fraunces + bigger headline; interior
  // slides keep Plus Jakarta Sans for the tighter wrap.
  fitWrappedText(ctx, slide.title, {
    x: 130,
    y: isCover ? 290 : 330,
    maxWidth: isCover ? 820 : 800,
    maxHeight: isCover ? 480 : 330,
    maxFontSize: isCover ? 110 : 72,
    minFontSize: isCover ? 56 : 40,
    lineHeightRatio: isCover ? 1.0 : 1.08,
    weight: isCover ? 700 : 800,
    color: theme.text,
    fontFamily: isCover
      ? "'Fraunces', 'Plus Jakarta Sans', serif"
      : "'Plus Jakarta Sans', sans-serif",
  });
  // Cover skips the body line — let the headline carry alone.
  // Interior slides keep the body for the value beat.
  if (slide.body && !isCover) {
    fitWrappedText(ctx, slide.body, {
      x: 130,
      y: 745,
      maxWidth: 740,
      maxHeight: 180,
      maxFontSize: 38,
      minFontSize: isCover ? 32 : 25,
      lineHeightRatio: 1.28,
      weight: 500,
      color: theme.muted,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    });
  }
  // SAVE THIS only on the payoff slide. Was on every interior slide
  // before, which read as hard-sell. Payoff is when the reader actually
  // wants to bookmark.
  if (isPayoff) {
    ctx.fillStyle = theme.accent;
    ctx.font = "800 26px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText("SAVE THIS", 130, 1165);
  }
  // Swipe-prompt arrow on every slide except the last — universal
  // carousel cue that was missing.
  if (slideNumber < totalSlides) {
    drawSwipeArrow(ctx, theme.accent);
  }
  // Subtle grain overlay so the slide reads as a finished asset, not
  // a flat color block. Mirrors the dashboard atmosphere fix.
  drawNoise(ctx, 0.018);
}

function drawHardFactsSlide(
  ctx: CanvasRenderingContext2D,
  slide: CarouselSlide,
  slideNumber: number,
  totalSlides: number,
  identity: string,
  theme: CarouselCanvasTheme
) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 1350);
  gradient.addColorStop(0, "#B9BDC5");
  gradient.addColorStop(0.55, "#767B85");
  gradient.addColorStop(1, "#111111");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);
  drawNoise(ctx, 0.02);

  ctx.save();
  ctx.translate(660, 150);
  ctx.rotate(-0.12);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 36px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(slideNumber === 1 ? "DISCOVER THE HARD FACTS" : identity.slice(0, 28).toUpperCase(), 0, 0);
  ctx.restore();

  fitWrappedText(ctx, slide.title, {
    x: 66,
    y: 270,
    maxWidth: 950,
    maxHeight: 460,
    maxFontSize: 106,
    minFontSize: 48,
    lineHeightRatio: 0.92,
    weight: 900,
    color: "#050505",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  });
  if (slide.body) {
    fitWrappedText(ctx, slide.body, {
      x: 590,
      y: 740,
      maxWidth: 390,
      maxHeight: 210,
      maxFontSize: 36,
      minFontSize: 24,
      lineHeightRatio: 1.28,
      weight: 500,
      color: "#FFFFFF",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    });
  }
  ctx.strokeStyle = "#C8A16A";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(92, 780);
  ctx.lineTo(92, 1240);
  ctx.lineTo(520, 1240);
  ctx.stroke();
  // Slide counter dropped from cover (slide 1) per the carousel research.
  if (slideNumber !== 1) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 28px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(`${slideNumber}/${totalSlides}`, 892, 1245);
  }
  // Universal swipe arrow on every slide except the last.
  if (slideNumber < totalSlides) {
    drawSwipeArrow(ctx, "#C8A16A");
  }
}

function carouselCanvasTheme(
  style: CarouselStyle,
  slideNumber: number,
  accentColor: string,
  customStyle: CarouselCustomStyle | null,
  kitTemplate?: CarouselKitTemplate | null
) {
  const accent = isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT_HEX;
  if (kitTemplate) {
    return {
      bg: kitTemplate.background,
      text: kitTemplate.text,
      muted: colorWithAlpha(kitTemplate.text, 0.76),
      subtle: colorWithAlpha(kitTemplate.text, 0.5),
      accent: kitTemplate.accent,
    };
  }
  if (style === "imported" && customStyle) {
    return {
      bg: customStyle.background,
      text: customStyle.text,
      muted: colorWithAlpha(customStyle.text, 0.72),
      subtle: colorWithAlpha(customStyle.text, 0.46),
      accent: customStyle.accent,
    };
  }
  if (style === "forest_sand") {
    return {
      bg: "#F6F1E8",
      text: "#172116",
      muted: "rgba(23,33,22,0.70)",
      subtle: "rgba(23,33,22,0.42)",
      accent: "#386641",
    };
  }
  if (style === "editorial_gold") {
    return {
      bg: "#B8892E",
      text: "#FFF8E8",
      muted: "rgba(255,248,232,0.72)",
      subtle: "rgba(255,248,232,0.48)",
      accent: "#B8892E",
    };
  }
  if (style === "hard_facts") {
    return {
      bg: "#B1B5BE",
      text: "#050505",
      muted: "rgba(5,5,5,0.68)",
      subtle: "rgba(5,5,5,0.44)",
      accent: "#C8A16A",
    };
  }
  return {
    bg: "#111111",
    text: "#FAFAF8",
    muted: "rgba(250,250,248,0.72)",
    subtle: "rgba(250,250,248,0.44)",
    accent: "#D4A24C",
  };
}

function pickCarouselKitTemplate(
  customStyle: CarouselCustomStyle | null,
  slideNumber: number,
  totalSlides: number
): CarouselKitTemplate | null {
  const templates = customStyle?.templates ?? [];
  if (!templates.length) return null;
  const wantedRole: CarouselKitRole =
    slideNumber === 1 ? "cover" : slideNumber === totalSlides ? "cta" : slideNumber === 5 || slideNumber === 7 ? "quote" : "teaching";
  const roleMatch = templates.find((template) => template.role === wantedRole);
  return roleMatch ?? templates[(slideNumber - 1) % templates.length] ?? templates[0] ?? null;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y + lines * lineHeight);
  }
}

function applyTitleCase(text: string, mode: CarouselStyleDna["titleCase"]): string {
  if (mode === "uppercase") return text.toUpperCase();
  if (mode === "sentence") return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  return text;
}

function drawHighlightedWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    maxHeight: number;
    maxFontSize: number;
    minFontSize: number;
    lineHeightRatio: number;
    weight: number;
    color: string;
    accentColor: string;
    fontFamily: string;
    align: "left" | "center";
    highlightMode: CarouselHighlightMode;
    tracking: CarouselStyleDna["tracking"];
  }
) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;

  let chosenFontSize = options.minFontSize;
  let chosenLines: string[][] = [[clean]];
  for (let fontSize = options.maxFontSize; fontSize >= options.minFontSize; fontSize -= 2) {
    ctx.font = `${options.weight} ${fontSize}px ${options.fontFamily}`;
    const lines = wrapTokenLines(ctx, clean.split(" "), options.maxWidth);
    const lineHeight = fontSize * options.lineHeightRatio;
    if (lines.length * lineHeight <= options.maxHeight) {
      chosenFontSize = fontSize;
      chosenLines = lines;
      break;
    }
  }

  ctx.font = `${options.weight} ${chosenFontSize}px ${options.fontFamily}`;
  const lineHeight = chosenFontSize * options.lineHeightRatio;
  const maxLines = Math.max(1, Math.floor(options.maxHeight / lineHeight));
  const highlighted = selectHighlightWords(clean);
  const visibleLines = chosenLines.slice(0, maxLines);

  visibleLines.forEach((lineTokens, lineIndex) => {
    const line = lineTokens.join(" ");
    const lineWidth = ctx.measureText(line).width;
    let cursorX = options.align === "center" ? options.x + (options.maxWidth - lineWidth) / 2 : options.x;
    const baseline = options.y + lineIndex * lineHeight;

    lineTokens.forEach((token, tokenIndex) => {
      const cleanToken = token.replace(/[^a-zA-Z0-9']/g, "").toLowerCase();
      const shouldHighlight = highlighted.has(cleanToken) && options.highlightMode !== "none";
      const tokenText = tokenIndex === lineTokens.length - 1 ? token : `${token} `;
      const tokenWidth = ctx.measureText(tokenText).width;

      if (shouldHighlight && options.highlightMode === "marker") {
        ctx.fillStyle = colorWithAlpha(options.accentColor, 0.28);
        roundRect(ctx, cursorX - 4, baseline - chosenFontSize * 0.82, tokenWidth + 4, chosenFontSize * 1.05, 7);
        ctx.fill();
      }

      ctx.fillStyle = shouldHighlight ? options.accentColor : options.color;
      if (shouldHighlight && options.highlightMode === "italic_accent") {
        ctx.font = `italic ${options.weight} ${chosenFontSize}px ${options.fontFamily}`;
      } else {
        ctx.font = `${options.weight} ${chosenFontSize}px ${options.fontFamily}`;
      }
      ctx.fillText(tokenText, cursorX, baseline);
      cursorX += tokenWidth;
    });
  });
}

function wrapTokenLines(ctx: CanvasRenderingContext2D, tokens: string[], maxWidth: number): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  for (const token of tokens) {
    const next = [...line, token];
    if (ctx.measureText(next.join(" ")).width > maxWidth && line.length) {
      lines.push(line);
      line = [token];
    } else {
      line = next;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function selectHighlightWords(text: string): Set<string> {
  const stop = new Set(["the", "and", "with", "your", "you", "that", "this", "from", "into", "about", "are", "not", "for", "but", "what", "why", "how"]);
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9']/g, "").toLowerCase())
    .filter((word) => word.length > 3 && !stop.has(word));
  return new Set(words.slice(-2));
}

function fitWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    maxHeight: number;
    maxFontSize: number;
    minFontSize: number;
    lineHeightRatio: number;
    weight: number;
    color: string;
    fontFamily?: string;
    align?: "left" | "center";
  }
) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;

  let chosenFontSize = options.minFontSize;
  let chosenLines: string[] = [clean];
  for (let fontSize = options.maxFontSize; fontSize >= options.minFontSize; fontSize -= 2) {
    ctx.font = `${options.weight} ${fontSize}px ${options.fontFamily ?? "'Plus Jakarta Sans', sans-serif"}`;
    const lines = wrapLines(ctx, clean, options.maxWidth);
    const lineHeight = fontSize * options.lineHeightRatio;
    if (lines.length * lineHeight <= options.maxHeight) {
      chosenFontSize = fontSize;
      chosenLines = lines;
      break;
    }
  }

  ctx.fillStyle = options.color;
  ctx.font = `${options.weight} ${chosenFontSize}px ${options.fontFamily ?? "'Plus Jakarta Sans', sans-serif"}`;
  const lineHeight = chosenFontSize * options.lineHeightRatio;
  const maxLines = Math.max(1, Math.floor(options.maxHeight / lineHeight));
  const visibleLines = chosenLines.slice(0, maxLines);
  visibleLines.forEach((line, index) => {
    const finalLine =
      index === visibleLines.length - 1 && chosenLines.length > visibleLines.length
        ? truncateToWidth(ctx, `${line}...`, options.maxWidth)
        : line;
    if (options.align === "center") {
      ctx.textAlign = "center";
      ctx.fillText(finalLine, options.x + options.maxWidth / 2, options.y + index * lineHeight);
      ctx.textAlign = "left";
      return;
    }
    ctx.fillText(finalLine, options.x, options.y + index * lineHeight);
  });
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.clearRect(-size / 5, -size / 5, size / 2.5, size / 2.5);
  ctx.restore();
}

function drawHalfCircles(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(x, y + i * 94, 62, Math.PI, 0);
    ctx.lineTo(x + 62, y + i * 94);
    ctx.closePath();
    ctx.fill();
  }
}

function drawAsterisk(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 18;
  for (let i = 0; i < 4; i += 1) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-78, 0);
    ctx.lineTo(78, 0);
    ctx.stroke();
  }
  ctx.restore();
}

// Universal "swipe →" cue. Carousels need this on every slide except the
// last so the reader knows the post continues — Marketing Harry uses
// this consistently and it's mentioned across every 2026 carousel
// playbook. Anchored bottom-right, brand accent color, small.
function drawSwipeArrow(ctx: CanvasRenderingContext2D, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "700 38px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("swipe →", 1010, 1290);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawNoise(ctx: CanvasRenderingContext2D, opacity: number) {
  const image = ctx.getImageData(0, 0, 1080, 1350);
  for (let i = 0; i < image.data.length; i += 16) {
    const noise = Math.random() * 255 * opacity;
    image.data[i] = Math.min(255, image.data[i] + noise);
    image.data[i + 1] = Math.min(255, image.data[i + 1] + noise);
    image.data[i + 2] = Math.min(255, image.data[i + 2] + noise);
  }
  ctx.putImageData(image, 0, 0);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  let next = text;
  while (next.length > 1 && ctx.measureText(next).width > maxWidth) {
    next = `${next.slice(0, -4).trimEnd()}...`;
  }
  return next;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "carousel";
}

function getLeadSignals(leads: Lead[]): string[] {
  const painCounts = new Map<string, number>();
  for (const lead of leads) {
    for (const pain of lead.pain_signal ?? []) {
      const label = PAIN_SIGNAL_LABEL[pain as PainSignal] ?? pain;
      painCounts.set(label, (painCounts.get(label) ?? 0) + 1);
    }
  }

  const painLines = [...painCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => `${label} is showing up across ${count} ${count === 1 ? "lead" : "leads"}.`);

  const noteLines = leads
    .map((lead) => lead.notes?.trim())
    .filter((note): note is string => Boolean(note))
    .slice(0, 2)
    .map((note) => `Lead note: ${note.slice(0, 140)}`);

  return [...painLines, ...noteLines].slice(0, 5);
}

function summarizeSources(sources: VoiceTrainingSource[]): { primary: string; detail: string } {
  if (sources.length === 0) {
    return { primary: "None yet", detail: "import voice to sharpen drafts" };
  }
  const counts = sources.reduce<Record<string, number>>((acc, source) => {
    acc[source.source_type] = (acc[source.source_type] ?? 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topType, topCount] = entries[0] ?? ["source", 0];
  return {
    primary: `${topCount} ${topType.replaceAll("_", " ")}`,
    detail: entries.map(([type, count]) => `${count} ${type.replaceAll("_", " ")}`).join(", "),
  };
}

function voiceLines(
  stats: ReturnType<typeof getVoiceAssetStats>,
  sourceDetail: string
): string[] {
  return [
    `${stats.totalSignals} voice signals are available for drafting.`,
    `${stats.posts} posts, ${stats.audioHours} audio hours, ${stats.salesCalls} sales calls tracked.`,
    sourceDetail,
    `${stats.confidence} voice confidence.`,
  ];
}
