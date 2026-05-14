// /brand-os/trial/welcome?session_id=cs_...
//
// Landing page after Stripe Checkout. The webhook is racing this load,
// so we just thank the buyer + tell them to check email. If they're
// already signed in (rare — they just paid), we route them straight in.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function TripwireWelcome({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // If they're already authed (rare), drop them into Brand OS directly.
  if (user) redirect("/brand-os");

  const email = searchParams.session_id ? "your email" : "your email";

  return (
    <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--brand-soft)] border-2 border-[var(--brand-strong)]">
          <span className="text-3xl">✓</span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight leading-tight text-[color:var(--text)]">
          Paid. Check {email}.
        </h1>
        <p className="text-[color:var(--text-muted)] leading-relaxed">
          Your magic-link sign-in is on its way (usually 30 seconds). Click it to start your Brand OS run — about 30 minutes, one question at a time.
        </p>
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 text-left space-y-3">
          <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--brand-strong)]">
            What's in the email
          </p>
          <ul className="space-y-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            <li>· A one-click sign-in link (no password)</li>
            <li>· What you'll get when you finish</li>
            <li>· Direct reply path if anything's off</li>
          </ul>
        </div>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
          Not arriving? Check spam, then{" "}
          <a href="mailto:sunny.binjola@gmail.com" className="underline">email Sunny</a>{" "}
          — we'll resend manually.
        </p>
      </div>
    </div>
  );
}
