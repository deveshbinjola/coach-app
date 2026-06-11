// /build · The Resonance Build sales page
//
// Two deployment targets, same copy + design:
//   1. app.elevateaisystem.com/build (this file)
//   2. elevateaisystem.com/build (Website/build.html, static mirror)
//
// Warm light + forest green palette. No dark surfaces.
// Copy from deliverables/2026-06-10-phase0-copy-resonance-direct-response.html
// Voice: Resonance Direct Response (Schwartz / Sugarman / Halbert / Miller).
// No em-dashes anywhere in copy.

import type { Metadata } from "next";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "The Resonance Build · Five calls. Thirty days. Your voice, captured for good.",
  description:
    "For the coach who's tired of sounding like everyone else's funnel. Five one-hour calls with Sunny. The engine that turns every client conversation into a brand only you could own. $2,000.",
  openGraph: {
    title: "The Resonance Build · ElevateAI",
    description:
      "Five calls. Thirty days. You leave sounding like the man your clients already trust. $2,000.",
    type: "website",
    url: "https://app.elevateaisystem.com/build",
  },
};

const CAL_URL = "https://cal.com/sunny-binjola/resonance-call";

export default function ResonanceBuildPage() {
  return (
    <div style={pageStyle}>
      <div style={wrapStyle}>

        {/* logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <a href="/" aria-label="Home" style={{ display: "inline-block" }}>
            <svg viewBox="0 0 88 88" width="44" height="44">
              <rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/>
              <path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/>
              <path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" strokeWidth="5" strokeLinecap="round" fill="none"/>
            </svg>
          </a>
        </div>

        {/* hero */}
        <section style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={eyebrowStyle}>The Resonance Build</div>
          <h1 style={h1Style}>
            For the coach who&rsquo;s tired of sounding like <em style={emStyle}>everyone else&rsquo;s funnel.</em>
          </h1>
          <p style={leadStyle}>
            I know the loop. Post, ghost, doubt, repeat. I lived in it for years. Then I built the thing that got me out, and now I build it with you. Thirty days. Five calls. You leave sounding like the man your clients already trust.
          </p>
          <div style={ctaRowStyle}>
            <a href={CAL_URL} style={ctaPrimaryStyle}>Book the first call</a>
            <a href="#what-we-build" style={ctaGhostStyle}>See what we build</a>
          </div>
        </section>

        {/* problem on three layers */}
        <section style={blockStyle}>
          <div style={smallLabelStyle}>The problem, on three layers</div>
          <div style={{ display: "grid", gap: 18 }}>
            <ThreeLayer label="External" body="You have content. You don't have a brand." />
            <ThreeLayer label="Internal" body="Every post feels like a guess. You hit publish and brace." />
            <ThreeLayer label="Philosophical" body="A man's work should sound like him. Most marketing makes you sound like a stranger who skimmed your testimonials." />
          </div>
        </section>

        {/* reframe */}
        <section style={blockStyle}>
          <div style={smallLabelStyle}>The reframe</div>
          <h2 style={h2Style}>The Resonance Build is not a content package.</h2>
          <p style={pStyle}>
            The content is the easy part. We already automate that. The Build is five calls where I sit with you and pull the real signal out. Your voice. Your clients&rsquo; actual words. The way you say the one thing only you say.
          </p>
          <p style={pMutedStyle}>
            Those five calls become your engine. Not a folder of posts you&rsquo;ll abandon in a month. An engine that gets smarter every time you talk to a client.
          </p>
        </section>

        {/* the five calls */}
        <section id="what-we-build" style={blockStyle}>
          <div style={smallLabelStyle}>The five calls</div>
          <h2 style={h2Style}>The product, named.</h2>
          <div style={{ display: "grid", gap: 0, marginTop: 18 }}>
            <CallRow n="01" name="Voice" body="We find the way you actually talk. Not your &lsquo;brand voice.&rsquo; Your kitchen-table voice." />
            <CallRow n="02" name="Signal" body="We mine what your clients already say about the work. Their words, not your guesses." />
            <CallRow n="03" name="The engine" body="We wire it into your platform so every future conversation feeds it." />
            <CallRow n="04" name="The first runs" body="We watch it write in your voice and correct it together, out loud." />
            <CallRow n="05" name="The handoff" body="You leave AI-native, holding an engine that compounds instead of a folder that rots." />
          </div>
        </section>

        {/* what compounds */}
        <section style={blockStyle}>
          <div style={smallLabelStyle}>What compounds</div>
          <h2 style={h2Style}>Most coaches buy content and watch it go stale.</h2>
          <p style={pStyle}>
            You leave with a system that knows more about your voice and your clients after every call you ever take. It does not reset. It does not forget. It is the one asset that is worth more next quarter than it is today. The day you would never reset.
          </p>
        </section>

        {/* not for */}
        <section style={blockStyle}>
          <div style={smallLabelStyle}>Who this is not for</div>
          <h2 style={h2Style}>The honest disqualifier.</h2>
          <p style={pStyle}>
            This isn&rsquo;t for you if you want a folder of posts and a logout button. It isn&rsquo;t for you if you&rsquo;ve never sat across from a client and felt the work land in the room. The Build only works on a real practice, with a real voice, run by a man willing to be on five calls and tell the truth on each one.
          </p>
        </section>

        {/* scarcity */}
        <section style={blockStyle}>
          <div style={smallLabelStyle}>Scarcity, the real kind</div>
          <p style={pStyle}>
            I&rsquo;m on every one of these calls myself. That caps how many Builds I can run in a month. When the month is full, it&rsquo;s full. No countdown, no fake timer on this page. Just one man, and only so many hours.
          </p>
        </section>

        {/* close + price */}
        <section style={closeBlockStyle}>
          <div style={{ ...smallLabelStyle, color: "#FAF8F3", opacity: 0.8 }}>The close</div>
          <h2 style={{ ...h2Style, color: "#FAF8F3", marginTop: 8 }}>
            Thirty days. Five calls with me. <em style={{ fontStyle: "italic", opacity: 0.85 }}>You leave with the engine.</em>
          </h2>
          <p style={{ ...pStyle, color: "#FAF8F3", opacity: 0.92 }}>
            $2,000. Not for a deliverable. For the thing that makes every deliverable after it sound like you.
          </p>
          <div style={{ marginTop: 28 }}>
            <a href={CAL_URL} style={ctaPrimaryOnDarkStyle}>Book the first call</a>
          </div>
          <p style={{ ...pStyle, color: "#FAF8F3", opacity: 0.7, fontSize: 14, marginTop: 18 }}>
            30 minutes with me. We look at what you have and figure out what to actually do with it. No pitch on the call unless you ask for one.
          </p>
        </section>

        {/* footer */}
        <footer style={footerStyle}>
          <p>ElevateAI Systems · The Resonance Build · <a href="mailto:sunny.binjola@gmail.com" style={{ color: "#0B6E23", textDecoration: "none" }}>sunny.binjola@gmail.com</a></p>
        </footer>

      </div>
    </div>
  );
}

function ThreeLayer({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 18, alignItems: "baseline" }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "#0B6E23",
        fontWeight: 700,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 17, lineHeight: 1.5, color: "#0A0F1C" }}>
        {body}
      </div>
    </div>
  );
}

function CallRow({ n, name, body }: { n: string; name: string; body: string }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "60px 1fr",
      gap: 22,
      padding: "20px 0",
      borderTop: "1px solid #E5E1D8",
      alignItems: "baseline",
    }}>
      <div style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: 22,
        fontWeight: 800,
        color: "#0B6E23",
      }}>
        {n}
      </div>
      <div>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 22,
          fontWeight: 700,
          color: "#0A0F1C",
          marginBottom: 6,
        }}>
          {name}
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.55, color: "#5A5A52" }}>
          {body}
        </div>
      </div>
    </div>
  );
}

// Styles
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#FAF8F3",
  color: "#0A0F1C",
  fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  WebkitFontSmoothing: "antialiased",
};

const wrapStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "56px 24px 96px",
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "#0B6E23",
  fontWeight: 700,
  marginBottom: 18,
};

const h1Style: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: 48,
  fontWeight: 800,
  lineHeight: 1.08,
  letterSpacing: "-0.018em",
  margin: 0,
  color: "#0A0F1C",
};

const emStyle: React.CSSProperties = {
  fontStyle: "italic",
  color: "#0B6E23",
};

const leadStyle: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1.55,
  color: "#5A5A52",
  margin: "22px auto 32px",
  maxWidth: 600,
};

const ctaRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  justifyContent: "center",
  flexWrap: "wrap",
};

const ctaPrimaryStyle: React.CSSProperties = {
  display: "inline-block",
  background: "#0B6E23",
  color: "#FAF8F3",
  fontSize: 16,
  fontWeight: 700,
  padding: "14px 28px",
  borderRadius: 100,
  textDecoration: "none",
  transition: "background 0.2s",
};

const ctaPrimaryOnDarkStyle: React.CSSProperties = {
  ...ctaPrimaryStyle,
  background: "#FAF8F3",
  color: "#0A0F1C",
};

const ctaGhostStyle: React.CSSProperties = {
  display: "inline-block",
  background: "transparent",
  color: "#0B6E23",
  fontSize: 16,
  fontWeight: 700,
  padding: "13px 26px",
  borderRadius: 100,
  textDecoration: "none",
  border: "1.5px solid #0B6E23",
};

const blockStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E1D8",
  borderLeft: "4px solid #0B6E23",
  borderRadius: "0 14px 14px 0",
  padding: "28px 32px",
  marginBottom: 18,
};

const closeBlockStyle: React.CSSProperties = {
  background: "#0A0F1C",
  borderRadius: 14,
  padding: "40px 36px",
  marginTop: 32,
  marginBottom: 32,
  color: "#FAF8F3",
};

const smallLabelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#0B6E23",
  fontWeight: 700,
  marginBottom: 12,
};

const h2Style: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: 28,
  fontWeight: 800,
  lineHeight: 1.18,
  letterSpacing: "-0.01em",
  margin: "0 0 14px",
  color: "#0A0F1C",
};

const pStyle: React.CSSProperties = {
  fontSize: 16.5,
  lineHeight: 1.6,
  color: "#0A0F1C",
  margin: "0 0 10px",
};

const pMutedStyle: React.CSSProperties = {
  ...pStyle,
  color: "#5A5A52",
};

const footerStyle: React.CSSProperties = {
  marginTop: 48,
  paddingTop: 24,
  borderTop: "1px solid #E5E1D8",
  fontSize: 13,
  color: "#5A5A52",
  textAlign: "center",
};
