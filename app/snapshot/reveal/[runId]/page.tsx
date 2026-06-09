// /snapshot/reveal/[runId] · public · the free reveal
//
// Server component. Anyone with the UUID can see the reveal. The CTA is
// "Create your free account to go deeper" → /login (magic link) with the
// run_id in state. On signup, the auth callback claims this run by email.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type SnapshotData = {
  firstName: string | null;
  archetype: string;
  archetypeStatement: string;
  voiceTexture: string[];
  theMoveYouMissed: string;
  pillarSeeds: { cornerstone: string; edge: string; teaching: string };
};

const ARCHETYPE_DISPLAY: Record<string, string> = {
  sage: "the Sage",
  lover: "the Lover",
  warrior: "the Warrior",
  magician: "the Magician",
  creator: "the Creator",
  ruler: "the Ruler",
};

export default async function PublicSnapshotReveal({
  params,
}: {
  params: { runId: string };
}) {
  const admin = createAdminClient();

  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select(
      "id, coach_id, claimed_at, variant_v, tier, archetype, voice_profile, pillars, first_name_for_claim, email_for_claim",
    )
    .eq("id", params.runId)
    .maybeSingle();

  if (!run) notFound();

  // If the run was already claimed, bounce to the in-app reveal so they're logged in.
  if (run.coach_id || run.claimed_at) {
    redirect(`/brand-os/reveal/${params.runId}`);
  }

  if (run.variant_v !== "v5" || run.tier !== "snapshot") notFound();

  // Generator hasn't run yet → back to the runner.
  if (!run.archetype) {
    redirect(`/snapshot/${params.runId}`);
  }

  const voiceProfile = (run.voice_profile ?? {}) as Record<string, unknown>;
  const pillars = (run.pillars ?? {}) as Record<string, unknown>;

  const data: SnapshotData = {
    firstName: (run.first_name_for_claim as string | null) ?? null,
    archetype: run.archetype as string,
    archetypeStatement: (voiceProfile.archetype_statement as string) ?? "",
    voiceTexture: (voiceProfile.texture as string[]) ?? [],
    theMoveYouMissed: (voiceProfile.the_move as string) ?? "",
    pillarSeeds: {
      cornerstone: (pillars.cornerstone as string) ?? "",
      edge: (pillars.edge as string) ?? "",
      teaching: (pillars.teaching as string) ?? "",
    },
  };

  const email = (run.email_for_claim as string) ?? "";
  const archetypeDisplay = ARCHETYPE_DISPLAY[data.archetype] ?? data.archetype;

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-6 py-4">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <span className="font-display text-lg font-bold text-[color:var(--text)]">
            Brand OS
          </span>
          <span className="text-xs uppercase tracking-wider text-[color:var(--text-faint)]">
            Snapshot · free
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-8">
          <span className="inline-block text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">
            Brand OS · Snapshot · for {data.firstName ?? "you"}
          </span>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-[color:var(--text)]">
            What we saw <em className="italic text-[color:var(--brand-strong)]">in you.</em>
          </h1>
          <p className="mt-3 max-w-md text-base text-[color:var(--text-muted)]">
            Read this slow. Put your phone down before you finish. This is for you, not for the feed.
          </p>
        </div>

        {/* Card 01 · Archetype */}
        <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-8">
          <div className="mb-3 font-mono text-xs uppercase tracking-widest text-[color:var(--brand-strong)]">
            01 · Your Brand Archetype
          </div>
          <h2 className="mb-3 font-display text-2xl font-bold text-[color:var(--text)]">
            You are <em className="italic text-[color:var(--brand-strong)]">{archetypeDisplay}.</em>
          </h2>
          <p className="text-base leading-relaxed text-[color:var(--text)]">{data.archetypeStatement}</p>
        </section>

        {/* Card 02 · Voice Texture */}
        <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-8">
          <div className="mb-3 font-mono text-xs uppercase tracking-widest text-[color:var(--brand-strong)]">
            02 · Your Voice Texture
          </div>
          <h2 className="mb-3 font-display text-2xl font-bold text-[color:var(--text)]">
            Your voice runs <em className="italic text-[color:var(--brand-strong)]">{data.voiceTexture.join(", ").toLowerCase()}.</em>
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.voiceTexture.map((word) => (
              <span
                key={word}
                className="rounded-md border border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface-elevated))] px-3 py-2 font-mono text-sm font-semibold tracking-wider text-[color:var(--brand-strong)]"
              >
                {word.toUpperCase()}
              </span>
            ))}
          </div>
        </section>

        {/* Card 03 · The Move */}
        <section className="mb-10 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-8">
          <div className="mb-3 font-mono text-xs uppercase tracking-widest text-[color:var(--brand-strong)]">
            03 · The Move You Have Been Missing
          </div>
          <p className="font-display text-xl italic leading-snug text-[color:var(--text)]">{data.theMoveYouMissed}</p>
        </section>

        {/* Pillar seeds */}
        <section className="mb-12 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-[color:var(--brand-strong)]">
            Three pillar seeds (preview · the Full Round names them)
          </h3>
          <ul className="space-y-3">
            <PillarSeed label="Cornerstone · from your wound" text={data.pillarSeeds.cornerstone} />
            <PillarSeed label="Edge · from your dissent" text={data.pillarSeeds.edge} />
            <PillarSeed label="Teaching · from your refrain" text={data.pillarSeeds.teaching} />
          </ul>
        </section>

        {/* CTA: Go deeper inside the app — free */}
        <section className="rounded-xl bg-[var(--ink)] p-10 text-center">
          <div className="mb-2 font-mono text-xs uppercase tracking-widest text-[color:var(--brand)]">
            Go deeper · free
          </div>
          <h2 className="mb-3 font-display text-2xl font-bold text-[var(--surface)]">
            The Full Round goes <em className="italic text-[color:var(--brand)]">eleven questions deeper.</em>
          </h2>
          <p className="mb-6 text-base text-[color:var(--surface)] opacity-80">
            Stance. Wound. Dissent. Funnel. Pillar architecture. Twenty-four hour integration hold. You walk out with a draft and a calendar. Free.
          </p>
          <Link
            href={`/login?next=/brand-os/run/${params.runId}&email=${encodeURIComponent(email)}`}
            className="inline-block rounded-md bg-[var(--brand)] px-8 py-3 text-base font-bold text-[var(--ink)] hover:bg-[var(--brand-strong)] hover:text-[var(--surface)]"
          >
            Create your free account →
          </Link>
          <p className="mt-3 font-mono text-xs text-[var(--surface)] opacity-60">
            We send a magic link. No password. We claim your Snapshot to your account so this lives forever.
          </p>
        </section>

        <p className="mt-8 text-center text-xs text-[color:var(--text-faint)]">
          You can also bookmark this page. The link above stays valid as long as you have it.
        </p>
      </main>
    </div>
  );
}

function PillarSeed({ label, text }: { label: string; text: string }) {
  return (
    <li>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-[color:var(--brand-strong)]">{label}</div>
      <div className="text-[color:var(--text)]">{text}</div>
    </li>
  );
}
