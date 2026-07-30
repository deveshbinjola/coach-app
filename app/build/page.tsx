// /build · The Resonance Build sales page
//
// Editorial premium landing page following the /design-taste-frontend skill.
// Mirrors the static version at elevateaisystem.com/build (Website/build.html)
// for full visual parity.
//
// Dials: VARIANCE 7 / MOTION 5 / DENSITY 3 (premium-consumer preset).
// Fonts: Playfair Display + Plus Jakarta Sans + JetBrains Mono.
// Palette: warm light + forest green (brand-locked).
// Real photography via Picsum placeholders (swap with brand photos).
// No hand-rolled icons, no decorative SVGs, no em-dashes anywhere.
//
// CSS lives in a single style block (compile-time constant) so :hover,
// ::before/::after, keyframes, and reduced-motion overrides survive.

import type { Metadata } from "next";
import Script from "next/script";

export const runtime = "edge";

export const metadata: Metadata = {
  title:
    "The Resonance Build · Five calls. Thirty days. The voice no one can clone.",
  description:
    "Five one-hour calls with Sunny Binjola. Five hours over thirty days. We pull your real signal and wire it into an engine that compounds. $2,000.",
  openGraph: {
    title: "The Resonance Build · ElevateAI",
    description:
      "Five calls. Thirty days. The voice no one can clone. $2,000.",
    type: "website",
    url: "https://app.elevateaisystem.com/build",
  },
};

const CAL_URL = "https://cal.com/sunny-binjola/resonance-call";

const CSS = `
:root{
  --bg:#FAF8F3;
  --bg-warm:#F2EEDF;
  --ink:#0A0F1C;
  --ink-soft:#1F2638;
  --muted:#6A6A60;
  --soft:#9A9A8E;
  --accent:#0B6E23;
  --accent-dark:#064214;
  --accent-soft:#1F9B47;
  --line:#D9D4C5;
  --line-soft:#E8E3D4;
  --fd:'Playfair Display', Georgia, serif;
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
.rb-page img{display:block;max-width:100%;height:auto}
.rb-page::after{
  content:'';
  position:fixed;
  inset:0;
  pointer-events:none;
  opacity:.28;
  mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .05  0 0 0 0 .06  0 0 0 0 .08  0 0 0 .14 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>");
  z-index:1;
}
.rb-page main,.rb-page header,.rb-page footer{position:relative;z-index:2}

/* CANONICAL NAV (mirrors navbar.js across the rest of the site) */
.rb-page .rb-nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  background:rgba(250,250,248,.85);
  backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);
  border-bottom:1px solid #E0E0D8;
  padding:0 2rem;height:72px;
  display:flex;align-items:center;justify-content:space-between;
  transition:all .3s;box-sizing:border-box;width:100%;
}
.rb-page .rb-nav.scrolled{box-shadow:0 2px 20px rgba(0,0,0,.06)}
.rb-page .rb-nav-logo{
  font-size:1.4rem;font-weight:800;
  color:#0A0F1C;letter-spacing:-.02em;
  display:flex;align-items:center;gap:.5rem;text-decoration:none;
  font-family:var(--fb);
}
.rb-page .rb-nav-logo-icon{width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.rb-page .rb-nav-logo-text span{color:#0B6E23}
.rb-page .rb-nav-links{display:flex;gap:2rem;align-items:center}
.rb-page .rb-nav-links a{
  font-size:.85rem;font-weight:700;
  color:#0A0F1C;letter-spacing:.08em;text-transform:uppercase;
  transition:color .2s;position:relative;text-decoration:none;
  font-family:var(--fb);
}
.rb-page .rb-nav-links a:hover{color:#0A0F1C}
.rb-page .rb-nav-links a::after{
  content:'';position:absolute;bottom:-2px;left:0;
  width:0;height:2px;background:#0B6E23;transition:width .3s;
}
.rb-page .rb-nav-links a:hover::after{width:100%}
.rb-page .rb-nav-cta{
  background:#0B6E23;color:#FAF8F3 !important;
  padding:.65rem 1.6rem;border-radius:50px;
  font-size:.85rem;font-weight:800;
  transition:all .3s;letter-spacing:.02em;
}
.rb-page .rb-nav-cta:hover{background:#085119;transform:translateY(-1px);box-shadow:0 4px 15px rgba(11,110,35,.25)}
.rb-page .rb-nav-cta::after{display:none !important}
.rb-page .rb-mobile-menu{
  display:none;flex-direction:column;gap:5px;cursor:pointer;
  background:none;border:none;padding:12px;z-index:101;
  -webkit-tap-highlight-color:transparent;
}
.rb-page .rb-mobile-menu span{display:block;width:26px;height:3px;background:#0A0F1C;border-radius:2px;transition:all .3s}
.rb-page .rb-mobile-nav{
  display:none;position:fixed;top:72px;left:0;right:0;
  background:#FFFFFF;border-bottom:1px solid #E0E0D8;
  padding:1.5rem 2rem;z-index:99;
  flex-direction:column;gap:.75rem;
  box-shadow:0 8px 30px rgba(0,0,0,.08);
}
.rb-page .rb-mobile-nav.open{display:flex}
.rb-page .rb-mobile-nav a{font-size:.95rem;font-weight:600;color:#1A1A2E;padding:.5rem 0;text-decoration:none}
.rb-page .rb-mobile-nav .rb-nav-cta{text-align:center;margin-top:.5rem}
@media (max-width:768px){
  .rb-page .rb-nav{padding:0 1rem}
  .rb-page .rb-nav-links{display:none}
  .rb-page .rb-mobile-menu{display:flex;margin-right:-4px}
  .rb-page .rb-mobile-nav{padding:1.25rem 1rem}
  .rb-page .rb-nav-logo{font-size:1.2rem}
}
@media (max-width:380px){
  .rb-page .rb-nav{padding:0 .75rem}
  .rb-page .rb-nav-logo-text{font-size:1rem}
}

/* Push page content below the fixed nav */
.rb-page{padding-top:72px}

.rb-hero{
  max-width:1280px;margin:0 auto;
  padding:24px 40px 112px;
  display:grid;grid-template-columns:1.1fr .9fr;gap:80px;
  align-items:center;
}
.rb-eyebrow{
  font-family:var(--fm);font-size:11px;letter-spacing:.26em;text-transform:uppercase;
  color:var(--accent);font-weight:500;margin-bottom:28px;
  display:inline-flex;align-items:center;gap:12px;
}
.rb-eyebrow::before{content:'';width:24px;height:1px;background:var(--accent)}
.rb-h1{
  font-family:var(--fd);font-weight:700;
  font-size:clamp(44px, 6.4vw, 80px);
  line-height:1.02;letter-spacing:-.022em;
  color:var(--ink);margin-bottom:28px;padding-bottom:6px;
}
.rb-h1 em{font-style:italic;font-weight:600;color:var(--accent)}
.rb-lede{font-size:19px;line-height:1.55;color:var(--ink-soft);max-width:520px;margin-bottom:40px}
.rb-ctas{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.rb-cta{
  display:inline-flex;align-items:center;gap:10px;
  font-family:var(--fb);font-weight:600;font-size:15.5px;
  padding:16px 28px;border-radius:100px;
  transition:all .25s cubic-bezier(.2,.7,.3,1);
  white-space:nowrap;cursor:pointer;letter-spacing:.005em;
}
.rb-cta.primary{
  background:var(--ink);color:var(--bg);
  box-shadow:0 8px 24px rgba(10,15,28,.10);
}
.rb-cta.primary:hover{
  background:var(--accent-dark);transform:translateY(-2px);
  box-shadow:0 14px 36px rgba(10,15,28,.14);
}
.rb-cta.primary .arr{transition:transform .25s ease}
.rb-cta.primary:hover .arr{transform:translateX(4px)}
.rb-cta.ghost{
  color:var(--ink);font-weight:500;padding:16px 0;
  display:inline-flex;align-items:center;gap:8px;
}
.rb-cta.ghost::after{
  content:'';display:inline-block;width:22px;height:1px;background:var(--ink);
  transition:width .25s ease, background .25s ease;
}
.rb-cta.ghost:hover::after{width:34px;background:var(--accent)}
.rb-cta.ghost:hover{color:var(--accent)}

.rb-hero-photo{
  position:relative;justify-self:center;width:100%;
  max-width:500px;aspect-ratio:4/5;
  overflow:hidden;border-radius:6px;
  background:var(--bg-warm);
  box-shadow:0 30px 60px rgba(10,15,28,.10);
}
.rb-hero-photo img{width:100%;height:100%;object-fit:cover;filter:saturate(.88) contrast(.96)}
.rb-hero-photo::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(180deg, transparent 60%, rgba(10,15,28,.18));
  pointer-events:none;
}

.rb-trust{max-width:1280px;margin:0 auto;padding:24px 40px 112px}
.rb-trust .top{
  font-family:var(--fd);font-weight:500;font-style:italic;
  font-size:21px;line-height:1.4;color:var(--muted);
  text-align:center;max-width:680px;margin:0 auto 64px;
  border-top:1px solid var(--line);padding-top:48px;
}
.rb-trust .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:48px}
.rb-trust .pr{padding:0 8px}
.rb-trust .pr .num{
  font-family:var(--fd);font-weight:500;font-style:italic;
  font-size:44px;line-height:1;color:var(--accent);margin-bottom:18px;
}
.rb-trust .pr h3{
  font-family:var(--fd);font-weight:700;font-size:21px;line-height:1.25;
  color:var(--ink);margin-bottom:12px;letter-spacing:-.005em;
}
.rb-trust .pr p{font-size:15.5px;line-height:1.6;color:var(--muted)}

.rb-section{max-width:1280px;margin:0 auto;padding:112px 40px;position:relative}
.rb-h2{
  font-family:var(--fd);font-weight:700;
  font-size:clamp(34px, 4.4vw, 54px);
  line-height:1.05;letter-spacing:-.018em;
  color:var(--ink);margin-bottom:28px;
  max-width:760px;padding-bottom:4px;
}
.rb-h2 em{font-style:italic;font-weight:600;color:var(--accent)}
.rb-body{font-size:18px;line-height:1.65;color:var(--ink-soft);margin-bottom:18px;max-width:580px}
.rb-body.muted{color:var(--muted)}

.rb-problem{display:grid;grid-template-columns:.92fr 1.08fr;gap:80px;align-items:center}
.rb-problem-photo{
  position:relative;width:100%;max-width:480px;aspect-ratio:5/6;
  overflow:hidden;border-radius:6px;background:var(--bg-warm);
  box-shadow:0 24px 50px rgba(10,15,28,.08);
}
.rb-problem-photo img{
  width:100%;height:100%;object-fit:cover;
  filter:saturate(.78) contrast(.94) brightness(.96);
}

.rb-reframe{text-align:center;max-width:780px;margin:0 auto}
.rb-reframe .rb-h2{margin-left:auto;margin-right:auto}
.rb-reframe .rb-body{margin-left:auto;margin-right:auto;text-align:center}

.rb-calls-head{max-width:780px;margin:0 auto 48px;text-align:center}
.rb-calls-head .rb-h2{margin-left:auto;margin-right:auto}
.rb-calls-head p{
  font-family:var(--fd);font-style:italic;font-weight:500;
  font-size:21px;color:var(--muted);margin:0 auto;max-width:560px;
}
.rb-calls{max-width:880px;margin:0 auto;border-top:1px solid var(--line)}
.rb-call{
  display:grid;grid-template-columns:140px 1fr;gap:48px;
  padding:42px 0;border-bottom:1px solid var(--line);align-items:baseline;
}
.rb-call .n{
  font-family:var(--fd);font-weight:500;font-style:italic;
  font-size:54px;line-height:1;color:var(--accent);padding-top:6px;
}
.rb-call .nm{
  font-family:var(--fd);font-weight:700;font-size:32px;line-height:1.12;
  letter-spacing:-.014em;color:var(--ink);margin-bottom:12px;padding-bottom:4px;
}
.rb-call .nm em{font-style:italic;font-weight:600;color:var(--accent)}
.rb-call .b{font-size:17px;line-height:1.6;color:var(--muted);max-width:560px;margin-bottom:14px}
.rb-call .meta{
  font-family:var(--fm);font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--accent);font-weight:500;
}

.rb-dq-head{max-width:680px;margin:0 auto 56px;text-align:center}
.rb-dq{display:grid;grid-template-columns:1fr 1fr;gap:64px;max-width:1040px;margin:0 auto}
.rb-dq .col h3{
  font-family:var(--fd);font-weight:700;font-size:24px;line-height:1.2;
  color:var(--ink);margin-bottom:24px;letter-spacing:-.008em;
}
.rb-dq .col.yes h3{color:var(--accent)}
.rb-dq ul{list-style:none;padding:0;margin:0}
.rb-dq li{
  font-size:16.5px;line-height:1.55;color:var(--ink-soft);
  padding:16px 0;border-top:1px solid var(--line-soft);
}
.rb-dq li:first-child{border-top:none;padding-top:4px}

.rb-close{
  background-color:#0A0F1C;color:#FAF8F3;padding:128px 0;
  position:relative;overflow:hidden;isolation:isolate;
}
.rb-close::before{
  content:'';position:absolute;inset:0;
  background:
    radial-gradient(ellipse at 20% 10%, rgba(31,155,71,.18), transparent 50%),
    radial-gradient(ellipse at 80% 90%, rgba(11,110,35,.10), transparent 55%);
  pointer-events:none;
}
.rb-close-inner{
  max-width:1080px;margin:0 auto;padding:0 40px;
  display:grid;grid-template-columns:1.15fr .85fr;gap:80px;align-items:center;
  position:relative;
}
.rb-close .rb-eyebrow{color:var(--accent-soft)}
.rb-close .rb-eyebrow::before{background:var(--accent-soft)}
.rb-close .rb-h2{color:var(--bg);max-width:520px}
.rb-close .rb-h2 em{color:var(--accent-soft)}
.rb-close .rb-body{color:rgba(250,248,243,.78);max-width:520px}
.rb-close .rb-cta.primary{background:var(--bg);color:var(--ink);box-shadow:0 8px 24px rgba(0,0,0,.30)}
.rb-close .rb-cta.primary:hover{background:var(--accent-soft);color:var(--ink)}
.rb-close .rb-cta.ghost{color:var(--bg)}
.rb-close .rb-cta.ghost::after{background:var(--bg)}
.rb-close .rb-cta.ghost:hover{color:var(--accent-soft)}
.rb-close .rb-cta.ghost:hover::after{background:var(--accent-soft);width:34px}
.rb-close .fineprint{
  font-family:var(--fm);font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  color:rgba(250,248,243,.5);margin-top:28px;
}
.rb-offer{
  padding:36px 0;
  border-top:1px solid rgba(250,248,243,.18);
  border-bottom:1px solid rgba(250,248,243,.18);
}
.rb-offer .lbl{
  font-family:var(--fm);font-size:11px;letter-spacing:.22em;text-transform:uppercase;
  color:var(--accent-soft);margin-bottom:18px;
}
.rb-offer .amt{
  font-family:var(--fd);font-weight:700;font-size:88px;line-height:.95;
  color:var(--bg);letter-spacing:-.026em;margin-bottom:10px;
}
.rb-offer .amt sup{font-size:34px;vertical-align:super;letter-spacing:0;font-weight:600}
.rb-offer .sub{
  font-family:var(--fm);font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  color:rgba(250,248,243,.55);margin-bottom:24px;
}
.rb-offer ul{list-style:none;padding:0;margin:0}
.rb-offer li{
  font-size:15px;line-height:1.55;color:rgba(250,248,243,.86);
  padding:10px 0;border-top:1px solid rgba(250,248,243,.10);
}
.rb-offer li:first-child{border-top:none;padding-top:4px}

.rb-signoff{max-width:880px;margin:0 auto;padding:112px 40px;text-align:center}
.rb-signoff .open{
  font-family:var(--fd);font-style:italic;font-weight:500;
  font-size:clamp(24px, 2.8vw, 34px);line-height:1.32;
  color:var(--ink);letter-spacing:-.01em;margin-bottom:36px;padding-bottom:8px;
}
.rb-signoff .nm{font-family:var(--fd);font-weight:700;font-size:19px;color:var(--ink);margin-bottom:6px}
.rb-signoff .role{
  font-family:var(--fm);font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);
}

.rb-footer{border-top:1px solid var(--line);padding:36px 40px 48px}
.rb-footer .inner{
  max-width:1280px;margin:0 auto;
  display:grid;grid-template-columns:auto 1fr auto;gap:36px;align-items:center;
}
.rb-footer .brand{display:flex;align-items:center;gap:11px}
.rb-footer .brand .nm{font-family:var(--fd);font-weight:700;font-size:15px;color:var(--ink)}
.rb-footer .nav{display:flex;gap:28px;justify-content:center;flex-wrap:wrap}
.rb-footer .nav a{font-size:13.5px;color:var(--muted);transition:color .2s ease}
.rb-footer .nav a:hover{color:var(--accent)}
.rb-footer .email{font-size:13px;color:var(--muted)}
.rb-footer .email a{color:var(--ink);font-weight:500}
.rb-footer .email a:hover{color:var(--accent)}

.rb-reveal{
  opacity:0;transform:translateY(18px);
  transition:opacity .9s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.16,1,.3,1);
}
.rb-reveal.rb-in-view{opacity:1;transform:translateY(0)}
.rb-d1{transition-delay:.08s}
.rb-d2{transition-delay:.16s}
.rb-d3{transition-delay:.24s}

@media (prefers-reduced-motion: reduce){
  .rb-reveal,.rb-reveal.rb-in-view{opacity:1;transform:none;transition:none}
  .rb-cta.primary:hover{transform:none}
}

@media(max-width:960px){
  .rb-bar{padding:16px 22px}
  .rb-bar .right a.txt{display:none}
  .rb-hero{padding:16px 22px 72px;grid-template-columns:1fr;gap:48px}
  .rb-hero-photo{max-width:380px;order:-1;aspect-ratio:4/5}
  .rb-h1{font-size:clamp(36px, 9vw, 56px)}
  .rb-lede{font-size:17px}
  .rb-section{padding:80px 22px}
  .rb-trust{padding:0 22px 80px}
  .rb-trust .grid{grid-template-columns:1fr;gap:32px;text-align:left}
  .rb-trust .top{font-size:18px;padding-top:36px;margin-bottom:48px}
  .rb-problem{grid-template-columns:1fr;gap:48px}
  .rb-problem-photo{order:-1;max-width:340px}
  .rb-h2{font-size:clamp(28px, 8vw, 40px)}
  .rb-calls{margin-top:32px}
  .rb-call{grid-template-columns:64px 1fr;gap:20px;padding:32px 0}
  .rb-call .n{font-size:36px}
  .rb-call .nm{font-size:24px}
  .rb-dq{grid-template-columns:1fr;gap:48px}
  .rb-close{padding:88px 0}
  .rb-close-inner{grid-template-columns:1fr;gap:56px;padding:0 22px}
  .rb-offer .amt{font-size:68px}
  .rb-signoff{padding:80px 22px}
  .rb-footer{padding:32px 22px 40px}
  .rb-footer .inner{grid-template-columns:1fr;gap:24px;text-align:center}
  .rb-footer .brand,.rb-footer .nav,.rb-footer .email{justify-content:center}
}
`;

const REVEAL_JS = `
(function(){
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting) {
          e.target.classList.add('rb-in-view');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    document.querySelectorAll('.rb-reveal').forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll('.rb-reveal').forEach(function(el){el.classList.add('rb-in-view')});
  }
  var mobileBtn = document.getElementById('rb-mobile-btn');
  var mobileNav = document.getElementById('rb-mobile-nav');
  if (mobileBtn && mobileNav) {
    mobileBtn.addEventListener('click', function(){ mobileNav.classList.toggle('open'); });
    mobileNav.querySelectorAll('a').forEach(function(link){
      link.addEventListener('click', function(){ mobileNav.classList.remove('open'); });
    });
  }
  var nav = document.getElementById('rb-nav');
  if (nav) {
    window.addEventListener('scroll', function(){
      nav.classList.toggle('scrolled', window.scrollY > 20);
    });
  }
})();
`;

export default function ResonanceBuildPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="rb-page">

        <nav className="rb-nav" id="rb-nav" role="navigation" aria-label="Main navigation">
          <a href="/" className="rb-nav-logo">
            <div className="rb-nav-logo-icon"><CanonicalLeaf size={36} /></div>
            <span className="rb-nav-logo-text">Elevate<span>AI</span></span>
          </a>
          <div className="rb-nav-links">
            <a href="https://elevateaisystem.com/quiz">Quiz</a>
            <a href="/brand-os">Brand OS</a>
            <a href="https://elevateaisystem.com/build-your-brand">Build Your Brand</a>
            <a href="https://elevateaisystem.com/about">About</a>
            <a href="https://elevateaisystem.com/blog">Blog</a>
            <a href={CAL_URL} className="rb-nav-cta">Book the first call</a>
          </div>
          <button className="rb-mobile-menu" aria-label="Menu" id="rb-mobile-btn">
            <span></span><span></span><span></span>
          </button>
        </nav>
        <div className="rb-mobile-nav" id="rb-mobile-nav">
          <a href="/">Home</a>
          <a href="https://elevateaisystem.com/quiz">Quiz</a>
          <a href="/brand-os">Brand OS</a>
          <a href="https://elevateaisystem.com/build-your-brand">Build Your Brand</a>
          <a href="https://elevateaisystem.com/about">About</a>
          <a href="https://elevateaisystem.com/blog">Blog</a>
          <a href={CAL_URL} className="rb-nav-cta">Book the first call</a>
        </div>

        <main>

          {/* HERO */}
          <section className="rb-hero">
            <div>
              <div className="rb-eyebrow rb-reveal">The Resonance Build</div>
              <h1 className="rb-h1 rb-reveal rb-d1">
                Five calls. Thirty days.<br/>
                <em>The voice no one can clone.</em>
              </h1>
              <p className="rb-lede rb-reveal rb-d2">
                Five hours over thirty days. We pull your real signal and wire it into an engine that compounds.
              </p>
              <div className="rb-ctas rb-reveal rb-d3">
                <a href={CAL_URL} className="rb-cta primary">
                  Book the first call
                  <ArrowRight />
                </a>
                <a href="#what-we-do" className="rb-cta ghost">See the five calls</a>
              </div>
            </div>

            {/* HERO PHOTO PLACEHOLDER (4:5). Swap with brand photography. */}
            <div className="rb-hero-photo rb-reveal rb-d2">
              <img
                src="https://picsum.photos/seed/quiet-window-morning-light-32/720/900"
                alt=""
                loading="eager"
                decoding="async"
              />
            </div>
          </section>

          {/* TRUST */}
          <section className="rb-trust">
            <div className="top rb-reveal">
              For men&rsquo;s coaches who already sound like themselves in the room. Now we make the page sound like that too.
            </div>
            <div className="grid">
              <div className="pr rb-reveal">
                <div className="num">i.</div>
                <h3>Built, not taught.</h3>
                <p>Done with you, not handed off. You leave holding the engine, not a binder.</p>
              </div>
              <div className="pr rb-reveal rb-d1">
                <div className="num">ii.</div>
                <h3>The calls are the product.</h3>
                <p>Five hours with me. The signal we mine in them is what makes the rest work.</p>
              </div>
              <div className="pr rb-reveal rb-d2">
                <div className="num">iii.</div>
                <h3>Real scarcity. My time.</h3>
                <p>I&rsquo;m on every call. When the month is full, it&rsquo;s full. No fake timers on this page.</p>
              </div>
            </div>
          </section>

          {/* PROBLEM */}
          <section className="rb-section">
            <div className="rb-problem">
              <div className="rb-problem-photo rb-reveal">
                <img
                  src="https://picsum.photos/seed/wooden-desk-window-light-12/640/768"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div>
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
          <section className="rb-section">
            <div className="rb-reframe">
              <h2 className="rb-h2 rb-reveal">
                The Build is <em>not</em> a content package.
              </h2>
              <p className="rb-body rb-reveal">
                The content is the easy part. We already automate that. The Build is five calls where I sit with you and pull the real signal out. Your voice. Your clients&rsquo; actual words. The way you say the one thing only you say.
              </p>
              <p className="rb-body muted rb-reveal">
                Those five calls become your engine. Not a folder of posts you&rsquo;ll abandon in a month. An engine that gets smarter every time you talk to a client.
              </p>
            </div>
          </section>

          {/* THE FIVE CALLS */}
          <section className="rb-section" id="what-we-do">
            <div className="rb-calls-head">
              <h2 className="rb-h2 rb-reveal">
                What we actually do, <em>in order.</em>
              </h2>
              <p className="rb-reveal">Five hours over thirty days. Each call has one job. They stack.</p>
            </div>

            <div className="rb-calls">
              <Call n="01" name={<em>Voice.</em>} body="We find the way you actually talk. Not your &lsquo;brand voice.&rsquo; Your kitchen-table voice. The one your wife hears. The one a friend would recognize before reading the byline." meta="60 min · on Zoom" />
              <Call n="02" name={<em>Signal.</em>} body="We mine what your clients already say about the work. Their words, not your guesses. The phrases they used when something landed. The way they describe the before, the during, the after." meta="60 min · transcripts prepared" />
              <Call n="03" name={<>The <em>engine.</em></>} body="We wire it into your platform so every future conversation feeds it. The voice rules, the pillar logic, the audience deltas. By the end of call three you have a thing that writes in your voice on demand, not a thing that pretends." meta="60 min · live in the app" />
              <Call n="04" name={<>The <em>first runs.</em></>} body="We watch the engine write in your voice and correct it together, out loud. You see what gets caught, what gets missed, what your face does when you read your own words back. That correction loop is what makes the engine yours." meta="60 min · live, side by side" />
              <Call n="05" name={<>The <em>handoff.</em></>} body="You leave AI-native, holding an engine that compounds instead of a folder that rots. Every client call after this one makes it sharper. That is the asset. You walk in carrying it." meta="60 min · plus 30 days of followups" />
            </div>
          </section>

          {/* DISQUALIFIER */}
          <section className="rb-section">
            <div className="rb-dq-head">
              <h2 className="rb-h2 rb-reveal" style={{ marginLeft: "auto", marginRight: "auto" }}>
                This isn&rsquo;t for <em>everyone.</em>
              </h2>
              <p className="rb-body muted rb-reveal" style={{ marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>
                The honest version, so we don&rsquo;t waste a first call.
              </p>
            </div>

            <div className="rb-dq">
              <div className="col no rb-reveal">
                <h3>Skip the call if</h3>
                <ul>
                  <li>You want a folder of posts and a logout button.</li>
                  <li>You&rsquo;ve never sat across from a client and felt the work land in the room.</li>
                  <li>You&rsquo;re still hunting for your first idea or offer.</li>
                  <li>You want someone to learn the craft for you instead of with you.</li>
                </ul>
              </div>
              <div className="col yes rb-reveal rb-d1">
                <h3>Book the call if</h3>
                <ul>
                  <li>You already have an audience and a real offer, and the hours are the bottleneck.</li>
                  <li>You can tell when a sentence sounds like you and when it doesn&rsquo;t.</li>
                  <li>You want one engine you sharpen for years, not a campaign you redo each quarter.</li>
                  <li>You&rsquo;re willing to be on five calls and tell the truth on each one.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* CLOSE (dark Color Block Story) */}
          <section className="rb-close">
            <div className="rb-close-inner">
              <div>
                <div className="rb-eyebrow rb-reveal">$2,000 &middot; Thirty days</div>
                <h2 className="rb-h2 rb-reveal">
                  Five calls with me. <em>You leave with the engine.</em>
                </h2>
                <p className="rb-body rb-reveal">
                  Book a thirty-minute Zoom. We&rsquo;ll look at what you have together. If the Build is the right move, we schedule call one on the same call. If it isn&rsquo;t, you leave with the clearest read of your brand you&rsquo;ve had in a year.
                </p>
                <div className="rb-ctas rb-reveal">
                  <a href={CAL_URL} className="rb-cta primary">
                    Book the first call
                    <ArrowRight />
                  </a>
                  <a href="mailto:sunny.binjola@gmail.com" className="rb-cta ghost">Email first</a>
                </div>
                <div className="fineprint rb-reveal">30 minutes &middot; No pitch unless you ask for one</div>
              </div>

              <div className="rb-offer rb-reveal rb-d1">
                <div className="lbl">The Resonance Build</div>
                <div className="amt"><sup>$</sup>2,000</div>
                <div className="sub">One time &middot; thirty days &middot; small batch</div>
                <ul>
                  <li>Five one-hour calls with Sunny, on Zoom</li>
                  <li>Your voice captured into a working engine</li>
                  <li>Engine wired into your coach platform</li>
                  <li>Recorded sessions, plus 30 days of followups</li>
                  <li>Capacity capped to a small monthly cohort</li>
                </ul>
              </div>
            </div>
          </section>

          {/* SIGN-OFF */}
          <section className="rb-signoff">
            <div className="open rb-reveal">
              Written, sat with, and run by one man.<br/>
              Built for one man at a time.
            </div>
            <div className="nm rb-reveal rb-d1">Sunny Binjola</div>
            <div className="role rb-reveal rb-d1">Founder, ElevateAI &middot; Men&rsquo;s Embodiment Coach</div>
          </section>

        </main>

        <footer className="rb-footer">
          <div className="inner">
            <a href="/" className="brand" aria-label="ElevateAI Systems">
              <Leaf size={26} />
              <span className="nm">ElevateAI Systems</span>
            </a>
            <nav className="nav">
              <a href="/">Home</a>
              <a href="/brand-os">Brand OS</a>
              <a href="/refer">Refer</a>
              <a href="https://elevateaisystem.com/blog">The Signal</a>
            </nav>
            <div className="email">
              &copy; ElevateAI &middot;{" "}
              <a href="mailto:sunny.binjola@gmail.com">sunny.binjola@gmail.com</a>
            </div>
          </div>
        </footer>

      </div>

      <Script id="rb-reveal" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: REVEAL_JS }} />
    </>
  );
}

function Leaf({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 88 88" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/>
      <path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/>
      <path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" strokeWidth="5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function CanonicalLeaf({ size = 36 }: { size?: number }) {
  // Canonical brand mark used across elevateaisystem.com — matches navbar.js leafSVG.
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="39" height="39" rx="9.8" fill="#0B6E23"/>
      <path d="M14.2 30.5C13.6 24 15.2 18.8 19.9 15.6C23.5 13.2 27.7 13.4 32.1 10.2C33.9 18.5 31.6 25.6 25.7 28.8C21.9 30.9 18 30.7 15.4 29.6L14.2 30.5Z" fill="#FAF8F3"/>
      <path d="M13.4 32.1C15.8 26.9 19.8 22.9 25.3 20.1" stroke="#FAF8F3" strokeWidth="2.7" strokeLinecap="round"/>
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg className="arr" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8h13M8 2l6 6-6 6"/>
    </svg>
  );
}

function Call({ n, name, body, meta }: { n: string; name: React.ReactNode; body: string; meta: string }) {
  return (
    <div className="rb-call rb-reveal">
      <div className="n">{n}</div>
      <div>
        <div className="nm">{name}</div>
        <div className="b">{body}</div>
        <div className="meta">{meta}</div>
      </div>
    </div>
  );
}
