"use client";

// Login — dark split-screen with phone demo (left) + auth (right).

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
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,100..900,0..100;1,9..144,100..900,0..100&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        .lp {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          background: #060a14;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow: hidden;
          color: #FAFAF8;
        }
        .lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
        .lp ::selection { background: #00FF41; color: #0A0F1C; }

        /* ── LEFT: Phone demo ── */
        .lp-left {
          position: relative;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 2rem; overflow: hidden;
          border-right: 1px solid rgba(255,255,255,0.04);
        }
        .lp-left::before {
          content: ''; position: absolute; top: -15%; right: -10%;
          width: 500px; height: 500px; border-radius: 50%;
          background: radial-gradient(circle, rgba(0,255,65,0.1), transparent 65%);
          filter: blur(60px); pointer-events: none;
          animation: lp-drift 20s ease-in-out infinite;
        }
        .lp-left::after {
          content: ''; position: absolute; bottom: -10%; left: 10%;
          width: 350px; height: 350px; border-radius: 50%;
          background: radial-gradient(circle, rgba(0,255,65,0.05), transparent 65%);
          filter: blur(60px); pointer-events: none;
          animation: lp-drift 16s ease-in-out infinite reverse;
        }
        @keyframes lp-drift { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(3%,-4%) scale(1.08); } }

        .lp-left-inner { position: relative; z-index: 2; width: 100%; max-width: 380px; display: flex; flex-direction: column; align-items: center; }

        /* Feature pills */
        .lp-features { display: flex; flex-wrap: wrap; gap: 0.5rem; align-self: flex-start; margin-bottom: 1.5rem; opacity: 0; animation: lp-rise 0.9s 0.9s cubic-bezier(.16,1,.3,1) both; }
        .lp-feat { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.75rem; border-radius: 100px; background: rgba(0,255,65,0.06); border: 1px solid rgba(0,255,65,0.12); font-family: 'JetBrains Mono', monospace; font-size: 0.55rem; letter-spacing: 0.06em; color: rgba(250,250,248,0.6); white-space: nowrap; }
        .lp-feat-dot { width: 5px; height: 5px; border-radius: 50%; background: #00FF41; opacity: 0.7; }

        .lp-logo { display: flex; align-items: center; gap: 0.65rem; margin-bottom: 1.5rem; align-self: flex-start; }
        .lp-logo-dot { width: 10px; height: 10px; border-radius: 50%; background: #00FF41; box-shadow: 0 0 12px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.2); animation: lp-pulse 3s ease-in-out infinite; }
        @keyframes lp-pulse { 0%,100% { box-shadow: 0 0 12px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.2); } 50% { box-shadow: 0 0 18px rgba(0,255,65,0.7), 0 0 60px rgba(0,255,65,0.3); } }
        .lp-logo-text { font-family: 'Fraunces', Georgia, serif; font-weight: 800; font-size: 1.15rem; letter-spacing: -0.02em; font-variation-settings: "SOFT" 30, "opsz" 144; }
        .lp-logo-text span { color: #00CC34; }

        .lp-headline { font-family: 'Fraunces', Georgia, serif; font-weight: 800; font-size: clamp(1.5rem, 2.2vw, 2rem); line-height: 1.12; letter-spacing: -0.02em; color: rgba(250,250,248,0.92); margin-bottom: 2rem; align-self: flex-start; font-variation-settings: "SOFT" 30, "opsz" 144; }
        .lp-headline em { font-style: normal; color: #00FF41; font-variation-settings: "SOFT" 100, "opsz" 144; text-shadow: 0 0 40px rgba(0,255,65,0.25); }

        /* Phone mockup */
        .lp-phone-wrap { width: 100%; max-width: 340px; position: relative; opacity: 0; animation: lp-rise 1s 0.3s cubic-bezier(.16,1,.3,1) both; }
        .lp-phone-notice { position: absolute; top: -38px; right: -20px; transform: none; display: flex; align-items: center; gap: 0.5rem; background: rgba(10,15,28,0.92); backdrop-filter: blur(12px); color: #fff; padding: 0.45rem 0.85rem; border-radius: 100px; font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; letter-spacing: 0.05em; white-space: nowrap; box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 24px rgba(10,15,28,0.2); z-index: 5; opacity: 0; animation: lp-noticeIn 0.6s 1.2s cubic-bezier(.2,.8,.2,1) both, lp-bob 4s 2s ease-in-out infinite; }
        .lp-phone-notice .ndot { width: 6px; height: 6px; border-radius: 50%; background: #00FF41; box-shadow: 0 0 8px #00FF41; }
        .lp-phone-notice strong { color: #00FF41; font-weight: 700; }
        .lp-phone-notice .sep { opacity: 0.4; }
        @keyframes lp-noticeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lp-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

        .lp-phone { width: 100%; background: linear-gradient(135deg, #0A0F1C 0%, #1F2937 25%, #0A0F1C 75%, #000 100%); border-radius: 40px; padding: 10px; box-shadow: 0 0 0 1.5px rgba(0,0,0,0.4), 0 2px 0 rgba(255,255,255,0.04) inset, 0 30px 60px rgba(10,15,28,0.30), 0 60px 120px rgba(10,15,28,0.20), 0 0 80px rgba(0,255,65,0.08); animation: lp-float 5s ease-in-out infinite; position: relative; }
        @keyframes lp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        .lp-phone::before { content: ''; position: absolute; top: 1px; left: 14px; right: 14px; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent); border-radius: 50px; }

        .lp-screen { background: #FAFAF8; border-radius: 30px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.5); }
        .lp-sb { display: flex; justify-content: space-between; align-items: center; padding: 0.7rem 1.5rem 0.3rem; font-size: 0.8rem; font-weight: 700; color: #0A0F1C; position: relative; }
        .lp-sb .r { display: flex; align-items: center; gap: 0.35rem; }
        .lp-sb svg { width: 15px; height: 9px; }
        .lp-sb::after { content: ''; position: absolute; top: 0.45rem; left: 50%; transform: translateX(-50%); width: 85px; height: 24px; background: #000; border-radius: 16px; }

        .lp-ah { display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem 1.2rem 0.8rem; border-bottom: 1px solid rgba(10,15,28,0.06); background: rgba(250,250,248,0.7); }
        .lp-ah-back { width: 24px; height: 24px; border-radius: 50%; background: #F2F2EE; display: flex; align-items: center; justify-content: center; color: #1A1A2E; font-size: 1rem; }
        .lp-ah-av { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #64748B, #1F2937); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 0.8rem; position: relative; }
        .lp-ah-av::after { content: ''; position: absolute; bottom: -1px; right: -1px; width: 10px; height: 10px; background: #00FF41; border: 2px solid #FAFAF8; border-radius: 50%; }
        .lp-ah-info { flex: 1; }
        .lp-ah-name { font-weight: 700; font-size: 0.85rem; color: #0A0F1C; }
        .lp-ah-status { font-family: 'JetBrains Mono', monospace; font-size: 0.55rem; color: #8A8A9E; letter-spacing: 0.06em; text-transform: uppercase; }
        .lp-ah-status .od { display: inline-block; width: 5px; height: 5px; background: #00FF41; border-radius: 50%; margin-right: 4px; vertical-align: 1px; }

        .lp-thread { padding: 0.7rem 0.75rem 0.4rem; background: #FAFAF8; }
        .lp-inbound { display: flex; gap: 0.45rem; margin-bottom: 0.7rem; align-items: flex-end; }
        .lp-ma { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #94A3B8, #475569); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.6rem; font-weight: 700; flex-shrink: 0; }
        .lp-bubble { background: #fff; border: 1px solid rgba(10,15,28,0.06); border-radius: 14px 14px 14px 4px; padding: 0.6rem 0.75rem; font-size: 0.72rem; color: #1A1A2E; line-height: 1.45; max-width: 85%; box-shadow: 0 1px 3px rgba(10,15,28,0.05); }
        .lp-ts { font-family: 'JetBrains Mono', monospace; font-size: 0.5rem; color: #8A8A9E; margin-top: 3px; letter-spacing: 0.04em; }

        .lp-aid { display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; font-family: 'JetBrains Mono', monospace; font-size: 0.52rem; color: #00CC34; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700; }
        .lp-aid::before, .lp-aid::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(0,255,65,0.3), transparent); }

        .lp-sug { background: #fff; border: 1px solid #E0E0D8; border-radius: 10px; padding: 0.65rem 0.75rem; margin-bottom: 0.5rem; }
        .lp-sug-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; font-family: 'JetBrains Mono', monospace; font-size: 0.52rem; letter-spacing: 0.1em; text-transform: uppercase; }
        .lp-sug-src { color: #8A8A9E; font-weight: 700; }
        .lp-sug-txt { font-size: 0.7rem; line-height: 1.5; color: #1A1A2E; margin: 0; }
        .lp-sug.bad { background: #F2F2EE; }
        .lp-sug.bad .lp-sug-txt { color: #5A5A6E; }
        .lp-sug.bad .lp-sug-src::before { content: '\\2717 '; color: #B91C1C; }
        .lp-sug.good { border: 2px solid #00FF41; background: radial-gradient(ellipse 100% 50% at 50% 0%, rgba(0,255,65,0.06), transparent 70%), #fff; box-shadow: 0 0 0 4px rgba(0,255,65,0.06), 0 6px 20px rgba(0,255,65,0.14); animation: lp-sugPulse 5s ease-in-out infinite; }
        .lp-sug.good .lp-sug-txt { font-weight: 500; }
        .lp-sug.good .lp-sug-src { color: #00CC34; }
        .lp-sug.good .lp-sug-src::before { content: '\\2713 '; color: #00CC34; font-weight: 800; }
        @keyframes lp-sugPulse { 0%,100% { box-shadow: 0 0 0 4px rgba(0,255,65,0.06), 0 6px 20px rgba(0,255,65,0.14); } 50% { box-shadow: 0 0 0 7px rgba(0,255,65,0.09), 0 10px 30px rgba(0,255,65,0.22); } }

        .lp-compose { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.7rem 0.7rem; }
        .lp-compose-input { flex: 1; height: 28px; background: #F2F2EE; border-radius: 14px; display: flex; align-items: center; padding: 0 0.65rem; font-family: 'JetBrains Mono', monospace; font-size: 0.52rem; color: #8A8A9E; border: 1px solid rgba(10,15,28,0.04); }
        .lp-compose-send { width: 28px; height: 28px; border-radius: 50%; background: #00FF41; display: flex; align-items: center; justify-content: center; color: #0A0F1C; font-size: 0.9rem; font-weight: 800; box-shadow: 0 2px 8px rgba(0,255,65,0.3); }
        .lp-home-ind { width: 100px; height: 4px; background: #0A0F1C; border-radius: 3px; margin: 0 auto 5px; opacity: 0.6; }

        .lp-caption { text-align: center; margin-top: 1.5rem; font-family: 'Fraunces', Georgia, serif; font-size: 0.85rem; font-weight: 500; color: rgba(250,250,248,0.45); font-variation-settings: "SOFT" 100; }
        .lp-caption strong { color: #FAFAF8; font-weight: 700; }

        /* ── RIGHT: Auth ── */
        .lp-right { display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 3rem 2.5rem; background: linear-gradient(170deg, #080D18 0%, #0C1220 40%, #0A0F1C 100%); position: relative; }
        .lp-auth-card { width: 100%; max-width: 400px; opacity: 0; animation: lp-rise 0.9s 0.25s cubic-bezier(.16,1,.3,1) both; }

        .lp-mobile-logo { display: none; align-items: center; gap: 0.5rem; margin-bottom: 2rem; font-family: 'Fraunces', serif; font-weight: 800; font-size: 1.25rem; }
        .lp-mobile-logo .mdot { width: 10px; height: 10px; border-radius: 50%; background: #00FF41; box-shadow: 0 0 12px rgba(0,255,65,0.5); }

        .lp-auth-label { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; letter-spacing: 0.22em; text-transform: uppercase; color: #00CC34; margin-bottom: 0.75rem; }
        .lp-auth-title { font-family: 'Fraunces', Georgia, serif; font-weight: 800; font-size: 2rem; letter-spacing: -0.03em; color: #FAFAF8; margin: 0 0 0.5rem; font-variation-settings: "SOFT" 30, "opsz" 96; }
        .lp-auth-sub { font-size: 0.85rem; color: rgba(250,250,248,0.7); line-height: 1.5; margin: 0 0 2.5rem; }

        .lp-google { width: 100%; display: flex; align-items: center; gap: 0.75rem; padding: 0.95rem 1.25rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #FAFAF8; font-family: inherit; font-weight: 600; font-size: 0.92rem; cursor: pointer; transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s; }
        .lp-google:hover:not(:disabled) { background: rgba(255,255,255,0.1); border-color: rgba(0,255,65,0.25); transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,255,65,0.1); }
        .lp-google:active:not(:disabled) { transform: scale(0.985); }
        .lp-google:disabled { opacity: 0.5; cursor: wait; }
        .lp-google svg { width: 20px; height: 20px; flex-shrink: 0; }
        .lp-google-label { flex: 1; }
        .lp-google-arrow { color: rgba(250,250,248,0.3); transition: color 0.2s, transform 0.2s; }
        .lp-google:hover:not(:disabled) .lp-google-arrow { color: #00FF41; transform: translateX(3px); }

        .lp-divider { display: flex; align-items: center; gap: 1rem; margin: 1.5rem 0; }
        .lp-divider-line { flex: 1; height: 1px; background: rgba(255,255,255,0.06); }
        .lp-divider-text { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(250,250,248,0.45); }

        .lp-field-label { font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(250,250,248,0.7); display: block; margin-bottom: 0.5rem; }
        .lp-input { width: 100%; height: 48px; padding: 0 1rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #FAFAF8; font-family: inherit; font-size: 0.9rem; transition: border-color 0.2s, box-shadow 0.2s; outline: none; }
        .lp-input:focus { border-color: rgba(0,255,65,0.4); box-shadow: 0 0 0 3px rgba(0,255,65,0.08); }
        .lp-input::placeholder { color: rgba(250,250,248,0.2); }

        .lp-submit { width: 100%; height: 48px; margin-top: 0.75rem; background: #00FF41; color: #0A0F1C; border: none; border-radius: 10px; font-family: inherit; font-weight: 700; font-size: 0.88rem; cursor: pointer; transition: background 0.15s, transform 0.15s, box-shadow 0.15s; position: relative; overflow: hidden; }
        .lp-submit:hover:not(:disabled) { background: #00E63B; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,255,65,0.3); }
        .lp-submit:active:not(:disabled) { transform: scale(0.985); }
        .lp-submit:disabled { opacity: 0.4; cursor: not-allowed; }
        .lp-submit.shimmer::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); animation: lp-shimmer 1.5s ease-in-out infinite; }
        @keyframes lp-shimmer { 0% { left: -100%; } 100% { left: 100%; } }

        .lp-error { margin-top: 0.75rem; font-size: 0.8rem; color: #FF4040; font-weight: 500; }

        .lp-sent { text-align: center; padding: 2rem 1rem; border: 1px solid rgba(0,255,65,0.2); border-radius: 14px; background: rgba(0,255,65,0.04); }
        .lp-sent-icon { width: 48px; height: 48px; border-radius: 50%; background: rgba(0,255,65,0.12); color: #00FF41; font-size: 1.3rem; font-weight: 800; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; }
        .lp-sent-title { font-family: 'Fraunces', Georgia, serif; font-weight: 700; font-size: 1.25rem; color: #FAFAF8; margin-bottom: 0.5rem; }
        .lp-sent-body { font-size: 0.85rem; color: rgba(250,250,248,0.5); line-height: 1.6; margin-bottom: 1.25rem; }
        .lp-sent-body strong { color: #FAFAF8; }
        .lp-sent-retry { background: none; border: none; color: #00CC34; font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; border-bottom: 1px dotted rgba(0,204,52,0.4); padding-bottom: 2px; }
        .lp-sent-retry:hover { color: #00FF41; }

        .lp-trust { display: flex; justify-content: center; gap: 1.5rem; margin-top: 2rem; flex-wrap: wrap; }
        .lp-trust-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; font-weight: 600; color: rgba(255,255,255,0.85); white-space: nowrap; }
        .lp-trust-icon { color: #00FF41; font-size: 0.7rem; }

        .lp-terms { margin-top: 1.5rem; text-align: center; font-size: 0.75rem; color: rgba(255,255,255,0.55); }
        .lp-terms a { color: rgba(255,255,255,0.65); text-decoration: none; }
        .lp-terms a:hover { color: rgba(255,255,255,0.9); }
        .lp-terms .tdot { display: inline-block; margin: 0 0.5rem; color: #00FF41; opacity: 0.3; }

        .lp-foot-links { position: absolute; bottom: 2rem; display: flex; align-items: center; gap: 0.75rem; font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(250,250,248,0.5); }
        .lp-foot-links a { color: inherit; text-decoration: none; transition: color 0.15s; }
        .lp-foot-links a:hover { color: rgba(250,250,248,0.85); }

        @keyframes lp-rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 1024px) { .lp { grid-template-columns: 1fr 1fr; } .lp-headline { font-size: 1.35rem; } .lp-phone-wrap { max-width: 300px; } }
        @media (max-width: 768px) { .lp { grid-template-columns: 1fr; } .lp-left { display: none; } .lp-right { min-height: 100vh; padding: 2rem 1.5rem; } .lp-mobile-logo { display: flex; } }
        @media (max-width: 420px) { .lp-right { padding: 1.5rem 1.25rem; } .lp-auth-title { font-size: 1.5rem; } }
      `}</style>

      <div className="lp">
        <div className="lp-left">
          <div className="lp-left-inner">
            <div className="lp-logo" style={{ opacity: 0, animation: 'lp-rise 0.9s 0.1s cubic-bezier(.16,1,.3,1) both' }}>
              <span className="lp-logo-dot" />
              <span className="lp-logo-text">ElevateAI<span>.</span></span>
            </div>

            <h1 className="lp-headline" style={{ opacity: 0, animation: 'lp-rise 0.9s 0.2s cubic-bezier(.16,1,.3,1) both' }}>
              Your next client is already <em>in your DMs.</em>
            </h1>

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
            </div>

            <p className="lp-caption" style={{ opacity: 0, animation: 'lp-rise 0.8s 0.8s cubic-bezier(.16,1,.3,1) both' }}>
              Both written by AI. Only one sounds like a <strong>coach</strong>.
            </p>

            <div className="lp-features">
              <span className="lp-feat"><span className="lp-feat-dot" />Lead CRM</span>
              <span className="lp-feat"><span className="lp-feat-dot" />Authentic Voice</span>
              <span className="lp-feat"><span className="lp-feat-dot" />Content Engine</span>
              <span className="lp-feat"><span className="lp-feat-dot" />Client Rooms</span>
              <span className="lp-feat"><span className="lp-feat-dot" />Stripe Payments</span>
            </div>
          </div>
        </div>

        <div className="lp-right">
          <div className="lp-auth-card">
            <div className="lp-mobile-logo">
              <span className="mdot" />
              ElevateAI
            </div>

            {sent ? (
              <div className="lp-sent">
                <div className="lp-sent-icon">✓</div>
                <p className="lp-sent-title">Check your email</p>
                <p className="lp-sent-body">
                  We sent a magic link to <strong>{email}</strong>.
                  <br />Click it to sign in — it expires in 10 minutes.
                </p>
                <button className="lp-sent-retry" onClick={() => setSent(false)}>Use a different email →</button>
              </div>
            ) : (
              <>
                <p className="lp-auth-label">Sign in</p>
                <h2 className="lp-auth-title">Welcome back.</h2>
                <p className="lp-auth-sub">Or create your account — same button, we handle the rest.</p>

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
    </>
  );
}
