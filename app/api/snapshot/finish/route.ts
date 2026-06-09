// POST /api/snapshot/finish · public · generate the Snapshot reveal
//
// After Q5 is persisted, this endpoint calls generateSnapshot (server-side
// Anthropic) and returns the SnapshotPayload. State on cp_brand_os_runs is
// updated by generateSnapshot itself.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { generateSnapshot } from "@/lib/brand-os/snapshot-generator";

export const runtime = "edge";

type Body = { run_id?: string };

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const runId = (body.run_id ?? "").toString();

  if (!runId) {
    return NextResponse.json({ ok: false, error: "missing_run_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the run exists and is at the Snapshot tier.
  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("id, variant_v, tier, state, archetype")
    .eq("id", runId)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ ok: false, error: "run_not_found" }, { status: 404 });
  }
  if (run.variant_v !== "v5" || run.tier !== "snapshot") {
    return NextResponse.json({ ok: false, error: "invalid_run_state" }, { status: 400 });
  }

  // Idempotent: if generator already ran, return the persisted payload.
  if (run.archetype) {
    const { data: full } = await admin
      .from("cp_brand_os_runs")
      .select("archetype, voice_profile, pillars")
      .eq("id", runId)
      .maybeSingle();
    return NextResponse.json({ ok: true, cached: true, runId, payload: hydrateFromRun(full) });
  }

  try {
    const payload = await generateSnapshot(runId);
    return NextResponse.json({ ok: true, cached: false, runId, payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function hydrateFromRun(row: Record<string, unknown> | null) {
  if (!row) return null;
  const voiceProfile = (row.voice_profile ?? {}) as Record<string, unknown>;
  const pillars = (row.pillars ?? {}) as Record<string, unknown>;
  return {
    archetype: row.archetype as string,
    archetypeStatement: (voiceProfile.archetype_statement as string) ?? "",
    voiceTexture: (voiceProfile.texture as string[]) ?? [],
    theMoveYouMissed: (voiceProfile.the_move as string) ?? "",
    pillarSeeds: {
      cornerstone: (pillars.cornerstone as string) ?? "",
      edge: (pillars.edge as string) ?? "",
      teaching: (pillars.teaching as string) ?? "",
    },
  };
}
