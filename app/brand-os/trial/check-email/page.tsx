// /brand-os/trial/check-email — fallback page when the auto-login at
// /brand-os/trial/welcome couldn't complete (Stripe hiccup, expired
// verify token, server-side cookie write failed, etc.).
//
// The webhook still provisions the user in the background and the
// magic-link email goes out either way — this page just tells the
// buyer that and surfaces an inline "Open Brand OS now" button if we
// have the action_link query param (skips the wait-for-email step).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { Badge } from "@/components/ui";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  missing_session:           "We didn't get the Stripe session ID back from the redirect.",
  stripe_unavailable:        "Couldn't reach Stripe to confirm payment.",
  session_not_found:         "That Stripe session ID doesn't exist or has expired.",
  not_paid:                  "Payment hasn't cleared yet. Wait a minute and refresh.",
  no_email_on_session:       "Stripe didn't capture an email on this purchase.",
  user_create_failed:        "Could not provision a Supabase account for this email.",
  verify_failed:             "Payment succeeded but the instant sign-in step didn't complete.",
  wrong_product:             "This Stripe session isn't for the Brand OS Quick Start.",
  secrets_master_key_missing: "Server is missing SECRETS_MASTER_KEY env var. The admin needs to set it: `openssl rand -base64 32` → paste into Cloudflare Pages → Settings → Environment variables → both Production and Preview → redeploy.",
  token_sign_failed:         "Could not sign the trial-access token.",
  provision_threw:           "Server crashed during provisioning. See logs.",
  no_purchase_id_after_upsert: "Server could not record the purchase row.",
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: { reason?: string; action_link?: string; detail?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/brand-os");

  const reason = (searchParams.reason ?? "").trim();
  const reasonText = REASONS[reason] ?? "The auto-sign-in step didn't complete.";
  const actionLink = (searchParams.action_link ?? "").trim();
  const detail = (searchParams.detail ?? "").trim();

  return (
    <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--brand-soft)] border-2 border-[var(--brand-strong)]">
          <span className="text-3xl">✓</span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight leading-tight text-[color:var(--text)]">
          Paid. Check your email.
        </h1>
        <p className="text-[color:var(--text-muted)] leading-relaxed">
          {reasonText} Your account is being set up and a magic-link email is on its way (usually 30 seconds).
        </p>

        {actionLink && (
          <div className="rounded-[var(--r-lg)] border-2 border-[var(--brand-strong)] bg-[var(--brand-soft)] p-5 space-y-3">
            <Badge tone="brand" size="xs" uppercase>Skip the wait</Badge>
            <p className="text-[color:var(--text)] leading-relaxed">
              Don't want to wait for the email? Click below to sign in now.
            </p>
            <a
              href={actionLink}
              className="inline-flex items-center justify-center h-11 px-6 rounded-[var(--r-md)] bg-[var(--brand-strong)] text-[color:var(--surface)] text-[length:var(--t-body)] font-bold hover:bg-[color-mix(in_srgb,var(--brand)_85%,black)] transition"
            >
              Open Brand OS →
            </a>
          </div>
        )}

        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 text-left space-y-2">
          <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
            What's in the email
          </p>
          <ul className="space-y-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            <li>· One-click sign-in link (no password)</li>
            <li>· Works from any device</li>
            <li>· Save it for later — same link resumes you next time</li>
          </ul>
        </div>

        <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
          Not arriving in 60 seconds? Check spam, then{" "}
          <a href="mailto:sunny.binjola@gmail.com" className="underline">email Sunny</a>{" "}
          — we'll resend manually.
        </p>

        {reason && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-mono">
            ref: {reason}
          </p>
        )}
        {detail && (
          <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-left">
            <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)] mb-1">
              Server detail
            </p>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text)] font-mono break-words">{detail}</p>
          </div>
        )}
      </div>
    </div>
  );
}
