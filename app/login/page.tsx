"use client";

// Login — the entry gate.
//
//   1. Google SSO (primary) — one click, no email round-trip.
//   2. Magic link (secondary) — email-only fallback.
//
// Design: dark split — atmospheric brand on the left, focused auth on
// the right. Feels like stepping into a threshold, not reading a
// landing page.

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("login-body");

    let ticking = false;
    const onMove = (e: PointerEvent) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        glowRef.current?.style.setProperty("--gx", x + "%");
        glowRef.current?.style.setProperty("--gy", y + "%");
        ticking = false;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll(".login-glow, .login-grain, .login-orb").forEach((el) => (el as HTMLElement).style.display = "none");
    }

    return () => {
      document.body.classList.remove("login-body");
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  async function onGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  }

  async function onMagicLinkSubmit(e: React.FormEvent) {
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
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300,0;9..144,500,30;9..144,700,30;9..144,800,100&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      />

      {/* Atmosphere */}
      <div className="login-glow" ref={glowRef} aria-hidden="true" />
      <div className="login-grain" aria-hidden="true" />

      <div className="login-split">
        {/* ── LEFT: Brand atmosphere ── */}
        <div className="login-brand">
          <div className="login-orb login-orb-1" aria-hidden="true" />
          <div className="login-orb login-orb-2" aria-hidden="true" />

          <div className="login-brand-inner">
            <div className="login-logo">
              <span className="login-logo-dot" />
              <span className="login-logo-text">
                ElevateAI<span className="login-logo-period">.</span>
              </span>
            </div>

            <h1 className="login-statement">
              Your next client is already
              <br />
              <em>in your DMs.</em>
            </h1>

            <div className="login-proof">
              <div className="login-proof-item">
                <span className="login-proof-icon">✦</span>
                <span>Voice-trained AI that sounds like you</span>
              </div>
              <div className="login-proof-item">
                <span className="login-proof-icon">◆</span>
                <span>Content, leads, clients — one nervous system</span>
              </div>
              <div className="login-proof-item">
                <span className="login-proof-icon">●</span>
                <span>Free forever for your first 500 leads</span>
              </div>
            </div>

            <p className="login-quiet">
              &ldquo;AI that sounds like a coach, not a chatbot.&rdquo;
            </p>
          </div>

          <div className="login-brand-foot">
            <span>COACH PLATFORM</span>
            <span className="login-brand-sep" />
            <span>BUILT FOR COACHES, BY A COACH</span>
          </div>
        </div>

        {/* ── RIGHT: Auth zone ── */}
        <div className="login-auth">
          <div className="login-auth-inner">
            <div className="login-auth-header">
              <p className="login-auth-label">Sign in</p>
              <h2 className="login-auth-title">Welcome back.</h2>
              <p className="login-auth-sub">
                Or create your account — same button, we handle the rest.
              </p>
            </div>

            {sent ? (
              <div className="login-sent">
                <div className="login-sent-icon">✓</div>
                <p className="login-sent-title">Check your email</p>
                <p className="login-sent-body">
                  We sent a magic link to <strong>{email}</strong>.
                  <br />Click it to sign in — it expires in 10 minutes.
                </p>
                <button className="login-sent-retry" onClick={() => setSent(false)}>
                  Use a different email →
                </button>
              </div>
            ) : (
              <div className="login-form-zone">
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={googleLoading}
                  className="login-google"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span className="login-google-label">
                    {googleLoading ? "Redirecting…" : "Continue with Google"}
                  </span>
                  <span className="login-google-arrow">→</span>
                </button>

                <div className="login-divider">
                  <span className="login-divider-line" />
                  <span className="login-divider-text">or</span>
                  <span className="login-divider-line" />
                </div>

                <form onSubmit={onMagicLinkSubmit} className="login-magic">
                  <label className="login-field-label" htmlFor="login-email">Email address</label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourcoachingbiz.com"
                    className="login-input"
                  />
                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="login-submit"
                  >
                    {loading ? "Sending…" : "Send magic link"}
                  </button>
                </form>

                {error && (
                  <p className="login-error" role="alert">{error}</p>
                )}
              </div>
            )}

            <div className="login-terms">
              No credit card required · 500 leads free forever
            </div>
          </div>

          <div className="login-auth-links">
            <a href="https://elevateaisystem.com">elevateaisystem.com</a>
            <span className="login-auth-links-sep">·</span>
            <a href="https://elevateaisystem.com/pricing">Pricing</a>
          </div>
        </div>
      </div>

      <style>{loginCSS}</style>
    </>
  );
}

const loginCSS = `
/* ─── Reset on body ─── */
.login-body {
  margin: 0;
  padding: 0;
  background: #060A14;
  color: #FAFAF8;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  height: 100vh;
}
.login-body *, .login-body *::before, .login-body *::after { box-sizing: border-box; }
.login-body a { color: inherit; text-decoration: none; }
.login-body ::selection { background: #00FF41; color: #0A0F1C; }

/* ─── Atmosphere ─── */
.login-glow {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(900px circle at var(--gx, 30%) var(--gy, 40%),
    rgba(0,255,65,0.07), transparent 50%);
  transition: background 0.4s ease-out;
}
.login-grain {
  position: fixed; inset: 0; z-index: 1; pointer-events: none;
  opacity: 0.3; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}

/* ─── Split layout ─── */
.login-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 100vh;
  position: relative;
  z-index: 2;
}

/* ─── LEFT: Brand ─── */
.login-brand {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem 4rem;
  overflow: hidden;
  border-right: 1px solid rgba(255,255,255,0.04);
}
.login-brand-inner {
  position: relative;
  z-index: 2;
  max-width: 520px;
  opacity: 0;
  animation: login-rise 0.9s 0.1s cubic-bezier(.16,1,.3,1) both;
}
.login-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
}
.login-orb-1 {
  width: 500px; height: 500px;
  top: -15%; right: -10%;
  background: radial-gradient(circle, rgba(0,255,65,0.12), transparent 65%);
  animation: login-drift 20s ease-in-out infinite;
}
.login-orb-2 {
  width: 350px; height: 350px;
  bottom: -10%; left: 10%;
  background: radial-gradient(circle, rgba(0,255,65,0.06), transparent 65%);
  animation: login-drift 16s ease-in-out infinite reverse;
}
@keyframes login-drift {
  0%,100% { transform: translate(0,0) scale(1); }
  50% { transform: translate(3%,-4%) scale(1.08); }
}

.login-logo {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 3rem;
}
.login-logo-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #00FF41;
  box-shadow: 0 0 12px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.2);
  animation: login-pulse 3s ease-in-out infinite;
}
@keyframes login-pulse {
  0%,100% { box-shadow: 0 0 12px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.2); }
  50% { box-shadow: 0 0 18px rgba(0,255,65,0.7), 0 0 60px rgba(0,255,65,0.3); }
}
.login-logo-text {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 800;
  font-size: 1.15rem;
  letter-spacing: -0.02em;
  color: #FAFAF8;
  font-variation-settings: "SOFT" 30, "opsz" 144;
}
.login-logo-period { color: #00CC34; }

.login-statement {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 300;
  font-size: clamp(2rem, 3.2vw, 3.2rem);
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: rgba(250,250,248,0.92);
  margin: 0 0 2.5rem;
  font-variation-settings: "SOFT" 0, "opsz" 144;
}
.login-statement em {
  font-style: normal;
  font-weight: 800;
  color: #00FF41;
  font-variation-settings: "SOFT" 100, "opsz" 144;
  text-shadow: 0 0 40px rgba(0,255,65,0.25);
}

.login-proof {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-bottom: 3rem;
}
.login-proof-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  font-size: 0.88rem;
  color: rgba(250,250,248,0.55);
  letter-spacing: 0.01em;
}
.login-proof-icon {
  width: 20px;
  text-align: center;
  color: #00CC34;
  font-size: 0.7rem;
  flex-shrink: 0;
}

.login-quiet {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 0.95rem;
  font-weight: 500;
  color: rgba(250,250,248,0.3);
  font-variation-settings: "SOFT" 100;
  letter-spacing: -0.005em;
  line-height: 1.5;
  border-left: 2px solid rgba(0,255,65,0.2);
  padding-left: 1rem;
}

.login-brand-foot {
  position: absolute;
  bottom: 2rem;
  left: 4rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(250,250,248,0.2);
}
.login-brand-sep {
  width: 1px;
  height: 12px;
  background: rgba(250,250,248,0.1);
}

/* ─── RIGHT: Auth ─── */
.login-auth {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  position: relative;
  background: linear-gradient(170deg, #080D18 0%, #0C1220 40%, #0A0F1C 100%);
}
.login-auth-inner {
  width: 100%;
  max-width: 400px;
  opacity: 0;
  animation: login-rise 0.9s 0.25s cubic-bezier(.16,1,.3,1) both;
}

.login-auth-header { margin-bottom: 2.5rem; }
.login-auth-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #00CC34;
  margin-bottom: 0.75rem;
}
.login-auth-title {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 800;
  font-size: 2rem;
  letter-spacing: -0.03em;
  color: #FAFAF8;
  margin: 0 0 0.5rem;
  font-variation-settings: "SOFT" 30, "opsz" 96;
}
.login-auth-sub {
  font-size: 0.85rem;
  color: rgba(250,250,248,0.4);
  line-height: 1.5;
  margin: 0;
}

/* Google button */
.login-google {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.95rem 1.25rem;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  color: #FAFAF8;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.login-google:hover:not(:disabled) {
  background: rgba(255,255,255,0.1);
  border-color: rgba(0,255,65,0.25);
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,255,65,0.1);
}
.login-google:disabled { opacity: 0.5; cursor: wait; }
.login-google svg { width: 20px; height: 20px; flex-shrink: 0; }
.login-google-label { flex: 1; }
.login-google-arrow {
  color: rgba(250,250,248,0.3);
  transition: color 0.2s, transform 0.2s;
}
.login-google:hover:not(:disabled) .login-google-arrow {
  color: #00FF41;
  transform: translateX(3px);
}

/* Divider */
.login-divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.5rem 0;
}
.login-divider-line {
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.06);
}
.login-divider-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(250,250,248,0.2);
}

/* Magic link form */
.login-magic {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.login-field-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(250,250,248,0.35);
}
.login-input {
  width: 100%;
  height: 48px;
  padding: 0 1rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  color: #FAFAF8;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 0.9rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.login-input:focus {
  outline: none;
  border-color: rgba(0,255,65,0.4);
  box-shadow: 0 0 0 3px rgba(0,255,65,0.08), 0 0 20px rgba(0,255,65,0.06);
}
.login-input::placeholder { color: rgba(250,250,248,0.2); }

.login-submit {
  width: 100%;
  height: 48px;
  background: #00FF41;
  color: #0A0F1C;
  border: none;
  border-radius: 10px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 700;
  font-size: 0.88rem;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}
.login-submit:hover:not(:disabled) {
  background: #00E63B;
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(0,255,65,0.3), 0 0 60px rgba(0,255,65,0.1);
}
.login-submit:disabled { opacity: 0.4; cursor: not-allowed; }

/* Error */
.login-error {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: #FF4040;
  font-weight: 500;
}

/* Sent state */
.login-sent {
  text-align: center;
  padding: 2rem 1rem;
  border: 1px solid rgba(0,255,65,0.2);
  border-radius: 14px;
  background: rgba(0,255,65,0.04);
}
.login-sent-icon {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: rgba(0,255,65,0.12);
  color: #00FF41;
  font-size: 1.3rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
  box-shadow: 0 0 30px rgba(0,255,65,0.15);
}
.login-sent-title {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 700;
  font-size: 1.25rem;
  color: #FAFAF8;
  margin-bottom: 0.5rem;
}
.login-sent-body {
  font-size: 0.85rem;
  color: rgba(250,250,248,0.5);
  line-height: 1.6;
  margin-bottom: 1.25rem;
}
.login-sent-body strong { color: #FAFAF8; }
.login-sent-retry {
  background: none;
  border: none;
  color: #00CC34;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  border-bottom: 1px dotted rgba(0,204,52,0.4);
  padding-bottom: 2px;
  transition: color 0.15s;
}
.login-sent-retry:hover { color: #00FF41; }

/* Terms */
.login-terms {
  margin-top: 2rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(250,250,248,0.2);
  text-align: center;
}

/* Bottom links */
.login-auth-links {
  position: absolute;
  bottom: 2rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(250,250,248,0.2);
}
.login-auth-links a {
  transition: color 0.15s;
  border-bottom: 1px solid transparent;
}
.login-auth-links a:hover {
  color: rgba(250,250,248,0.5);
  border-bottom-color: rgba(250,250,248,0.15);
}
.login-auth-links-sep { color: rgba(250,250,248,0.1); }

/* Animation */
@keyframes login-rise {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ─── Responsive ─── */
@media (max-width: 900px) {
  .login-split {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 100vh;
  }
  .login-brand {
    padding: 2.5rem 2rem 2rem;
    border-right: none;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .login-brand-inner { max-width: 100%; }
  .login-statement { font-size: clamp(1.6rem, 5vw, 2.2rem); margin-bottom: 1.5rem; }
  .login-proof { margin-bottom: 1.5rem; }
  .login-quiet { display: none; }
  .login-brand-foot { position: static; margin-top: 1.5rem; }
  .login-auth { padding: 2rem 1.5rem 3rem; min-height: auto; }
  .login-auth-inner { max-width: 100%; }
}
@media (max-width: 480px) {
  .login-brand { padding: 2rem 1.25rem 1.5rem; }
  .login-auth { padding: 1.5rem 1.25rem 2.5rem; }
  .login-auth-title { font-size: 1.5rem; }
}
`;
