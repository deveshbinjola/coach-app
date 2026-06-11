// /build · The Resonance Build sales page
//
// Editorial premium landing page. Custom SVG graphics, asymmetric
// sections, warm light + forest green. Mirrors the static version
// at elevateaisystem.com/build (Website/build.html) for full parity.
//
// CSS lives in a single style block injected via dangerouslySetInnerHTML
// to keep pseudo-element + hover + keyframe rules intact.

import type { Metadata } from "next";
import Script from "next/script";

export const runtime = "edge";

export const metadata: Metadata = {
  title:
    "The Resonance Build · Five calls. Thirty days. The voice no one can clone.",
  description:
    "Five one-hour calls with Sunny Binjola. We sit together, pull your real signal out, and wire it into an engine that compounds every time you talk to a client. Thirty days. $2,000.",
  openGraph: {
    title: "The Resonance Build · ElevateAI",
    description:
      "Five calls. Thirty days. The voice no one can clone. $2,000.",
    type: "website",
    url: "https://app.elevateaisystem.com/build",
  },
};

const CAL_URL = "https://cal.com/sunny-binjola/resonance-call";

const PAGE_CSS = `
:root{
  --bg:#FAF8F3;
  --bg-warm:#F2EEDF;
  --bg-cream:#F6F1E3;
  --ink:#0A0F1C;
  --ink-soft:#1F2638;
  --muted:#6A6A60;
  --soft:#9A9A8E;
  --accent:#0B6E23;
  --accent-dark:#064214;
  --accent-soft:#1F9B47;
  --copper:#B58A1E;
  --line:#D9D4C5;
  --line-soft:#E8E3D4;
  --pale:#F0EBDB;
  --shadow-sm:0 1px 2px rgba(10,15,28,.04);
  --shadow-md:0 8px 30px rgba(10,15,28,.06);
  --shadow-lg:0 20px 50px rgba(10,15,28,.08);
  --fd:'Fraunces', Georgia, serif;
  --fb:'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --fm:'JetBrains Mono', monospace;
}
.rb-page *{box-sizing:border-box;margin:0;padding:0}
.rb-page{
  background:var(--bg);
  color:var(--ink);
  font-family:var(--fb);
  font-size:17px;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  overflow-x:hidden;
  position:relative;
  min-height:100vh;
}
.rb-page ::selection{background:var(--accent);color:var(--bg)}
.rb-page a{color:inherit;text-decoration:none}
.rb-page img,.rb-page svg{display:block;max-width:100%}

.rb-page::before{
  content:'';
  position:fixed;
  inset:0;
  pointer-events:none;
  background:
    radial-gradient(ellipse at 15% 0%, rgba(11,110,35,.04), transparent 50%),
    radial-gradient(ellipse at 85% 100%, rgba(181,138,30,.03), transparent 50%);
  z-index:1;
}
.rb-page::after{
  content:'';
  position:fixed;
  inset:0;
  pointer-events:none;
  opacity:.32;
  mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .05  0 0 0 0 .06  0 0 0 0 .08  0 0 0 .18 0'/></filter><rect width='180' height='180' filter='url(%23n)'/></svg>");
  z-index:1;
}
.rb-page main,.rb-page header,.rb-page footer{position:relative;z-index:2}

.rb-bar{
  max-width:1280px;
  margin:0 auto;
  padding:24px 40px;
  display:flex;align-items:center;justify-content:space-between;
}
.rb-bar .left{display:flex;align-items:center;gap:14px}
.rb-bar .mark{display:flex;align-items:center;gap:10px;line-height:0}
.rb-bar .mark .name{
  font-family:var(--fd);
  font-weight:700;
  font-size:17px;
  color:var(--ink);
  letter-spacing:-.005em;
  line-height:1;
}
.rb-bar .meta{
  font-family:var(--fm);
  font-size:11px;
  letter-spacing:.18em;
  text-transform:uppercase;
  color:var(--muted);
  display:flex;align-items:center;gap:18px;
}
.rb-bar .meta b{color:var(--ink);font-weight:600}
.rb-bar .meta .sep{width:1px;height:14px;background:var(--line)}
.rb-bar .meta .dot{
  width:5px;height:5px;border-radius:50%;
  background:var(--accent);
  display:inline-block;
  box-shadow:0 0 0 4px rgba(11,110,35,.12);
  animation:rb-pulse 2.6s ease-in-out infinite;
  margin-right:6px;
}
@keyframes rb-pulse{0%,100%{box-shadow:0 0 0 4px rgba(11,110,35,.12)}50%{box-shadow:0 0 0 8px rgba(11,110,35,0)}}

.rb-hero{
  max-width:1280px;
  margin:0 auto;
  padding:80px 40px 120px;
  display:grid;
  grid-template-columns:1.1fr .9fr;
  gap:80px;
  align-items:center;
  position:relative;
}
.rb-hero::before{
  content:'';
  position:absolute;top:0;left:40px;
  width:1px;height:60px;
  background:linear-gradient(to bottom, transparent, var(--accent));
}
.rb-eyebrow{
  font-family:var(--fm);
  font-size:11px;
  letter-spacing:.26em;
  text-transform:uppercase;
  color:var(--accent);
  font-weight:500;
  margin-bottom:32px;
  display:inline-flex;align-items:center;gap:12px;
}
.rb-eyebrow::before{content:'';width:24px;height:1px;background:var(--accent)}
.rb-h1{
  font-family:var(--fd);
  font-variation-settings:"opsz" 144, "SOFT" 30, "wght" 600;
  font-size:clamp(46px, 7.4vw, 96px);
  line-height:.96;
  letter-spacing:-.028em;
  color:var(--ink);
  margin-bottom:36px;
}
.rb-h1 em{
  font-style:italic;
  font-variation-settings:"opsz" 144, "SOFT" 80, "wght" 500;
  color:var(--accent);
  display:inline-block;
  position:relative;
}
.rb-h1 em::after{
  content:'';
  position:absolute;left:0;right:0;bottom:.06em;
  height:.22em;
  background:rgba(11,110,35,.12);
  z-index:-1;
  border-radius:2px;
}
.rb-lede{
  font-size:20px;
  line-height:1.55;
  color:var(--ink-soft);
  max-width:540px;
  margin-bottom:42px;
}
.rb-ctas{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.rb-cta{
  display:inline-flex;align-items:center;gap:10px;
  font-family:var(--fb);font-weight:600;font-size:15.5px;
  letter-spacing:.005em;
  padding:17px 30px;
  border-radius:100px;
  transition:all .25s cubic-bezier(.2,.7,.3,1);
  position:relative;
  white-space:nowrap;
  cursor:pointer;
}
.rb-cta.primary{
  background:var(--ink);
  color:var(--bg);
  box-shadow:var(--shadow-md);
}
.rb-cta.primary:hover{
  background:var(--accent-dark);
  transform:translateY(-2px);
  box-shadow:var(--shadow-lg);
}
.rb-cta.primary .arrow{transition:transform .25s ease}
.rb-cta.primary:hover .arrow{transform:translateX(4px)}
.rb-cta.ghost{
  color:var(--ink);
  font-weight:500;
  padding:17px 0;
  display:inline-flex;align-items:center;gap:8px;
}
.rb-cta.ghost::after{
  content:'';display:inline-block;
  width:22px;height:1px;
  background:var(--ink);
  transition:width .25s ease;
}
.rb-cta.ghost:hover::after{width:34px;background:var(--accent)}
.rb-hero-meta{
  margin-top:48px;
  display:flex;align-items:center;gap:24px;
  font-family:var(--fm);
  font-size:11px;
  letter-spacing:.18em;
  text-transform:uppercase;
  color:var(--muted);
  flex-wrap:wrap;
}
.rb-hero-meta b{color:var(--ink);font-weight:600}
.rb-hero-meta .sep{width:1px;height:14px;background:var(--line)}
.rb-hero-art{
  position:relative;
  justify-self:center;
  width:100%;
  max-width:520px;
  aspect-ratio:1/1;
}
.rb-hero-art svg{
  width:100%;height:100%;
  filter:drop-shadow(0 30px 80px rgba(11,110,35,.12));
}
.rb-hero-art .float{
  animation:rb-floaty 8s ease-in-out infinite;
  transform-origin:center;
}
@keyframes rb-floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
.rb-hero-art .ring{
  animation:rb-spin 80s linear infinite;
  transform-origin:center;
}
@keyframes rb-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.rb-hero-art .pulse-line{
  stroke-dasharray:200;
  stroke-dashoffset:200;
  animation:rb-draw 3s ease-out forwards;
}
@keyframes rb-draw{to{stroke-dashoffset:0}}

.rb-trust{
  max-width:1280px;
  margin:0 auto;
  padding:48px 40px 96px;
  border-top:1px solid var(--line);
}
.rb-trust .who{
  font-family:var(--fm);
  font-size:11px;
  letter-spacing:.22em;
  text-transform:uppercase;
  color:var(--muted);
  margin-bottom:32px;
  text-align:center;
}
.rb-trust .principles{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:0;
}
.rb-trust .pr{padding:0 32px;position:relative}
.rb-trust .pr + .pr{border-left:1px solid var(--line)}
.rb-trust .pr .pn{
  font-family:var(--fd);
  font-variation-settings:"opsz" 100, "SOFT" 50, "wght" 700;
  font-size:42px;line-height:1;
  color:var(--accent);
  margin-bottom:14px;
  font-style:italic;
}
.rb-trust .pr .pt{
  font-family:var(--fd);
  font-variation-settings:"opsz" 24, "wght" 700;
  font-size:19px;line-height:1.3;
  color:var(--ink);
  margin-bottom:8px;
  letter-spacing:-.005em;
}
.rb-trust .pr .pb{font-size:14.5px;line-height:1.5;color:var(--muted)}

.rb-section{
  max-width:1280px;
  margin:0 auto;
  padding:120px 40px;
  position:relative;
}
.rb-label{
  font-family:var(--fm);
  font-size:11px;
  letter-spacing:.22em;
  text-transform:uppercase;
  color:var(--accent);
  font-weight:500;
  margin-bottom:24px;
  display:inline-flex;align-items:center;gap:12px;
}
.rb-label::before{content:'';width:18px;height:1px;background:var(--accent);display:inline-block}
.rb-h2{
  font-family:var(--fd);
  font-variation-settings:"opsz" 96, "SOFT" 40, "wght" 600;
  font-size:clamp(36px, 4.6vw, 60px);
  line-height:1.02;
  letter-spacing:-.022em;
  color:var(--ink);
  margin-bottom:32px;
  max-width:760px;
}
.rb-h2 em{
  font-style:italic;
  font-variation-settings:"opsz" 96, "SOFT" 90, "wght" 500;
  color:var(--accent);
}
.rb-body{
  font-size:18px;
  line-height:1.65;
  color:var(--ink-soft);
  margin-bottom:18px;
  max-width:580px;
}
.rb-body.muted{color:var(--muted)}

.rb-problem{
  display:grid;
  grid-template-columns:.85fr 1.15fr;
  gap:80px;
  align-items:center;
}
.rb-problem-art{
  position:relative;
  width:100%;
  max-width:440px;
  aspect-ratio:1/1;
  justify-self:center;
}
.rb-problem-art svg{width:100%;height:100%}
.rb-loop-arrow{stroke-dasharray:400;stroke-dashoffset:400}
.rb-in-view .rb-loop-arrow{animation:rb-draw 2.4s ease-out forwards}

.rb-reframe{text-align:center}
.rb-reframe .rb-h2{margin-left:auto;margin-right:auto}
.rb-reframe .rb-body{margin-left:auto;margin-right:auto;text-align:center}
.rb-reframe-grid{
  margin-top:64px;
  display:grid;
  grid-template-columns:1fr auto 1fr;
  gap:24px;
  align-items:center;
  max-width:920px;
  margin-left:auto;margin-right:auto;
}
.rb-rfp{
  background:var(--bg-cream);
  border:1px solid var(--line-soft);
  border-radius:18px;
  padding:36px 32px;
  text-align:left;
  min-height:260px;
  display:flex;flex-direction:column;justify-content:space-between;
  position:relative;
  overflow:hidden;
}
.rb-rfp.after{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.rb-rfp.after .rb-rfh{color:var(--bg)}
.rb-rfp.after .rb-rfb{color:rgba(250,248,243,.75)}
.rb-rfp .rb-rft{
  font-family:var(--fm);
  font-size:10.5px;
  letter-spacing:.22em;
  text-transform:uppercase;
  font-weight:500;
  margin-bottom:14px;
  color:var(--muted);
}
.rb-rfp.after .rb-rft{color:rgba(250,248,243,.5)}
.rb-rfp .rb-rfh{
  font-family:var(--fd);
  font-variation-settings:"opsz" 48, "SOFT" 50, "wght" 700;
  font-size:22px;line-height:1.2;
  color:var(--ink);
  margin-bottom:12px;
  letter-spacing:-.012em;
}
.rb-rfp .rb-rfb{font-size:14.5px;line-height:1.55;color:var(--muted)}
.rb-rfp .rb-rfsvg{margin-top:16px;width:100%;height:88px}
.rb-rfarrow{display:flex;align-items:center;justify-content:center;color:var(--accent)}
.rb-rfarrow svg{width:48px;height:48px}

.rb-calls{max-width:920px;margin:64px auto 0;position:relative}
.rb-calls::before{
  content:'';
  position:absolute;left:62px;top:48px;bottom:48px;
  width:1px;
  background:linear-gradient(to bottom,
    transparent 0%,
    var(--line) 8%,
    var(--line) 92%,
    transparent 100%);
}
.rb-call{
  display:grid;
  grid-template-columns:128px 1fr;
  gap:32px;
  align-items:flex-start;
  padding:32px 0;
  position:relative;
}
.rb-call:not(:last-child)::after{
  content:'';
  position:absolute;left:128px;right:0;bottom:0;
  height:1px;background:var(--line-soft);
}
.rb-call .idx{
  display:flex;flex-direction:column;align-items:center;gap:14px;
  position:relative;z-index:1;
}
.rb-call .icon{
  width:64px;height:64px;
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  color:var(--accent);
  position:relative;z-index:1;
  transition:all .35s ease;
}
.rb-call:hover .icon{
  border-color:var(--accent);
  transform:scale(1.06);
  background:var(--bg-warm);
}
.rb-call .icon svg{width:32px;height:32px}
.rb-call .n{
  font-family:var(--fm);
  font-size:11px;
  letter-spacing:.2em;
  color:var(--muted);
  font-weight:500;
}
.rb-call .cb{padding-top:6px}
.rb-call .nm{
  font-family:var(--fd);
  font-variation-settings:"opsz" 48, "SOFT" 40, "wght" 700;
  font-size:30px;
  line-height:1.1;
  letter-spacing:-.014em;
  color:var(--ink);
  margin-bottom:10px;
}
.rb-call .nm em{
  font-style:italic;
  color:var(--accent);
  font-variation-settings:"opsz" 48, "SOFT" 80, "wght" 600;
}
.rb-call .b{
  font-size:16.5px;line-height:1.6;
  color:var(--muted);
  max-width:560px;
}
.rb-call .cmeta{
  font-family:var(--fm);
  font-size:10.5px;
  letter-spacing:.18em;
  text-transform:uppercase;
  color:var(--accent);
  margin-top:12px;
  font-weight:500;
}

.rb-outcomes{
  background:var(--bg-warm);
  padding:120px 0;
  margin-top:40px;
  position:relative;
}
.rb-outcomes::before,.rb-outcomes::after{
  content:'';position:absolute;left:0;right:0;height:1px;background:var(--line);
}
.rb-outcomes::before{top:0}.rb-outcomes::after{bottom:0}
.rb-outcomes-inner{max-width:1280px;margin:0 auto;padding:0 40px}
.rb-outcomes-head{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:80px;
  align-items:end;
  margin-bottom:72px;
}
.rb-outcomes-head .rb-h2{margin-bottom:0}
.rb-outcomes-head p{color:var(--muted);font-size:18px;line-height:1.55;max-width:440px}
.rb-outcomes-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:40px}
.rb-outcome{
  background:var(--bg);
  border:1px solid var(--line-soft);
  border-radius:20px;
  padding:40px 36px;
  position:relative;
  transition:all .3s ease;
}
.rb-outcome:hover{
  transform:translateY(-4px);
  box-shadow:var(--shadow-md);
  border-color:var(--line);
}
.rb-outcome .icon{
  width:56px;height:56px;
  background:var(--bg-cream);
  border-radius:14px;
  display:flex;align-items:center;justify-content:center;
  margin-bottom:28px;
  color:var(--accent);
}
.rb-outcome .icon svg{width:30px;height:30px}
.rb-outcome h3{
  font-family:var(--fd);
  font-variation-settings:"opsz" 36, "SOFT" 30, "wght" 700;
  font-size:24px;line-height:1.2;
  letter-spacing:-.012em;
  color:var(--ink);
  margin-bottom:14px;
}
.rb-outcome p{font-size:15.5px;line-height:1.55;color:var(--muted)}

.rb-dq{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}
.rb-dqp{
  border:1px solid var(--line);
  border-radius:20px;
  padding:40px 36px;
  background:var(--bg);
  position:relative;
}
.rb-dqp.yes{border-color:var(--accent);background:linear-gradient(180deg, rgba(11,110,35,.04) 0%, var(--bg) 100%)}
.rb-dqp .tag{
  font-family:var(--fm);
  font-size:10.5px;
  letter-spacing:.22em;
  text-transform:uppercase;
  font-weight:600;
  margin-bottom:18px;
  display:inline-flex;align-items:center;gap:10px;
}
.rb-dqp.no .tag{color:var(--muted)}
.rb-dqp.yes .tag{color:var(--accent)}
.rb-dqp .tag .mk{
  width:18px;height:18px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-family:var(--fb);font-weight:700;font-size:11px;
}
.rb-dqp.no .tag .mk{background:var(--line);color:var(--muted)}
.rb-dqp.yes .tag .mk{background:var(--accent);color:var(--bg)}
.rb-dqp h3{
  font-family:var(--fd);
  font-variation-settings:"opsz" 36, "SOFT" 40, "wght" 700;
  font-size:22px;line-height:1.2;
  letter-spacing:-.012em;
  color:var(--ink);
  margin-bottom:18px;
}
.rb-dqp ul{list-style:none;padding:0;margin:0}
.rb-dqp li{
  font-size:16px;line-height:1.55;color:var(--ink-soft);
  padding:14px 0;
  border-top:1px solid var(--line-soft);
  display:flex;gap:14px;align-items:flex-start;
}
.rb-dqp li:first-child{border-top:none;padding-top:6px}
.rb-dqp li .dot{
  margin-top:9px;flex-shrink:0;
  width:5px;height:5px;border-radius:50%;background:var(--line);
}
.rb-dqp.yes li .dot{background:var(--accent)}

.rb-scarcity{
  text-align:center;
  padding:80px 40px 120px;
  max-width:880px;
  margin:0 auto;
}
.rb-scarcity .quote{
  font-family:var(--fd);
  font-variation-settings:"opsz" 120, "SOFT" 60, "wght" 500;
  font-style:italic;
  font-size:clamp(28px, 3.6vw, 42px);
  line-height:1.18;
  letter-spacing:-.012em;
  color:var(--ink);
  margin-bottom:32px;
  display:inline-block;
  position:relative;
}
.rb-scarcity .quote::before{
  content:'';display:block;
  width:48px;height:1px;background:var(--accent);
  margin:0 auto 32px;
}
.rb-scarcity .by{
  font-family:var(--fm);
  font-size:11px;
  letter-spacing:.22em;
  text-transform:uppercase;
  color:var(--muted);
  margin-top:20px;
}

.rb-close{
  background:var(--ink);
  color:var(--bg);
  padding:140px 0;
  position:relative;
  overflow:hidden;
}
.rb-close::before{
  content:'';position:absolute;inset:0;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(11,110,35,.22), transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(181,138,30,.10), transparent 50%);
  pointer-events:none;
}
.rb-close-inner{
  max-width:1080px;margin:0 auto;padding:0 40px;
  display:grid;grid-template-columns:1.2fr .8fr;gap:80px;align-items:center;
  position:relative;
}
.rb-close .rb-label{color:var(--accent-soft)}
.rb-close .rb-label::before{background:var(--accent-soft)}
.rb-close .rb-h2{color:var(--bg);font-size:clamp(36px, 4.8vw, 60px);margin-bottom:32px}
.rb-close .rb-h2 em{color:var(--accent-soft)}
.rb-close .rb-body{color:rgba(250,248,243,.75);font-size:17px;line-height:1.6;max-width:520px;margin-bottom:36px}
.rb-close .rb-cta.primary{background:var(--bg);color:var(--ink)}
.rb-close .rb-cta.primary:hover{background:var(--accent-soft);color:var(--ink)}
.rb-close .rb-cta.ghost{color:var(--bg)}
.rb-close .rb-cta.ghost::after{background:var(--bg)}
.rb-close .rb-cta.ghost:hover::after{background:var(--accent-soft)}
.rb-close .fineprint{
  font-family:var(--fm);font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  color:rgba(250,248,243,.5);margin-top:32px;
}
.rb-price{
  background:rgba(250,248,243,.04);
  border:1px solid rgba(250,248,243,.12);
  border-radius:24px;
  padding:36px 36px 32px;
  position:relative;
}
.rb-price .pcl{
  font-family:var(--fm);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;
  color:var(--accent-soft);font-weight:500;margin-bottom:14px;
}
.rb-price .pca{
  font-family:var(--fd);
  font-variation-settings:"opsz" 144, "SOFT" 60, "wght" 700;
  font-size:72px;line-height:1;
  color:var(--bg);
  letter-spacing:-.025em;
  margin-bottom:6px;
}
.rb-price .pca sup{font-size:28px;vertical-align:super;letter-spacing:0}
.rb-price .pcs{
  font-family:var(--fm);font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  color:rgba(250,248,243,.55);margin-bottom:28px;
}
.rb-price ul{list-style:none;padding:0;margin:0 0 28px}
.rb-price li{
  display:flex;align-items:flex-start;gap:12px;
  padding:10px 0;
  font-size:14.5px;
  color:rgba(250,248,243,.85);
  border-top:1px solid rgba(250,248,243,.08);
}
.rb-price li:first-child{border-top:none}
.rb-price li::before{
  content:'';margin-top:8px;flex-shrink:0;
  width:6px;height:6px;background:var(--accent-soft);border-radius:50%;
}
.rb-price .rb-cta{width:100%;justify-content:center}

.rb-signoff{
  max-width:1080px;margin:0 auto;
  padding:120px 40px;
  display:grid;grid-template-columns:auto 1fr;
  gap:48px;align-items:center;
}
.rb-portrait{
  width:160px;height:160px;border-radius:50%;
  background:radial-gradient(circle at 30% 30%, var(--accent-soft), var(--accent) 60%, var(--accent-dark));
  position:relative;overflow:hidden;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  color:var(--bg);
  box-shadow:var(--shadow-md);
}
.rb-portrait .initial{
  font-family:var(--fd);font-style:italic;
  font-variation-settings:"opsz" 144, "SOFT" 90, "wght" 500;
  font-size:88px;line-height:1;
}
.rb-portrait::after{
  content:'';position:absolute;inset:-1px;border-radius:50%;
  border:1px solid rgba(255,255,255,.16);
}
.rb-signoff .open{
  font-family:var(--fd);font-style:italic;
  font-variation-settings:"opsz" 96, "SOFT" 70, "wght" 500;
  font-size:30px;line-height:1.25;
  color:var(--ink);
  letter-spacing:-.012em;
  margin-bottom:16px;
}
.rb-signoff .nm{
  font-family:var(--fd);
  font-variation-settings:"opsz" 36, "wght" 700;
  font-size:20px;color:var(--ink);
  margin-bottom:4px;
}
.rb-signoff .role{
  font-family:var(--fm);font-size:12px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--muted);
}

.rb-footer{
  border-top:1px solid var(--line);
  padding:48px 40px 64px;
}
.rb-footer .inner{
  max-width:1280px;margin:0 auto;
  display:grid;grid-template-columns:auto 1fr auto;
  gap:48px;align-items:center;
}
.rb-footer .brand{display:flex;align-items:center;gap:12px}
.rb-footer .brand .nm{font-family:var(--fd);font-weight:700;font-size:16px;color:var(--ink)}
.rb-footer .nav{display:flex;gap:32px;justify-content:center}
.rb-footer .nav a{font-size:14px;color:var(--muted);transition:color .2s ease}
.rb-footer .nav a:hover{color:var(--accent)}
.rb-footer .email{font-size:13px;color:var(--muted)}
.rb-footer .email a{color:var(--ink);font-weight:500}
.rb-footer .email a:hover{color:var(--accent)}

.rb-reveal{opacity:0;transform:translateY(20px);transition:opacity .9s ease, transform .9s ease}
.rb-reveal.rb-in-view{opacity:1;transform:translateY(0)}
.rb-d1{transition-delay:.1s}
.rb-d2{transition-delay:.2s}
.rb-d3{transition-delay:.3s}

@media(max-width:960px){
  .rb-bar{padding:18px 22px}
  .rb-bar .meta{display:none}
  .rb-hero{padding:48px 22px 80px;grid-template-columns:1fr;gap:48px}
  .rb-hero::before{display:none}
  .rb-hero-art{max-width:340px;order:-1}
  .rb-lede{font-size:17.5px}
  .rb-hero-meta{flex-wrap:wrap;gap:14px}
  .rb-section{padding:80px 22px}
  .rb-problem{grid-template-columns:1fr;gap:48px}
  .rb-problem-art{order:-1;max-width:320px}
  .rb-reframe-grid{grid-template-columns:1fr;gap:14px}
  .rb-rfarrow{transform:rotate(90deg)}
  .rb-calls::before{left:32px}
  .rb-call{grid-template-columns:80px 1fr;gap:18px;padding:24px 0}
  .rb-call:not(:last-child)::after{left:80px}
  .rb-call .idx{gap:8px}
  .rb-call .icon{width:56px;height:56px}
  .rb-call .icon svg{width:26px;height:26px}
  .rb-call .nm{font-size:24px}
  .rb-outcomes{padding:80px 0}
  .rb-outcomes-inner{padding:0 22px}
  .rb-outcomes-head{grid-template-columns:1fr;gap:18px;margin-bottom:48px}
  .rb-outcomes-grid{grid-template-columns:1fr;gap:18px}
  .rb-dq{grid-template-columns:1fr;gap:18px}
  .rb-close{padding:96px 0}
  .rb-close-inner{grid-template-columns:1fr;gap:48px;padding:0 22px}
  .rb-price .pca{font-size:56px}
  .rb-signoff{grid-template-columns:1fr;gap:24px;padding:80px 22px;text-align:center}
  .rb-portrait{justify-self:center;margin:0 auto}
  .rb-trust .principles{grid-template-columns:1fr;gap:32px}
  .rb-trust .pr{padding:0}
  .rb-trust .pr + .pr{border-left:none;border-top:1px solid var(--line);padding-top:32px}
  .rb-footer .inner{grid-template-columns:1fr;gap:24px;text-align:center}
  .rb-footer .brand,.rb-footer .nav,.rb-footer .email{justify-content:center}
}
`;

const REVEAL_SCRIPT = `
(function(){
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.rb-reveal').forEach(function(el){el.classList.add('rb-in-view')});
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (e.isIntersecting) {
        e.target.classList.add('rb-in-view');
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
  document.querySelectorAll('.rb-reveal, .rb-problem-art').forEach(function(el){ io.observe(el); });
})();
`;

export default function ResonanceBuildPage() {
  return (
    <>
      {/* Stylesheet + fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,400..900,0..100;1,9..144,400..900,0..100&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      <div className="rb-page">

        {/* Top bar */}
        <header className="rb-bar">
          <div className="left">
            <a href="/" className="mark" aria-label="ElevateAI Systems">
              <Leaf size={34} />
              <span className="name">ElevateAI</span>
            </a>
          </div>
          <div className="meta">
            <span><b>The Resonance Build</b></span>
            <span className="sep"></span>
            <span><span className="dot"></span>Taking June applicants</span>
          </div>
        </header>

        <main>

          {/* HERO */}
          <section className="rb-hero">
            <div>
              <div className="rb-eyebrow rb-reveal">The Resonance Build &middot; $2,000</div>
              <h1 className="rb-h1 rb-reveal rb-d1">
                Five calls. Thirty days. <em>The voice no one can clone.</em>
              </h1>
              <p className="rb-lede rb-reveal rb-d2">
                I sit with you for five hours over thirty days and pull the real signal out. Your voice. Your clients&rsquo; actual words. The one thing only you say. Those calls become an engine that compounds every time you talk to a client.
              </p>
              <div className="rb-ctas rb-reveal rb-d3">
                <a href={CAL_URL} className="rb-cta primary">
                  Book the first call
                  <ArrowRight />
                </a>
                <a href="#what-we-do" className="rb-cta ghost">See the five calls</a>
              </div>
              <div className="rb-hero-meta rb-reveal rb-d3">
                <span><b>30 days</b> &middot; build window</span>
                <span className="sep"></span>
                <span><b>5 hours</b> &middot; with me, on Zoom</span>
                <span className="sep"></span>
                <span>Small batch &middot; capacity-capped</span>
              </div>
            </div>

            <div className="rb-hero-art rb-reveal rb-d2">
              <HeroArt />
            </div>
          </section>

          {/* TRUST */}
          <section className="rb-trust">
            <div className="who">
              For men&rsquo;s coaches who already sound like themselves in the room. Now we make the page sound like that too.
            </div>
            <div className="principles">
              <div className="pr">
                <div className="pn">i.</div>
                <div className="pt">Built, not taught.</div>
                <div className="pb">Done with you, not handed off. You leave holding the engine, not a binder.</div>
              </div>
              <div className="pr">
                <div className="pn">ii.</div>
                <div className="pt">The calls are the product.</div>
                <div className="pb">Five hours with me, not a course. The signal we mine in them is what makes the rest work.</div>
              </div>
              <div className="pr">
                <div className="pn">iii.</div>
                <div className="pt">Real scarcity. My time.</div>
                <div className="pb">I&rsquo;m on every call. When the month is full, it&rsquo;s full. No fake timers on this page.</div>
              </div>
            </div>
          </section>

          {/* PROBLEM */}
          <section className="rb-section">
            <div className="rb-problem">
              <div className="rb-problem-art rb-reveal">
                <ProblemArt />
              </div>
              <div>
                <div className="rb-label rb-reveal">The Problem</div>
                <h2 className="rb-h2 rb-reveal">
                  You have content. <em>You don&rsquo;t have a brand.</em>
                </h2>
                <p className="rb-body rb-reveal">
                  Every post feels like a guess. You hit publish and brace. Then nothing happens, or worse, the wrong people clap, and you start writing for them.
                </p>
                <p className="rb-body rb-reveal">
                  A man&rsquo;s work should sound like him. Most marketing makes you sound like a stranger who skimmed your testimonials and ran them through a calendar.
                </p>
                <p className="rb-body muted rb-reveal">
                  The problem was never the volume. It was the voice underneath it.
                </p>
              </div>
            </div>
          </section>

          {/* REFRAME */}
          <section className="rb-section rb-reframe">
            <div className="rb-label rb-reveal">The Reframe</div>
            <h2 className="rb-h2 rb-reveal">
              The Build is <em>not</em> a content package.
            </h2>
            <p className="rb-body rb-reveal">
              The content is the easy part. We already automate that. The Build is five calls where I sit with you and pull the real signal out. Your voice. Your clients&rsquo; actual words. The way you say the one thing only you say.
            </p>
            <p className="rb-body rb-reveal" style={{ color: "var(--muted)" }}>
              Those five calls become your engine. Not a folder of posts you&rsquo;ll abandon in a month. An engine that gets smarter every time you talk to a client.
            </p>

            <div className="rb-reframe-grid">
              <div className="rb-rfp rb-reveal">
                <div>
                  <div className="rb-rft">Without the Build</div>
                  <div className="rb-rfh">A folder of posts you&rsquo;ll abandon in a month.</div>
                  <div className="rb-rfb">Templates. Calendars. A tab that stays open and a doc that goes stale.</div>
                </div>
                <svg className="rb-rfsvg" viewBox="0 0 240 88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <g opacity=".55">
                    <rect x="10" y="20" width="40" height="24" rx="3" fill="#D9D4C5"/>
                    <rect x="58" y="38" width="36" height="22" rx="3" fill="#D9D4C5"/>
                    <rect x="100" y="14" width="44" height="22" rx="3" fill="#D9D4C5"/>
                    <rect x="152" y="44" width="40" height="22" rx="3" fill="#D9D4C5"/>
                    <rect x="198" y="22" width="36" height="22" rx="3" fill="#D9D4C5"/>
                  </g>
                  <line x1="0" y1="78" x2="240" y2="78" stroke="#6A6A60" strokeOpacity=".4" strokeDasharray="2 4"/>
                </svg>
              </div>

              <div className="rb-rfarrow rb-reveal" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6"/>
                </svg>
              </div>

              <div className="rb-rfp after rb-reveal">
                <div>
                  <div className="rb-rft">With the Build</div>
                  <div className="rb-rfh">An engine that compounds every time you talk to a client.</div>
                  <div className="rb-rfb">Voice captured. Signal flowing in. The one asset worth more next quarter than it is today.</div>
                </div>
                <svg className="rb-rfsvg" viewBox="0 0 240 88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <g stroke="#1F9B47" strokeWidth="1.4" fill="none">
                    <path d="M10,60 Q40,50 60,40 T120,30 T210,20"/>
                    <path d="M10,68 Q40,62 70,56 T140,46 T220,36"/>
                  </g>
                  <g fill="#1F9B47">
                    <circle cx="10" cy="60" r="4"/>
                    <circle cx="60" cy="40" r="4"/>
                    <circle cx="120" cy="30" r="4"/>
                    <circle cx="170" cy="24" r="4"/>
                    <circle cx="220" cy="36" r="4"/>
                  </g>
                  <line x1="0" y1="80" x2="240" y2="80" stroke="#1F9B47" strokeOpacity=".5" strokeDasharray="2 4"/>
                </svg>
              </div>
            </div>
          </section>

          {/* FIVE CALLS */}
          <section className="rb-section" id="what-we-do">
            <div style={{ maxWidth: 920, margin: "0 auto", textAlign: "center" }}>
              <div className="rb-label rb-reveal">The Five Calls</div>
              <h2 className="rb-h2 rb-reveal" style={{ marginLeft: "auto", marginRight: "auto" }}>
                What we actually do, <em>in order.</em>
              </h2>
              <p className="rb-body rb-reveal" style={{ marginLeft: "auto", marginRight: "auto", textAlign: "center", color: "var(--muted)" }}>
                Five hours over thirty days. Each call has one job. They stack.
              </p>
            </div>

            <div className="rb-calls">
              <CallRow n="01" name={<><em>Voice.</em></>} body={`We find the way you actually talk. Not your ‘brand voice.’ Your kitchen-table voice. The one your wife hears. The one a friend would recognize before reading the byline.`} meta="60 min · Zoom · recorded" icon={<IconVoice />} />
              <CallRow n="02" name={<><em>Signal.</em></>} body="We mine what your clients already say about the work. Their words, not your guesses. The phrases they used when something landed. The way they describe the before, the during, the after." meta="60 min · transcripts in advance" icon={<IconSignal />} />
              <CallRow n="03" name={<>The <em>engine.</em></>} body="We wire it into your platform so every future conversation feeds it. The voice rules, the pillar logic, the audience deltas. By the end of call three you have a thing that writes in your voice on demand, not a thing that pretends." meta="60 min · live in the app" icon={<IconEngine />} />
              <CallRow n="04" name={<>The <em>first runs.</em></>} body="We watch the engine write in your voice and correct it together, out loud. You see what gets caught, what gets missed, what your face does when you read your own words back. That correction loop is what makes the engine yours." meta="60 min · live, side-by-side" icon={<IconRuns />} />
              <CallRow n="05" name={<>The <em>handoff.</em></>} body="You leave AI-native, holding an engine that compounds instead of a folder that rots. Every client call after this one makes it sharper. That is the asset. You walk in carrying it." meta="60 min · recorded · followups for 30 days" icon={<IconHandoff />} />
            </div>
          </section>

          {/* OUTCOMES */}
          <section className="rb-outcomes">
            <div className="rb-outcomes-inner">
              <div className="rb-outcomes-head">
                <div>
                  <div className="rb-label rb-reveal">What You Leave With</div>
                  <h2 className="rb-h2 rb-reveal" style={{ marginBottom: 0 }}>
                    Three things <em>that compound.</em>
                  </h2>
                </div>
                <p className="rb-reveal">
                  The deliverable is small. The asset is the thing the deliverable becomes after thirty days of you actually doing the work.
                </p>
              </div>

              <div className="rb-outcomes-grid">
                <Outcome icon={<IconSpiral />} title="An engine that compounds." body="It does not reset. It does not forget. It is worth more next quarter than it is today, because every client conversation feeds it." />
                <Outcome delay={1} icon={<IconVoiceprint />} title="Your real voice, captured." body={`Not your ‘brand voice.’ The way you actually talk. Captured in language the engine can produce on demand, without making you sound like a stranger.`} />
                <Outcome delay={2} icon={<IconSignature />} title="A brand only you could own." body="Two coaches with the same playbook could rebuild your content in 90 days. They could not rebuild this. The voice underneath was never the part you could template." />
              </div>
            </div>
          </section>

          {/* DISQUALIFIER */}
          <section className="rb-section">
            <div style={{ maxWidth: 920, margin: "0 auto", textAlign: "center" }}>
              <div className="rb-label rb-reveal">Who This Is For</div>
              <h2 className="rb-h2 rb-reveal" style={{ marginLeft: "auto", marginRight: "auto" }}>
                This isn&rsquo;t for <em>everyone.</em>
              </h2>
              <p className="rb-body rb-reveal" style={{ marginLeft: "auto", marginRight: "auto", textAlign: "center", color: "var(--muted)", maxWidth: 620 }}>
                The honest version, so we don&rsquo;t waste a first call.
              </p>
            </div>

            <div className="rb-dq">
              <div className="rb-dqp no rb-reveal">
                <div className="tag"><span className="mk">&times;</span> Not the right fit</div>
                <h3>Skip the call if</h3>
                <ul>
                  <li><span className="dot"></span>You want a folder of posts and a logout button.</li>
                  <li><span className="dot"></span>You&rsquo;ve never sat across from a client and felt the work land in the room.</li>
                  <li><span className="dot"></span>You&rsquo;re still hunting for your first idea or offer.</li>
                  <li><span className="dot"></span>You want someone to learn the craft for you instead of with you.</li>
                </ul>
              </div>

              <div className="rb-dqp yes rb-reveal rb-d1">
                <div className="tag"><span className="mk">&#10003;</span> Right fit</div>
                <h3>Book the call if</h3>
                <ul>
                  <li><span className="dot"></span>You already have an audience and a real offer, and the hours are the bottleneck.</li>
                  <li><span className="dot"></span>You can tell when a sentence sounds like you and when it doesn&rsquo;t.</li>
                  <li><span className="dot"></span>You want one engine you sharpen for years, not a campaign you redo each quarter.</li>
                  <li><span className="dot"></span>You&rsquo;re willing to be on five calls and tell the truth on each one.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* SCARCITY */}
          <section className="rb-scarcity">
            <div className="quote rb-reveal">
              I&rsquo;m on every one of these calls myself. When the month is full, it&rsquo;s full. No countdown on this page. Just one man, and only so many hours.
            </div>
            <div className="by rb-reveal">&mdash; Sunny</div>
          </section>

          {/* CLOSE */}
          <section className="rb-close">
            <div className="rb-close-inner">
              <div>
                <div className="rb-label rb-reveal">The Close</div>
                <h2 className="rb-h2 rb-reveal">
                  Thirty days. Five calls with me. <em>You leave with the engine.</em>
                </h2>
                <p className="rb-body rb-reveal">
                  Book a thirty-minute Zoom and we&rsquo;ll look at what you have together. If the Build is the right move, we&rsquo;ll schedule call one on the same call. If it&rsquo;s not, you leave with the clearest read of your brand you&rsquo;ve had in a year. Either way, you don&rsquo;t lose.
                </p>
                <div className="rb-ctas rb-reveal">
                  <a href={CAL_URL} className="rb-cta primary">
                    Book the first call
                    <ArrowRight />
                  </a>
                  <a href="mailto:sunny.binjola@gmail.com" className="rb-cta ghost">Email me first</a>
                </div>
                <div className="fineprint rb-reveal">30 minutes &middot; No pitch unless you ask for one</div>
              </div>

              <div className="rb-price rb-reveal rb-d1">
                <div className="pcl">The Resonance Build</div>
                <div className="pca"><sup>$</sup>2,000</div>
                <div className="pcs">One time &middot; thirty days &middot; small batch</div>
                <ul>
                  <li>Five one-hour calls with Sunny, on Zoom</li>
                  <li>Your voice captured into a working engine</li>
                  <li>Engine wired into your coach platform</li>
                  <li>Recorded sessions &middot; thirty days of followups</li>
                  <li>Small monthly cohort &middot; capacity-capped</li>
                </ul>
                <a href={CAL_URL} className="rb-cta primary">
                  Book the first call
                  <ArrowRight />
                </a>
              </div>
            </div>
          </section>

          {/* SIGN-OFF */}
          <section className="rb-signoff">
            <div className="rb-portrait" aria-hidden="true">
              <span className="initial">S</span>
            </div>
            <div>
              <div className="open rb-reveal">
                Written, sat with, and run by one man.<br/>
                Built for one man at a time.
              </div>
              <div className="nm rb-reveal">Sunny Binjola</div>
              <div className="role rb-reveal">Founder &middot; ElevateAI Systems &middot; Men&rsquo;s Embodiment Coach</div>
            </div>
          </section>

        </main>

        <footer className="rb-footer">
          <div className="inner">
            <div className="brand">
              <Leaf size={28} />
              <span className="nm">ElevateAI Systems</span>
            </div>
            <nav className="nav">
              <a href="/">Home</a>
              <a href="/brand-os">Brand OS</a>
              <a href="/refer">Refer</a>
              <a href="https://elevateaisystem.com/about">About</a>
            </nav>
            <div className="email">
              &copy; ElevateAI &middot;{" "}
              <a href="mailto:sunny.binjola@gmail.com">sunny.binjola@gmail.com</a>
            </div>
          </div>
        </footer>

      </div>

      <Script id="rb-reveal" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
    </>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────

function Leaf({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 88 88" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/>
      <path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/>
      <path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" strokeWidth="5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg className="arrow" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8h13M8 2l6 6-6 6"/>
    </svg>
  );
}

function CallRow({ n, name, body, meta, icon }: { n: string; name: React.ReactNode; body: string; meta: string; icon: React.ReactNode }) {
  return (
    <div className="rb-call rb-reveal">
      <div className="idx">
        <div className="icon">{icon}</div>
        <div className="n">CALL {n}</div>
      </div>
      <div className="cb">
        <div className="nm">{name}</div>
        <div className="b">{body}</div>
        <div className="cmeta">{meta}</div>
      </div>
    </div>
  );
}

function Outcome({ icon, title, body, delay }: { icon: React.ReactNode; title: string; body: string; delay?: number }) {
  return (
    <div className={`rb-outcome rb-reveal${delay ? ` rb-d${delay}` : ""}`}>
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function HeroArt() {
  return (
    <svg viewBox="0 0 520 520" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="haloG" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0B6E23" stopOpacity=".18"/>
          <stop offset="55%" stopColor="#0B6E23" stopOpacity=".04"/>
          <stop offset="100%" stopColor="#0B6E23" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="leafG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1F9B47"/>
          <stop offset="100%" stopColor="#0B6E23"/>
        </linearGradient>
      </defs>
      <circle cx="260" cy="260" r="240" fill="url(#haloG)"/>
      <g className="ring">
        <circle cx="260" cy="260" r="220" fill="none" stroke="#D9D4C5" strokeWidth="1" strokeDasharray="2 8"/>
      </g>
      <g className="float">
        <circle cx="260" cy="260" r="175" fill="none" stroke="#0B6E2330" strokeWidth="1"/>
        <circle cx="260" cy="260" r="175" fill="none" stroke="#0B6E23" strokeWidth="2" strokeDasharray="6 280" strokeDashoffset="-40"/>
        <circle cx="260" cy="260" r="175" fill="none" stroke="#0B6E23" strokeWidth="2" strokeDasharray="6 280" strokeDashoffset="-200"/>
      </g>
      <g stroke="#9A9A8E" strokeWidth="1" strokeLinecap="round">
        <line x1="260" y1="70" x2="260" y2="80"/>
        <line x1="260" y1="440" x2="260" y2="450"/>
        <line x1="70" y1="260" x2="80" y2="260"/>
        <line x1="440" y1="260" x2="450" y2="260"/>
      </g>
      <g className="float">
        <g transform="translate(260, 90)">
          <circle r="22" fill="#FAF8F3" stroke="#0B6E23" strokeWidth="1.5"/>
          <circle r="6" fill="#0B6E23"/>
          <text x="32" y="6" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#0B6E23" letterSpacing="2">01</text>
        </g>
        <g transform="translate(421, 175)">
          <circle r="18" fill="#FAF8F3" stroke="#1F9B47" strokeWidth="1.5"/>
          <circle r="5" fill="#1F9B47"/>
          <text x="26" y="5" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1F9B47" letterSpacing="2">02</text>
        </g>
        <g transform="translate(421, 345)">
          <circle r="18" fill="#FAF8F3" stroke="#0B6E23" strokeWidth="1.5"/>
          <circle r="5" fill="#0B6E23"/>
          <text x="26" y="5" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#0B6E23" letterSpacing="2">03</text>
        </g>
        <g transform="translate(99, 345)">
          <circle r="18" fill="#FAF8F3" stroke="#1F9B47" strokeWidth="1.5"/>
          <circle r="5" fill="#1F9B47"/>
          <text x="-44" y="5" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1F9B47" letterSpacing="2">04</text>
        </g>
        <g transform="translate(99, 175)">
          <circle r="18" fill="#FAF8F3" stroke="#0B6E23" strokeWidth="1.5"/>
          <circle r="5" fill="#0B6E23"/>
          <text x="-44" y="5" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#0B6E23" letterSpacing="2">05</text>
        </g>
      </g>
      <g stroke="#0B6E2350" strokeWidth="1" fill="none">
        <path className="pulse-line" d="M260,112 Q280,180 260,200"/>
        <path className="pulse-line" d="M403,180 Q330,210 280,220"/>
        <path className="pulse-line" d="M403,340 Q330,300 280,290"/>
        <path className="pulse-line" d="M117,340 Q190,300 240,290"/>
        <path className="pulse-line" d="M117,180 Q190,210 240,220"/>
      </g>
      <g transform="translate(260, 260)">
        <circle r="62" fill="#FAF8F3" stroke="#0B6E23" strokeWidth="1"/>
        <circle r="62" fill="url(#haloG)"/>
        <g transform="translate(-26, -26)">
          <rect x="0" y="0" width="52" height="52" rx="13" fill="url(#leafG)"/>
          <path d="M16 38C15.3 30.8 17.2 25.1 22.4 21.6C26.3 19 31 19.2 35.8 15.7C37.8 24.9 35.3 32.8 28.7 36.4C24.5 38.7 20.2 38.5 17.3 37.3L16 38Z" fill="#FAF8F3"/>
          <path d="M15 39.7C17.7 33.9 22.1 29.6 28.2 26.5" stroke="#FAF8F3" strokeWidth="3" strokeLinecap="round" fill="none"/>
        </g>
        <text x="0" y="46" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2.5" fill="#0B6E23" fontWeight="500">VOICE CORE</text>
      </g>
    </svg>
  );
}

function ProblemArt() {
  return (
    <svg viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <marker id="arr-rb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#6A6A60"/>
        </marker>
      </defs>
      <g fontFamily="JetBrains Mono, monospace" fontSize="11" letterSpacing="2" fill="#0A0F1C">
        <g transform="translate(180, 60)">
          <circle r="36" fill="#F2EEDF" stroke="#D9D4C5"/>
          <text textAnchor="middle" y="5">POST</text>
        </g>
        <g transform="translate(300, 180)">
          <circle r="36" fill="#F2EEDF" stroke="#D9D4C5"/>
          <text textAnchor="middle" y="5">GHOST</text>
        </g>
        <g transform="translate(180, 300)">
          <circle r="36" fill="#F2EEDF" stroke="#D9D4C5"/>
          <text textAnchor="middle" y="5">DOUBT</text>
        </g>
        <g transform="translate(60, 180)">
          <circle r="36" fill="#F2EEDF" stroke="#D9D4C5"/>
          <text textAnchor="middle" y="5">REPEAT</text>
        </g>
      </g>
      <g fill="none" stroke="#6A6A60" strokeWidth="1.5" markerEnd="url(#arr-rb)">
        <path className="rb-loop-arrow" d="M222,80 Q280,100 290,150"/>
        <path className="rb-loop-arrow" d="M295,220 Q280,270 222,288"/>
        <path className="rb-loop-arrow" d="M138,290 Q80,270 70,222"/>
        <path className="rb-loop-arrow" d="M68,148 Q80,90 138,75"/>
      </g>
      <circle cx="180" cy="180" r="60" fill="none" stroke="#B23A2E" strokeOpacity=".4" strokeWidth="1" strokeDasharray="4 6"/>
      <text x="180" y="178" textAnchor="middle" fontFamily="Fraunces, serif" fontStyle="italic" fontSize="14" fill="#B23A2E" letterSpacing=".02em">the loop</text>
      <text x="180" y="195" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2" fill="#B23A2E">YOU LIVE IN</text>
    </svg>
  );
}

function IconVoice() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 16 L6 16 L8 10 L10 22 L12 12 L14 20 L16 14"/>
      <path d="M18 16 C20 12, 24 12, 26 16 C28 20, 26 24, 22 24 C20 24, 18 22, 18 20"/>
      <path d="M22 24 C24 22, 26 20, 26 16" strokeOpacity=".55"/>
    </svg>
  );
}
function IconSignal() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="16" cy="16" r="3" fill="currentColor"/>
      <circle cx="16" cy="16" r="7"/>
      <circle cx="16" cy="16" r="11" strokeOpacity=".6"/>
      <path d="M16 5 L18 8" strokeOpacity=".5"/>
      <path d="M27 16 L24 18" strokeOpacity=".5"/>
      <path d="M16 27 L14 24" strokeOpacity=".5"/>
      <path d="M5 16 L8 14" strokeOpacity=".5"/>
    </svg>
  );
}
function IconEngine() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="13" cy="13" r="5"/>
      <path d="M13 7 L13 5 M13 21 L13 19 M7 13 L5 13 M21 13 L19 13 M9 9 L7.5 7.5 M18.5 7.5 L17 9 M9 17 L7.5 18.5 M17 17 L18.5 18.5"/>
      <circle cx="22" cy="22" r="4"/>
      <path d="M22 16 L22 17 M22 27 L22 28 M16 22 L17 22 M27 22 L28 22"/>
    </svg>
  );
}
function IconRuns() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 11 L20 11 L17 8 M20 11 L17 14"/>
      <path d="M26 21 L12 21 L15 18 M12 21 L15 24"/>
      <circle cx="6" cy="11" r="1.5" fill="currentColor"/>
      <circle cx="26" cy="21" r="1.5" fill="currentColor"/>
    </svg>
  );
}
function IconHandoff() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22 C6 18, 9 16, 12 16 L20 16 C24 16, 28 18, 28 21"/>
      <path d="M16 16 C16 12, 18 9, 21 8 C20 11, 19 14, 16 16Z" fill="currentColor"/>
      <path d="M21 8 L22 5" strokeOpacity=".6"/>
    </svg>
  );
}
function IconSpiral() {
  return (
    <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M15 15 C15 11, 19 9, 22 11 C25 13, 25 18, 22 20 C18 22, 12 22, 9 19 C6 16, 6 9, 11 6 C16 3, 24 5, 27 11"/>
      <circle cx="15" cy="15" r="1.5" fill="currentColor"/>
    </svg>
  );
}
function IconVoiceprint() {
  return (
    <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="6" y1="15" x2="8" y2="15"/>
      <line x1="10" y1="11" x2="10" y2="19"/>
      <line x1="13" y1="7" x2="13" y2="23"/>
      <line x1="16" y1="10" x2="16" y2="20"/>
      <line x1="19" y1="6" x2="19" y2="24"/>
      <line x1="22" y1="12" x2="22" y2="18"/>
      <line x1="25" y1="15" x2="27" y2="15"/>
    </svg>
  );
}
function IconSignature() {
  return (
    <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 22 C7 18, 9 16, 11 17 C13 18, 13 22, 15 22 C17 22, 17 14, 19 14 C21 14, 21 22, 23 21 C25 20, 25 17, 26 17"/>
      <line x1="5" y1="26" x2="25" y2="26" strokeOpacity=".4"/>
    </svg>
  );
}
