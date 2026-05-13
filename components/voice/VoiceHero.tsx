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
    <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface-elevated)_0%,var(--surface-elevated)_60%,var(--brand-soft)_100%)] p-5 sm:p-7 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-faint)] bg-white/70 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)]">
            Voice OS
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
            {hasProfile ? "Active" : "Missing"}
          </div>
          <h2 className="mt-4 text-[length:var(--t-h1)] font-extrabold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            {hasProfile ? "Your voice is becoming the asset." : "No voice, no real assistant."}
          </h2>
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-2 max-w-xl leading-[var(--leading-base)]">
            {hasProfile
              ? "Every lead reply, Compose draft, welcome reveal, and auto-draft uses this active profile before it writes."
              : "Set this up before trusting AI drafts. Otherwise the app can be useful, but it will not sound like the coach."}
          </p>
        </div>

        <div className="rounded-[var(--r-lg)] border border-white/10 bg-[var(--navy)] p-4 text-[color:var(--text-inverse)] min-w-full sm:min-w-[360px] shadow-[var(--shadow-md)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand)]">
                Voice lock
              </div>
              <div className="mt-1 text-[length:var(--t-h3)] font-extrabold">
                {hasProfile ? `${lockPct}% personalized` : "Not trained yet"}
              </div>
            </div>
            <div className="text-right text-[length:var(--t-caption)] text-white/55 font-bold">
              {fields}/8 fields
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${Math.max(6, lockPct)}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <VoiceHeroStat label="Status" value={hasProfile ? "Active" : "Missing"} />
            <VoiceHeroStat label="Fields" value={hasProfile ? `${fields}/8` : "0/8"} />
            <VoiceHeroStat label="Samples" value={String(sampleCount)} />
          </div>
          {signals.length > 0 && (
            <div className="mt-3 text-[10px] font-mono uppercase tracking-wider text-white/45 leading-relaxed">
              Pulling from: {signals.join(" · ")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function VoiceHeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-white/10 bg-white/[0.06] px-3 py-2.5">
      <div className="text-[length:var(--t-label)] font-bold text-white/45">
        {label}
      </div>
      <div className="mt-1 text-lg sm:text-xl font-extrabold leading-none tabular-nums text-[color:var(--text-inverse)] truncate">
        {value}
      </div>
    </div>
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
    <section className="rounded-[var(--r-xl)] border border-[color-mix(in_srgb,var(--brand)_28%,var(--border))] bg-[var(--surface-elevated)] p-5 sm:p-6 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[var(--brand-soft)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text)]">
            Principle 07
            <span className="h-1 w-1 rounded-full bg-[var(--brand)]" />
            Switching cost moat
          </div>
          <h2 className="mt-3 text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
            Your voice is becoming an asset.
          </h2>
          <p className="mt-2 text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
            Your assistant is learning from proprietary signal: posts, calls, edits, samples, and approved memory. This is the part competitors cannot copy from a prompt.
          </p>
        </div>
        <div className="rounded-[var(--r-lg)] bg-[var(--navy)] px-4 py-3 text-[color:var(--text-inverse)] min-w-[210px]">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/45">
            Voice signal
          </div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums text-[color:var(--brand)]">
            {stats.totalSignals}
          </div>
          <div className="mt-1 text-[length:var(--t-caption)] font-bold text-white/60">
            {stats.confidence}
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${Math.min(100, Math.max(8, stats.totalSignals * 4))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-stretch">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
              Next training session
            </div>
            <p className="mt-1 text-[length:var(--t-body)] font-bold leading-[var(--leading-snug)] text-[color:var(--text)]">
              {nextAction}
            </p>
          </div>
          <a
            href={sessionHref}
            className="group block rounded-[var(--r-md)] bg-[var(--navy)] p-3 text-[color:var(--text-inverse)] transition hover:-translate-y-px hover:shadow-[var(--shadow-md)] focus-visible:shadow-[var(--shadow-glow)]"
            aria-label={`${sessionTitle}: ${sessionMeta}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand)]">
                  Session
                </div>
                <div className="mt-1 text-[length:var(--t-body)] font-extrabold">
                  {sessionTitle}
                </div>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-[color:var(--navy)] transition group-hover:scale-105">
                &rarr;
              </span>
            </div>
            <div className="mt-2 text-[length:var(--t-caption)] text-white/55">
              {sessionMeta}
            </div>
          </a>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <VoiceAssetStat label="Posts mined" value={String(stats.posts)} />
        <VoiceAssetStat label="Audio captured" value={formatHours(stats.audioHours)} />
        <VoiceAssetStat label="Sales calls" value={String(stats.salesCalls)} />
        <VoiceAssetStat label="Approved rules" value={String(stats.approvedRules)} />
        <VoiceAssetStat label="Edited drafts" value={String(stats.editedDrafts)} />
        <VoiceAssetStat label="Saved samples" value={String(stats.sampleMessages)} />
      </div>
    </section>
  );
}

function VoiceAssetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-3">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold tabular-nums text-[color:var(--text)]">
        {value}
      </div>
    </div>
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
