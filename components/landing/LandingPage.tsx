// The public front door at app.elevateaisystem.com.
//
// LAYOUT
//   A broadsheet. Paper and ink bands alternate, so the page reads as a
//   sequence of rooms rather than one continuous scroll of paragraphs.
//   Numbered rail in the margin. Mono labels against serif display type.
//   The inbox demo is lifted onto an ink band as a lit white stage, which is
//   what makes it the centre of the page instead of the sixth thing down.
//
//   Section order: hero, your week, chief of staff, how it works, the inbox
//   demo, the reply demo, what you get back, founder, what it will never do,
//   who it is for, questions, close. The two demos are the spine; everything
//   before them is setup and everything after is reassurance.
//
//   The previous design of this page (one continuous sheet of warm paper, no
//   week ring, no FAQ) is in git history if a comparison is ever wanted. The
//   copy survived that redesign unchanged, which is the point of the rules
//   below.
//
// COPY RULES (they are the reason this page works)
//   - A five year old could read it aloud and know what the thing does.
//   - Every pain named is one Sunny heard in real coach interviews: admin is
//     the whole problem, and inside admin it is leads first, then content,
//     then marketing. Session prep is absent because coaches did not raise it.
//   - No invented statistics. Where a number would go, ask a question the
//     coach answers from their own week instead.
//   - One label per CTA intent across the whole page: "Meet your assistant"
//     for signup, "Sign in" for returning.

import { Home, Sunrise, X } from "lucide-react";
import InboxTriage from "./InboxTriage";
import LiveDemo from "./LiveDemo";
import WeekRing from "./WeekRing";

export default function LandingPage() {
  return (
    <div className="lx">
      <a href="#main" className="lx-skip">Skip to content</a>

      <nav className="lx-nav" aria-label="Main">
        <div className="lx-wrap">
          <div className="lx-nav-in">
            <a href="/" className="lx-logo">
              <BrandLeaf />
              <span className="lx-logo-text">Coach <span>Assistant</span></span>
            </a>
            <div className="lx-nav-actions">
              <a href="/login" className="lx-signin">Sign in</a>
              <a href="/meet" className="lx-btn">Meet your assistant</a>
            </div>
          </div>
        </div>
      </nav>

      <main id="main">
        {/* ══ 1. Hero ══ */}
        <header className="lx-hero">
          <div className="lx-wrap lx-hero-grid">
            <div className="lx-rise">
              <h1 className="lx-h1">
                You did not become a coach to{" "}
                <span className="lx-rot" aria-label="chase leads, write posts, do marketing, run admin">
                  <span>chase leads.</span>
                  <span>write posts.</span>
                  <span>do marketing.</span>
                  <span>run admin.</span>
                </span>
              </h1>
              <p className="lx-hero-sub">
                Coach Assistant runs the admin in your own words, so your week
                goes back to the work only you can do.
              </p>
              <div className="lx-hero-cta">
                <a href="/meet" className="lx-btn lx-btn-lg">Meet your assistant</a>
                <a href="/login" className="lx-btn lx-btn-lg lx-btn-ghost">Sign in</a>
              </div>
              <p className="lx-hero-fine">Free to start. No credit card.</p>
            </div>

            <div className="lx-rise lx-rise-2">
              {/* The identity claim. It gives permission before the page asks
                  for anything, which is why it sits above the fold. When a
                  real photograph exists, this card moves down to open the
                  chief-of-staff band and the image takes this slot. */}
              <div className="lx-claim">
                <span className="lx-claim-mark" aria-hidden>&ldquo;</span>
                <p className="lx-claim-q">
                  Great coaches are not great admins. You were never supposed to
                  be both.
                </p>
                <div className="lx-claim-rule" aria-hidden />
                <p className="lx-claim-a">
                  Coach Assistant is great at the second one, so you can stay
                  great at <strong>the first</strong>.
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* ══ 2. Your week ══ */}
        <section className="lx-band lx-band-card" aria-labelledby="lx-week">
          <span className="lx-rail" aria-hidden>01</span>
          <div className="lx-wrap lx-mid lx-reveal">
            <p className="lx-label">Right now</p>
            <h2 className="lx-h2" id="lx-week">This is your week.</h2>
            <p className="lx-lead lx-lead-lg">
              How much of last week did you actually spend coaching?
            </p>

            <WeekRing />

            <ul className="lx-spine">
              <li className="lx-spine-row">
                <span className="lx-spine-when">Leads</span>
                <span className="lx-spine-body">
                  Someone asked about coaching eleven days ago. The message is
                  still sitting there, going cold.
                </span>
              </li>
              <li className="lx-spine-row">
                <span className="lx-spine-when">Content</span>
                <span className="lx-spine-body">
                  The post you finished three weeks ago is still in drafts. You
                  know it is good. You still have not put it up.
                </span>
              </li>
              <li className="lx-spine-row">
                <span className="lx-spine-when">Marketing</span>
                <span className="lx-spine-body">
                  The thing you keep meaning to launch is a note on your phone,
                  and has been for a month.
                </span>
              </li>
              <li className="lx-spine-row">
                <span className="lx-spine-when">Home</span>
                <span className="lx-spine-body">
                  You were at the table but not really there. Your kid asked
                  twice. You were still writing the reply in your head.
                </span>
              </li>
              <li className="lx-spine-row">
                <span className="lx-spine-when">You</span>
                <span className="lx-spine-body">
                  Your own practice got skipped again, because the inbox came
                  first. It is eleven at night.
                </span>
              </li>
            </ul>

            <p className="lx-verdict">
              None of that is coaching. All of it is admin. And admin is what
              you are giving your best hours to.
            </p>
          </div>
        </section>

        {/* ══ 3. Chief of staff ══ */}
        <section className="lx-band lx-band-ink" aria-labelledby="lx-cos">
          <span className="lx-rail" aria-hidden>02</span>
          <div className="lx-wrap lx-mid lx-manifesto lx-reveal">
            <h2 className="lx-manifesto-line" id="lx-cos">
              So we built you <em>a chief of staff.</em>
            </h2>
            <p className="lx-manifesto-sub">
              Think of the person a busy leader cannot work without. The one who
              knows every name, catches what is slipping, and has the reply
              already written before you ask. That is what this is. It works
              while you are in session, it sounds exactly like you, and it hands
              you your day already sorted. You stay the coach. It runs the rest.
            </p>
          </div>
        </section>

        {/* ══ 4. How it works ══ */}
        <section className="lx-band" aria-labelledby="lx-how">
          <span className="lx-rail" aria-hidden>03</span>
          <div className="lx-wrap lx-reveal">
            <p className="lx-label">Setup</p>
            <h2 className="lx-h2" id="lx-how">How it works</h2>
            <p className="lx-lead">Three things happen. Then it starts working.</p>

            <div className="lx-steps">
              <div className="lx-step">
                <div className="lx-step-n" aria-hidden>01</div>
                <h3 className="lx-step-h">It asks who you are</h3>
                <p className="lx-step-b">
                  A few questions, one at a time. What kind of coach you are,
                  who you work with, what you want off your plate first. It
                  listens and it remembers.
                </p>
              </div>

              <div className="lx-step">
                <div className="lx-step-n" aria-hidden>02</div>
                <h3 className="lx-step-h">It learns how you talk</h3>
                <p className="lx-step-b">
                  Show it something you already wrote. It picks up your rhythm,
                  your words, and the things you would never say. Now it sounds
                  like you and not like a robot.
                </p>
              </div>

              <div className="lx-step">
                <div className="lx-step-n" aria-hidden>03</div>
                <h3 className="lx-step-h">It gets to work</h3>
                <p className="lx-step-b">
                  Leads get answered while they are still warm. Posts get
                  written. You get one short note each morning telling you what
                  actually needs you today, and nothing when nothing does.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ══ 5. The demo, act one: judgement.
            Ink band, white stage. This is the moment the page is built
            around, so it gets the most air and the only lit surface. ══ */}
        <section className="lx-band lx-band-major lx-band-ink" aria-labelledby="lx-demo">
          <span className="lx-rail" aria-hidden>04</span>
          <div className="lx-wrap">
            <div className="lx-stage-head">
              <p className="lx-label">Try it now</p>
              <h2 className="lx-h2 lx-h2-major" id="lx-demo">
                Paste your inbox.<br />
                <em>It will tell you where your morning goes.</em>
              </h2>
              <p className="lx-lead lx-stage-lead">
                A week of messages, as they came in. You get back who to answer,
                who is quietly going cold, and who is not worth the hour.
              </p>
            </div>

            <div className="lx-stage">
              <div className="lx-chrome" aria-hidden>
                <span className="lx-chrome-dot" />
                <span className="lx-chrome-dot" />
                <span className="lx-chrome-dot" />
                <span className="lx-chrome-title">inbox · monday morning</span>
              </div>
              <div className="lx-stage-body">
                <InboxTriage />
              </div>
            </div>
          </div>
        </section>

        {/* ══ 5b. Act two: execution.
            Narrower measure, plain paper. It reads as a follow-on beat rather
            than a second competing demo. ══ */}
        <section className="lx-band lx-band-card" aria-labelledby="lx-reply">
          <span className="lx-rail" aria-hidden>05</span>
          <div className="lx-wrap lx-mid lx-reveal">
            <p className="lx-label">Then</p>
            <h2 className="lx-h2" id="lx-reply">Then it writes the reply.</h2>
            <p className="lx-lead">
              Deciding who matters is half of it. Paste a message someone
              actually sent you, and a few lines you actually wrote. The same
              model answers it twice. One draft gets your words. One does not.
            </p>
            <LiveDemo />
          </div>
        </section>

        {/* ══ 6. What you get back ══ */}
        <section className="lx-band" aria-labelledby="lx-back">
          <span className="lx-rail" aria-hidden>06</span>
          <div className="lx-wrap lx-reveal">
            <p className="lx-label">The point</p>
            <h2 className="lx-h2" id="lx-back">What you get back.</h2>
            <p className="lx-lead">
              The point was never to answer messages faster. It was to stop
              losing your week to them.
            </p>

            <div className="lx-bento">
              <div className="lx-tile lx-tile-wide">
                <div className="lx-tile-icon" aria-hidden>
                  <Sunrise size={20} strokeWidth={1.8} />
                </div>
                <h3 className="lx-tile-h">The hours you are actually good at</h3>
                <p className="lx-tile-b">
                  You walk into the session having thought about the person, not
                  about your inbox. You finish and you are not behind. The gift
                  you built your life around gets your best hours instead of
                  whatever is left at the end of the day.
                </p>
              </div>

              <div className="lx-tile">
                <div className="lx-tile-icon" aria-hidden>
                  <Leaf />
                </div>
                <h3 className="lx-tile-h">Your own practice</h3>
                <p className="lx-tile-b">
                  The mat gets rolled out. The breath work happens before the
                  phone, not instead of sleep. You keep doing the work that made
                  you worth hiring in the first place.
                </p>
              </div>

              <div className="lx-tile">
                <div className="lx-tile-icon" aria-hidden>
                  <Home size={20} strokeWidth={1.8} />
                </div>
                <h3 className="lx-tile-h">The people at your table</h3>
                <p className="lx-tile-b">
                  Your partner gets you present, not typing. Your kid asks once
                  and you are already listening. You are home when you are home.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ══ 7. Why I built it. The believability slot. ══ */}
        <section className="lx-band lx-band-card" aria-labelledby="lx-founder">
          <span className="lx-rail" aria-hidden>07</span>
          <div className="lx-wrap lx-founder lx-reveal">
            <div className="lx-founder-aside">
              {/* object-position pulls the crop up to the face, since the
                  source is a full portrait rather than a headshot. */}
              <img
                src="/sunny.jpg"
                alt="Sunny Binjola"
                width={260}
                height={325}
                className="lx-founder-photo"
                loading="lazy"
              />
              <div>
                <p className="lx-founder-name">Sunny Binjola</p>
                <p className="lx-founder-role">
                  Men&apos;s embodiment coach.<br />Founder, Coach Assistant.
                </p>
              </div>
            </div>

            <div>
              <p className="lx-label">Why this exists</p>
              <h2 className="lx-founder-quote" id="lx-founder">
                I was already doing this by hand, one coach at a time.
              </h2>
              <p className="lx-founder-body lx-dropcap">
                I coach men. I also run an agency that cleans up marketing and
                admin for other coaches. Funnels, follow up, all the
                unglamorous machinery behind a practice.
              </p>
              <p className="lx-founder-body">
                After enough of them I stopped seeing different problems. It was
                the same week every time. Leads going cold. Posts that never got
                published. Marketing moved to tomorrow again. Their best hours
                going to work nobody would ever thank them for.
              </p>
              <p className="lx-founder-body">
                Almost none of them could fix it by hiring. A good assistant
                costs more than they had, takes months to find, and longer to be
                useful. Some tried AI and got generic mush back, because nobody
                had shown them how to make it sound like them. So they did it
                all themselves, at eleven at night.
              </p>
              <p className="lx-founder-body">
                This is the work my agency does, built into software, at a price
                a working coach can actually pay.
              </p>
            </div>
          </div>
        </section>

        {/* ══ 8. Never do. The one bold colour block. ══ */}
        <section className="lx-band lx-band-forest" aria-labelledby="lx-never">
          <span className="lx-rail" aria-hidden>08</span>
          <div className="lx-wrap lx-reveal">
            <p className="lx-label">The line it does not cross</p>
            <h2 className="lx-h2" id="lx-never" style={{ color: "var(--paper)" }}>
              What it will never do.
            </h2>
            <ul className="lx-nots">
              {NEVER.map((line) => (
                <li className="lx-not" key={line}>
                  <span className="lx-not-mark" aria-hidden>
                    <X size={13} strokeWidth={2.5} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ══ 9. Who it is for ══ */}
        <section className="lx-band lx-band-tight" aria-labelledby="lx-who">
          <span className="lx-rail" aria-hidden>09</span>
          <div className="lx-wrap lx-mid lx-reveal">
            <h2 className="lx-label" id="lx-who">Who this is for</h2>
            <p className="lx-forwho">
              Built for <strong>coaches who do real inner work</strong>.
              Men&apos;s work, embodiment, somatic, depth. People whose whole
              value is being fully present in a room, which is exactly what
              admin steals. If you want a bot to blast strangers, this is the
              wrong tool.
            </p>
          </div>
        </section>

        {/* ══ 10. Questions ══
            Every answer here is a promise made somewhere else on this page,
            restated as the question a sceptical coach actually asks. Nothing
            new is claimed, and nothing new should be added without it being
            true of the shipped product. */}
        <section className="lx-band lx-band-card" aria-labelledby="lx-faq">
          <span className="lx-rail" aria-hidden>10</span>
          <div className="lx-wrap lx-mid lx-reveal">
            <p className="lx-label">Straight answers</p>
            <h2 className="lx-h2" id="lx-faq">The things you are about to ask.</h2>

            <div className="lx-faq">
              {FAQ.map((item) => (
                <details className="lx-faq-item" key={item.q}>
                  <summary className="lx-faq-q">
                    {item.q}
                    <span className="lx-faq-sign" aria-hidden />
                  </summary>
                  <p className="lx-faq-a">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ══ 11. Close ══ */}
        <section className="lx-band lx-band-ink" aria-labelledby="lx-close">
          <div className="lx-wrap lx-narrow lx-close lx-reveal">
            <h2 className="lx-h2 lx-h2-major" id="lx-close">
              Two minutes and it <em>knows you.</em>
            </h2>
            <p className="lx-close-lead">
              Answer three questions. See what kind of assistant your practice
              actually needs.
            </p>
            <a href="/meet" className="lx-btn lx-btn-lg lx-btn-onink">
              Meet your assistant
            </a>
            <p className="lx-close-fine">Free to start. No credit card.</p>
          </div>
        </section>
      </main>

      <footer>
        <div className="lx-wrap lx-foot">
          <span>Coach Assistant by ElevateAI Systems</span>
          <span>
            <a href="/login">Sign in</a>
            {"  ·  "}
            <a href="mailto:sunny.binjola@gmail.com">sunny.binjola@gmail.com</a>
          </span>
        </div>
      </footer>

      {/* Below 720px the nav button has shrunk and scrolled away. */}
      <div className="lx-dock">
        <a href="/meet" className="lx-btn lx-btn-lg">Meet your assistant</a>
      </div>
    </div>
  );
}

const NEVER = [
  "Send anything to anyone without you reading it first. Nothing leaves without your yes.",
  "Sit in a session pretending to be you. That room is yours and it always will be.",
  "Post as you on your own accounts. It writes, you publish.",
  "Email you for the sake of it. Quiet week, quiet inbox.",
  "Touch what your clients told you. Their words are not training data and never will be.",
  "Lock your work in. Export everything, delete everything, any time you want.",
];

const FAQ = [
  {
    q: "Will it message people without me?",
    a: "No. Nothing leaves without your yes. It writes the reply and hands it to you. You read it, you send it. Same with posts: it writes, you publish.",
  },
  {
    q: "Will it sound like me, or like every other AI?",
    a: "You show it something you already wrote. It picks up your rhythm, your words, and the things you would never say. That is what the second demo above is for: the same model answers the same message twice, and only one of the drafts has your words in it.",
  },
  {
    q: "What happens to what my clients tell me?",
    a: "Nothing. Their words are not training data and never will be. It does not sit in your sessions either. That room is yours and it always will be.",
  },
  {
    q: "What if I want to leave?",
    a: "Export everything, delete everything, any time you want. Your work is not locked in.",
  },
  {
    q: "How long does setup take?",
    a: "Two minutes to start. It asks a few questions, one at a time, about what kind of coach you are and what you want off your plate first. It listens and it remembers.",
  },
  {
    q: "Am I going to get another inbox to check?",
    a: "One short note each morning telling you what actually needs you today, and nothing when nothing does. Quiet week, quiet inbox.",
  },
  {
    q: "What does it cost?",
    a: "Free to start. No credit card.",
  },
];

function BrandLeaf() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="3" y="4" width="39" height="39" rx="9.8" fill="#0B6E23" />
      <path d="M14.2 30.5C13.6 24 15.2 18.8 19.9 15.6C23.5 13.2 27.7 13.4 32.1 10.2C33.9 18.5 31.6 25.6 25.7 28.8C21.9 30.9 18 30.7 15.4 29.6L14.2 30.5Z" fill="#FAF8F3" />
      <path d="M13.4 32.1C15.8 26.9 19.8 22.9 25.3 20.1" stroke="#FAF8F3" strokeWidth="2.7" strokeLinecap="round" />
    </svg>
  );
}

/** The brand leaf, stroked, at icon weight. Lucide has no leaf that matches
 *  the mark, and a near-miss glyph in the one tile about his own practice
 *  would read as carelessness. */
function Leaf() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" aria-hidden>
      <path
        d="M5.4 18.6c-.6-5 .6-9 4.2-11.4 2.7-1.8 5.9-1.6 9.2-4 1.4 6.3-.4 11.7-4.9 14.1-2.9 1.6-5.8 1.4-7.8.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4.8 19.8C6.6 15.9 9.7 12.8 13.9 10.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
