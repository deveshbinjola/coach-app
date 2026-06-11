// /build · The Resonance Build sales page
//
// Letter-style. No cards, no section labels. Reads top-to-bottom
// like an essay from Sunny, not like a review deck.
//
// Mirrored at elevateaisystem.com/build (Website/build.html).
// Warm light + forest green. No em-dashes in copy.

import type { Metadata } from "next";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "The Resonance Build · Thirty days. Five calls. Your voice, captured for good.",
  description:
    "For the coach who's tired of sounding like everyone else's funnel. Five one-hour calls with Sunny Binjola. The engine that turns every client conversation into a brand only you could own. $2,000.",
  openGraph: {
    title: "The Resonance Build · ElevateAI",
    description:
      "Thirty days. Five calls. You leave sounding like the man your clients already trust. $2,000.",
    type: "website",
    url: "https://app.elevateaisystem.com/build",
  },
};

const CAL_URL = "https://cal.com/sunny-binjola/resonance-call";

const PALETTE = {
  bg: "#FAF8F3",
  ink: "#0A0F1C",
  muted: "#5A5A52",
  accent: "#0B6E23",
  line: "#D9D4C5",
};

const FH = "'Playfair Display', Georgia, serif";
const FB = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const FM = "'JetBrains Mono', monospace";

export default function ResonanceBuildPage() {
  return (
    <div style={{
      background: PALETTE.bg,
      color: PALETTE.ink,
      fontFamily: FB,
      minHeight: "100vh",
      WebkitFontSmoothing: "antialiased",
    }}>

      {/* Top: leaf only, no chrome */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 32px 0" }}>
        <a href="/" aria-label="ElevateAI Systems" style={{ display: "inline-block", lineHeight: 0 }}>
          <svg viewBox="0 0 88 88" width="36" height="36">
            <rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/>
            <path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/>
            <path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" strokeWidth="5" strokeLinecap="round" fill="none"/>
          </svg>
        </a>
      </div>

      {/* Reading column */}
      <article style={{ maxWidth: 620, margin: "0 auto", padding: "48px 32px 96px" }}>

        <div style={{
          fontFamily: FM,
          fontSize: 11,
          letterSpacing: "0.26em",
          textTransform: "uppercase",
          color: PALETTE.accent,
          fontWeight: 500,
          marginBottom: 24,
        }}>
          The Resonance Build
        </div>

        <h1 style={{
          fontFamily: FH,
          fontWeight: 800,
          fontSize: "clamp(38px, 6.5vw, 54px)",
          lineHeight: 1.05,
          letterSpacing: "-0.022em",
          color: PALETTE.ink,
          marginBottom: 32,
          margin: 0,
        }}>
          For the coach who&rsquo;s tired of sounding like{" "}
          <em style={{ fontStyle: "italic", color: PALETTE.accent, fontWeight: 700 }}>
            everyone else&rsquo;s funnel.
          </em>
        </h1>

        <p style={{
          fontSize: 21,
          lineHeight: 1.5,
          color: PALETTE.ink,
          marginTop: 32,
          marginBottom: 22,
        }}>
          I know the loop. Post, ghost, doubt, repeat. I lived in it for years. Then I built the thing that got me out, and now I build it with you.
        </p>

        <p style={{
          fontFamily: FH,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 23,
          lineHeight: 1.4,
          color: PALETTE.ink,
          margin: "32px 0 36px",
          paddingLeft: 18,
          borderLeft: `2px solid ${PALETTE.accent}`,
        }}>
          Thirty days. Five calls. You leave sounding like the man your clients already trust.
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <a href={CAL_URL} style={ctaPrimary}>Book the first call</a>
          <a href="#what-we-build" style={ctaGhost}>What we build &rarr;</a>
        </div>

        <Rule />

        <H2>You have content. You don&rsquo;t have a brand.</H2>
        <P>Every post feels like a guess. You hit publish and brace.</P>
        <P>A man&rsquo;s work should sound like him. Most marketing makes you sound like a stranger who skimmed your testimonials.</P>

        <Rule />

        <H2>The Resonance Build is not a content package.</H2>
        <P>The content is the easy part. We already automate that.</P>
        <P>The Build is five calls where I sit with you and pull the real signal out. Your voice. Your clients&rsquo; actual words. The way you say the one thing only you say.</P>
        <P muted>Those five calls become your engine. Not a folder of posts you&rsquo;ll abandon in a month. An engine that gets smarter every time you talk to a client.</P>

        <Rule />

        <H2 id="what-we-build">What we actually do, in order.</H2>
        <ol style={{ listStyle: "none", margin: "14px 0 0", padding: 0 }}>
          <Call n="01" name="Voice" body="We find the way you actually talk. Not your &lsquo;brand voice.&rsquo; Your kitchen-table voice." first />
          <Call n="02" name="Signal" body="We mine what your clients already say about the work. Their words, not your guesses." />
          <Call n="03" name="The engine" body="We wire it into your platform so every future conversation feeds it." />
          <Call n="04" name="The first runs" body="We watch it write in your voice and correct it together, out loud." />
          <Call n="05" name="The handoff" body="You leave AI-native, holding an engine that compounds instead of a folder that rots." />
        </ol>

        <Rule />

        <H2>Most coaches buy content and watch it go stale.</H2>
        <P>You leave with a system that knows more about your voice and your clients after every call you ever take. It does not reset. It does not forget.</P>
        <P>It is the one asset that is worth more next quarter than it is today. The day you would never reset.</P>

        <Rule />

        <H2>This isn&rsquo;t for everyone.</H2>
        <P>It isn&rsquo;t for you if you want a folder of posts and a logout button. It isn&rsquo;t for you if you&rsquo;ve never sat across from a client and felt the work land in the room.</P>
        <P>The Build only works on a real practice, with a real voice, run by a man willing to be on five calls and tell the truth on each one.</P>

        <Rule />

        <H2>I&rsquo;m on every one of these calls myself.</H2>
        <P>That caps how many Builds I can run in a month. When the month is full, it&rsquo;s full. No countdown, no fake timer on this page. Just one man, and only so many hours.</P>

        <Rule />

        {/* Close */}
        <section style={{ marginTop: 24 }}>
          <h2 style={{
            fontFamily: FH,
            fontWeight: 800,
            fontSize: "clamp(30px, 5vw, 44px)",
            lineHeight: 1.08,
            letterSpacing: "-0.014em",
            color: PALETTE.ink,
            marginBottom: 28,
          }}>
            Thirty days. Five calls with me.{" "}
            <em style={{ fontStyle: "italic", color: PALETTE.accent, fontWeight: 700 }}>
              You leave with the engine.
            </em>
          </h2>
          <div style={{
            fontFamily: FH,
            fontWeight: 700,
            fontSize: 32,
            color: PALETTE.accent,
            marginBottom: 14,
          }}>
            $2,000.
          </div>
          <p style={{ ...pBase, color: PALETTE.muted }}>
            Not for a deliverable. For the thing that makes every deliverable after it sound like you.
          </p>
          <div style={{ marginTop: 24 }}>
            <a href={CAL_URL} style={{ ...ctaPrimary, fontSize: 17, padding: "17px 36px" }}>
              Book the first call
            </a>
          </div>
          <p style={{ fontSize: 15, color: PALETTE.muted, marginTop: 18 }}>
            30 minutes. No pitch unless you ask for one.
          </p>
        </section>

        {/* Sign-off */}
        <div style={{ marginTop: 80, paddingTop: 40, borderTop: `1px solid ${PALETTE.line}` }}>
          <div style={{ fontFamily: FH, fontStyle: "italic", fontSize: 22, color: PALETTE.ink, marginBottom: 14 }}>
            Written for one man at a time,
          </div>
          <div style={{ fontFamily: FH, fontWeight: 700, fontSize: 18, color: PALETTE.ink }}>
            Sunny Binjola
          </div>
          <div style={{ fontSize: 15, color: PALETTE.muted, marginTop: 2 }}>
            Founder, ElevateAI Systems
          </div>
        </div>

      </article>

      {/* Footer */}
      <footer style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "40px 32px 56px",
        borderTop: `1px solid ${PALETTE.line}`,
        marginTop: 24,
        fontSize: 13.5,
        color: PALETTE.muted,
        display: "flex",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 18,
      }}>
        <div>
          <FooterLink href="/">Home</FooterLink>
          <FooterLink href="/brand-os">Brand OS</FooterLink>
          <FooterLink href="/refer">Refer</FooterLink>
        </div>
        <div>
          &copy; ElevateAI Systems &middot;{" "}
          <a href="mailto:sunny.binjola@gmail.com" style={{ color: PALETTE.muted, textDecoration: "none" }}>
            sunny.binjola@gmail.com
          </a>
        </div>
      </footer>

    </div>
  );
}

// Subcomponents
function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} style={{
      fontFamily: FH,
      fontWeight: 800,
      fontSize: "clamp(26px, 4.5vw, 38px)",
      lineHeight: 1.1,
      letterSpacing: "-0.014em",
      color: PALETTE.ink,
      marginBottom: 24,
      margin: 0,
    }}>
      {children}
    </h2>
  );
}

const pBase: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1.65,
  color: PALETTE.ink,
  margin: "0 0 18px",
};

function P({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p style={{ ...pBase, color: muted ? PALETTE.muted : PALETTE.ink, marginTop: 24 }}>
      {children}
    </p>
  );
}

function Rule() {
  return <hr style={{
    display: "block",
    width: 48,
    height: 1,
    background: PALETTE.line,
    border: "none",
    margin: "64px auto 56px",
  }} />;
}

function Call({ n, name, body, first }: { n: string; name: string; body: string; first?: boolean }) {
  return (
    <li style={{
      display: "grid",
      gridTemplateColumns: "64px 1fr",
      gap: 24,
      padding: first ? "8px 0 24px" : "24px 0",
      borderTop: first ? "none" : `1px solid ${PALETTE.line}`,
    }}>
      <span style={{
        fontFamily: FH,
        fontWeight: 500,
        fontStyle: "italic",
        fontSize: 30,
        lineHeight: 1,
        color: PALETTE.accent,
        paddingTop: 4,
      }}>
        {n}
      </span>
      <div>
        <div style={{
          fontFamily: FH,
          fontWeight: 700,
          fontSize: 26,
          lineHeight: 1.15,
          color: PALETTE.ink,
          marginBottom: 6,
        }}>
          {name}
        </div>
        <div style={{ fontSize: 17, lineHeight: 1.55, color: PALETTE.muted }}>
          {body}
        </div>
      </div>
    </li>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{ color: PALETTE.muted, textDecoration: "none", marginRight: 18 }}>
      {children}
    </a>
  );
}

const ctaPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: PALETTE.accent,
  color: PALETTE.bg,
  fontSize: 16,
  fontWeight: 600,
  padding: "15px 30px",
  borderRadius: 100,
  textDecoration: "none",
  letterSpacing: "0.01em",
};

const ctaGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: PALETTE.ink,
  fontSize: 16,
  fontWeight: 600,
  padding: "14px 24px 14px 0",
  textDecoration: "none",
  background: "transparent",
};
