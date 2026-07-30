"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import "./login.css";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const prefilledEmail = (searchParams?.get("email") ?? "").trim().toLowerCase();
  const nextPath = searchParams?.get("next") ?? null;

  const [email, setEmail] = useState(prefilledEmail);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFiredRef = useRef(false);

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/api/auth/callback${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}` },
    });
    if (err) { setError(err.message); setGoogleLoading(false); }
  }

  const fireMagicLink = useCallback(async (rawEmail: string) => {
    const clean = rawEmail.trim();
    if (!clean || !clean.includes("@")) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: `${location.origin}/api/auth/callback${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}` },
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSent(true);
  }, [nextPath]);

  // Auto-fire magic link when post-call email link arrives with prefilled email.
  // Only fires once per page load. Guarded so manual edits don't re-trigger.
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (!prefilledEmail || !prefilledEmail.includes("@")) return;
    autoFiredRef.current = true;
    void fireMagicLink(prefilledEmail);
  }, [prefilledEmail, fireMagicLink]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    await fireMagicLink(email);
  }

  return (
    <div className="lp">
      <div className="lp-left">
        <div className="lp-left-inner">
          <div className="lp-logo" style={{ opacity: 0, animation: 'lp-rise 0.9s 0.1s cubic-bezier(.16,1,.3,1) both' }}>
            <svg viewBox="0 0 100 100" style={{ width: 28, height: 28 }}><rect width="100" height="100" rx="24" fill="#00FF41"/><path d="M50 20 C35 20 25 35 25 55 C25 75 40 80 50 80 C60 80 75 75 75 55 C75 35 65 20 50 20 Z" fill="#020802"/><path d="M50 80 L50 85" stroke="#020802" strokeWidth="4" strokeLinecap="round"/></svg>
            <span className="lp-logo-text">Coach <span>Assistant</span></span>
          </div>

          <h1 className="lp-headline" style={{ opacity: 0, animation: 'lp-rise 0.9s 0.2s cubic-bezier(.16,1,.3,1) both' }}>
            Your next client is already <em>in your DMs.</em>
          </h1>

          <div className="lp-phone-row">
            <div className="lp-phone-wrap">
              <div className="lp-phone-notice">
                <span className="ndot" />
                <strong>1 new lead</strong>
                <span className="sep">·</span>
                Auto-Response drafted in 2.3s
              </div>
              <div className="lp-phone">
                <div className="lp-screen">
                  <div className="lp-sb">
                    <span>9:41</span>
                    <div className="r">
                      <svg viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="0.5"/><rect x="5" y="6" width="3" height="6" rx="0.5"/><rect x="10" y="3" width="3" height="9" rx="0.5"/><rect x="15" y="0" width="3" height="12" rx="0.5" opacity=".3"/></svg>
                      <svg viewBox="0 0 26 12" fill="none" stroke="currentColor" strokeWidth="1" style={{ width: 22, height: 10 }}><rect x="0.5" y="0.5" width="22" height="11" rx="2.5"/><rect x="2" y="2" width="19" height="8" rx="1.5" fill="currentColor"/><rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor"/></svg>
                    </div>
                  </div>
                  <div className="lp-ah">
                    <div className="lp-ah-back">‹</div>
                    <div className="lp-ah-av">M</div>
                    <div className="lp-ah-info">
                      <div className="lp-ah-name">Marcus Reyes</div>
                      <div className="lp-ah-status"><span className="od" />online · new lead</div>
                    </div>
                  </div>
                  <div className="lp-thread">
                    <div className="lp-inbound">
                      <div className="lp-ma">M</div>
                      <div>
                        <div className="lp-bubble">Been following your work. Curious about coaching — what does it look like to work with you?</div>
                        <div className="lp-ts">9:38 AM · IG DM</div>
                      </div>
                    </div>
                    <div className="lp-aid"><span>✦</span> AI suggested replies <span>✦</span></div>
                    <div className="lp-sug bad">
                      <div className="lp-sug-head">
                        <span className="lp-sug-src">Generic AI</span>
                        <span style={{ color: '#8A8A9E' }}>Edit · 100%</span>
                      </div>
                      <p className="lp-sug-txt">Hi Marcus! Thanks for reaching out. Would you like to schedule a discovery call to see if working together is a fit?</p>
                    </div>
                    <div className="lp-sug good">
                      <div className="lp-sug-head">
                        <span className="lp-sug-src">Your voice · trained</span>
                        <span style={{ color: '#00CC34', fontWeight: 700 }}>Edit · 0%</span>
                      </div>
                      <p className="lp-sug-txt">Marcus. Appreciate you being here. Before logistics, what&apos;s the real reason you&apos;re reaching out? Not &ldquo;I want to grow.&rdquo; The honest one. Tell me that and I&apos;ll tell you if I&apos;m the right person.</p>
                    </div>
                  </div>
                  <div className="lp-compose">
                    <div className="lp-compose-input">Type a message · or pick a suggestion</div>
                    <div className="lp-compose-send">↑</div>
                  </div>
                  <div className="lp-home-ind" />
                </div>
              </div>
              <p className="lp-caption" style={{ opacity: 0, animation: 'lp-rise 0.8s 0.8s cubic-bezier(.16,1,.3,1) both' }}>
                Both written by AI. Only one sounds like a <strong>coach</strong>.
              </p>
            </div>

            <div className="lp-features">
              <span className="lp-feat"><span className="lp-feat-dot" />Lead CRM</span>
              <span className="lp-feat"><span className="lp-feat-dot" />Authentic Voice</span>
              <span className="lp-feat"><span className="lp-feat-dot" />Content Engine</span>
              <span className="lp-feat"><span className="lp-feat-dot" />Client Rooms</span>
              <span className="lp-feat"><span className="lp-feat-dot" />Stripe Payments</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-right">
        <div className="lp-auth-card">
          <div className="lp-mobile-logo">
            <svg viewBox="0 0 100 100" style={{ width: 24, height: 24 }}><rect width="100" height="100" rx="24" fill="#00FF41"/><path d="M50 20 C35 20 25 35 25 55 C25 75 40 80 50 80 C60 80 75 75 75 55 C75 35 65 20 50 20 Z" fill="#020802"/><path d="M50 80 L50 85" stroke="#020802" strokeWidth="4" strokeLinecap="round"/></svg>
            Coach Assistant
          </div>

          {sent ? (
            <div className="lp-sent">
              <div className="lp-sent-icon">✓</div>
              <p className="lp-sent-title">Check your email</p>
              <p className="lp-sent-body">
                We sent a magic link to <strong>{email}</strong>.
                <br />Click it to sign in. It expires in 10 minutes.
              </p>
              <button className="lp-sent-retry" onClick={() => setSent(false)}>Use a different email →</button>
            </div>
          ) : (
            <>
              <p className="lp-auth-label">Sign in</p>
              <h2 className="lp-auth-title">Welcome back.</h2>
              <p className="lp-auth-sub">Or create your account. Same button, we handle the rest.</p>

              <button type="button" onClick={handleGoogle} disabled={googleLoading} className="lp-google">
                <svg viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="lp-google-label">{googleLoading ? "Redirecting…" : "Continue with Google"}</span>
                <span className="lp-google-arrow">→</span>
              </button>

              <div className="lp-divider">
                <span className="lp-divider-line" />
                <span className="lp-divider-text">or</span>
                <span className="lp-divider-line" />
              </div>

              <form onSubmit={handleMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label className="lp-field-label">Email address</label>
                <input type="email" className="lp-input" placeholder="you@yourcoachingbiz.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <button type="submit" className={`lp-submit${loading ? " shimmer" : ""}`} disabled={loading || !email}>
                  {loading ? "Sending…" : "Send magic link"}
                </button>
              </form>

              {error && <p className="lp-error" role="alert">{error}</p>}

              <div className="lp-trust">
                <span className="lp-trust-item"><span className="lp-trust-icon">🔒</span> Secure sign-in</span>
                <span className="lp-trust-item"><span className="lp-trust-icon">✦</span> No credit card</span>
                <span className="lp-trust-item"><span className="lp-trust-icon">∞</span> 500 leads free</span>
              </div>

              <p className="lp-terms">
                <a href="/meet">New here? Meet your assistant first (60-second interview) →</a>
              </p>

              <p className="lp-terms">
                <a href="/terms">Terms</a>
                <span className="tdot">·</span>
                <a href="/privacy">Privacy</a>
              </p>
            </>
          )}
        </div>

        <div className="lp-foot-links">
          <a href="https://elevateaisystem.com">elevateaisystem.com</a>
          <span style={{ color: 'rgba(250,250,248,0.1)' }}>·</span>
          <a href="https://elevateaisystem.com/pricing">Pricing</a>
        </div>
      </div>
    </div>
  );
}
