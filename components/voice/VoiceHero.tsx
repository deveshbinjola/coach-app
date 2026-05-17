import type { VoiceProfile } from "@/lib/types";
import type { VoiceAssetStats } from "@/lib/voice-asset";
import type { BrandVoiceOverlay } from "@/lib/brand-os/voice-overlay";

type VoiceShape = {
  tone?: string[];
  sentence_rhythm?: string;
  vocabulary?: { use?: string[]; avoid?: string[] };
  openers?: string[];
  closers?: string[];
  ctas?: string[];
  do_nots?: string[];
};

/** Honest voice-lock calculation. Five weighted sources, all real:
 *
 *    40%  Voice profile completeness (8 fields → up to 40)
 *    20%  Sample messages (2 each, capped at 10 → up to 20)
 *    20%  Brand OS voice DNA overlay present, with quality scaling
 *    15%  Training source diversity (Instagram + LinkedIn + newsletter +
 *         paste + sales call, 3 each, capped at 15)
 *     5%  Buyer mirror named (the avatar is concrete)
 *
 *  Hits 100 only when ALL signals are real. Previous formula hardcoded a
 *  Math.min(96, …) cap → stuck at 96 forever even after Brand OS ran.
 */
function computeVoiceLock(
  profile: VoiceProfile | null,
  overlay: BrandVoiceOverlay | null,
  trainingSourceCount: number,
  trainingTypeCount: number,
): { pct: number; signals: string[] } {
  if (!profile && !overlay) return { pct: 0, signals: [] };
  const v = (profile?.voice_json ?? {}) as VoiceShape;
  const fields = voiceCompleteness(v);
  const sampleCount = profile?.sample_messages?.length ?? 0;
  const signals: string[] = [];

  // 1. Profile completeness (40)
  const profileScore = Math.min(40, fields * 5);
  if (profileScore > 0) signals.push(`profile ${fields}/8`);

  // 2. Sample messages (20)
  const sampleScore = Math.min(20, sampleCount * 2);
  if (sampleScore > 0) signals.push(`${sampleCount} sample${sampleCount === 1 ? "" : "s"}`);

  // 3. Brand OS overlay (20)
  let overlayScore = 0;
  if (overlay) {
    let q = 8; // baseline for having one
    if ((overlay.signature_moves ?? []).length >= 3) q += 4;
    if ((overlay.vocab_yes ?? []).length      >= 8) q += 4;
    if ((overlay.vocab_no ?? []).length       >= 5) q += 4;
    overlayScore = Math.min(20, q);
    signals.push("Brand OS DNA");
  }

  // 4. Training sources (15) — diversity matters more than raw count.
  const diversityScore = Math.min(15, trainingTypeCount * 3 + Math.min(3, Math.max(0, trainingSourceCount - trainingTypeCount)));
  if (diversityScore > 0) signals.push(`${trainingSourceCount} import${trainingSourceCount === 1 ? "" : "s"} (${trainingTypeCount} type${trainingTypeCount === 1 ? "" : "s"})`);

  // 5. Buyer mirror named (5)
  const mirrorScore = overlay?.buyer_mirror_name ? 5 : 0;
  if (mirrorScore > 0) signals.push(`avatar: ${overlay!.buyer_mirror_name}`);

  const pct = Math.min(100, profileScore + sampleScore + overlayScore + diversityScore + mirrorScore);
  return { pct, signals };
}

export function VoiceStatusHero({
  profile,
  overlay = null,
  trainingSourceCount = 0,
  trainingTypeCount = 0,
}: {
  profile: VoiceProfile | null;
  overlay?: BrandVoiceOverlay | null;
  trainingSourceCount?: number;
  trainingTypeCount?: number;
}) {
  const hasProfile = !!profile || !!overlay;
  const v: VoiceShape = (profile?.voice_json ?? {}) as VoiceShape;
  const fields = voiceCompleteness(v);
  const sampleCount = profile?.sample_messages?.length ?? 0;
  const { pct: lockPct, signals } = computeVoiceLock(profile, overlay, trainingSourceCount, trainingTypeCount);

  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* Status pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-faint)] bg-white/70 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)]">
          Voice OS
          <span className={`h-1.5 w-1.5 rounded-full ${hasProfile ? "bg-[var(--brand)]" : "bg-[var(--text-faint)]"}`} />
          {hasProfile ? "Active" : "Missing"}
        </div>

        {/* Lock bar */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)] whitespace-nowrap">
            {hasProfile ? `${lockPct}%` : "0%"} locked
          </span>
          <div className="h-1.5 w-24 rounded-full bg-[var(--navy)]/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${Math.max(4, lockPct)}%` }}
            />
          </div>
        </div>

        {/* Inline stats */}
        <div className="flex items-center gap-4 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          <span><b className="text-[color:var(--text)]">{fields}/8</b> fields</span>
          <span><b className="text-[color:var(--text)]">{sampleCount}</b> samples</span>
          {trainingSourceCount > 0 && (
            <span><b className="text-[color:var(--text)]">{trainingSourceCount}</b> imports</span>
          )}
        </div>

        {/* Signal trail */}
        {signals.length > 0 && (
          <div className="ml-auto text-[10px] font-mono uppercase tracking-wider text-[color:var(--text-faint)] hidden lg:block">
            {signals.join(" · ")}
          </div>
        )}
      </div>
    </section>
  );
}

export function VoiceAssetPanel({
  stats,
  sourceCount,
  pendingRules,
}: {
  stats: VoiceAssetStats;
  sourceCount: number;
  pendingRules: number;
}) {
  const nextAction =
    pendingRules > 0
      ? `Review ${pendingRules} extracted rule${pendingRules === 1 ? "" : "s"} in Training history.`
      : sourceCount === 0
        ? "Import Instagram or paste writing so the asset starts from proof, not guesses."
        : stats.editedDrafts < 3
          ? "Send and edit a few drafts so the app learns your corrections."
          : "Keep adding real calls when your offer or market shifts.";
  const sessionTitle =
    pendingRules > 0
      ? "Approve memory"
      : sourceCount === 0
        ? "Import voice"
        : stats.editedDrafts < 3
          ? "Edit 3 drafts"
          : "Add fresh signal";
  const sessionMeta =
    pendingRules > 0
      ? `${pendingRules} rule${pendingRules === 1 ? "" : "s"} waiting`
      : sourceCount === 0
        ? "Instagram or paste"
        : stats.editedDrafts < 3
          ? `${Math.max(0, 3 - stats.editedDrafts)} edits left`
          : "When offer shifts";
  const sessionHref =
    pendingRules > 0
      ? "#voice-training-history"
      : sourceCount === 0
        ? "#voice-import"
        : stats.editedDrafts < 3
          ? "#voice-edit-learning"
          : "#voice-add-signal";

  return (
    <section className="space-y-3">
      {/* Compact voice asset bar */}
      <div className="rounded-[var(--r-lg)] border border-[color-mix(in_srgb,var(--brand)_28%,var(--border))] bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--shadow-xs)]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[var(--brand-soft)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text)]">
            Voice Asset
            <span className="h-1 w-1 rounded-full bg-[var(--brand)]" />
            {stats.confidence}
          </div>
          <div className="flex items-center gap-4 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            <span><b className="text-[color:var(--text)]">{stats.totalSignals}</b> signals</span>
            <span><b className="text-[color:var(--text)]">{stats.posts}</b> posts</span>
            <span><b className="text-[color:var(--text)]">{stats.approvedRules}</b> rules</span>
            <span><b className="text-[color:var(--text)]">{stats.sampleMessages}</b> samples</span>
            {stats.salesCalls > 0 && <span><b className="text-[color:var(--text)]">{stats.salesCalls}</b> calls</span>}
          </div>
        </div>
      </div>

      {/* Training session CTA */}
      <a
        href={sessionHref}
        className="group flex items-center justify-between gap-4 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface-deep)] px-4 py-3 transition hover:border-[var(--brand)] hover:-translate-y-px"
        aria-label={`${sessionTitle}: ${sessionMeta}`}
      >
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Next training session
          </div>
          <p className="mt-0.5 text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
            {nextAction}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <div className="text-right">
            <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">{sessionTitle}</div>
            <div className="text-[10px] text-[color:var(--text-muted)]">{sessionMeta}</div>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-[color:var(--navy)] transition group-hover:scale-105">
            &rarr;
          </span>
        </div>
      </a>
    </section>
  );
}

function formatHours(hours: number): string {
  if (hours === 0) return "0 hrs";
  if (Number.isInteger(hours)) return `${hours} hrs`;
  return `${hours.toFixed(1)} hrs`;
}

function voiceCompleteness(v: VoiceShape): number {
  return [
    v.tone?.length,
    v.sentence_rhythm,
    v.vocabulary?.use?.length,
    v.vocabulary?.avoid?.length,
    v.openers?.length,
    v.closers?.length,
    v.ctas?.length,
    v.do_nots?.length,
  ].filter(Boolean).length;
}
