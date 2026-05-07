"use client";

// Login — two doors:
//
//   1. Google SSO (primary) — one click, no email round-trip. Most coaches
//      sign in to work tools with Google, so this is the default path.
//   2. Magic link (secondary) — email-only fallback for anyone who prefers
//      not to use Google. Same OAuth callback handles both flows because
//      Supabase Auth normalizes them into a single user identity.
//
// Account linking note: Supabase merges Google + magic-link sign-ins for the
// same verified email into one auth.users row, so a coach who started with
// magic link and switches to Google later keeps the same coach_id and all
// their data. (Verify "Confirm email" + automatic linking are on in the
// Supabase dashboard before relying on this in production.)

import { useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    const supabase = createClient();
    // signInWithOAuth navigates the browser away to Google on success, so the
    // loading state only renders for the brief moment before redirect, or
    // permanently if Supabase returns an error before any navigation happens.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (otpError) setError(otpError.message);
    else setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative bg-[var(--navy)] p-6 text-[color:var(--text-inverse)] sm:p-8 lg:min-h-[640px]">
          <div className="absolute inset-x-0 top-0 h-px bg-[var(--brand)]" />
          <div className="flex items-center gap-2.5">
            <BrandLogo iconSize={42} showWordmark={false} />
            <div className="text-2xl font-extrabold tracking-tight">
              Elevate<span className="text-[color:var(--brand)]">AI</span>
              <span className="ml-2 border-l border-white/15 pl-2 text-base font-semibold text-white/55">
                Coach
              </span>
            </div>
          </div>

          <div className="mt-14 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white/55">
              Lead rescue
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
              Voice OS
            </div>
            <h1 className="font-display mt-5 text-4xl font-bold leading-[var(--leading-tight)] tracking-tight sm:text-5xl">
              AI that follows up like you would.
            </h1>
            <p className="mt-4 text-[length:var(--t-body)] leading-[var(--leading-relaxed)] text-white/65">
              Capture the lead, preserve your voice, and know the next move before the conversation goes cold.
            </p>
          </div>

          <div className="mt-10 grid gap-3">
            <div className="rounded-[var(--r-lg)] border border-white/10 bg-white/[0.06] p-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/45">
                Generic AI
              </div>
              <p className="mt-2 text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-white/55">
                “Thanks for reaching out. I would love to learn more about your goals.”
              </p>
            </div>
            <div className="rounded-[var(--r-lg)] border border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] p-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand)]">
                ElevateAI Coach
              </div>
              <p className="mt-2 text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-white/80">
                “I hear the pattern. You are not lazy, you are carrying too many open loops. Want me to help you name the real one?”
              </p>
            </div>
          </div>

          <p className="mt-8 text-[length:var(--t-caption)] font-bold text-white/50">
            Built for coaches who sell through trust, timing, and voice.
          </p>
        </section>

        <section className="p-6 sm:p-8 lg:p-10 lg:flex lg:flex-col lg:justify-center">
          <div className="mb-8">
            <h2 className="text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)]">
              Welcome.
            </h2>
            <p className="mt-2 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
              Open your coach operating system.
            </p>
          </div>

        {sent ? (
          <div className="rounded-[var(--r-md)] bg-[var(--brand-soft)] border border-[color-mix(in_srgb,var(--brand)_30%,transparent)] p-4">
            <p className="font-bold text-[color:var(--text)]">Check your email.</p>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">
              We sent a magic link to <strong>{email}</strong>. Click it to
              sign in.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Google SSO — primary path. 44px tap target. */}
            <Button
              variant="ghost"
              onClick={onGoogleSignIn}
              disabled={googleLoading}
              block
              leadingIcon={<GoogleIcon />}
              className="h-12"
              aria-label="Sign in with Google"
            >
              {googleLoading ? "Redirecting…" : "Sign in with Google"}
            </Button>

            {/* Divider — visually separates the one-click path from the
                magic-link form so they don't compete for attention. */}
            <div className="flex items-center gap-3 text-[length:var(--t-label)] text-[color:var(--text-faint)] font-bold uppercase tracking-widest">
              <div className="flex-1 h-px bg-[var(--border-faint)]" />
              <span>or</span>
              <div className="flex-1 h-px bg-[var(--border-faint)]" />
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-[length:var(--t-label)] font-bold uppercase tracking-wider mb-1.5 text-[color:var(--text-faint)]">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] text-[color:var(--text)] focus:border-[var(--brand-strong)] focus:outline-none"
                  placeholder="you@yourcoachingsite.com"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                block
                className="h-12"
              >
                {loading ? "Sending…" : "Send Magic Link"}
              </Button>
            </form>

            {error && (
              <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-6 text-center">
          Need help? Email{" "}
          <a
            href="mailto:sunny.binjola@gmail.com"
            className="underline text-[color:var(--text)] hover:text-[color:var(--brand-strong)]"
          >
            sunny.binjola@gmail.com
          </a>
        </p>
        </section>
      </div>
    </main>
  );
}

// Official Google "G" logo per Google's brand guidelines. Inlined as SVG so
// the button renders instantly with no network round-trip and no broken-image
// edge case if a CDN ever blips.
function GoogleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}
