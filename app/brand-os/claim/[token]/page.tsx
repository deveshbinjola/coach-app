// /brand-os/claim/[token] · the recovery claim landing
//
// When a legacy abandoner clicks the recovery email CTA, they land here.
// We look up the run by recovery_token, render the SnapshotReveal with
// the stored payload, mark claimed_at on the recovery log row, and (for
// Tier 4 gift runs) show the content gift section below.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import SnapshotReveal, { type SnapshotPayload } from "@/components/brand-os/SnapshotReveal";

export const runtime = "edge";

type ClaimPageProps = {
  params: { token: string };
};

type RunRow = {
  id: string;
  coach_id: string | null;
  recovery_tier: "skip" | "partial" | "full" | "gift" | null;
  archetype: SnapshotPayload["archetype"] | null;
  voice_profile: any;
  avatar_profile: any;
  pillars: any;
  content_calendar: any;
};

type CoachRow = {
  full_name: string | null;
};

function buildPayloadFromRun(run: RunRow, firstName?: string): SnapshotPayload | null {
  if (!run.archetype || !run.voice_profile) return null;

  return {
    firstName,
    archetype: run.archetype,
    archetypeStatement: run.voice_profile?.archetype_statement ?? "",
    voiceTexture: (run.voice_profile?.texture ?? ["GROUNDED", "DIRECT", "POETIC"]) as [string, string, string],
    theMoveYouMissed: run.voice_profile?.the_move ?? "",
    pillarSeeds: {
      cornerstone: run.pillars?.cornerstone?.name ?? run.pillars?.[0]?.name ?? "",
      edge: run.pillars?.edge?.name ?? run.pillars?.[1]?.name ?? "",
      teaching: run.pillars?.teaching?.name ?? run.pillars?.[2]?.name ?? "",
    },
  };
}

export default async function ClaimPage({ params }: ClaimPageProps) {
  const supabase = createClient();

  // 1 · Find the run by recovery token
  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id, coach_id, recovery_tier, archetype, voice_profile, avatar_profile, pillars, content_calendar")
    .eq("recovery_token", params.token)
    .maybeSingle<RunRow>();

  if (!run) return notFound();
  if (run.recovery_tier === "skip") return notFound();

  // 2 · Pull coach first name (if any)
  let firstName: string | undefined;
  if (run.coach_id) {
    const { data: coach } = await supabase
      .from("cp_coaches")
      .select("full_name")
      .eq("id", run.coach_id)
      .maybeSingle<CoachRow>();
    firstName = (coach?.full_name ?? undefined)?.split(/[\s.]/)[0];
  }

  const payload = buildPayloadFromRun(run, firstName);
  if (!payload) return notFound();

  // 3 · Mark claimed_at on the recovery log (fire-and-forget)
  void supabase
    .from("cp_brand_os_recovery_log")
    .update({ claimed_at: new Date().toISOString() })
    .eq("run_id", run.id)
    .is("claimed_at", null);

  // 4 · Render the reveal (and the content gift for Tier 4)
  const gift = run.recovery_tier === "gift" ? extractContentGift(run.content_calendar) : null;

  return (
    <>
      <SnapshotReveal
        payload={payload}
        onContinueToFullRound={() => {
          // Client-side handler. Routes to checkout. Implemented in the component
          // wrapper (this is a server component; we pass an inline handler note).
        }}
      />
      {gift && <ContentGiftSection pieces={gift} />}
    </>
  );
}

type ContentPiece = { day: number; title: string; stance: string };

function extractContentGift(calendar: any): ContentPiece[] | null {
  if (!Array.isArray(calendar)) return null;
  // Pull the first 5 to 10 pieces as the gift.
  return calendar.slice(0, 10).map((p: any) => ({
    day: p.day ?? 0,
    title: p.title ?? "",
    stance: p.stance ?? "",
  }));
}

function ContentGiftSection({ pieces }: { pieces: ContentPiece[] }) {
  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-4 font-mono text-xs uppercase tracking-widest text-green">
        Free gift · {pieces.length} calendar pieces in your voice
      </div>
      <h2 className="mb-6 font-serif text-3xl font-bold leading-tight text-ink">
        Yours, no payment. <em className="italic text-green">Whether you continue or not.</em>
      </h2>
      <ul className="space-y-3">
        {pieces.map((p, i) => (
          <li key={i} className="rounded-md border border-line bg-card px-5 py-4">
            <div className="mb-1 font-mono text-xs text-muted">
              Day {p.day} · {p.stance}
            </div>
            <div className="font-serif text-base font-semibold text-ink">{p.title}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
