// legacy-recovery · Brand OS v5
//
// One-time backfill job. Runs once during Week 1 of the v5 migration.
//
// For each in-progress legacy run with >= 4 answers and an email on file:
//   1 · Classify into recovery_tier (partial / full / gift).
//   2 · Map legacy answers → v5 fields where overlap exists.
//   3 · Generate the Snapshot artifact (via snapshot-generator).
//   4 · Sync into the coach platform (voice profile + content drafts).
//   5 · Mint a recovery_token. Build .md + .pdf.html attachments.
//   6 · Queue the recovery email via Resend with attachments.
//   7 · Insert a row in cp_brand_os_recovery_log.
//
// Runs below the 4-answer floor are archived with recovery_tier = 'skip'.
// Idempotent: safe to re-run. Skips runs that already have a recovery_token.

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { generateSnapshot } from "./snapshot-generator";

// ============================================================
// Types
// ============================================================

type CohortMember = {
  run_id: string;
  coach_id: string;
  recipient_email: string;
  first_name?: string;
  answers_count: number;
  stopped_at: string;
  days_cold: number;
  audience: "M" | "W" | "X";
};

export type RecoveryTier = "skip" | "partial" | "full" | "gift";

type BackfillOptions = {
  dryRun?: boolean;
  /** Max coaches to process this call. Defaults to all. Use small batches
   *  (2 to 4) when running under the edge runtime CPU limit. */
  limit?: number;
};

type BackfillSummary = {
  cohort_size: number;
  sent: number;
  skipped: number;
  synced_to_platform: number;
  details: Array<{
    run_id: string;
    coach_email: string;
    tier: RecoveryTier;
    action: "sent" | "skipped" | "dry_run_would_send" | "errored";
    error?: string;
  }>;
};

// ============================================================
// Tier classification
// ============================================================

const FLOOR = 4;
const GIFT_FLOOR = 19;
const FULL_FLOOR = 10;

function classify(answersCount: number): RecoveryTier {
  if (answersCount < FLOOR) return "skip";
  if (answersCount >= GIFT_FLOOR) return "gift";
  if (answersCount >= FULL_FLOOR) return "full";
  return "partial";
}

// ============================================================
// Cohort load · real Supabase query
// ============================================================

async function loadCohort(): Promise<CohortMember[]> {
  const admin = createAdminClient();

  // Query in-progress legacy runs joined to coach email + answer count.
  const { data: runs, error } = await admin
    .from("cp_brand_os_runs")
    .select(`
      id,
      coach_id,
      audience,
      current_question_id,
      updated_at,
      started_at,
      variant_v,
      recovery_token,
      state
    `)
    .eq("state", "in_progress")
    .eq("variant_v", "legacy")
    .is("recovery_token", null);

  if (error || !runs?.length) return [];

  const out: CohortMember[] = [];

  for (const run of runs) {
    // Answer count for this run
    const { count: answersCount } = await admin
      .from("cp_brand_os_answers")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run.id);

    // Coach details
    const { data: coach } = await admin
      .from("cp_coaches")
      .select("email, full_name")
      .eq("id", run.coach_id)
      .maybeSingle();

    if (!coach?.email) continue;

    const ageMs = Date.now() - new Date(run.updated_at ?? run.started_at).getTime();
    const days_cold = ageMs / 86_400_000;

    const fullName = (coach.full_name ?? "").trim();
    const first_name = fullName ? fullName.split(/[\s.]/)[0] : undefined;

    out.push({
      run_id: run.id,
      coach_id: run.coach_id,
      recipient_email: coach.email,
      first_name,
      answers_count: answersCount ?? 0,
      stopped_at: run.current_question_id ?? "preflight.audience",
      days_cold,
      audience: (run.audience as "M" | "W" | "X" | null) ?? "X",
    });
  }

  // Sort hottest-first.
  return out.sort((a, b) => b.answers_count - a.answers_count);
}

// ============================================================
// Legacy → v5 field mapping
// ============================================================

const LEGACY_TO_V5_FIELDS: Array<{ legacyIds: string[]; field: string; jsonKey?: string }> = [
  { legacyIds: ["mirror.q1"],          field: "v5_audience_proxy" },
  { legacyIds: ["mirror.q2"],          field: "avatar_name" },
  { legacyIds: ["mirror.q5"],          field: "avatar_somatic" },
  { legacyIds: ["mirror.q8"],          field: "refrain_proxy" },
  { legacyIds: ["mirror.q11"],         field: "wound_proxy" },
  { legacyIds: ["signal.q1"],          field: "voice_paragraph" },
  { legacyIds: ["signal.q9"],          field: "signature_phrases" },
  { legacyIds: ["signal.q10"],         field: "anti_voice_list" },
  { legacyIds: ["stance.q4"],          field: "dissent_proxy" },
];

async function mapLegacyToV5(runId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: answers } = await admin
    .from("cp_brand_os_answers")
    .select("question_id, refined_text, raw_text")
    .eq("run_id", runId);

  if (!answers?.length) return;

  const map = new Map<string, string>();
  for (const a of answers) {
    const text = (a.refined_text ?? a.raw_text ?? "").toString().trim();
    if (text) map.set(a.question_id, text);
  }

  // Build avatar_profile from legacy mirror answers.
  const avatar_profile = {
    name:           map.get("mirror.q2") ?? null,
    positioning:    map.get("mirror.q1") ?? null,
    somatic_6am:    map.get("mirror.q5") ?? null,
    one_sentence_at_11pm: map.get("mirror.q8") ?? null,
    inner_monologue: map.get("mirror.q11") ?? null,
  };

  // anti_voice list from signal.q10 (comma or line separated).
  const antiRaw = map.get("signal.q10") ?? "";
  const anti_voice = antiRaw
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 10);

  await admin
    .from("cp_brand_os_runs")
    .update({
      avatar_profile,
      anti_voice: anti_voice.length ? anti_voice : null,
    })
    .eq("id", runId);
}

// ============================================================
// Coach platform sync · voice profile + content drafts
// ============================================================

async function syncCoachPlatform(member: CohortMember, tier: RecoveryTier): Promise<void> {
  if (!member.coach_id) return;
  const admin = createAdminClient();

  // 1 · Read the generated outputs from cp_brand_os_runs
  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("voice_profile, anti_voice, avatar_profile, content_calendar")
    .eq("id", member.run_id)
    .maybeSingle();

  if (!run?.voice_profile) return;

  // 2 · Deactivate existing voice profiles for this coach
  await admin
    .from("cp_voice_profiles")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("coach_id", member.coach_id)
    .eq("active", true);

  // 3 · Determine next version
  const { data: maxV } = await admin
    .from("cp_voice_profiles")
    .select("version")
    .eq("coach_id", member.coach_id)
    .order("version", { ascending: false })
    .limit(1);
  const nextVersion = ((maxV?.[0]?.version as number | undefined) ?? 0) + 1;

  // 4 · Read writing sample from cp_brand_os_answers (signal.q1)
  const { data: sampleRow } = await admin
    .from("cp_brand_os_answers")
    .select("refined_text, raw_text")
    .eq("run_id", member.run_id)
    .eq("question_id", "signal.q1")
    .maybeSingle();
  const writingSample = (sampleRow?.refined_text ?? sampleRow?.raw_text ?? "").toString().trim();

  // 5 · Insert new voice profile
  const { data: profileRow } = await admin
    .from("cp_voice_profiles")
    .insert({
      coach_id: member.coach_id,
      voice_json: {
        ...(run.voice_profile as Record<string, unknown>),
        anti_voice: run.anti_voice ?? [],
        avatar: run.avatar_profile ?? {},
        source: "brand_os_legacy_recovery",
        brand_os_run_id: member.run_id,
      },
      sample_messages: writingSample ? [writingSample] : [],
      version: nextVersion,
      active: true,
    })
    .select("id")
    .maybeSingle();

  // 6 · Voice training source (if we had a paragraph)
  if (writingSample && profileRow?.id) {
    await admin
      .from("cp_voice_training_sources")
      .insert({
        coach_id: member.coach_id,
        voice_profile_id: profileRow.id,
        source_type: "brand_os_quiz",
        title: "Brand OS · Snapshot writing sample",
        transcript: writingSample,
      });
  }

  // 7 · Content drafts (Tier 4 gift only)
  if (tier === "gift" && Array.isArray(run.content_calendar)) {
    const pieces = (run.content_calendar as Array<{ title?: string; body?: string; channel?: string; stance?: string }>).slice(0, 10);
    for (const piece of pieces) {
      await admin
        .from("cp_content")
        .insert({
          coach_id: member.coach_id,
          title: piece.title ?? "Brand OS gift piece",
          body: piece.body ?? "",
          ai_original_body: piece.body ?? "",
          platform: piece.channel ?? "instagram",
          content_type: "post",
          status: "draft",
          pillar: piece.stance ?? null,
          brand_os_generated: true,
        });
    }
  }
}

// ============================================================
// File generation · .md + .pdf.html
// ============================================================

export type RunSnapshot = {
  first_name?: string;
  audience: "M" | "W" | "X";
  archetype: string;
  voice_texture: [string, string, string];
  anti_voice: string[];
  avatar: {
    name?: string;
    positioning?: string;
    somatic_6am?: string;
    one_sentence_at_11pm?: string;
    inner_monologue?: string;
  };
  pillars: Array<{ kind: "cornerstone" | "edge" | "teaching" | "pending"; name: string; body?: string }>;
  calendar: Array<{ day: number; title: string; body?: string; stance: string; channel: string }>;
  weird_interest?: string;
  weird_lens?: string;
  paragraph_sample?: string;
  signature_phrases?: string[];
  answer_count: number;
  answered_at: string;
};

export function generateMarkdownFile(snap: RunSnapshot): string {
  const lines: string[] = [];
  const name = snap.first_name ?? "you";
  lines.push(`# Brand OS · For ${name}`);
  lines.push("");
  lines.push(`Generated 2026-06-06 from your ${snap.answer_count} answers. Yours forever.`);
  lines.push("");
  lines.push("## How to use this file");
  lines.push("");
  lines.push("Paste this whole file into Claude, ChatGPT, or Gemini and tell it:");
  lines.push("");
  lines.push('> "Use this as the voice and brand context for everything you help me write."');
  lines.push("");
  lines.push("From the next reply on, the AI sounds like you.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Who you are coaching");
  lines.push("");
  if (snap.avatar.name) lines.push(`**Named avatar: ${snap.avatar.name}.**`);
  if (snap.avatar.somatic_6am) lines.push(`Body at 6am Tuesday: ${snap.avatar.somatic_6am}`);
  if (snap.avatar.one_sentence_at_11pm) lines.push(`The 11pm sentence: ${snap.avatar.one_sentence_at_11pm}`);
  if (snap.avatar.inner_monologue) lines.push(`What they say to themselves alone: ${snap.avatar.inner_monologue}`);
  lines.push("");
  if (snap.avatar.positioning) {
    lines.push("**What you do for them.**");
    lines.push("");
    lines.push(snap.avatar.positioning);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("## Your voice");
  lines.push("");
  lines.push("### Texture");
  lines.push(`**${snap.voice_texture.join(". ")}**.`);
  lines.push("");
  if (snap.signature_phrases?.length) {
    lines.push("### Phrases you keep using (use these)");
    snap.signature_phrases.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }
  if (snap.anti_voice.length) {
    lines.push("### Words you will never use (the AI must refuse these)");
    snap.anti_voice.forEach((w) => lines.push(`- ${w}`));
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("## Three pillars");
  lines.push("");
  snap.pillars.forEach((p, i) => {
    const label = p.kind === "pending" ? "Pending" : p.kind[0].toUpperCase() + p.kind.slice(1);
    lines.push(`### Pillar ${String(i + 1).padStart(2, "0")} · ${label}`);
    lines.push(`**${p.name}**`);
    if (p.body) {
      lines.push("");
      lines.push(p.body);
    }
    lines.push("");
  });
  if (snap.calendar.length) {
    lines.push("---");
    lines.push("");
    lines.push("## Calendar pieces drafted in your voice · use as starting points");
    lines.push("");
    snap.calendar.forEach((c) => {
      lines.push(`### Day ${String(c.day).padStart(2, "0")} · ${c.stance} · ${c.channel}`);
      lines.push(`**${c.title}**`);
      if (c.body) {
        lines.push("");
        lines.push(c.body);
      }
      lines.push("");
    });
  }
  lines.push("---");
  lines.push("");
  lines.push("*Brand OS · Yours forever · The Full Round picks up where you left off. Twenty-two minutes. Seven dollars. elevateaisystem.com/brand-os*");
  return lines.join("\n");
}

export function generateBrandOsPdfHtml(snap: RunSnapshot): string {
  const name = snap.first_name ?? "you";
  const calendarHtml = snap.calendar.map((c) => `
    <div class="calendar-piece">
      <div class="meta">Day ${String(c.day).padStart(2, "0")} · ${c.stance} · ${c.channel}</div>
      <h4>${escapeHtml(c.title)}</h4>
      ${c.body ? `<p>${escapeHtml(c.body)}</p>` : ""}
    </div>
  `).join("");
  const pillarsHtml = snap.pillars.map((p, i) => `
    <div class="pillar ${p.kind === "pending" ? "pending" : ""}">
      <div class="pillar-label">Pillar ${String(i + 1).padStart(2, "0")} · ${p.kind}</div>
      <h3>${escapeHtml(p.name)}</h3>
      ${p.body ? `<p>${escapeHtml(p.body)}</p>` : ""}
    </div>
  `).join("");
  const antiHtml = snap.anti_voice.map((w) => `<span class="anti-word">${escapeHtml(w)}</span>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Brand OS · ${escapeHtml(name)}</title>
<style>
body{font-family:Georgia,serif;max-width:720px;margin:48px auto;padding:0 48px;color:#0A0F1C;background:#FAF8F3;line-height:1.7;}
h1{font-weight:900;font-size:42pt;line-height:1.0;margin-bottom:18pt;}
h1 em{color:#0B6E23;}
h2{font-weight:700;font-size:22pt;margin:36pt 0 14pt;}
h3{font-weight:700;font-size:15pt;margin:18pt 0 8pt;}
h4{font-weight:700;font-size:13pt;margin:14pt 0 6pt;}
.meta{font-family:monospace;font-size:9pt;text-transform:uppercase;letter-spacing:0.15em;color:#0B6E23;margin-bottom:6pt;}
.pillar{background:#fff;border-left:4px solid #0B6E23;padding:18pt 22pt;margin:12pt 0;border-radius:0 8px 8px 0;}
.pillar.pending{border-left-color:#9A6E1F;background:#F4ECDA;}
.pillar-label{font-family:monospace;font-size:8pt;color:#0B6E23;letter-spacing:0.18em;text-transform:uppercase;}
.calendar-piece{background:#fff;border:1px solid #E5E1D8;padding:18pt 22pt;margin:10pt 0;border-radius:8px;}
.anti-word{display:inline-block;padding:3pt 9pt;background:#F8E8E5;color:#B23A2E;border-radius:5px;font-family:monospace;font-size:9pt;text-decoration:line-through;margin:2pt;}
.instruction{background:#E8F1EA;border:1px solid #C5DDCB;padding:24pt 28pt;border-radius:12px;margin:24pt 0;}
.instruction .quote{background:#fff;border-left:4px solid #0B6E23;padding:12pt 18pt;font-style:italic;margin:12pt 0;}
@media print{body{font-size:11pt;}}
</style></head><body>
<h1>Your <em>Brand OS</em>. <br>For ${escapeHtml(name)}.</h1>
<p>Pulled from the ${snap.answer_count} answers you gave us. <strong>Yours forever.</strong></p>

<div class="instruction">
<h2>Why this is in your inbox. <em>And how to use it.</em></h2>
<p>You started the Brand OS quiz. You gave ${snap.answer_count} answers. We read every one.</p>
<p>Open the text file we attached. Drop it into Claude, ChatGPT, or Gemini. Then tell your AI this:</p>
<div class="quote">"Use this as the voice and brand context for everything you help me write."</div>
<p>From the next reply on, the AI sounds like you. <strong>That is the whole instruction.</strong></p>
</div>

<h2>Who you are coaching</h2>
${snap.avatar.name ? `<p><strong>Named avatar: ${escapeHtml(snap.avatar.name)}.</strong></p>` : ""}
${snap.avatar.somatic_6am ? `<p><strong>Body at 6am Tuesday.</strong> ${escapeHtml(snap.avatar.somatic_6am)}</p>` : ""}
${snap.avatar.one_sentence_at_11pm ? `<p><strong>The 11pm sentence.</strong> ${escapeHtml(snap.avatar.one_sentence_at_11pm)}</p>` : ""}
${snap.avatar.inner_monologue ? `<p><strong>What they say to themselves alone.</strong> ${escapeHtml(snap.avatar.inner_monologue)}</p>` : ""}
${snap.avatar.positioning ? `<h3>What you do for them.</h3><p>${escapeHtml(snap.avatar.positioning)}</p>` : ""}

<h2>Your voice</h2>
<p><strong>${snap.voice_texture.join(". ")}</strong>.</p>
${snap.anti_voice.length ? `<h3>Words you will never use</h3><div>${antiHtml}</div>` : ""}

<h2>Your pillars</h2>
${pillarsHtml}

${snap.calendar.length ? `<h2>Calendar pieces drafted in your voice</h2>${calendarHtml}` : ""}

<p style="margin-top:48pt;color:#5A5A52;font-size:10pt;font-style:italic;">Brand OS · Yours forever · The Full Round picks up where you left off. Twenty-two minutes. Seven dollars. elevateaisystem.com/brand-os</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================
// Storage upload
// ============================================================

async function uploadRecoveryFile(
  runId: string,
  filename: string,
  contentType: string,
  body: string,
): Promise<string> {
  const admin = createAdminClient();
  const path = `${runId}/${filename}`;
  const { error } = await admin
    .storage
    .from("brand-os-recovery")
    .upload(path, new Blob([body], { type: contentType }), {
      contentType,
      upsert: true,
    });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  const { data } = admin.storage.from("brand-os-recovery").getPublicUrl(path);
  return data.publicUrl;
}

async function buildSnapshotFromRun(runId: string, member: CohortMember): Promise<RunSnapshot> {
  const admin = createAdminClient();
  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("archetype, voice_profile, anti_voice, avatar_profile, pillars, content_calendar")
    .eq("id", runId)
    .maybeSingle();

  const voice = (run?.voice_profile ?? {}) as { texture?: [string, string, string] };
  const avatar = (run?.avatar_profile ?? {}) as RunSnapshot["avatar"];
  const pillars = run?.pillars ?? {};

  const pillarsList: RunSnapshot["pillars"] = [
    { kind: "cornerstone", name: (pillars.cornerstone as string) ?? "(pending)" },
    { kind: "edge",        name: (pillars.edge as string)        ?? "(pending)" },
    { kind: "teaching",    name: (pillars.teaching as string)    ?? "(pending)" },
  ];

  return {
    first_name: member.first_name,
    audience: member.audience,
    archetype: run?.archetype ?? "sage",
    voice_texture: voice.texture ?? ["GROUNDED", "DIRECT", "POETIC"],
    anti_voice: (run?.anti_voice ?? []) as string[],
    avatar,
    pillars: pillarsList,
    calendar: (run?.content_calendar ?? []) as RunSnapshot["calendar"],
    answer_count: member.answers_count,
    answered_at: new Date().toISOString(),
  };
}

async function buildAndUploadAttachments(member: CohortMember): Promise<{ md_url: string; pdf_html_url: string; md_text: string; pdf_html: string }> {
  const snap = await buildSnapshotFromRun(member.run_id, member);
  const md_text = generateMarkdownFile(snap);
  const pdf_html = generateBrandOsPdfHtml(snap);
  const slug = (member.first_name ?? "coach").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const md_url       = await uploadRecoveryFile(member.run_id, `brand-os-${slug}.md`,       "text/markdown", md_text);
  const pdf_html_url = await uploadRecoveryFile(member.run_id, `brand-os-${slug}.pdf.html`, "text/html",     pdf_html);
  return { md_url, pdf_html_url, md_text, pdf_html };
}

// ============================================================
// Email templates · per tier
// ============================================================

function recoveryEmailTemplate(
  member: CohortMember,
  tier: RecoveryTier,
  claimUrl: string,
  mdUrl: string,
): { subject: string; html: string; text: string } | null {
  const firstName = member.first_name ?? "there";
  const days = Math.round(member.days_cold);
  if (tier === "skip") return null;

  const instructionBlock = `
    <p><strong>Two files are attached.</strong> One is plain text. One is a printed version. Open the text file. Drop it into Claude, ChatGPT, or Gemini. Tell your AI: <em>"use this as my brand context."</em> From the next reply on, every piece it writes sounds like you. <strong>That is the whole instruction.</strong></p>
  `.trim();

  const ctaBlock = `
    <p style="text-align:center; margin: 22px 0;">
      <a href="${claimUrl}" style="display:inline-block; background:#0A0F1C; color:#00FF41; padding:14px 26px; border-radius:8px; font-weight:700; text-decoration:none;">Read what we saw in you →</a>
    </p>
  `.trim();

  const closingBlock = `
    <p>If the deeper share lands, the Full Round adds the held draft, the pre-post ritual, and the rest of the 45-day calendar. Twenty-two more minutes. Seven dollars. The draft holds for twenty-four hours before you can publish.</p>
    <p style="font-style:italic; color:#5A5A52;">Sunny</p>
  `.trim();

  const wrap = (subject: string, body: string) => ({
    subject,
    html: `<html><body style="font-family:Georgia,serif; max-width:600px; margin:0 auto; padding:24px; color:#0A0F1C; line-height:1.65;">${body}</body></html>`,
    text: body.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  });

  switch (tier) {
    case "gift":
      return wrap(
        `${firstName}. We read every one of your ${member.answers_count} answers.`,
        `<p>Hey ${firstName},</p>
         <p>${days} days ago you opened the Brand OS quiz and answered ${member.answers_count} questions. <em>You did the work.</em></p>
         <p>What I built tells you what your voice is doing that you have not named yet. Plus calendar pieces drafted in your voice. <strong>Yours, no payment.</strong></p>
         ${instructionBlock}
         ${ctaBlock}
         ${closingBlock}`,
      );

    case "full":
      return wrap(
        `${firstName}. ${member.answers_count} answers was enough.`,
        `<p>Hey ${firstName},</p>
         <p>${days} days ago you opened the Brand OS quiz and answered ${member.answers_count} questions. We read you with that.</p>
         <p>Your Brand Snapshot is ready. <strong>Yours.</strong></p>
         ${instructionBlock}
         ${ctaBlock}
         ${closingBlock}`,
      );

    case "partial":
      return wrap(
        `${firstName}. Your partial Snapshot is ready.`,
        `<p>Hey ${firstName},</p>
         <p>${days} days ago you started the Brand OS quiz and gave us ${member.answers_count} answers. Enough for two of the three Snapshot cards.</p>
         ${instructionBlock}
         ${ctaBlock}
         <p>The voice card needs one more answer. Sixty seconds. We will not guess at it.</p>
         <p style="font-style:italic; color:#5A5A52;">Sunny</p>`,
      );
  }
}

// ============================================================
// Resend send
// ============================================================

async function sendViaResend(
  to: string,
  payload: { subject: string; html: string; text: string },
  attachments: Array<{ filename: string; content: string; contentType: string }>,
): Promise<{ resend_message_id?: string; ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };

  const from = process.env.BRAND_OS_RECOVERY_FROM
    ?? process.env.RESEND_FROM
    ?? "Sunny Binjola <sunny@elevateaisystem.com>";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: "sunny.binjola@gmail.com",
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "utf8").toString("base64"),
      })),
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { ok: false, error: `Resend ${resp.status}: ${errText}` };
  }
  const json = await resp.json();
  return { ok: true, resend_message_id: json?.id };
}

// ============================================================
// Main entry
// ============================================================

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";

export async function runLegacyRecoveryBackfill(
  opts: BackfillOptions = {},
): Promise<BackfillSummary> {
  const dry = opts.dryRun ?? false;
  const limit = opts.limit ?? Infinity;
  const admin = createAdminClient();
  const fullCohort = await loadCohort();
  // Filter to runs that have not been processed yet. Re-running the endpoint
  // walks forward through the cohort until everyone is done.
  const cohort = fullCohort.slice(0, limit);

  let sent = 0;
  let skipped = 0;
  let syncedToPlatform = 0;
  const details: BackfillSummary["details"] = [];

  for (const member of cohort) {
    const tier = classify(member.answers_count);

    if (tier === "skip") {
      if (!dry) {
        await admin
          .from("cp_brand_os_runs")
          .update({ recovery_tier: "skip" })
          .eq("id", member.run_id);
      }
      skipped++;
      details.push({ run_id: member.run_id, coach_email: member.recipient_email, tier, action: "skipped" });
      continue;
    }

    if (dry) {
      sent++;
      details.push({ run_id: member.run_id, coach_email: member.recipient_email, tier, action: "dry_run_would_send" });
      continue;
    }

    try {
      // 1 · Map legacy → v5
      await mapLegacyToV5(member.run_id);

      // 2 · Generate the Snapshot output (agent calls + persist)
      await generateSnapshot(member.run_id);

      // 3 · Mint token + tag the run
      const token = randomUUID().replace(/-/g, "");
      await admin
        .from("cp_brand_os_runs")
        .update({ recovery_tier: tier, recovery_token: token })
        .eq("id", member.run_id);

      // 4 · Sync into the coach platform
      await syncCoachPlatform(member, tier);
      syncedToPlatform++;

      // 5 · Build attachments + upload
      const { md_url, md_text, pdf_html } = await buildAndUploadAttachments(member);

      // 6 · Compose + send email
      const claimUrl = `${APP_ORIGIN}/brand-os/claim/${token}`;
      const tpl = recoveryEmailTemplate(member, tier, claimUrl, md_url);
      if (!tpl) {
        skipped++;
        details.push({ run_id: member.run_id, coach_email: member.recipient_email, tier, action: "skipped" });
        continue;
      }

      const slug = (member.first_name ?? "coach").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const sendResult = await sendViaResend(member.recipient_email, tpl, [
        { filename: `brand-os-${slug}.md`,       content: md_text, contentType: "text/markdown" },
        { filename: `brand-os-${slug}.pdf.html`, content: pdf_html, contentType: "text/html" },
      ]);

      // 7 · Log the send
      await admin
        .from("cp_brand_os_recovery_log")
        .insert({
          run_id: member.run_id,
          coach_id: member.coach_id,
          recipient_email: member.recipient_email,
          recovery_tier: tier,
          subject: tpl.subject,
          resend_message_id: sendResult.resend_message_id ?? null,
          notes: sendResult.ok ? null : sendResult.error,
        });

      if (sendResult.ok) {
        sent++;
        details.push({ run_id: member.run_id, coach_email: member.recipient_email, tier, action: "sent" });
      } else {
        details.push({
          run_id: member.run_id,
          coach_email: member.recipient_email,
          tier,
          action: "errored",
          error: sendResult.error,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      details.push({ run_id: member.run_id, coach_email: member.recipient_email, tier, action: "errored", error: msg });
    }
  }

  return {
    cohort_size: cohort.length,
    sent,
    skipped,
    synced_to_platform: syncedToPlatform,
    details,
  };
}
