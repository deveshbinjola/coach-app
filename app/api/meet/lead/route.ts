// POST /api/meet/lead — capture an email from the /meet result screen and
// send the archetype email (public, no auth).
//
// Closes the funnel leak: a visitor who finishes the teaser but doesn't sign
// up used to vanish with their answers stuck in localStorage. Now their email
// + archetype + answers land in cp_meet_leads (service-role only, RLS locked)
// and they get the result in their inbox with a signup CTA.
//
// The insert is the priority; the email is best-effort. A captured lead with
// a failed send is still a lead (email_status records the outcome).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import {
  ARCHETYPES,
  optionValues,
  TIME_DRAIN_OPTIONS,
  HAND_OFF_OPTIONS,
  DESIRE_OPTIONS,
  type ArchetypeSlug,
} from "@/lib/assistant-interview";
import { sendArchetypeEmail } from "@/lib/email/archetype-result";

export const runtime = "edge";

const TIME_DRAINS: string[] = optionValues(TIME_DRAIN_OPTIONS);
const HAND_OFFS: string[] = optionValues(HAND_OFF_OPTIONS);
const DESIRES: string[] = optionValues(DESIRE_OPTIONS);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown"
  );
}

type Body = {
  email?: string;
  archetype?: string;
  answers?: {
    timeDrain?: string | null;
    handOffFirst?: string | null;
    desires?: string[];
  };
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
};

export async function POST(request: NextRequest) {
  const rl = rateLimit(`meet/lead:${clientIp(request)}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 });
  }

  let body: Body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase().slice(0, 320);
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }

  const archetype = ARCHETYPES[(body.archetype ?? "") as ArchetypeSlug];
  if (!archetype) {
    return NextResponse.json({ error: "Unknown archetype." }, { status: 400 });
  }

  const a = body.answers ?? {};
  const answers = {
    timeDrain: typeof a.timeDrain === "string" && TIME_DRAINS.includes(a.timeDrain) ? a.timeDrain : null,
    handOffFirst: typeof a.handOffFirst === "string" && HAND_OFFS.includes(a.handOffFirst) ? a.handOffFirst : null,
    desires: Array.isArray(a.desires) ? a.desires.filter((d) => typeof d === "string" && DESIRES.includes(d)) : [],
  };

  const admin = createAdminClient();
  const { data: row, error: insertErr } = await admin
    .from("cp_meet_leads")
    .insert({
      email,
      archetype: archetype.slug,
      answers,
      utm_source: (body.utm_source ?? "").slice(0, 200) || null,
      utm_medium: (body.utm_medium ?? "").slice(0, 200) || null,
      utm_campaign: (body.utm_campaign ?? "").slice(0, 200) || null,
      referrer: (body.referrer ?? "").slice(0, 500) || null,
      user_agent: (request.headers.get("user-agent") ?? "").slice(0, 500) || null,
    })
    .select("id")
    .single();

  if (insertErr || !row) {
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }

  // Best-effort send; record the outcome either way.
  const sent = await sendArchetypeEmail(email, archetype);
  await admin
    .from("cp_meet_leads")
    .update({ email_status: sent.ok ? "sent" : sent.error === "no_resend_key" ? "skipped" : "failed" })
    .eq("id", row.id);

  return NextResponse.json({ ok: true, emailed: sent.ok });
}
