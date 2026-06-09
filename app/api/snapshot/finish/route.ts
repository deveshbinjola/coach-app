// POST /api/snapshot/finish · public · generate the Snapshot reveal
//
// After Q5 is persisted, this endpoint calls generateSnapshot (server-side
// Anthropic) and returns the SnapshotPayload. State on cp_brand_os_runs is
// updated by generateSnapshot itself. For anonymous runs (email_for_claim
// set), we send a Resend follow-up so the coach can revisit the reveal.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { generateSnapshot } from "@/lib/brand-os/snapshot-generator";

export const runtime = "edge";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";
const FROM_EMAIL = process.env.BRAND_OS_RECOVERY_FROM ?? "Sunny <sunny@elevateaisystem.com>";

async function sendSnapshotEmail(opts: {
  to: string;
  firstName: string | null;
  archetype: string;
  archetypeDisplay: string;
  voiceTexture: string[];
  runId: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // No Resend key configured. Skip silently so the snapshot still saves.
    return;
  }
  const greet = opts.firstName ? `Hey ${opts.firstName}` : "Hey";
  const revealUrl = `${APP_ORIGIN}/snapshot/reveal/${opts.runId}`;
  const textureList = opts.voiceTexture.map((t) => t.toLowerCase()).join(", ");

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0A0F1C; background: #FAF8F3;">
      <p style="font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #0B6E23; font-weight: 700; margin: 0 0 16px;">Brand OS · Snapshot</p>
      <h1 style="font-size: 28px; line-height: 1.2; font-weight: 800; margin: 0 0 16px;">${greet}. Here is what we saw.</h1>
      <p style="font-size: 16px; line-height: 1.6; color: #5A5A52; margin: 0 0 24px;">You are <strong style="color: #0A0F1C;">${opts.archetypeDisplay}</strong>. Your voice runs <strong style="color: #0A0F1C;">${textureList}</strong>.</p>
      <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">The full reveal — your archetype, the move you have been missing, three pillar seeds — is at the link below. Bookmark it. Save it in your notes. Send it to no one yet.</p>
      <p style="margin: 0 0 32px;"><a href="${revealUrl}" style="display: inline-block; background: #0B6E23; color: white; padding: 14px 28px; border-radius: 100px; text-decoration: none; font-weight: 700; font-size: 15px;">Open your Snapshot →</a></p>
      <p style="font-size: 14px; line-height: 1.6; color: #5A5A52; margin: 0 0 8px;">When you are ready to go deeper, the Full Round is inside the app. Eleven more questions. Twenty-four hour integration hold. Free.</p>
      <p style="font-size: 14px; line-height: 1.6; color: #5A5A52; margin: 0 0 24px;">Sit with the Snapshot first. The first thing you write after reading it is usually the most you.</p>
      <hr style="border: 0; border-top: 1px solid #E5E1D8; margin: 24px 0;" />
      <p style="font-size: 12px; color: #5A5A52; margin: 0;">Sunny Binjola · ElevateAI Systems</p>
    </div>
  `;

  const text = `${greet}. Here is what we saw.

You are ${opts.archetypeDisplay}. Your voice runs ${textureList}.

Open your full Snapshot: ${revealUrl}

When you are ready, the Full Round is inside the app. Eleven more questions. Free.

— Sunny, ElevateAI Systems`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: opts.to,
        subject: `Your Brand OS Snapshot · ${opts.archetypeDisplay}`,
        html,
        text,
      }),
    });
  } catch {
    // Email failure must not block the snapshot. Swallow.
  }
}

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
    .select("id, variant_v, tier, state, archetype, email_for_claim, first_name_for_claim, coach_id")
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

    // Fire-and-forget follow-up email for anonymous funnel runs only.
    // (Auth'd in-app runs already see the reveal inside the app.)
    const email = run.email_for_claim as string | null;
    if (email && !run.coach_id) {
      const archetypeDisplay = ARCHETYPE_DISPLAY[payload.archetype] ?? payload.archetype;
      void sendSnapshotEmail({
        to: email,
        firstName: (run.first_name_for_claim as string | null) ?? null,
        archetype: payload.archetype,
        archetypeDisplay,
        voiceTexture: payload.voiceTexture,
        runId,
      });
    }

    return NextResponse.json({ ok: true, cached: false, runId, payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

const ARCHETYPE_DISPLAY: Record<string, string> = {
  sage: "the Sage",
  lover: "the Lover",
  warrior: "the Warrior",
  magician: "the Magician",
  creator: "the Creator",
  ruler: "the Ruler",
};

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
