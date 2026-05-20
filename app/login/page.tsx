"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import "./login.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/api/auth/callback` },
    });
    if (err) { setError(err.message); setGoogleLoading(false); }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/api/auth/callback` },
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  return (
    <div className="login-page">
      {/* ── Left: Brand Panel ── */}
      <div className="login-brand">
        <div className="login-vertical-text">ELEVATE</div>
        <div className="login-corner-accent" />

        <div className="login-leaf login-stagger-1">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 5C50 5 20 25 15 55C10 85 35 95 50 95C65 95 90 85 85 55C80 25 50 5 50 5ZM50 85C40 85 25 75 28 55C31 35 50 20 50 20C50 20 69 35 72 55C75 75 60 85 50 85Z" />
          </svg>
        </div>

        <h1 className="login-tagline login-stagger-2">
          Your coaching practice,{" "}
          <em>elevated</em> by AI.
        </h1>

        <p className="login-subtitle login-stagger-3">
          The command center for coaches who build with clarity,
          content, and systems — not chaos.
        </p>

        <ul className="login-proof-list login-stagger-4">
          <li className="login-proof-item">
            <span className="login-proof-icon">✦</span>
            Brand voice, content pillars, and messaging — all in one place
          </li>
          <li className="login-proof-item">
            <span className="login-proof-icon">✦</span>
            AI-powered content engine built on your real voice
          </li>
          <li className="login-proof-item">
            <span className="login-proof-icon">✦</span>
            Client rooms, lead tracking, and Stripe payments
          </li>
        </ul>

        <p className="login-quote login-stagger-5">
          &ldquo;The system does what used to take me all week —
          now I coach.&rdquo;
        </p>
      </div>

      {/* ── Right: Auth Panel ── */}
      <div className="login-auth">
        <div className="login-auth-card">
          <div className="login-mobile-logo login-stagger-r1">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 5C50 5 20 25 15 55C10 85 35 95 50 95C65 95 90 85 85 55C80 25 50 5 50 5ZM50 85C40 85 25 75 28 55C31 35 50 20 50 20C50 20 69 35 72 55C75 75 60 85 50 85Z" />
            </svg>
            ElevateAI
          </div>

          {sent ? (
            <div className="login-sent">
              <div className="login-sent-icon">✉️</div>
              <h2 className="login-sent-heading">Check your inbox</h2>
              <p className="login-sent-text">
                We sent a magic link to{" "}
                <span className="login-sent-email">{email}</span>.
                <br />
                Click it to sign in — no password needed.
              </p>
            </div>
          ) : (
            <>
              <h2 className="login-auth-heading login-stagger-r1">
                Welcome back
              </h2>
              <p className="login-auth-sub login-stagger-r2">
                Sign in to your coaching command center
              </p>

              {/* Google */}
              <button
                type="button"
                className="login-google-btn login-stagger-r2"
                onClick={handleGoogle}
                disabled={googleLoading}
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {googleLoading ? "Connecting…" : "Continue with Google"}
              </button>

              {/* Divider */}
              <div className="login-divider login-stagger-r3">
                <div className="login-divider-line" />
                <span className="login-divider-diamond">◆</span>
                <div className="login-divider-line" />
              </div>

              {/* Magic link */}
              <form onSubmit={handleMagicLink}>
                <label className="login-email-label login-stagger-r3">
                  Email address
                </label>
                <input
                  type="email"
                  className="login-email-input login-stagger-r4"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className={`login-submit-btn login-stagger-r4${loading ? " login-shimmer" : ""}`}
                  disabled={loading}
                >
                  {loading ? "Sending link…" : "Send magic link"}
                </button>
              </form>

              {error && (
                <div className="login-error">{error}</div>
              )}

              <div className="login-trust login-stagger-r5">
                <span className="login-trust-item">
                  <span className="login-trust-icon">🔒</span> Secure sign-in
                </span>
                <span className="login-trust-item">
                  <span className="login-trust-icon">✦</span> No credit card required
                </span>
                <span className="login-trust-item">
                  <span className="login-trust-icon">∞</span> 500 leads free forever
                </span>
              </div>

              <p className="login-terms login-stagger-r5">
                By signing in you agree to the{" "}
                <a href="/terms">Terms</a>
                <span className="login-dot-sep">•</span>
                <a href="/privacy">Privacy</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
