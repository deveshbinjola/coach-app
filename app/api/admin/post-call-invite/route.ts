// POST /api/admin/post-call-invite
//
// Sunny just got off a call. He pastes the coach's first name, email,
// optionally one note from the call. This endpoint:
//
//   1. Sends the "After our call" email (manual, personal, brand-aligned).
//   2. Records the outreach in cp_outreach_log so the admin page can show
//      who Sunny has personally reached out to.
//
// When the recipient clicks through and signs up, /auth/callback handles
// the rest: claims any anonymous Snapshot runs, sends Day 0, sets step=1.
// The daily cron then walks them through Days 1-4. So one manual email
// kicks off a 6-touch sequence with zero further work.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendPostCallInviteEmail } from "@/lib/email/post-call-invite";

export const runtime = "edge";

const ADMIN_EMAIL = "sunny.binjola@gmail.com";

type Body = {
  email?: string;
  first_name?: string;
  note?: string | null;
  ps?: string | null;
};

export async function POST(request: NextRequest) {
  // Admin-only. Two auth paths: token in header, OR signed-in admin user.
  const adminTokenEnv = process.env.BRAND_OS_ADMIN_TOKEN;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const tokenOk = Boolean(adminTokenEnv) && bearer === adminTokenEnv;

  if (!tokenOk) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const email = (body.email ?? "").trim().toLowerCase();
  const firstName = (body.first_name ?? "").trim();
  const note = body.note?.trim() || null;
  const ps = body.ps?.trim() || null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  if (!firstName) {
    return NextResponse.json({ ok: false, error: "missing_first_name" }, { status: 400 });
  }

  // Send the personalized invite.
  const result = await sendPostCallInviteEmail({
    to: email,
    firstName,
    note,
    ps,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "send_failed", rendered: { subject: result.rendered.subject, preview: result.rendered.preview } }, { status: 500 });
  }

  // Log the outreach so /admin can show who's been touched.
  // Best-effort. Don't block the response on this.
  try {
    const admin = createAdminClient();
    await admin
      .from("cp_outreach_log")
      .insert({
        email,
        first_name: firstName,
        kind: "post_call",
        note,
        snapshot_link: result.rendered.snapshotLink,
        sent_at: new Date().toISOString(),
      });
  } catch {
    // swallow · the email already went out, that's the critical path
  }

  return NextResponse.json({
    ok: true,
    sent_to: email,
    subject: result.rendered.subject,
    snapshot_link: result.rendered.snapshotLink,
  });
}
