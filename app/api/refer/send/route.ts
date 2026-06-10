// POST /api/refer/send · public · referral send
//
// Called by the /refer page when a coach refers a friend.
// Sends a personalized invite to the friend, logs the referral in
// cp_outreach_log so /admin/outreach shows the chain.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendReferralInviteEmail } from "@/lib/email/referral-invite";

export const runtime = "edge";

type Body = {
  from_email?: string;
  from_first_name?: string;
  friend_email?: string;
  friend_first_name?: string;
  note?: string | null;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const fromEmail = (body.from_email ?? "").trim().toLowerCase();
  const fromFirstName = (body.from_first_name ?? "").trim();
  const friendEmail = (body.friend_email ?? "").trim().toLowerCase();
  const friendFirstName = (body.friend_first_name ?? "").trim();
  const note = body.note?.trim() || null;

  if (!fromEmail || !fromEmail.includes("@")) {
    return NextResponse.json({ ok: false, error: "invalid_from_email" }, { status: 400 });
  }
  if (!friendEmail || !friendEmail.includes("@")) {
    return NextResponse.json({ ok: false, error: "invalid_friend_email" }, { status: 400 });
  }
  if (!friendFirstName) {
    return NextResponse.json({ ok: false, error: "missing_friend_first_name" }, { status: 400 });
  }
  if (fromEmail === friendEmail) {
    return NextResponse.json({ ok: false, error: "self_referral" }, { status: 400 });
  }

  // Look up the referrer's first name if not provided
  let referrerFirstName = fromFirstName;
  if (!referrerFirstName) {
    const admin = createAdminClient();
    // Try cp_coaches first
    const { data: coach } = await admin
      .from("cp_coaches")
      .select("full_name")
      .eq("email", fromEmail)
      .maybeSingle();
    if (coach?.full_name) {
      referrerFirstName = (coach.full_name as string).split(/\s+/)[0];
    } else {
      // Fall back to email-for-claim in cp_brand_os_runs
      const { data: run } = await admin
        .from("cp_brand_os_runs")
        .select("first_name_for_claim")
        .eq("email_for_claim", fromEmail)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (run?.first_name_for_claim) {
        referrerFirstName = run.first_name_for_claim as string;
      } else {
        // Last resort: derive from the local-part of the email
        referrerFirstName = fromEmail.split("@")[0].replace(/[^a-zA-Z]/g, "") || "A friend";
        referrerFirstName = referrerFirstName.charAt(0).toUpperCase() + referrerFirstName.slice(1);
      }
    }
  }

  // Send the invite
  const result = await sendReferralInviteEmail({
    to: friendEmail,
    friendFirstName,
    referrerFirstName,
    note,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "send_failed" },
      { status: 500 },
    );
  }

  // Log to cp_outreach_log so /admin/outreach surfaces it
  try {
    const admin = createAdminClient();
    await admin.from("cp_outreach_log").insert({
      email: friendEmail,
      first_name: friendFirstName,
      kind: "referral",
      note,
      referred_by_email: fromEmail,
      referred_by_first_name: referrerFirstName,
      sent_at: new Date().toISOString(),
    });
  } catch {
    // swallow — email already sent, log is secondary
  }

  return NextResponse.json({
    ok: true,
    sent_to: friendEmail,
    referrer_first_name: referrerFirstName,
  });
}
