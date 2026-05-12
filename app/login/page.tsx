"use client";

// Login — the NexCard entry page.
//
//   1. Google SSO (primary) — one click, no email round-trip.
//   2. Magic link (secondary) — email-only fallback.
//
// Same OAuth callback handles both flows because Supabase Auth normalizes
// them into a single user identity. Supabase merges Google + magic-link
// sign-ins for the same verified email into one auth.users row.

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneRef = useRef<HTMLDivElement>(null);
  const cursorLightRef = useRef<HTMLDivElement>(null);
  const embersHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("nexcard-body");

    // ----- Cursor-following light -----
    let cursorTicking = false;
    const onPointerMove = (e: PointerEvent) => {
      const mx = (e.clientX / window.innerWidth) * 100;
      const my = (e.clientY / window.innerHeight) * 100;
      if (cursorTicking) return;
      cursorTicking = true;
      requestAnimationFrame(() => {
        cursorLightRef.current?.style.setProperty("--mx", mx + "%");
        cursorLightRef.current?.style.setProperty("--my", my + "%");
        cursorTicking = false;
      });
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    // ----- Phone 3D tilt -----
    const phone = phoneRef.current;
    let tiltTicking = false;
    const maxTilt = 5;
    const onPhoneMove = (e: PointerEvent) => {
      if (!phone) return;
      const rect = phone.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotY = (x - 0.5) * 2 * maxTilt;
      const rotX = (0.5 - y) * 2 * maxTilt;
      if (tiltTicking) return;
      tiltTicking = true;
      requestAnimationFrame(() => {
        if (phone)
          phone.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        tiltTicking = false;
      });
    };
    const onPhoneLeave = () => {
      if (phone) phone.style.transform = "";
    };
    phone?.addEventListener("pointermove", onPhoneMove);
    phone?.addEventListener("pointerleave", onPhoneLeave);

    // ----- Drifting embers -----
    const host = embersHostRef.current;
    if (host && !host.dataset.spawned) {
      host.dataset.spawned = "1";
      const COUNT = 8;
      for (let i = 0; i < COUNT; i++) {
        const e = document.createElement("span");
        e.className = "ember";
        const startX = Math.random() * 100;
        const duration = 18 + Math.random() * 14;
        const delay = -Math.random() * duration;
        const size = 3 + Math.random() * 4;
        e.style.left = startX + "%";
        e.style.width = size + "px";
        e.style.height = size + "px";
        e.style.animationDuration = duration + "s";
        e.style.animationDelay = delay + "s";
        host.appendChild(e);
      }
    }

    // ----- Reduced motion -----
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document
        .querySelectorAll(".aurora-drift, .cursor-light, .embers")
        .forEach((el) => el.remove());
      if (phone) phone.style.animation = "none";
    }

    return () => {
      document.body.classList.remove("nexcard-body");
      window.removeEventListener("pointermove", onPointerMove);
      phone?.removeEventListener("pointermove", onPhoneMove);
      phone?.removeEventListener("pointerleave", onPhoneLeave);
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
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,500,30;9..144,700,30;9..144,800,30;9..144,900,100&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      />

      {/* Atmospheric depth layers */}
      <div className="aurora-drift" aria-hidden="true" />
      <div className="embers" ref={embersHostRef} aria-hidden="true" />
      <div className="cursor-light" ref={cursorLightRef} aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="nc-topbar">
        <div className="brand-row">
          <a href="/" className="brand">
            <span className="brand-dot" />
            ElevateAI<span style={{ color: "var(--green-dk)" }}>.</span>
          </a>
          <span className="brand-divider" />
          <span className="brand-tag">Coach Platform</span>
        </div>
        <nav className="topbar-links">
          <a href="https://elevateaisystem.com">Marketing site ↗</a>
          <a href="https://elevateaisystem.com/pricing">Pricing</a>
        </nav>
      </header>

      <main className="stage">
        <div className="bg-type left" aria-hidden="true">Coach</div>
        <div className="bg-type right" aria-hidden="true">OS</div>

        <section className="hero-mini">
          <div className="eyebrow">
            <span className="pulse" />
            AI-first platform · built for coaches, by a coach
          </div>
          <h1 className="headline">
            The next <em>3 clients</em> you&apos;ll sign are already in your DMs.
          </h1>
        </section>

        <section className="tri">
          <div className="col-side left">
            <div className="tags-row">
              <span className="tag-pill">Voice Memory</span>
              <span className="tag-pill dark">Coach Platform</span>
              <span className="tag-pill">Lead Pipeline</span>
              <span className="tag-pill">Content Engine</span>
              <span className="tag-pill">Brand OS</span>
            </div>
            <div className="quote-brackets">
              AI that<br />sounds like you,<br />not ChatGPT.
            </div>
            <div className="feature-callout left-feature">
              <h3 className="feature-headline left">
                <span className="icon">✦</span> Content Engine
              </h3>
              <p className="feature-desc">
                Carousels, captions, newsletters, LinkedIn posts. All drafted in your voice — ready to ship in minutes, not hours.
              </p>
            </div>
            <p className="left-desc">
              Coach OS captures your leads, learns your voice, and drafts every reply in your tone. Free forever for your first 500 leads.
            </p>
          </div>

          <div className="col-center">
            <div className="demo">
              <div className="phone-notice" aria-hidden="true">
                <span className="nx-dot" />
                <strong>1 new lead</strong>
                <span className="sep">·</span>
                Auto-Response drafted in 2.3s
              </div>
              <div className="phone" ref={phoneRef}>
                <div className="screen">
                  <div className="status-bar">
                    <span className="time">9:41</span>
                    <div className="right">
                      <svg viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
                        <rect x="0" y="8" width="3" height="4" rx="0.5" />
                        <rect x="5" y="6" width="3" height="6" rx="0.5" />
                        <rect x="10" y="3" width="3" height="9" rx="0.5" />
                        <rect x="15" y="0" width="3" height="12" rx="0.5" opacity=".3" />
                      </svg>
                      <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                        <path d="M2 5 C5 2, 13 2, 16 5" />
                        <path d="M4 7.5 C6 5.5, 12 5.5, 14 7.5" />
                        <circle cx="9" cy="10" r="1" fill="currentColor" />
                      </svg>
                      <svg viewBox="0 0 26 12" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" style={{ width: 24, height: 12 }}>
                        <rect x="0.5" y="0.5" width="22" height="11" rx="2.5" />
                        <rect x="2" y="2" width="19" height="8" rx="1.5" fill="currentColor" />
                        <rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" />
                      </svg>
                    </div>
                  </div>

                  <div className="app-header">
                    <div className="back-arrow">‹</div>
                    <div className="contact-avatar">M</div>
                    <div className="contact-info">
                      <div className="contact-name">Marcus Reyes</div>
                      <div className="contact-status">
                        <span className="online-dot" />online · new lead
                      </div>
                    </div>
                    <div className="menu">⋯</div>
                  </div>

                  <div className="thread">
                    <div className="inbound">
                      <div className="mini-avatar">M</div>
                      <div>
                        <div className="bubble">
                          Been following your work. Curious about coaching — what does it look like to work with you?
                        </div>
                        <div className="timestamp">9:38 AM · IG DM</div>
                      </div>
                    </div>

                    <div className="ai-divider">
                      <span className="sparkle">✦</span> AI suggested replies <span className="sparkle">✦</span>
                    </div>

                    <div className="suggestion bad">
                      <div className="suggestion-head">
                        <span className="suggestion-source">Generic AI</span>
                        <span className="suggestion-edit">Edit · 100%</span>
                      </div>
                      <p className="suggestion-text">
                        Hi Marcus! Thanks for reaching out. Would you like to schedule a discovery call to see if working together is a fit?
                      </p>
                    </div>

                    <div className="suggestion good">
                      <div className="suggestion-head">
                        <span className="suggestion-source">Your voice · trained</span>
                        <span className="suggestion-edit">Edit · 0%</span>
                      </div>
                      <p className="suggestion-text">
                        Marcus. Appreciate you being here. Before logistics, what&apos;s the real reason you&apos;re reaching out? Not &ldquo;I want to grow.&rdquo; The honest one. Where are you stuck, and what have you already tried that hasn&apos;t worked? Tell me that and I&apos;ll tell you if I&apos;m the right person to walk this with you.
                      </p>
                    </div>
                  </div>

                  <div className="compose">
                    <div className="compose-input">Type a message · or pick a suggestion</div>
                    <div className="send-btn">↑</div>
                  </div>
                  <div className="home-indicator" />
                </div>
              </div>
              <p className="demo-caption">
                Both written by AI. Only one sounds like a <strong>coach</strong>.
              </p>
            </div>
          </div>

          <div className="col-side right">
            <div className="feature-callout">
              <h3 className="feature-headline">
                Voice Memory <span className="icon">✦</span>
              </h3>
              <p className="feature-desc">
                Every DM, caption, and call transcript trains your AI. The longer you use it, the sharper it sounds like you.
              </p>
            </div>
            <svg className="arrow-doodle" viewBox="0 0 80 60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M70 8 C 55 22, 50 38, 22 48" strokeDasharray="4 4" />
              <path d="M28 42 L 22 48 L 28 54" />
            </svg>
            <div className="feature-callout">
              <h3 className="feature-headline">
                Client Rooms <span className="icon">◆</span>
              </h3>
              <p className="feature-desc">
                Dedicated space per client. Session notes from Granola, Zoom, Calendly — synced and searchable.
              </p>
            </div>
            <p className="right-small">
              Tap to send. Auto-Response drafts in under 3 seconds, in your voice.
            </p>
          </div>
        </section>

        {/* AUTH ZONE — Google + Magic Link */}
        <div className="auth-zone">
          {sent ? (
            <div className="sent-card">
              <div className="sent-title">✓ Check your email</div>
              <p className="sent-body">
                We sent a magic link to <strong>{email}</strong>. Click it to sign in.
              </p>
              <button className="sent-resend" onClick={() => setSent(false)}>
                Use a different email →
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={googleLoading}
                className="google-btn"
                aria-label="Sign in with Google"
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {googleLoading ? "Redirecting…" : "Continue with Google"}
                <span className="arrow">→</span>
              </button>

              <div className="or-divider">
                <span className="line" />
                <span className="or-text">or sign in with email</span>
                <span className="line" />
              </div>

              <form onSubmit={onMagicLinkSubmit} className="magic-form">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourcoachingsite.com"
                  className="magic-input"
                  aria-label="Email address"
                />
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="magic-btn"
                >
                  {loading ? "Sending…" : "Send magic link →"}
                </button>
              </form>

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}

          <p className="no-card">
            No credit card<span className="dot" />500 leads, free forever
            <span className="dot" />Pay only to act
          </p>
        </div>

        <div className="quiet-context">
          <span className="principle">
            &ldquo;We don&apos;t paywall having leads. We paywall turning them into action.&rdquo;
          </span>
          <a href="https://elevateaisystem.com/pricing">See pricing →</a>
        </div>
      </main>

      <footer className="foot">
        © 2026 ELEVATEAI SYSTEMS · SUNNY.BINJOLA@GMAIL.COM
      </footer>

      <style>{nexcardCSS}</style>
    </>
  );
}

// ===================================================================
// All the NexCard styling, scoped via .nexcard-body class on body.
// ===================================================================
const nexcardCSS = `
.nexcard-body {
  --bg:      #FAFAF8;
  --bg-2:    #F2F2EE;
  --navy:    #0A0F1C;
  --ink:     #1A1A2E;
  --ink-dim: #5A5A6E;
  --ink-mute:#8A8A9E;
  --rule:    #E0E0D8;
  --green:   #00FF41;
  --green-dk:#00CC34;
  --green-tint:#E6FFEC;
  --display: 'Fraunces', Georgia, serif;
  --body:    'Plus Jakarta Sans', system-ui, sans-serif;
  --mono:    'JetBrains Mono', ui-monospace, monospace;

  font-family: var(--body);
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  margin: 0;
}
.nexcard-body em, .nexcard-body i, .nexcard-body cite, .nexcard-body q { font-style: normal; }
.nexcard-body a { color: inherit; text-decoration: none; }
.nexcard-body *, .nexcard-body *::before, .nexcard-body *::after { box-sizing: border-box; }
.nexcard-body ::selection { background: var(--green); color: var(--navy); }

/* Ambient layers */
.nexcard-body::before {
  content: ''; position: fixed; top: -10%; right: -10%; width: 900px; height: 900px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0,255,65,0.13), rgba(0,255,65,0.04) 40%, transparent 70%);
  pointer-events: none; animation: nc-breathe 14s ease-in-out infinite; z-index: 0; filter: blur(20px);
}
.nexcard-body::after {
  content: ''; position: fixed; bottom: -20%; left: -10%; width: 800px; height: 800px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0,255,65,0.07), rgba(0,255,65,0.02) 50%, transparent 70%);
  pointer-events: none; animation: nc-breathe 18s ease-in-out infinite reverse; z-index: 0; filter: blur(20px);
}
@keyframes nc-breathe {
  0%,100% { transform: scale(1) translate(0,0); opacity: .85; }
  50% { transform: scale(1.1) translate(2%, -1%); opacity: 1; }
}
.aurora-drift {
  position: fixed; top: 15%; left: -20%; width: 50vw; height: 50vh;
  background: radial-gradient(ellipse, rgba(0,255,65,0.06), transparent 60%);
  pointer-events: none; animation: nc-drift 24s ease-in-out infinite; z-index: 0; filter: blur(40px);
}
@keyframes nc-drift {
  0%,100% { transform: translateX(0) translateY(0); opacity: .5; }
  33% { transform: translateX(60vw) translateY(-10%); opacity: .9; }
  66% { transform: translateX(120vw) translateY(8%); opacity: .7; }
}
.cursor-light {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 1;
  background: radial-gradient(circle 600px at var(--mx, 50%) var(--my, 30%), rgba(0,255,65,0.06), transparent 50%);
  mix-blend-mode: multiply;
}
.embers { position: fixed; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }
.ember {
  position: absolute; bottom: -20px; width: 4px; height: 4px; border-radius: 50%;
  background: var(--green); opacity: 0; filter: blur(0.5px);
  animation: nc-rise linear infinite; box-shadow: 0 0 8px rgba(0,255,65,0.4);
}
@keyframes nc-rise {
  0% { transform: translateY(0) translateX(0) scale(0.6); opacity: 0; }
  10% { opacity: .5; }
  50% { transform: translateY(-50vh) translateX(20px) scale(1); opacity: .35; }
  90% { opacity: .2; }
  100% { transform: translateY(-110vh) translateX(-10px) scale(0.4); opacity: 0; }
}
.grain {
  position: fixed; inset: 0; pointer-events: none; z-index: 2; opacity: 0.35; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.04 0 0 0 0 0.06 0 0 0 0 0.11 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 240px 240px;
}

/* Topbar */
.nc-topbar {
  padding: 1.1rem 2rem; display: flex; justify-content: space-between; align-items: center;
  position: sticky; top: 0; z-index: 20;
  background: rgba(250,250,248,0.85);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid transparent;
}
.brand-row { display: flex; align-items: center; gap: 1rem; }
.brand { display: flex; align-items: center; gap: .65rem; font-family: var(--display); font-size: 1.15rem; font-weight: 800; letter-spacing: -0.02em; color: var(--navy); }
.brand-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px rgba(0,255,65,0.18); }
.brand-divider { width: 1px; height: 22px; background: var(--rule); }
.brand-tag { font-family: var(--mono); font-size: .68rem; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-dim); }
.topbar-links { display: flex; gap: 1.5rem; align-items: center; font-family: var(--mono); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-mute); }
.topbar-links a:hover { color: var(--navy); }

/* Stage + bg type */
.stage { flex: 1; position: relative; z-index: 1; padding: 1rem 2rem 1.5rem; overflow: hidden; }
.bg-type {
  position: absolute; top: 50%; transform: translateY(-50%); font-family: var(--display);
  font-weight: 900; font-size: clamp(8rem, 18vw, 16rem); line-height: 0.85; letter-spacing: -0.06em;
  color: var(--navy); opacity: 0.04; pointer-events: none; user-select: none; z-index: 0;
  font-variation-settings: "SOFT" 30, "opsz" 144;
}
.bg-type.left { left: -2rem; }
.bg-type.right { right: -2rem; color: var(--green-dk); opacity: 0.05; font-variation-settings: "SOFT" 100; }

/* Hero mini */
.hero-mini { text-align: center; margin: 0.25rem 0 1.25rem; opacity: 0; animation: nc-fadeUp 0.7s 0.1s both; }
.eyebrow {
  font-family: var(--mono); font-size: .7rem; letter-spacing: .22em; text-transform: uppercase;
  color: var(--ink-mute); display: inline-flex; align-items: center; gap: .65rem; margin-bottom: .85rem;
}
.eyebrow .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: nc-pulse 2s ease-in-out infinite; }
@keyframes nc-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(0,255,65,0.5); } 50% { box-shadow: 0 0 0 8px rgba(0,255,65,0); } }
.headline {
  font-family: var(--display); font-weight: 800; font-size: clamp(1.85rem, 3.4vw, 2.85rem);
  line-height: 1.0; letter-spacing: -0.025em; color: var(--navy);
  font-variation-settings: "SOFT" 30, "opsz" 144; max-width: 780px; margin: 0 auto;
}
.headline em { color: var(--green-dk); font-variation-settings: "SOFT" 100, "opsz" 144; text-shadow: 0 0 24px rgba(0,255,65,0.18), 0 0 64px rgba(0,255,65,0.10); }

/* Tri-column */
.tri { display: grid; grid-template-columns: minmax(220px, 1fr) auto minmax(220px, 1fr); gap: 2.5rem; align-items: center; max-width: 1320px; margin: 0 auto; position: relative; z-index: 2; }
.col-center { width: 348px; position: relative; padding-top: 52px; }
.tags-row { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: 1.5rem; opacity: 0; animation: nc-fadeUp 0.7s 0.1s both; }
.tag-pill { font-family: var(--mono); font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-dim); background: var(--bg); border: 1px solid var(--rule); padding: .4rem .85rem; border-radius: 100px; font-weight: 600; box-shadow: 0 1px 2px rgba(10,15,28,0.04); }
.tag-pill.dark { background: var(--navy); color: var(--bg); border-color: var(--navy); }
.col-side { display: flex; flex-direction: column; gap: 1.5rem; opacity: 0; animation: nc-fadeUp 0.8s 0.6s both; }
.col-side.left { align-items: flex-start; }
.col-side.right { align-items: flex-end; text-align: right; }

.quote-brackets { font-family: var(--display); font-size: 1.1rem; font-weight: 500; line-height: 1.35; color: var(--navy); letter-spacing: -0.01em; position: relative; padding: .4rem 1rem; max-width: 250px; }
.quote-brackets::before, .quote-brackets::after { content: ''; position: absolute; top: 0; bottom: 0; width: 10px; border: 1.5px solid var(--ink); }
.quote-brackets::before { left: 0; border-right: none; }
.quote-brackets::after { right: 0; border-left: none; }

.feature-callout { max-width: 260px; }
.feature-headline { font-family: var(--display); font-weight: 700; font-size: 1.6rem; line-height: 1.05; letter-spacing: -0.02em; color: var(--navy); margin-bottom: .4rem; font-variation-settings: "SOFT" 100, "opsz" 96; display: flex; align-items: center; gap: .55rem; justify-content: flex-end; }
.feature-headline.left { justify-content: flex-start; }
.feature-headline .icon { color: var(--green-dk); font-size: 1.1rem; }
.feature-desc { font-size: .82rem; color: var(--ink-dim); line-height: 1.55; }
.left-feature { text-align: left; max-width: 260px; }
.arrow-doodle { width: 80px; height: 60px; color: var(--green-dk); opacity: 0.7; }
.left-desc { font-size: .82rem; color: var(--ink-dim); line-height: 1.55; max-width: 240px; }
.right-small { font-size: .78rem; color: var(--ink-dim); line-height: 1.5; max-width: 240px; text-align: right; }

/* Demo phone */
.demo { width: 100%; max-width: 348px; margin: 0 auto; opacity: 0; animation: nc-fadeUp 1s 0.7s both; position: relative; }
.demo::before { content: ''; position: absolute; bottom: -32px; left: 50%; transform: translateX(-50%); width: 80%; height: 50px; background: radial-gradient(ellipse, rgba(10,15,28,0.18), transparent 70%); filter: blur(18px); z-index: -1; animation: nc-shadowPulse 5s ease-in-out infinite; }
@keyframes nc-shadowPulse { 0%,100% { opacity: 0.8; transform: translateX(-50%) scale(1); } 50% { opacity: 0.55; transform: translateX(-50%) scale(0.92); } }

.phone-notice {
  position: absolute; top: -54px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: .55rem;
  background: rgba(10,15,28,0.92); backdrop-filter: blur(12px); color: #FFFFFF;
  padding: .55rem 1rem; border-radius: 100px;
  font-family: var(--mono); font-size: .65rem; letter-spacing: .05em; white-space: nowrap;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 24px rgba(10,15,28,0.20), 0 0 0 1px rgba(255,255,255,0.06);
  z-index: 5; opacity: 0;
  animation: nc-noticeIn 0.6s 1.5s cubic-bezier(.2,.8,.2,1) both, nc-noticeBob 4s 2.5s ease-in-out infinite;
}
.phone-notice .nx-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px var(--green); animation: nc-pulse 1.5s ease-in-out infinite; }
.phone-notice strong { color: var(--green); font-weight: 700; }
.phone-notice .sep { opacity: 0.4; padding: 0 .15rem; }
@keyframes nc-noticeIn { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes nc-noticeBob { 0%,100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -3px); } }

.phone {
  position: relative; width: 100%;
  background: linear-gradient(135deg, #0A0F1C 0%, #1F2937 25%, #0A0F1C 75%, #000000 100%);
  border-radius: 44px; padding: 11px;
  box-shadow: 0 0 0 1.5px rgba(0,0,0,0.4), 0 2px 0 rgba(255,255,255,0.04) inset, 0 -2px 0 rgba(0,0,0,0.4) inset, 0 30px 60px rgba(10,15,28,0.30), 0 60px 120px rgba(10,15,28,0.20), 0 0 80px rgba(0,255,65,0.10);
  transform-style: preserve-3d; will-change: transform; isolation: isolate;
  animation: nc-phoneFloat 5s ease-in-out infinite;
}
@keyframes nc-phoneFloat { 0%,100% { transform: perspective(1200px) rotateX(2deg) rotateY(-3deg) translateY(0); } 50% { transform: perspective(1200px) rotateX(2deg) rotateY(-3deg) translateY(-6px); } }
.phone::before { content: ''; position: absolute; top: 1px; left: 14px; right: 14px; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent); border-radius: 50px; }
.screen { background: var(--bg); border-radius: 34px; overflow: hidden; position: relative; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.5); }

.status-bar { display: flex; justify-content: space-between; align-items: center; padding: .85rem 1.85rem 0.4rem; font-family: var(--body); font-size: .85rem; font-weight: 700; color: var(--navy); position: relative; }
.status-bar .right { display: flex; align-items: center; gap: .4rem; }
.status-bar svg { width: 16px; height: 10px; }
.status-bar::after { content: ''; position: absolute; top: .55rem; left: 50%; transform: translateX(-50%); width: 95px; height: 28px; background: #000; border-radius: 18px; }

.app-header { display: flex; align-items: center; gap: .85rem; padding: .85rem 1.4rem .95rem; border-bottom: 1px solid rgba(10,15,28,0.06); background: rgba(250,250,248,0.7); backdrop-filter: blur(8px); }
.back-arrow { width: 28px; height: 28px; border-radius: 50%; background: var(--bg-2); display: flex; align-items: center; justify-content: center; color: var(--ink); font-size: 1.1rem; font-weight: 300; flex-shrink: 0; }
.contact-avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #64748B, #1F2937); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: .95rem; flex-shrink: 0; position: relative; box-shadow: 0 2px 6px rgba(10,15,28,0.15); }
.contact-avatar::after { content: ''; position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; background: var(--green); border: 2px solid var(--bg); border-radius: 50%; animation: nc-pulse 2s ease-in-out infinite; }
.contact-info { flex: 1; min-width: 0; }
.contact-name { font-weight: 700; font-size: .95rem; color: var(--navy); }
.contact-status { font-family: var(--mono); font-size: .62rem; color: var(--ink-mute); letter-spacing: .06em; text-transform: uppercase; margin-top: 1px; }
.contact-status .online-dot { display: inline-block; width: 6px; height: 6px; background: var(--green); border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
.app-header .menu { width: 28px; height: 28px; color: var(--ink-mute); font-size: 1.3rem; text-align: center; line-height: 1; font-weight: 700; letter-spacing: 1px; }

.thread { padding: .85rem .9rem .5rem; background: radial-gradient(ellipse 100% 60% at 50% 0%, rgba(0,255,65,0.04), transparent 60%), var(--bg); }
.inbound { display: flex; gap: .55rem; margin-bottom: .85rem; align-items: flex-end; }
.mini-avatar { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #94A3B8, #475569); display: flex; align-items: center; justify-content: center; color: white; font-size: .7rem; font-weight: 700; flex-shrink: 0; }
.inbound .bubble { background: linear-gradient(180deg, #FFFFFF, #F8F8F4); border: 1px solid rgba(10,15,28,0.06); border-radius: 16px 16px 16px 4px; padding: .7rem .9rem; font-size: .8rem; color: var(--ink); line-height: 1.45; max-width: 84%; box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 3px rgba(10,15,28,0.05), 0 6px 16px rgba(10,15,28,0.04); }
.inbound .timestamp { font-family: var(--mono); font-size: .55rem; color: var(--ink-mute); margin-top: 4px; letter-spacing: .04em; }

.ai-divider { display: flex; align-items: center; gap: .65rem; margin: .65rem 0 .6rem; font-family: var(--mono); font-size: .58rem; color: var(--green-dk); letter-spacing: .18em; text-transform: uppercase; font-weight: 700; }
.ai-divider::before, .ai-divider::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(0,255,65,0.3), transparent); }

.suggestion { background: linear-gradient(180deg, #FFFFFF, #FBFBF8); border: 1px solid var(--rule); border-radius: 12px; padding: .8rem .9rem; margin-bottom: .6rem; box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 3px rgba(10,15,28,0.04), 0 4px 12px rgba(10,15,28,0.05); }
.suggestion-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .55rem; font-family: var(--mono); font-size: .58rem; letter-spacing: .1em; text-transform: uppercase; }
.suggestion-source { color: var(--ink-mute); font-weight: 700; }
.suggestion-text { font-size: .78rem; line-height: 1.5; color: var(--ink); }
.suggestion.bad { background: linear-gradient(180deg, var(--bg-2), #ECECE6); box-shadow: inset 0 2px 4px rgba(10,15,28,0.05), 0 1px 2px rgba(10,15,28,0.03); }
.suggestion.bad .suggestion-text { color: var(--ink-dim); }
.suggestion.bad .suggestion-source::before { content: '✗ '; color: #B91C1C; }
.suggestion.good { border: 2px solid var(--green); background: radial-gradient(ellipse 100% 50% at 50% 0%, rgba(0,255,65,0.08), transparent 70%), linear-gradient(180deg, #FFFFFF, #FBFBF8); box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 4px rgba(0,255,65,0.07), 0 6px 20px rgba(0,255,65,0.16), 0 16px 40px rgba(10,15,28,0.08); animation: nc-livePulse 5s ease-in-out infinite; }
.suggestion.good .suggestion-text { font-weight: 500; }
.suggestion.good .suggestion-source { color: var(--green-dk); }
.suggestion.good .suggestion-source::before { content: '✓ '; color: var(--green-dk); font-weight: 800; }
.suggestion.good .suggestion-edit { color: var(--green-dk); font-weight: 700; }
@keyframes nc-livePulse { 0%,100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 4px rgba(0,255,65,0.07), 0 6px 20px rgba(0,255,65,0.16), 0 16px 40px rgba(10,15,28,0.08); } 50% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 7px rgba(0,255,65,0.10), 0 10px 30px rgba(0,255,65,0.24), 0 20px 48px rgba(10,15,28,0.10); } }

.compose { display: flex; align-items: center; gap: .5rem; padding: .55rem .85rem .85rem; background: linear-gradient(180deg, transparent, rgba(250,250,248,0.95) 30%); }
.compose-input { flex: 1; height: 32px; background: var(--bg-2); border-radius: 16px; display: flex; align-items: center; padding: 0 .75rem; font-family: var(--mono); font-size: .6rem; color: var(--ink-mute); letter-spacing: .05em; border: 1px solid rgba(10,15,28,0.05); }
.send-btn { width: 32px; height: 32px; border-radius: 50%; background: var(--green); display: flex; align-items: center; justify-content: center; color: var(--navy); font-size: 1rem; font-weight: 800; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,255,65,0.3), inset 0 1px 0 rgba(255,255,255,0.4); }
.home-indicator { display: block; width: 120px; height: 4px; background: var(--navy); border-radius: 3px; margin: 0 auto 6px; opacity: 0.6; }

.demo-caption { text-align: center; margin-top: 2rem; font-family: var(--display); font-size: .95rem; font-weight: 500; color: var(--ink-dim); font-variation-settings: "SOFT" 100; }
.demo-caption strong { color: var(--navy); font-weight: 700; }

/* ============ AUTH ZONE ============ */
.auth-zone {
  max-width: 460px; margin: 2.5rem auto 0; padding: 0 1rem; text-align: center;
  opacity: 0; animation: nc-fadeUp 0.8s 0.9s both; position: relative; z-index: 2;
}
.google-btn {
  display: inline-flex; align-items: center; gap: .75rem;
  background: linear-gradient(180deg, #FFFFFF, #F8F8F4); color: var(--navy);
  padding: 1rem 1.85rem; border-radius: 10px;
  font-family: var(--body); font-weight: 600; font-size: .95rem;
  border: 1px solid var(--rule);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 2px rgba(10,15,28,0.04), 0 4px 12px rgba(10,15,28,0.06), 0 16px 40px rgba(10,15,28,0.08);
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.15s;
  cursor: pointer;
}
.google-btn:hover:not(:disabled) { transform: translateY(-3px); box-shadow: inset 0 1px 0 rgba(255,255,255,1), 0 2px 4px rgba(10,15,28,0.06), 0 8px 20px rgba(10,15,28,0.10), 0 28px 60px rgba(10,15,28,0.14); border-color: var(--navy); }
.google-btn:disabled { opacity: 0.6; cursor: wait; }
.google-btn svg { width: 20px; height: 20px; }
.google-btn .arrow { color: var(--ink-mute); margin-left: .25rem; transition: transform 0.2s, color 0.2s; }
.google-btn:hover:not(:disabled) .arrow { color: var(--green-dk); transform: translateX(3px); }

.or-divider { display: flex; align-items: center; gap: .75rem; max-width: 360px; margin: 1.25rem auto; font-family: var(--mono); font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-mute); }
.or-divider .line { flex: 1; height: 1px; background: var(--rule); }

.magic-form { display: flex; gap: .5rem; max-width: 440px; margin: 0 auto; }
.magic-input {
  flex: 1; height: 46px; background: #FFFFFF; border: 1px solid var(--rule);
  border-radius: 10px; padding: 0 1rem;
  font-family: var(--body); font-size: .9rem; color: var(--ink);
  box-shadow: inset 0 1px 2px rgba(10,15,28,0.04);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.magic-input:focus { outline: none; border-color: var(--green-dk); box-shadow: inset 0 1px 2px rgba(10,15,28,0.04), 0 0 0 3px rgba(0,255,65,0.15); }
.magic-input::placeholder { color: var(--ink-mute); }
.magic-btn {
  height: 46px; padding: 0 1.25rem; background: var(--navy); color: #FFFFFF;
  border: none; border-radius: 10px; font-family: var(--body); font-weight: 600; font-size: .85rem;
  cursor: pointer; transition: background 0.15s, transform 0.15s; white-space: nowrap;
  box-shadow: 0 2px 8px rgba(10,15,28,0.18);
}
.magic-btn:hover:not(:disabled) { background: var(--ink); transform: translateY(-1px); }
.magic-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.auth-error { margin-top: .85rem; color: #B91C1C; font-size: .8rem; font-weight: 500; }

.sent-card { max-width: 440px; margin: 0 auto; background: linear-gradient(180deg, #FFFFFF, #FBFBF8); border: 2px solid var(--green); border-radius: 12px; padding: 1.5rem; text-align: center; box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 4px rgba(0,255,65,0.08), 0 12px 32px rgba(0,255,65,0.18); }
.sent-title { font-family: var(--display); font-weight: 700; font-size: 1.3rem; color: var(--navy); margin-bottom: .5rem; }
.sent-body { color: var(--ink-dim); font-size: .9rem; line-height: 1.55; margin-bottom: 1rem; }
.sent-body strong { color: var(--navy); font-weight: 700; }
.sent-resend { background: none; border: none; color: var(--green-dk); font-family: var(--mono); font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; border-bottom: 1px dotted var(--green-dk); padding-bottom: 1px; }
.sent-resend:hover { color: var(--navy); border-bottom-color: var(--navy); }

.no-card {
  margin-top: 1.25rem; font-family: var(--mono); font-size: .72rem; letter-spacing: .12em;
  text-transform: uppercase; color: var(--ink-mute);
}
.no-card .dot { display: inline-block; width: 4px; height: 4px; background: var(--green-dk); border-radius: 50%; margin: 0 .75rem; vertical-align: middle; }

/* Quiet context */
.quiet-context {
  margin: 3rem auto 0; padding-top: 2rem; border-top: 1px solid var(--rule); max-width: 720px;
  display: flex; justify-content: space-between; align-items: center; gap: 1.5rem;
  font-family: var(--mono); font-size: .7rem; color: var(--ink-mute); letter-spacing: .05em;
  opacity: 0; animation: nc-fadeUp 0.8s 1.1s both; position: relative; z-index: 2;
}
.quiet-context a { border-bottom: 1px dotted var(--ink-mute); padding-bottom: 1px; transition: color 0.15s, border-color 0.15s; }
.quiet-context a:hover { color: var(--navy); border-bottom-color: var(--navy); }
.quiet-context .principle { font-family: var(--display); font-weight: 500; font-size: .95rem; color: var(--ink); letter-spacing: -0.005em; text-transform: none; }

.foot { padding: 1.5rem 2rem; font-family: var(--mono); font-size: .65rem; color: var(--ink-mute); letter-spacing: .08em; text-align: center; position: relative; z-index: 2; }

@keyframes nc-fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

/* Tablet */
@media (max-width: 1100px) {
  .tri { grid-template-columns: 1fr; gap: 1.5rem; text-align: center; }
  .col-side { display: none; }
  .col-center { padding-top: 50px; }
  .bg-type { font-size: clamp(7rem, 24vw, 12rem); opacity: 0.035; }
  .headline { font-size: clamp(1.6rem, 5vw, 2.4rem); }
  .quiet-context { flex-direction: column; gap: 1rem; text-align: center; }
}
/* Mobile */
@media (max-width: 720px) {
  .nc-topbar { padding: .85rem 1rem; }
  .topbar-links { gap: .9rem; font-size: .62rem; }
  .topbar-links a { display: none; }
  .stage { padding: .5rem 1rem 2rem; }
  .demo { max-width: 320px; }
  .auth-zone { margin-top: 2rem; }
  .magic-form { flex-direction: column; }
  .magic-input, .magic-btn { width: 100%; }
}
`;
