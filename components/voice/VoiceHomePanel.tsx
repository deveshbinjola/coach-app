"use client";

// VoiceHomePanel, the entire /voice page's interactive shell.
//
// Two top-level states:
//   1. No active profile -> Native 5-question VoiceSetupFlow as the primary
//      path. Below it: collapsible "I'd rather paste captions" alternate
//      using the existing VoiceMinePanel inline.
//   2. Active profile    -> Profile card showing tone/vocabulary/etc. +
//      "Refine voice" toggle that swaps in the setup flow on demand.
//
// Why one component instead of three pages: a coach who completed setup
// often wants to see the result AND iterate. Forcing them to a separate
// /voice/mine route was friction. Now: one home, all paths visible.

import { useState } from "react";
import type { ReactNode } from "react";
import { Badge, Button, Card, Select, Textarea } from "@/components/ui";
import VoiceSetupFlow from "@/components/VoiceSetupFlow";
import VoiceMinePanel from "@/components/VoiceMinePanel";
import { createClient } from "@/lib/supabase-browser";
import { DEFAULT_VOICE_PROFILE_SLUG, type VoiceProfileSlug } from "@/lib/voice-profiles";
import {
  editLearningExamples,
  summarizeEditLearning,
  suggestVoiceMemoryRules,
  voiceMemoryRules,
  type VoiceMemoryRule,
} from "@/lib/voice-trust";
import { getVoiceAssetStats } from "@/lib/voice-asset";
import { VoiceAssetPanel, VoiceStatusHero } from "@/components/voice/VoiceHero";
import type { BrandVoiceOverlay } from "@/lib/brand-os/voice-overlay";
import type { BrandOsRunState } from "@/lib/brand-os/run-state";
import type {
  Content,
  Lead,
  LeadMessage,
  VoiceProfile,
  VoiceTrainingSource,
} from "@/lib/types";

type VoiceShape = {
  tone?:               string[];
  sentence_rhythm?:    string;
  vocabulary?:         { use?: string[]; avoid?: string[] };
  openers?:            string[];
  closers?:            string[];
  ctas?:               string[];
  emotional_register?: string;
  do_nots?:            string[];
};

type Props = {
  profile: VoiceProfile | null;
  messages?: LeadMessage[];
  content?: Content[];
  leads?: Lead[];
  trainingSources?: VoiceTrainingSource[];
  /** Audience-aware voice profile slug. Drives Q1–Q3 cue copy in VoiceSetupFlow. */
  voiceProfileSlug?: VoiceProfileSlug;
  /** Brand voice overlay — feeds Voice lock calibration + Brand OS CTA state. */
  brandOverlay?: BrandVoiceOverlay | null;
  /** Resolved Brand OS run state — controls the CTA copy + destination. */
  brandOsState?: BrandOsRunState;
};

type AltPath = "interview" | "captions";
type VoiceImportSource = "instagram" | "linkedin" | "newsletter";

export default function VoiceHomePanel({
  profile,
  messages = [],
  content = [],
  leads = [],
  trainingSources = [],
  voiceProfileSlug = DEFAULT_VOICE_PROFILE_SLUG,
  brandOverlay = null,
  brandOsState = { kind: "none" },
}: Props) {
  const [activeProfile, setActiveProfile] = useState(profile);
  const [sources, setSources] = useState(trainingSources);
  const hasProfile = !!activeProfile;
  // Distinct training-source types feed the voice-lock diversity score.
  const trainingTypeCount = new Set(sources.map((s) => s.source_type)).size;
  const [refining, setRefining] = useState(false);
  // Default to the interview when no profile exists; coach can flip to
  // captions if they have public writing handy.
  const [altPath, setAltPath] = useState<AltPath>("interview");

  // No profile yet, setup first.
  if (!hasProfile) {
    return (
      <div className="space-y-8">
        <VoiceStatusHero
          profile={null}
          overlay={brandOverlay}
          trainingSourceCount={sources.length}
          trainingTypeCount={trainingTypeCount}
        />
        <BrandOsCta state={brandOsState} />
        <FrameworkCta />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
          <div className="space-y-5">
            <PathSwitcher altPath={altPath} onChange={setAltPath} />
            {altPath === "interview" ? <VoiceSetupFlow profileSlug={voiceProfileSlug} /> : <VoiceMinePanel />}
          </div>
          <VoiceSetupNote hasProfile={false} />
        </div>
      </div>
    );
  }

  // Active profile, display and refine on demand.
  const assetStats = getVoiceAssetStats({
    profile: activeProfile,
    messages,
    content,
    leads,
  });
  const pendingRules = sources.reduce(
    (total, source) =>
      total +
      source.extracted_rules.filter(
        (rule) => !(source.approved_rule_ids ?? []).includes(rule.id)
      ).length,
    0
  );
  const hasSourceImport = sources.some((source) =>
    source.source_type === "instagram" ||
    source.source_type === "linkedin" ||
    source.source_type === "newsletter"
  );
  // ── Compose-on-Top: one Workbench panel holds compose + history together.
  // The action (import / transcript) lives directly above the list it feeds.
  // No more "click at the bottom, result appears at the top" yo-yo.
  return (
    <div className="space-y-6">
      {/* ── STATUS: where voice is at, in one glance ────────── */}
      <VoiceStatusHero
        profile={activeProfile!}
        overlay={brandOverlay}
        trainingSourceCount={sources.length}
        trainingTypeCount={trainingTypeCount}
      />
      <BrandOsCta state={brandOsState} />
      <FrameworkCta />
      <VoiceAssetPanel
        stats={assetStats}
        sourceCount={sources.length}
        pendingRules={pendingRules}
      />

      {/* ── THE WORKBENCH: compose + history, adjacent ──────── */}
      <Workbench
        profile={activeProfile!}
        onProfileChange={setActiveProfile}
        sources={sources}
        onSourcesChange={setSources}
        pendingRules={pendingRules}
      />

      {/* ── REFERENCE: collapsed by default ─────────────────── */}
      <div className="space-y-3">
        <DisclosureSection
          id="voice-map"
          title="Voice DNA"
          description="The raw profile — tone, rhythm, vocabulary, openers, closers, CTAs, and do-nots."
          defaultOpen={false}
        >
          <CompletedView profile={activeProfile!} compact />
        </DisclosureSection>

        <DisclosureSection
          id="voice-edit-learning"
          title="Edit learning"
          description="What the app learned from drafts you changed before sending."
          defaultOpen={false}
        >
          <EditLearningPanel
            profile={activeProfile!}
            messages={messages}
            onProfileChange={setActiveProfile}
          />
        </DisclosureSection>
      </div>

      {!refining ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
          <Card variant="elevated" padding="lg">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <Badge tone="brand" size="xs" uppercase>
                  Keep it sharp
                </Badge>
                <h2 className="text-[length:var(--t-h2)] font-bold mt-2 text-[color:var(--text)] leading-[var(--leading-tight)]">
                  Voice should improve as you sell.
                </h2>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5 max-w-xl leading-[var(--leading-base)]">
                  Re-run the questions or paste newer captions when your market,
                  offer, or style changes. A new active version is saved without
                  destroying the old one.
                </p>
              </div>
              <Button onClick={() => setRefining(true)}>
                Refine voice
              </Button>
            </div>
          </Card>
          <VoiceSetupNote hasProfile />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[length:var(--t-h2)] font-bold text-[color:var(--text)] leading-[var(--leading-tight)]">
              Refine voice
            </h2>
            <button
              type="button"
              onClick={() => setRefining(false)}
              className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] underline decoration-dotted underline-offset-4"
            >
              Cancel
            </button>
          </div>
          <PathSwitcher altPath={altPath} onChange={setAltPath} />
          {altPath === "interview" ? (
            <VoiceSetupFlow variant="embedded" profileSlug={voiceProfileSlug} />
          ) : (
            <VoiceMinePanel />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Workbench — the Compose-on-Top panel.
//
// One container holds the compose surface and the training history. Compose
// stays at the top, history grows downward. New imports land directly below
// the action that created them. No yo-yo, no scrolling back up.
//
// Tab strip switches between "Import URL" (public writing — IG/LinkedIn/
// newsletter) and "Add transcript" (sales call / voice note / workshop).
// ─────────────────────────────────────────────────────────────────────────

type WorkbenchTab = "import" | "transcript";

function Workbench({
  profile,
  onProfileChange,
  sources,
  onSourcesChange,
  pendingRules,
}: {
  profile: VoiceProfile;
  onProfileChange: (p: VoiceProfile) => void;
  sources: VoiceTrainingSource[];
  onSourcesChange: (sources: VoiceTrainingSource[]) => void;
  pendingRules: number;
}) {
  const [tab, setTab] = useState<WorkbenchTab>("import");

  const onSourceAdded = (source: VoiceTrainingSource) => {
    onSourcesChange([source, ...sources]);
  };

  return (
    <Card variant="elevated" padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-[var(--border-faint)]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)] leading-tight">
                Voice workbench
              </h2>
              <Badge tone="brand" size="xs" uppercase>
                {sources.length} {sources.length === 1 ? "source" : "sources"}
              </Badge>
              {pendingRules > 0 && (
                <Badge tone="warning" size="xs" uppercase>
                  {pendingRules} pending
                </Badge>
              )}
            </div>
            <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed max-w-2xl">
              Add a source above, see it land below. Public writing and
              recorded conversations both feed the same voice asset.
            </p>
          </div>
        </div>

        {/* Tab strip */}
        <div className="mt-4 flex items-center gap-1 border-b border-[var(--border)] -mb-px">
          {[
            { id: "import" as const, label: "Import URL", hint: "IG · LinkedIn · Newsletter" },
            { id: "transcript" as const, label: "Add transcript", hint: "Call · voice note · workshop" },
          ].map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-selected={on}
                role="tab"
                className={`px-4 py-2.5 -mb-px text-left border-b-2 transition ${
                  on
                    ? "border-[var(--brand-strong)] text-[color:var(--text)]"
                    : "border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                }`}
              >
                <span className="block text-[length:var(--t-body)] font-bold leading-tight">
                  {t.label}
                </span>
                <span className="block text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)] mt-0.5">
                  {t.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compose surface */}
      <div className="p-5 sm:p-6 bg-[var(--surface)]">
        {tab === "import" ? (
          <VoiceImportPanel
            profile={profile}
            onProfileChange={onProfileChange}
            onSourceAdded={onSourceAdded}
          />
        ) : (
          <TranscriptSignalPanel
            profile={profile}
            onProfileChange={onProfileChange}
            onSourceAdded={onSourceAdded}
          />
        )}
      </div>

      {/* Training history — collapsible */}
      <div className="px-5 py-4 sm:px-6 sm:py-5 border-t border-[var(--border-faint)] bg-[var(--surface-elevated)]">
        <DisclosureSection
          title="Training history"
          description={sources.length === 0 ? "Nothing yet — add the first source above." : `Newest first · ${sources.length} saved`}
          defaultOpen={false}
        >
          <TrainingHistoryPanel
            profile={profile}
            sources={sources}
            onProfileChange={onProfileChange}
            onSourcesChange={onSourcesChange}
          />
        </DisclosureSection>
      </div>
    </Card>
  );
}

function DisclosureSection({
  id,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      id={id}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="group scroll-mt-24 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
            {title}
          </div>
          <div className="mt-0.5 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
            {description}
          </div>
        </div>
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[color:var(--text-muted)] transition group-open:rotate-45"
          aria-hidden
        >
          +
        </span>
      </summary>
      <div className="border-t border-[var(--border-faint)] p-3 sm:p-4">
        {children}
      </div>
    </details>
  );
}

function EditLearningPanel({
  profile,
  messages,
  onProfileChange,
}: {
  profile: VoiceProfile;
  messages: LeadMessage[];
  onProfileChange: (profile: VoiceProfile) => void;
}) {
  const learning = summarizeEditLearning(messages);
  const examples = editLearningExamples(messages, 3);
  const approvedMemory = voiceMemoryRules(profile);
  const suggestedMemory = suggestVoiceMemoryRules(messages, approvedMemory);
  const confidenceLabel =
    learning.confidence === "real"
      ? "Real signal"
      : learning.confidence === "preliminary"
        ? "Early signal"
        : "Needs edits";
  const direction =
    learning.tendency === "shortens"
      ? "You make drafts tighter."
      : learning.tendency === "expands"
        ? "You add more context."
        : learning.tendency === "keeps_length"
          ? "You keep the shape and change the words."
          : "The app learns after edited AI drafts.";

  return (
    <Card padding="lg" className="border-[color-mix(in_srgb,var(--brand)_28%,var(--border))]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="brand" size="xs" uppercase>
              Edit learning
            </Badge>
            <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
              {confidenceLabel} · {learning.sampleSize} edited drafts
            </span>
          </div>
          <h2 className="text-[length:var(--t-h2)] font-bold mt-2 text-[color:var(--text)] leading-[var(--leading-tight)]">
            {direction}
          </h2>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5 max-w-2xl leading-[var(--leading-base)]">
            Every time a coach edits an AI draft before sending, the app captures
            what changed. This is the loop that makes Voice more than a profile.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 min-w-[220px]">
          <LearningStat
            label="Confidence"
            value={
              learning.confidence === "real"
                ? "Real"
                : learning.confidence === "preliminary"
                  ? "Early"
                : "Low"
            }
          />
          <LearningStat
            label="Length"
            value={
              learning.averageLengthChangePct === null
                ? "0%"
                : `${learning.averageLengthChangePct > 0 ? "+" : ""}${learning.averageLengthChangePct}%`
            }
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <LearningList title="Patterns" items={learning.patterns} />
        <LearningList title="Next drafts should" items={learning.nextActions} />
      </div>

      <VoiceMemoryPanel
        profile={profile}
        approved={approvedMemory}
        suggestions={suggestedMemory}
        onProfileChange={onProfileChange}
      />

      {examples.length > 0 && (
        <div className="mt-5">
          <div className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Before and after
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {examples.map((example) => (
              <EditExampleCard key={example.id} example={example} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function VoiceMemoryPanel({
  profile,
  approved,
  suggestions,
  onProfileChange,
}: {
  profile: VoiceProfile;
  approved: VoiceMemoryRule[];
  suggestions: VoiceMemoryRule[];
  onProfileChange: (profile: VoiceProfile) => void;
}) {
  const supabase = createClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const ignored = voiceIgnoredRules(profile);
  const visibleSuggestions = suggestions.filter(
    (rule) => !ignored.some((item) => item.id === rule.id)
  );

  async function saveMemoryPatch(nextApproved: VoiceMemoryRule[], nextIgnored = ignored) {
    const nextVoiceJson = {
      ...profile.voice_json,
      memory: {
        ...((profile.voice_json.memory as Record<string, unknown> | undefined) ?? {}),
        approved_rules: nextApproved,
        ignored_rules: nextIgnored,
      },
    };
    const { data, error } = await supabase
      .from("cp_voice_profiles")
      .update({ voice_json: nextVoiceJson })
      .eq("id", profile.id)
      .eq("coach_id", profile.coach_id)
      .select("*")
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    onProfileChange((data as VoiceProfile | null) ?? { ...profile, voice_json: nextVoiceJson });
  }

  async function approveRule(rule: VoiceMemoryRule, text = rule.text) {
    setSavingId(rule.id);
    try {
      const nextRule: VoiceMemoryRule = {
        ...rule,
        id: rule.id,
        text: text.trim(),
        approved_at: new Date().toISOString(),
      };
      await saveMemoryPatch([...approved, nextRule]);
      setEditingId(null);
      setEditText("");
    } finally {
      setSavingId(null);
    }
  }

  async function ignoreRule(rule: VoiceMemoryRule) {
    setSavingId(rule.id);
    try {
      await saveMemoryPatch(approved, [...ignored, rule]);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div
      id="voice-memory"
      className="mt-5 rounded-[var(--r-lg)] border border-[color-mix(in_srgb,var(--brand)_24%,var(--border))] bg-[var(--surface-elevated)] p-4 scroll-mt-24"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Voice memory
          </div>
          <h3 className="text-[length:var(--t-h3)] font-bold text-[color:var(--text)] mt-1 leading-[var(--leading-tight)]">
            Approve the rules your assistant should remember.
          </h3>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 max-w-2xl leading-[var(--leading-base)]">
            Edit learning finds patterns. Voice Memory only saves the ones the
            coach approves, then future draft tuning reads them from the active profile.
          </p>
        </div>
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
          {approved.length} approved
        </span>
      </div>

      {approved.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {approved.map((rule) => (
            <span
              key={rule.id}
              className="inline-flex items-center rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[length:var(--t-caption)] font-bold text-[color:var(--text)]"
            >
              {rule.text}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        {visibleSuggestions.length === 0 ? (
          <div className="md:col-span-2 rounded-[var(--r-md)] bg-[var(--surface-deep)] p-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            Send or log more edited AI drafts. Memory suggestions will appear here.
          </div>
        ) : (
          visibleSuggestions.map((rule) => (
            <div
              key={rule.id}
              className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-3"
            >
              {editingId === rule.id ? (
                <textarea
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  rows={2}
                  className="w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                />
              ) : (
                <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)] leading-[var(--leading-base)]">
                  {rule.text}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                  {rule.confidence === "real" ? "Real signal" : "Early signal"}
                </span>
                <div className="flex items-center gap-1.5">
                  {editingId === rule.id ? (
                    <button
                      type="button"
                      onClick={() => approveRule(rule, editText)}
                      disabled={savingId === rule.id || !editText.trim()}
                      className="inline-flex h-8 items-center justify-center rounded-[var(--r-sm)] bg-[var(--navy)] px-3 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--brand)] hover:opacity-90 disabled:opacity-50 transition"
                    >
                      {savingId === rule.id ? "Saving..." : "Save"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(rule.id);
                          setEditText(rule.text);
                        }}
                        className="inline-flex h-8 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] px-3 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => ignoreRule(rule)}
                        disabled={savingId === rule.id}
                        className="inline-flex h-8 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] px-3 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)] hover:text-[color:var(--text)] disabled:opacity-50 transition"
                      >
                        Ignore
                      </button>
                      <button
                        type="button"
                        onClick={() => approveRule(rule)}
                        disabled={savingId === rule.id}
                        className="inline-flex h-8 items-center justify-center rounded-[var(--r-sm)] bg-[var(--navy)] px-3 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--brand)] hover:opacity-90 disabled:opacity-50 transition"
                      >
                        {savingId === rule.id ? "Saving..." : "Approve"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function voiceIgnoredRules(profile: VoiceProfile): VoiceMemoryRule[] {
  const memory = (profile.voice_json.memory as Record<string, unknown> | undefined) ?? {};
  return Array.isArray(memory.ignored_rules)
    ? (memory.ignored_rules as VoiceMemoryRule[])
    : [];
}

function EditExampleCard({
  example,
}: {
  example: ReturnType<typeof editLearningExamples>[number];
}) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
          Coach edit
        </div>
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
          {example.changeLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-[var(--r-sm)] bg-[var(--surface-deep)] p-3">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            AI draft
          </div>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
            {example.original}
          </p>
        </div>
        <div className="rounded-[var(--r-sm)] bg-[var(--brand-soft)] p-3">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            You sent
          </div>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text)] leading-[var(--leading-base)]">
            {example.final}
          </p>
        </div>
      </div>
    </div>
  );
}

function LearningStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-deep)] px-3 py-2.5">
      <div className="text-[length:var(--t-label)] font-bold text-[color:var(--text-faint)]">
        {label}
      </div>
      <div className="mt-1 text-lg font-extrabold leading-none tabular-nums text-[color:var(--text)] truncate">
        {value}
      </div>
    </div>
  );
}

function LearningList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-3">
      <div className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
        {title}
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 4).map((item) => (
          <li
            key={item}
            className="text-[length:var(--t-caption)] text-[color:var(--text)] leading-[var(--leading-base)]"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function VoiceImportPanel({
  profile,
  onProfileChange,
  onSourceAdded,
}: {
  profile: VoiceProfile;
  onProfileChange: (profile: VoiceProfile) => void;
  onSourceAdded: (source: VoiceTrainingSource) => void;
}) {
  const [sourceType, setSourceType] = useState<VoiceImportSource>("instagram");
  const [linkedinMode, setLinkedinMode] = useState<"handle" | "paste">("handle");
  const [newsletterMode, setNewsletterMode] = useState<"url" | "paste">("url");
  const [handle, setHandle] = useState("");
  const [newsletterUrl, setNewsletterUrl] = useState("");
  const [limit, setLimit] = useState("18");
  const [title, setTitle] = useState("");
  const [textImport, setTextImport] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{
    handle: string;
    captionsUsed: number;
    rules: number;
    patterns: Array<{ label: string; text: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const importReady =
    sourceType === "instagram"
      ? normalizeHandleForUi(handle).length > 0
      : sourceType === "linkedin" && linkedinMode === "handle"
        ? normalizeLinkedInHandleForUi(handle).length > 0
        : sourceType === "newsletter" && newsletterMode === "url"
          ? newsletterUrl.trim().length > 0
      : textImport.trim().length >= 120;
  const limitValue = Math.max(3, Math.min(50, Math.round(Number(limit) || 18)));
  const currentVoiceJson = profile.voice_json as Record<string, unknown>;
  const trainingSignal = asRecord(currentVoiceJson.training_signal);
  const currentPosts = numericUiValue(trainingSignal.posts) + numericUiValue(trainingSignal.captions_used);

  async function importVoice() {
    setError(null);
    setSaved(null);
    setUpgradeRequired(false);
    if (!importReady) {
      setError(
        sourceType === "instagram"
          ? "Add an Instagram handle or profile URL."
          : sourceType === "linkedin" && linkedinMode === "handle"
            ? "Add a LinkedIn handle or profile URL."
            : sourceType === "newsletter" && newsletterMode === "url"
              ? "Add a beehiiv publication URL or RSS feed URL."
          : "Paste at least a few real paragraphs."
      );
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        sourceType === "instagram"
          ? "/api/voice/import/instagram"
          : sourceType === "linkedin" && linkedinMode === "handle"
            ? "/api/voice/import/linkedin"
          : "/api/voice/import/text",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sourceType === "instagram"
            ? { handle, limit: limitValue }
            : sourceType === "linkedin" && linkedinMode === "handle"
              ? { handle, limit: limitValue }
            : {
                source_type: sourceType,
                title: title.trim(),
                url: sourceType === "newsletter" && newsletterMode === "url" ? newsletterUrl.trim() : undefined,
                text: textImport.trim(),
              }
        ),
      });
      const payload = await response.json();
      if (!response.ok) {
        setUpgradeRequired(Boolean(payload?.upgrade_required));
        setError(String(payload?.error ?? "Could not import Instagram voice."));
        return;
      }

      onProfileChange(payload.profile as VoiceProfile);
      onSourceAdded(payload.source as VoiceTrainingSource);
      setSaved({
        handle:
          sourceType === "instagram" || (sourceType === "linkedin" && linkedinMode === "handle")
            ? String(payload.handle ?? normalizeHandleForUi(handle))
            : sourceTypeLabel(sourceType),
        captionsUsed: Number(payload.captions_used ?? payload.imported_units ?? 0),
        rules: Array.isArray(payload.extracted_rules) ? payload.extracted_rules.length : 0,
        patterns: Array.isArray(payload.learned_patterns) ? payload.learned_patterns : [],
      });
      setHandle("");
      setNewsletterUrl("");
      setTitle("");
      setTextImport("");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function startUpgrade() {
    setUpgrading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload?.url) {
        setError(String(payload?.error ?? "Could not start checkout."));
        return;
      }
      window.location.href = payload.url;
    } catch (err) {
      setError(String(err));
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <Card padding="lg" className="border-[color-mix(in_srgb,var(--brand)_26%,var(--border))]">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div>
          <Badge tone="brand" size="xs" uppercase>
            Import system
          </Badge>
          <h2 className="mt-2 text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] leading-[var(--leading-tight)]">
            Train the assistant on proof, not guesses.
          </h2>
          <p className="mt-1.5 max-w-2xl text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
            Import Instagram, LinkedIn, or newsletter writing into the Voice
            Asset. The coach sees exactly what trained the asset before any
            rule becomes approved memory.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-[var(--r-md)] bg-[var(--surface-deep)] p-1">
            {(["instagram", "linkedin", "newsletter"] as VoiceImportSource[]).map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => {
                  setSourceType(source);
                  setError(null);
                  setSaved(null);
                  setUpgradeRequired(false);
                }}
                className={[
                  "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                  sourceType === source
                    ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                    : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                ].join(" ")}
              >
                {sourceTypeLabel(source)}
              </button>
            ))}
          </div>

          {sourceType === "instagram" || (sourceType === "linkedin" && linkedinMode === "handle") ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
              {sourceType === "linkedin" && (
                <div className="sm:col-span-2 grid grid-cols-2 gap-2 rounded-[var(--r-md)] bg-[var(--surface-deep)] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLinkedinMode("handle");
                      setError(null);
                      setSaved(null);
                    }}
                    className={[
                      "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                      linkedinMode === "handle"
                        ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                    ].join(" ")}
                  >
                    Handle / URL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkedinMode("paste");
                      setError(null);
                      setSaved(null);
                    }}
                    className={[
                      "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                      linkedinMode === "paste"
                        ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                    ].join(" ")}
                  >
                    Paste posts
                  </button>
                </div>
              )}
              <label className="block space-y-1">
                <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                  {sourceType === "instagram" ? "Instagram handle" : "LinkedIn handle"}
                </span>
                <input
                  value={handle}
                  onChange={(event) => {
                    setHandle(event.target.value);
                    setSaved(null);
                    setError(null);
                  }}
                  className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                  placeholder={sourceType === "instagram" ? "@coachname or profile URL" : "handle or linkedin.com/in/profile"}
                />
              </label>
              <label className="block space-y-1">
                <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                  {sourceType === "instagram" ? "Posts" : "Posts"}
                </span>
                <input
                  type="number"
                  min="3"
                  max="50"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                />
              </label>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {sourceType === "newsletter" && (
                <div className="grid grid-cols-2 gap-2 rounded-[var(--r-md)] bg-[var(--surface-deep)] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setNewsletterMode("url");
                      setError(null);
                      setSaved(null);
                    }}
                    className={[
                      "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                      newsletterMode === "url"
                        ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                    ].join(" ")}
                  >
                    URL / RSS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewsletterMode("paste");
                      setError(null);
                      setSaved(null);
                    }}
                    className={[
                      "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                      newsletterMode === "paste"
                        ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                    ].join(" ")}
                  >
                    Paste issue
                  </button>
                </div>
              )}
              {sourceType === "newsletter" && newsletterMode === "url" && (
                <label className="block space-y-1">
                  <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                    Newsletter URL
                  </span>
                  <input
                    value={newsletterUrl}
                    onChange={(event) => {
                      setNewsletterUrl(event.target.value);
                      setSaved(null);
                      setError(null);
                    }}
                    className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                    placeholder="https://sunnys-newsletter.beehiiv.com/ or RSS feed URL"
                  />
                </label>
              )}
              <label className="block space-y-1">
                <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                  placeholder={sourceType === "linkedin" ? "LinkedIn posts from May" : "Newsletter issue or sequence"}
                />
              </label>
              {(sourceType !== "newsletter" || newsletterMode === "paste") && (
              <Textarea
                label={sourceType === "linkedin" ? "LinkedIn posts" : "Newsletter writing"}
                value={textImport}
                onChange={(event) => {
                  setTextImport(event.target.value);
                  setSaved(null);
                  setError(null);
                }}
                rows={8}
                placeholder={
                  sourceType === "linkedin"
                    ? "Paste 2-5 LinkedIn posts. Hooks, stories, comments, and CTAs are all useful."
                    : "Paste a newsletter, welcome sequence, or email that sounds unmistakably like you."
                }
              />
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-[var(--r-md)] bg-[var(--danger-soft)] px-3 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--danger)]">
              {error}
            </p>
          )}
          {saved && (
            <div className="mt-4 rounded-[var(--r-lg)] border border-[color-mix(in_srgb,var(--brand)_28%,var(--border))] bg-[var(--brand-soft)] p-4">
              <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                Imported {sourceType === "instagram" ? `@${saved.handle}` : saved.handle}: {saved.captionsUsed} source unit{saved.captionsUsed === 1 ? "" : "s"} and {saved.rules} rule{saved.rules === 1 ? "" : "s"} for review.
              </p>
              {saved.patterns.length > 0 && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {saved.patterns.map((pattern) => (
                    <div
                      key={`${pattern.label}:${pattern.text}`}
                      className="rounded-[var(--r-md)] bg-[var(--surface-elevated)] p-3"
                    >
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                        {pattern.label}
                      </div>
                      <div className="mt-1 text-[length:var(--t-caption)] font-bold leading-[var(--leading-base)] text-[color:var(--text)]">
                        {pattern.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-[var(--r-lg)] bg-[var(--surface-deep)] p-4 flex flex-col justify-between gap-5">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
              What this trains
            </div>
            <div className="mt-3 space-y-2">
              <TranscriptUpdateRow label={`${sourceTypeLabel(sourceType)} mode`} value="Updated" />
              <TranscriptUpdateRow
                label={sourceType === "instagram" ? "Captions imported" : "Writing blocks"}
                value={sourceType === "instagram" ? `+${limitValue}` : `+${Math.max(1, textImport.split(/\n{2,}/).filter((block) => block.trim().length >= 40).length)}`}
              />
              <TranscriptUpdateRow label="Current post signal" value={String(currentPosts)} />
            </div>
            <p className="mt-3 text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
              One source import is included each month. Upgrade for more
              imports when you are training heavier voice assets.
            </p>
            {upgradeRequired && (
              <div className="mt-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_32%,var(--border))] bg-[var(--surface-elevated)] p-3">
                <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                  Need another import this month?
                </div>
                <p className="mt-1 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
                  Upgrade to unlock additional imports and keep training the
                  asset from more source material.
                </p>
              </div>
            )}
          </div>
          <Button
            onClick={importVoice}
            disabled={saving || !importReady}
            className="w-full justify-center"
          >
            {saving ? "Importing..." : `Import ${sourceTypeLabel(sourceType)} voice`}
          </Button>
          {upgradeRequired && (
            <Button
              variant="ghost"
              onClick={startUpgrade}
              disabled={upgrading}
              className="w-full justify-center"
            >
              {upgrading ? "Opening checkout..." : "Upgrade for more imports"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function TranscriptSignalPanel({
  profile,
  onProfileChange,
  onSourceAdded,
}: {
  profile: VoiceProfile;
  onProfileChange: (profile: VoiceProfile) => void;
  onSourceAdded: (source: VoiceTrainingSource) => void;
}) {
  const [kind, setKind] = useState<"sales_call" | "voice_note" | "workshop">("sales_call");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [transcript, setTranscript] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRules, setLastRules] = useState<VoiceTrainingSource["extracted_rules"]>([]);
  const transcriptReady = transcript.trim().length >= 80 || !!audioFile;
  const minutesValue = Math.max(0, Math.round(Number(minutes) || 0));

  async function saveTranscriptSignal() {
    setError(null);
    setSaved(false);
    setLastRules([]);
    if (!transcriptReady) {
      setError("Paste a transcript or upload an audio file.");
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.set("source_type", kind);
      form.set("title", title.trim());
      form.set("duration_minutes", String(minutesValue));
      form.set("transcript", transcript.trim());
      if (audioFile) form.set("audio", audioFile);

      const response = await fetch("/api/voice/training-sources", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(String(payload?.error ?? "Could not save training source."));
        return;
      }

      onProfileChange(payload.profile as VoiceProfile);
      onSourceAdded(payload.source as VoiceTrainingSource);
      setLastRules((payload.extracted_rules ?? []) as VoiceTrainingSource["extracted_rules"]);
      setTranscript("");
      setAudioFile(null);
      setTitle("");
      setSaved(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="border-[color-mix(in_srgb,var(--brand)_22%,var(--border))]">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div>
          <Badge tone="brand" size="xs" uppercase>
            Add voice signal
          </Badge>
          <h2 className="mt-2 text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] leading-[var(--leading-tight)]">
            Capture the way you sound on real calls.
          </h2>
          <p className="mt-1.5 max-w-2xl text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
            Paste a transcript from a sales call, voice note, or workshop.
            The app adds it to your Voice Asset so the moat gets stronger
            after real conversations.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
            <Select
              label="Signal type"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as "sales_call" | "voice_note" | "workshop")
              }
            >
              <option value="sales_call">Sales call</option>
              <option value="voice_note">Voice note</option>
              <option value="workshop">Workshop</option>
            </Select>
            <label className="block space-y-1">
              <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                Minutes
              </span>
              <input
                type="number"
                min="0"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
              />
            </label>
          </div>

          <label className="mt-3 block space-y-1">
            <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
              Title
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
              placeholder="April enrollment call, workshop Q&A, voice note"
            />
          </label>

          <label className="mt-3 block space-y-1">
            <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
              Audio file
            </span>
            <input
              type="file"
              accept="audio/*,.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm"
              onChange={(event) => {
                setAudioFile(event.target.files?.[0] ?? null);
                setSaved(false);
              }}
              className="block w-full text-[length:var(--t-caption)] text-[color:var(--text-muted)] file:mr-3 file:rounded-[var(--r-sm)] file:border-0 file:bg-[var(--surface-deep)] file:px-3 file:py-2 file:text-[length:var(--t-caption)] file:font-bold file:text-[color:var(--text)]"
            />
            <span className="block text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Uses transcription when `OPENAI_API_KEY` is configured. Max 25 MB.
            </span>
          </label>

          <Textarea
            className="mt-3"
            label="Transcript fallback"
            value={transcript}
            onChange={(event) => {
              setTranscript(event.target.value);
              setSaved(false);
            }}
            rows={7}
            error={error ?? undefined}
            placeholder="Paste the raw transcript here if you do not upload audio, or use it as a backup. Real sales language, objections, stories, and spoken rhythm are the good stuff."
          />
        </div>

        <div className="rounded-[var(--r-lg)] bg-[var(--surface-deep)] p-4 flex flex-col justify-between gap-5">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
              What this updates
            </div>
            <div className="mt-3 space-y-2">
              <TranscriptUpdateRow label="Audio captured" value={`+${minutesValue} min`} />
              <TranscriptUpdateRow
                label="Sales calls"
                value={kind === "sales_call" ? "+1" : "+0"}
              />
              <TranscriptUpdateRow label="Saved samples" value="+1" />
            </div>
            {saved && (
              <div className="mt-3 rounded-[var(--r-md)] bg-[var(--brand-soft)] p-3">
                <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
                  Saved. Your Voice Asset just got harder to copy.
                </p>
                {lastRules.length > 0 && (
                  <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                    {lastRules.length} voice rule{lastRules.length === 1 ? "" : "s"} extracted for review below.
                  </p>
                )}
              </div>
            )}
          </div>
          <Button
            onClick={saveTranscriptSignal}
            disabled={saving || !transcriptReady}
            className="w-full justify-center"
          >
            {saving ? "Saving..." : "Add to Voice Asset"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TranscriptUpdateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--r-md)] bg-[var(--surface-elevated)] px-3 py-2">
      <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
        {label}
      </span>
      <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)] tabular-nums">
        {value}
      </span>
    </div>
  );
}

function TrainingHistoryPanel({
  profile,
  sources,
  onProfileChange,
  onSourcesChange,
}: {
  profile: VoiceProfile;
  sources: VoiceTrainingSource[];
  onProfileChange: (profile: VoiceProfile) => void;
  onSourcesChange: (sources: VoiceTrainingSource[]) => void;
}) {
  const supabase = createClient();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const approvedMemory = voiceMemoryRules(profile);

  async function approveRule(source: VoiceTrainingSource, rule: VoiceTrainingSource["extracted_rules"][number]) {
    setApprovingId(`${source.id}:${rule.id}`);
    try {
      const alreadyApproved = approvedMemory.some(
        (item) => item.id === rule.id || item.text.toLowerCase() === rule.text.toLowerCase()
      );
      const currentVoiceJson = profile.voice_json as Record<string, unknown>;
      const memory = (currentVoiceJson.memory as Record<string, unknown> | undefined) ?? {};
      const approvedRules = Array.isArray(memory.approved_rules)
        ? memory.approved_rules
        : [];
      const nextApprovedIds = Array.from(new Set([...(source.approved_rule_ids ?? []), rule.id]));
      const nextVoiceJson = {
        ...currentVoiceJson,
        memory: {
          ...memory,
          approved_rules: alreadyApproved
            ? approvedRules
            : [
                ...approvedRules,
                {
                  ...rule,
                  source: source.source_type,
                  approved_at: new Date().toISOString(),
                },
              ],
        },
      };

      const [profileRes, sourceRes] = await Promise.all([
        supabase
          .from("cp_voice_profiles")
          .update({ voice_json: nextVoiceJson })
          .eq("id", profile.id)
          .eq("coach_id", profile.coach_id)
          .select("*")
          .single(),
        supabase
          .from("cp_voice_training_sources")
          .update({ approved_rule_ids: nextApprovedIds })
          .eq("id", source.id)
          .eq("coach_id", profile.coach_id)
          .select("*")
          .single(),
      ]);

      if (profileRes.error) {
        alert(profileRes.error.message);
        return;
      }
      if (sourceRes.error) {
        alert(sourceRes.error.message);
        return;
      }

      onProfileChange((profileRes.data as VoiceProfile | null) ?? { ...profile, voice_json: nextVoiceJson });
      const nextSource = (sourceRes.data as VoiceTrainingSource | null) ?? {
        ...source,
        approved_rule_ids: nextApprovedIds,
      };
      onSourcesChange(
        sources.map((item) => (item.id === source.id ? nextSource : item))
      );
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge tone="brand" size="xs" uppercase>
            Training history
          </Badge>
          <h2 className="mt-2 text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] leading-[var(--leading-tight)]">
            What trained your Voice Asset.
          </h2>
          <p className="mt-1.5 max-w-2xl text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
            Every saved transcript becomes visible history. Extracted rules
            only become Voice Memory after the coach approves them.
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface-deep)] px-3 py-1.5 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
          {sources.length} source{sources.length === 1 ? "" : "s"}
        </span>
      </div>

      {sources.length === 0 ? (
        <p className="mt-4 rounded-[var(--r-md)] bg-[var(--surface-deep)] p-4 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          No transcripts saved yet. Add a real call above to start the ledger.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {sources.slice(0, 8).map((source) => (
            <div
              key={source.id}
              className="rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                    {source.title || sourceTypeLabel(source.source_type)}
                  </div>
                  <div className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                    {sourceTypeLabel(source.source_type)} · {source.duration_minutes} min · {formatSourceDate(source.created_at)}
                    {source.audio_filename ? ` · ${source.audio_filename}` : ""}
                  </div>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                  {source.approved_rule_ids?.length ?? 0} approved
                </span>
              </div>

              <p className="mt-3 line-clamp-2 text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                {source.transcript}
              </p>

              {source.extracted_rules.length > 0 && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {source.extracted_rules.map((rule) => {
                    const approved = source.approved_rule_ids?.includes(rule.id);
                    return (
                      <div
                        key={rule.id}
                        className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-3"
                      >
                        <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)] leading-[var(--leading-base)]">
                          {rule.text}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {rule.category && (
                              <span className="rounded-full bg-[var(--surface-deep)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)]">
                                {rule.category}
                              </span>
                            )}
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                              {rule.confidence === "real" ? "Real signal" : "Early signal"}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={approved || approvingId === `${source.id}:${rule.id}`}
                            onClick={() => approveRule(source, rule)}
                            className="inline-flex h-8 items-center justify-center rounded-[var(--r-sm)] bg-[var(--navy)] px-3 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--brand)] hover:opacity-90 disabled:opacity-50 transition"
                          >
                            {approved
                              ? "Approved"
                              : approvingId === `${source.id}:${rule.id}`
                                ? "Saving..."
                                : "Approve"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function sourceTypeLabel(sourceType: VoiceTrainingSource["source_type"]): string {
  if (sourceType === "sales_call") return "Sales call";
  if (sourceType === "workshop") return "Workshop";
  if (sourceType === "instagram") return "Instagram";
  if (sourceType === "linkedin") return "LinkedIn";
  if (sourceType === "newsletter") return "Newsletter";
  if (sourceType === "paste") return "Paste";
  return "Voice note";
}

function normalizeHandleForUi(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
}

function normalizeLinkedInHandleForUi(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/(in|company)\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numericUiValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatSourceDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Voice setup note ─────────────────────────────────────────────────────

function VoiceSetupNote({ hasProfile }: { hasProfile: boolean }) {
  return (
    <Card padding="md" className="lg:sticky lg:top-24">
      <Badge tone={hasProfile ? "brand" : "warning"} size="xs" uppercase>
        Voice system
      </Badge>
      <h3 className="text-[length:var(--t-h3)] font-bold text-[color:var(--text)] mt-2 leading-[var(--leading-tight)]">
        Keep one active voice.
      </h3>
      <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2 leading-[var(--leading-relaxed)]">
        The app uses this profile before it drafts. Advanced integrations live
        in Settings so this page stays focused on improving the asset.
      </p>

      <div className="mt-4 space-y-2">
        <IntegrationRow label="Onboarding" value="5 questions save voice" done />
        <IntegrationRow label="Caption mining" value="Posts become profile" done />
        <IntegrationRow label="Drafting" value="Always reads active voice" done />
      </div>
    </Card>
  );
}

function IntegrationRow({
  label,
  value,
  done,
}: {
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-2">
      <div className="min-w-0">
        <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
          {label}
        </div>
        <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] truncate">
          {value}
        </div>
      </div>
      <span
        className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-[length:var(--t-caption)] font-extrabold ${
          done
            ? "bg-[var(--brand)] text-[color:var(--navy)]"
            : "bg-[var(--surface-elevated)] text-[color:var(--text-faint)] border border-[var(--border)]"
        }`}
      >
        {done ? "✓" : "•"}
      </span>
    </div>
  );
}

// ── Path switcher ──────────────────────────────────────────────────────────

function PathSwitcher({
  altPath,
  onChange,
}: {
  altPath: AltPath;
  onChange: (p: AltPath) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Voice setup path"
      className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden text-[length:var(--t-caption)]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={altPath === "interview"}
        onClick={() => onChange("interview")}
        className={`px-4 h-11 font-bold transition ${
          altPath === "interview"
            ? "bg-[var(--brand-soft)] text-[color:var(--text)]"
            : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
        }`}
      >
        5 questions · ~90s
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={altPath === "captions"}
        onClick={() => onChange("captions")}
        className={`px-4 h-11 font-bold border-l border-[var(--border)] transition ${
          altPath === "captions"
            ? "bg-[var(--brand-soft)] text-[color:var(--text)]"
            : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
        }`}
      >
        Paste captions · ~30s
      </button>
    </div>
  );
}

// Completed view.

function CompletedView({
  profile,
  compact = false,
}: {
  profile: VoiceProfile;
  compact?: boolean;
}) {
  const v: VoiceShape = (profile.voice_json ?? {}) as VoiceShape;

  const created = new Date(profile.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {!compact && (
        <div className="rounded-[var(--r-xl)] p-6 bg-[var(--surface-dark)] text-[color:var(--text-inverse)] shadow-[var(--shadow-md)]">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone="brand" size="xs" uppercase>
                  Active
                </Badge>
                <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
                  version {profile.version} · built {created}
                </span>
              </div>
              <h2 className="text-[length:var(--t-h1)] font-bold mt-3 leading-[var(--leading-tight)]">
                This is how your AI sounds like you.
              </h2>
              <p className="text-[length:var(--t-body)] text-[color:var(--text-faint)] mt-2 max-w-2xl leading-[var(--leading-relaxed)]">
                Every AI draft, Compose message, and warm-engager outreach pulls
                from the voice below. Without it your assistant writes like
                Claude. With it, it writes like you on your best day. The
                version that closes, not the generic version that gets ignored.
              </p>
            </div>
          </div>
        </div>
      )}

      {compact && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand" size="xs" uppercase>
            Active
          </Badge>
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            version {profile.version} · built {created}
          </span>
        </div>
      )}

      {/* Voice profile grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field title="Tone">
          {v.tone?.length ? <Chips items={v.tone} /> : <Empty />}
        </Field>
        <Field title="Emotional register">
          {v.emotional_register ? (
            <p className="text-[length:var(--t-body)] text-[color:var(--text)] leading-[var(--leading-relaxed)]">
              {v.emotional_register}
            </p>
          ) : (
            <Empty />
          )}
        </Field>
        <Field title="Sentence rhythm" full>
          {v.sentence_rhythm ? (
            <p className="text-[length:var(--t-body)] text-[color:var(--text)] italic leading-[var(--leading-relaxed)]">
              "{v.sentence_rhythm}"
            </p>
          ) : (
            <Empty />
          )}
        </Field>
        <Field title="Use these words">
          {v.vocabulary?.use?.length ? <Chips items={v.vocabulary.use} /> : <Empty />}
        </Field>
        <Field title="Avoid these words">
          {v.vocabulary?.avoid?.length ? (
            <Chips items={v.vocabulary.avoid} variant="danger" />
          ) : (
            <Empty />
          )}
        </Field>
        <Field title="Openers">
          {v.openers?.length ? <Lines items={v.openers} /> : <Empty />}
        </Field>
        <Field title="Closers">
          {v.closers?.length ? <Lines items={v.closers} /> : <Empty />}
        </Field>
        <Field title="CTAs">
          {v.ctas?.length ? <Lines items={v.ctas} /> : <Empty />}
        </Field>
        <Field title="Do-nots" full>
          {v.do_nots?.length ? <Lines items={v.do_nots} variant="danger" /> : <Empty />}
        </Field>
      </div>

      {profile.sample_messages && profile.sample_messages.length > 0 && (
        <Field title={`Sample messages (${profile.sample_messages.length})`} full>
          <div className="space-y-2">
            {profile.sample_messages.map((m, i) => (
              <blockquote
                key={i}
                className="text-[length:var(--t-body)] text-[color:var(--text)] border-l-2 border-[var(--brand)] pl-3 py-1 bg-[var(--surface-deep)] rounded-r leading-[var(--leading-relaxed)]"
              >
                {m}
              </blockquote>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

// ── Tiny render helpers ────────────────────────────────────────────────────

function Field({
  title,
  children,
  full = false,
}: {
  title: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <Card padding="md" className={full ? "md:col-span-2" : ""}>
      <div className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-bold">
        {title}
      </div>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

function Chips({
  items,
  variant = "default",
}: {
  items: string[];
  variant?: "default" | "danger";
}) {
  const tone = variant === "danger" ? "danger" : "brand";
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <Badge key={i} tone={tone} size="sm">
          {t}
        </Badge>
      ))}
    </div>
  );
}

function Lines({
  items,
  variant = "default",
}: {
  items: string[];
  variant?: "default" | "danger";
}) {
  const textCls =
    variant === "danger" ? "text-[color:var(--danger)]" : "text-[color:var(--text)]";
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li
          key={i}
          className={`text-[length:var(--t-body)] ${textCls} leading-[var(--leading-relaxed)] before:content-['·'] before:mr-2 before:text-[color:var(--text-faint)]`}
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return (
    <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] italic">
      Not set
    </span>
  );
}

// ── Brand OS cross-sell — surfaced on /voice ──────────────────────────────
//
// The 5-question VoiceSetupFlow is the lite-voice path. Brand OS v2 is the
// full 6-module run. We point coaches at it from /voice because that's where
// they're already thinking about voice + brand. One-line CTA, no dead-end.

/** State-aware Brand OS CTA. The card adapts to whether the coach has
 *  never started, is mid-run, completed without synthesis, or fully done.
 *  Previous version always said "Want the full Brand OS run?" even to
 *  coaches who'd already finished. */
function BrandOsCta({ state }: { state: BrandOsRunState }) {
  // Done — show as accomplishment + link to output. MVP completers also
  // get a clear "go deeper" affordance below the main action so they
  // know there's a Full Run available without it pushing them away from
  // the deliverable they just earned.
  if (state.kind === "complete") {
    const isMvp = state.variant === "mvp";
    return (
      <div className="rounded-[var(--r-lg)] border-2 border-[var(--brand-strong)] bg-[var(--brand-soft)] overflow-hidden">
        <a
          href={`/brand-os/run/${state.runId}/output`}
          className="block p-5 hover:bg-[color-mix(in_srgb,var(--brand)_12%,var(--surface-elevated))] transition group"
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge tone="brand" size="xs" uppercase>
                  ✓ Brand OS · {isMvp ? "MVP / Quick Start" : "Full Run"}
                </Badge>
                {state.synthesizedAt && (
                  <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
                    Completed {new Date(state.synthesizedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <h3 className="font-display text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
                Your Brand OS is live.
              </h3>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-[var(--leading-relaxed)]">
                {isMvp
                  ? "You finished the MVP. Your voice DNA, pillars, and buyer mirror are feeding every draft."
                  : "You finished the Full Run. Your voice DNA, pillars, buyer mirror, and content angles are feeding every draft."}
              </p>
            </div>
            <span className="text-[color:var(--brand-strong)] font-bold whitespace-nowrap group-hover:translate-x-1 transition-transform">
              View deliverable →
            </span>
          </div>
        </a>

        {isMvp && (
          // MVP completers — surface the Full Run as the next depth step
          // without pushing them away from their finished deliverable.
          <a
            href="/brand-os#start-full"
            className="block border-t border-[color-mix(in_srgb,var(--brand)_25%,transparent)] px-5 py-3 bg-[var(--surface-elevated)] hover:bg-[var(--surface)] transition group"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[length:var(--t-caption)] text-[color:var(--text)] leading-snug">
                  <strong>Want to go deeper?</strong>{" "}
                  <span className="text-[color:var(--text-muted)]">
                    The Full Run adds Funnel, Distribution + 45-day calendar — 6 modules, ~60 questions.
                  </span>
                </p>
              </div>
              <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand-strong)] whitespace-nowrap group-hover:translate-x-1 transition-transform">
                Run Full →
              </span>
            </div>
          </a>
        )}
      </div>
    );
  }

  // Completed quiz but synthesis not generated — one click to finish.
  if (state.kind === "complete_no_synthesis") {
    return (
      <a
        href={`/brand-os/run/${state.runId}/output`}
        className="block rounded-[var(--r-lg)] border-2 border-[var(--warning)] bg-[var(--warning-soft)] p-5 hover:border-[#936300] transition group"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <Badge tone="warning" size="xs" uppercase>Brand OS · finish setup</Badge>
            <h3 className="font-display text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)] mt-1">
              Generate your deliverable.
            </h3>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-[var(--leading-relaxed)]">
              You finished the questions. One more step — generate the synthesis to unlock your voice DNA + pillars + ready-to-draft hooks.
            </p>
          </div>
          <span className="text-[#936300] font-bold whitespace-nowrap group-hover:translate-x-1 transition-transform">
            Generate output →
          </span>
        </div>
      </a>
    );
  }

  // Mid-run — pick back up.
  if (state.kind === "in_progress") {
    return (
      <a
        href={`/brand-os/run/${state.runId}`}
        className="block rounded-[var(--r-lg)] border-2 border-[color-mix(in_srgb,var(--brand)_45%,transparent)] bg-[var(--brand-soft)] p-5 hover:border-[var(--brand-strong)] transition group"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <Badge tone="brand" size="xs" uppercase>Brand OS · in progress</Badge>
            <h3 className="font-display text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)] mt-1">
              Pick back up where you left off.
            </h3>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-[var(--leading-relaxed)]">
              Your answers are auto-saved. Finish the {state.variant === "mvp" ? "Quick Start" : "Full Run"} to unlock your voice DNA.
            </p>
          </div>
          <span className="text-[color:var(--brand-strong)] font-bold whitespace-nowrap group-hover:translate-x-1 transition-transform">
            Continue →
          </span>
        </div>
      </a>
    );
  }

  // Never started — the original prompt.
  return (
    <a
      href="/brand-os"
      className="block rounded-[var(--r-lg)] border-2 border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[var(--brand-soft)] p-5 hover:border-[var(--brand-strong)] transition group"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="brand" size="xs" uppercase>Brand OS · v2.1</Badge>
            <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand-strong)]">New</span>
          </div>
          <h3 className="font-display text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
            Want the full Brand OS run?
          </h3>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-[var(--leading-relaxed)]">
            6 modules · 60+ questions · push-back on generic language · 45-day calendar at the end.
            One question at a time. Auto-saves. Or try the 13-question MVP first.
          </p>
        </div>
        <span className="text-[color:var(--brand-strong)] font-bold whitespace-nowrap group-hover:translate-x-1 transition-transform">
          Run Brand OS →
        </span>
      </div>
    </a>
  );
}

// ── Framework Generator cross-sell — surfaced on /voice ──────────────────

function FrameworkCta() {
  return (
    <a
      href="/framework"
      className="block rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 hover:border-[var(--brand-strong)] transition group"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="brand" size="xs" uppercase>
              Framework Generator
            </Badge>
          </div>
          <h3 className="font-display text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
            Coin your signature method.
          </h3>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-[var(--leading-relaxed)]">
            Turn your process into a named acronym — the kind of IP that powers
            carousels, lead magnets, and client conversations.
          </p>
        </div>
        <span className="text-[color:var(--brand-strong)] font-bold whitespace-nowrap group-hover:translate-x-1 transition-transform">
          Build one →
        </span>
      </div>
    </a>
  );
}
