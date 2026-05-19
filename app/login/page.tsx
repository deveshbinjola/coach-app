"use client";

// Login — dark split-screen entry gate.
//
//   1. Google SSO (primary) — one click, no email round-trip.
//   2. Magic link (secondary) — email-only fallback.
//
// Design: atmospheric brand panel (left) + focused auth (right).
// Staggered cascade animations, geometric texture, tactile button states.

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,100..900,0..100;1,9..144,100..900,0..100&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        .login-page {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          background: #060a14;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          overflow: hidden;
        }

        /* ── Left: Brand Panel ─────────────────────── */
        .login-brand {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 4rem 3.5rem;
          background:
            radial-gradient(ellipse 80% 60% at 20% 30%, rgba(0,255,65,0.06) 0%, transparent 70%),
            linear-gradient(165deg, #0a1020 0%, #060a14 100%);
          overflow: hidden;
        }

        .login-brand::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,255,65,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,65,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 70% 50% at 50% 50%, black 20%, transparent 70%);
          pointer-events: none;
        }

        .login-vertical-text {
          position: absolute;
          left: 1.25rem;
          top: 50%;
          transform: translateY(-50%) rotate(-90deg);
          font-family: 'Fraunces', serif;
          font-size: 7rem;
          font-weight: 900;
          letter-spacing: 0.25em;
          color: rgba(255,255,255,0.04);
          white-space: nowrap;
          pointer-events: none;
          user-select: none;
        }

        .login-corner-accent {
          position: absolute;
          top: 2rem;
          right: 2rem;
          width: 48px;
          height: 48px;
          border-top: 2px solid rgba(0,255,65,0.25);
          border-right: 2px solid rgba(0,255,65,0.25);
          opacity: 0;
          animation: login-corner-grow 0.6s ease-out 1.2s forwards;
        }
        @keyframes login-corner-grow {
          from { opacity: 0; width: 0; height: 0; }
          to { opacity: 1; width: 48px; height: 48px; }
        }

        .login-leaf {
          width: 44px;
          height: 44px;
          margin-bottom: 2.5rem;
        }
        .login-leaf svg {
          width: 100%;
          height: 100%;
          fill: #00ff41;
          filter: drop-shadow(0 0 20px rgba(0,255,65,0.3));
        }

        .login-tagline {
          font-family: 'Fraunces', serif;
          font-optical-sizing: auto;
          font-variation-settings: "SOFT" 80;
          font-size: 2.75rem;
          font-weight: 800;
          line-height: 1.12;
          color: #fff;
          margin-bottom: 1rem;
          max-width: 440px;
        }
        .login-tagline em {
          font-style: normal;
          color: #00ff41;
        }

        .login-subtitle {
          font-size: 1rem;
          font-weight: 400;
          color: rgba(255,255,255,0.45);
          line-height: 1.7;
          max-width: 380px;
          margin-bottom: 3rem;
        }

        .login-proof-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .login-proof-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: rgba(255,255,255,0.55);
          transition: transform 0.25s ease, color 0.25s ease;
          cursor: default;
        }
        .login-proof-item:hover {
          transform: translateX(4px);
          color: rgba(255,255,255,0.75);
        }
        .login-proof-icon {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(0,255,65,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 0.65rem;
          color: #00ff41;
          transition: box-shadow 0.25s ease;
        }
        .login-proof-item:hover .login-proof-icon {
          box-shadow: 0 0 12px rgba(0,255,65,0.3);
        }

        .login-quote {
          margin-top: auto;
          padding-top: 3rem;
          font-size: 0.8rem;
          font-style: italic;
          color: rgba(255,255,255,0.4);
          line-height: 1.65;
          border-left: 2px solid rgba(0,255,65,0.3);
          padding-left: 1rem;
          max-width: 340px;
        }

        /* ── Right: Auth Panel ─────────────────────── */
        .login-auth {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 3rem 2.5rem;
          background:
            radial-gradient(ellipse 80% 60% at 80% 20%, rgba(0,255,65,0.03) 0%, transparent 60%),
            #0c1121;
        }

        .login-auth::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, black 10%, transparent 80%);
          pointer-events: none;
        }

        .login-auth-card {
          width: 100%;
          max-width: 380px;
          position: relative;
          z-index: 1;
        }

        .login-mobile-logo {
          display: none;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 2rem;
          font-family: 'Fraunces', serif;
          font-weight: 800;
          font-size: 1.25rem;
          color: #fff;
        }
        .login-mobile-logo svg {
          width: 28px;
          height: 28px;
          fill: #00ff41;
        }

        .login-auth-heading {
          font-family: 'Fraunces', serif;
          font-variation-settings: "SOFT" 60;
          font-size: 1.75rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 0.35rem;
        }

        .login-auth-sub {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.4);
          margin-bottom: 2rem;
        }

        /* Google button */
        .login-google-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.625rem;
          width: 100%;
          padding: 0.875rem 1rem;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          background: rgba(255,255,255,0.04);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
          color: #fff;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .login-google-btn:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.18);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.2);
        }
        .login-google-btn:active {
          transform: scale(0.985);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .login-google-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .login-google-btn svg {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        /* Divider */
        .login-divider {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 1.75rem 0;
        }
        .login-divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.08);
        }
        .login-divider-diamond {
          color: #00ff41;
          font-size: 0.55rem;
          opacity: 0.6;
        }

        /* Magic link form */
        .login-email-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          color: rgba(255,255,255,0.5);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 0.5rem;
        }

        .login-email-input {
          width: 100%;
          padding: 0.8rem 1rem;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          background: rgba(255,255,255,0.03);
          color: #fff;
          font-family: inherit;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .login-email-input::placeholder { color: rgba(255,255,255,0.2); }
        .login-email-input:focus {
          border-color: rgba(0,255,65,0.4);
          box-shadow: 0 0 0 3px rgba(0,255,65,0.08);
        }

        .login-submit-btn {
          position: relative;
          width: 100%;
          margin-top: 0.75rem;
          padding: 0.85rem 1rem;
          border: none;
          border-radius: 10px;
          background: #00ff41;
          color: #060a14;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.2s ease;
        }
        .login-submit-btn:hover {
          background: #1aff55;
          box-shadow: 0 4px 20px rgba(0,255,65,0.25);
        }
        .login-submit-btn:active {
          transform: scale(0.985);
          box-shadow: 0 2px 10px rgba(0,255,65,0.15);
        }
        .login-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Loading shimmer */
        .login-submit-btn.login-shimmer::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          animation: login-shimmer-slide 1.5s ease-in-out infinite;
        }
        @keyframes login-shimmer-slide {
          0% { left: -100%; }
          100% { left: 100%; }
        }

        /* Error */
        .login-error {
          margin-top: 1rem;
          padding: 0.65rem 0.85rem;
          border-radius: 8px;
          background: rgba(255,60,60,0.08);
          border-left: 3px solid rgba(255,60,60,0.6);
          font-size: 0.8rem;
          color: rgba(255,100,100,0.9);
        }

        /* Success */
        .login-sent {
          text-align: center;
          padding: 2rem 0;
        }
        .login-sent-icon {
          font-size: 2.5rem;
          margin-bottom: 0.75rem;
        }
        .login-sent-heading {
          font-family: 'Fraunces', serif;
          font-size: 1.5rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 0.5rem;
        }
        .login-sent-text {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.5);
          line-height: 1.6;
        }
        .login-sent-email {
          color: #00ff41;
          font-weight: 600;
        }

        /* Terms */
        .login-terms {
          margin-top: 2.5rem;
          text-align: center;
          font-size: 0.7rem;
          color: rgba(255,255,255,0.25);
        }
        .login-terms a {
          color: rgba(255,255,255,0.35);
          text-decoration: none;
        }
        .login-terms a:hover {
          color: rgba(255,255,255,0.55);
        }
        .login-dot-sep {
          display: inline-block;
          margin: 0 0.5rem;
          color: #00ff41;
          opacity: 0.3;
        }

        /* Trust signals */
        .login-trust {
          display: flex;
          justify-content: center;
          gap: 1.25rem;
          margin-top: 1.75rem;
          flex-wrap: wrap;
        }
        .login-trust-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.7rem;
          color: rgba(255,255,255,0.3);
          white-space: nowrap;
        }
        .login-trust-icon {
          font-size: 0.6rem;
          color: rgba(0,255,65,0.5);
        }

        /* ── Staggered Cascade Animations ─────────── */
        @keyframes login-fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-stagger-1 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.15s forwards; }
        .login-stagger-2 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.3s forwards; }
        .login-stagger-3 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.45s forwards; }
        .login-stagger-4 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.6s forwards; }
        .login-stagger-5 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.75s forwards; }
        .login-stagger-6 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.9s forwards; }

        .login-stagger-r1 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.35s forwards; }
        .login-stagger-r2 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.5s forwards; }
        .login-stagger-r3 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.65s forwards; }
        .login-stagger-r4 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.8s forwards; }
        .login-stagger-r5 { opacity: 0; animation: login-fade-up 0.6s ease-out 0.95s forwards; }

        /* ── Responsive ───────────────────────────── */
        @media (max-width: 1024px) {
          .login-page { grid-template-columns: 1fr 1fr; }
          .login-tagline { font-size: 2.25rem; }
          .login-brand { padding: 3rem 2.5rem; }
        }
        @media (max-width: 768px) {
          .login-page {
            grid-template-columns: 1fr;
            grid-template-rows: auto;
          }
          .login-brand { display: none; }
          .login-auth {
            min-height: 100vh;
            padding: 2rem 1.5rem;
          }
          .login-mobile-logo { display: flex; }
        }
        @media (max-width: 420px) {
          .login-auth { padding: 1.5rem 1.25rem; }
          .login-auth-heading { font-size: 1.5rem; }
          .login-google-btn { padding: 0.75rem 0.875rem; font-size: 0.85rem; }
          .login-submit-btn { padding: 0.75rem 0.875rem; font-size: 0.85rem; }
        }
      `}</style>

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
    </>
  );
}
