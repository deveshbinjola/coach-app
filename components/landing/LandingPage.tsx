// The public front door at app.elevateaisystem.com.
//
// Copy rules for this page:
//   - A five year old could read it aloud and know what the thing does.
//   - Every pain named here is one Sunny heard in real coach interviews:
//     admin is the whole problem, and inside admin it is leads first,
//     then content, then marketing. Session prep is deliberately absent
//     because coaches did not raise it.
//   - No invented statistics. Where a number would go, ask a question the
//     coach answers from their own week instead.
//
// Structure (each section a different layout family):
//   1. Hero              split: rotating headline + the question / photo slot
//   2. Your week         editorial stack, dated and specific
//   3. Chief of staff    centred manifesto
//   4. How it works      numbered sequence
//   5. Inbox triage      the main demo, full width: they paste, it judges
//   5b. Reply demo       act two, mid measure: it writes, in their words
//   6. What you get back asymmetric pair grid
//   7. Never do          the one bold colour block
//   8. Who it is for + close
//
// One label per CTA intent across the whole page: "Meet your assistant" for
// signup, "Sign in" for returning. Two labels for one intent reads as two
// different offers.

import InboxTriage from "./InboxTriage";
import LiveDemo from "./LiveDemo";

export default function LandingPage() {
  return (
    <div className="ln">
      <nav className="ln-nav">
        <div className="ln-wrap ln-nav-in">
          <a href="/" className="ln-logo">
            <BrandLeaf />
            <span className="ln-logo-text">Coach <span>Assistant</span></span>
          </a>
          <div className="ln-nav-actions">
            <a href="/login" className="ln-signin">Sign in</a>
            <a href="/meet" className="ln-btn">Meet your assistant</a>
          </div>
        </div>
      </nav>

      {/* 1. Hero */}
      <header className="ln-hero">
        <div className="ln-wrap ln-hero-grid">
          <div className="ln-rise">
            <h1 className="ln-h1">
              You did not become a coach to{" "}
              <span className="ln-rot" aria-label="chase leads, write posts, do marketing, run admin">
                <span>chase leads.</span>
                <span>write posts.</span>
                <span>do marketing.</span>
                <span>run admin.</span>
              </span>
            </h1>
            <p className="ln-hero-sub">
              Coach Assistant runs the admin in your own words, so your week
              goes back to the work only you can do.
            </p>
            <div className="ln-hero-cta">
              <a href="/meet" className="ln-btn ln-btn-lg">Meet your assistant</a>
              <a href="/login" className="ln-btn ln-btn-lg ln-btn-ghost">Sign in</a>
            </div>
          </div>

          <div className="ln-rise ln-rise-2">
            <HeroVisual />
          </div>
        </div>
      </header>

      {/* 2. Your week */}
      <section className="ln-sec ln-problem">
        <div className="ln-wrap ln-narrow">
          <p className="ln-eyebrow">Right now</p>
          <h2 className="ln-h2">This is your week.</h2>
          {/* The question sets up the list rather than standing alone. The
              four rows below are the answer, which is the whole point. */}
          <p className="ln-askline">
            How much of last week did you actually spend coaching?
          </p>
          <ul className="ln-pains">
            <li className="ln-pain">
              <span className="ln-pain-when">Leads</span>
              Someone asked about coaching eleven days ago. The message is still
              sitting there, going cold.
            </li>
            <li className="ln-pain">
              <span className="ln-pain-when">Content</span>
              The post you finished three weeks ago is still in drafts. You know
              it is good. You still have not put it up.
            </li>
            <li className="ln-pain">
              <span className="ln-pain-when">Marketing</span>
              The thing you keep meaning to launch is a note on your phone, and
              has been for a month.
            </li>
            <li className="ln-pain">
              <span className="ln-pain-when">Home</span>
              You were at the table but not really there. Your kid asked twice.
              You were still writing the reply in your head.
            </li>
            <li className="ln-pain">
              <span className="ln-pain-when">You</span>
              Your own practice got skipped again, because the inbox came first.
              It is eleven at night.
            </li>
          </ul>
          <p className="ln-lead" style={{ marginTop: "2rem" }}>
            None of that is coaching. All of it is admin. And admin is what you
            are giving your best hours to.
          </p>
        </div>
      </section>

      {/* 3. Chief of staff */}
      <section className="ln-sec">
        <div className="ln-wrap ln-narrow ln-manifesto">
          <p className="ln-manifesto-line">
            So we built you <em>a chief of staff.</em>
          </p>
          <p className="ln-manifesto-sub">
            Think of the person a busy leader cannot work without. The one who
            knows every name, catches what is slipping, and has the reply
            already written before you ask. That is what this is. It works while
            you are in session, it sounds exactly like you, and it hands you
            your day already sorted. You stay the coach. It runs the rest.
          </p>
        </div>
      </section>

      {/* 4. How it works */}
      <section className="ln-sec ln-problem">
        <div className="ln-wrap ln-narrow">
          <h2 className="ln-h2">How it works</h2>
          <p className="ln-lead">Three things happen. Then it starts working.</p>

          <div className="ln-steps">
            <div className="ln-step">
              <div className="ln-step-n">1</div>
              <div>
                <h3 className="ln-step-h">It asks who you are</h3>
                <p className="ln-step-b">
                  A few questions, one at a time. What kind of coach you are, who
                  you work with, what you want off your plate first. It listens
                  and it remembers.
                </p>
              </div>
            </div>

            <div className="ln-step">
              <div className="ln-step-n">2</div>
              <div>
                <h3 className="ln-step-h">It learns how you talk</h3>
                <p className="ln-step-b">
                  Show it something you already wrote. It picks up your rhythm,
                  your words, and the things you would never say. Now it sounds
                  like you and not like a robot.
                </p>
              </div>
            </div>

            <div className="ln-step">
              <div className="ln-step-n">3</div>
              <div>
                <h3 className="ln-step-h">It gets to work</h3>
                <p className="ln-step-b">
                  Leads get answered while they are still warm. Posts get
                  written. You get one short note each morning telling you what
                  actually needs you today, and nothing when nothing does.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. The demo, act one: judgement. Full width and centred, because this
          is the moment the page is built around. */}
      <section className="ln-sec ln-sec-major">
        <div className="ln-wrap">
          <div className="ln-stage-head">
            <h2 className="ln-h2 ln-h2-major">
              Paste your inbox.<br />
              <em>It will tell you where your morning goes.</em>
            </h2>
            <p className="ln-lead ln-stage-lead">
              A week of messages, as they came in. You get back who to answer,
              who is quietly going cold, and who is not worth the hour.
            </p>
          </div>
          <div className="ln-stage">
            <InboxTriage />
          </div>
        </div>
      </section>

      {/* 5b. Act two: execution. Narrower measure so it reads as a follow-on
          beat rather than a second competing demo. */}
      <section className="ln-sec ln-problem">
        <div className="ln-wrap ln-mid">
          <h2 className="ln-h2">Then it writes the reply.</h2>
          <p className="ln-lead">
            Deciding who matters is half of it. Paste a message someone actually
            sent you, and a few lines you actually wrote. The same model answers
            it twice. One draft gets your words. One does not.
          </p>
          <LiveDemo />
        </div>
      </section>

      {/* 6. What you get back */}
      <section className="ln-sec ln-problem">
        <div className="ln-wrap ln-narrow">
          <h2 className="ln-h2">What you get back.</h2>
          <p className="ln-lead">
            The point was never to answer messages faster. It was to stop losing
            your week to them.
          </p>

          <div className="ln-back">
            <div className="ln-back-item">
              <h3 className="ln-back-h">The hours you are actually good at</h3>
              <p className="ln-back-b">
                You walk into the session having thought about the person, not
                about your inbox. You finish and you are not behind. The gift
                you built your life around gets your best hours instead of
                whatever is left at the end of the day.
              </p>
            </div>
            <div className="ln-back-item">
              <h3 className="ln-back-h">Your own practice</h3>
              <p className="ln-back-b">
                The mat gets rolled out. The breath work happens before the
                phone, not instead of sleep. You keep doing the work that made
                you worth hiring in the first place.
              </p>
            </div>
            <div className="ln-back-item">
              <h3 className="ln-back-h">The people at your table</h3>
              <p className="ln-back-b">
                Your partner gets you present, not typing. Your kid asks once
                and you are already listening. You are home when you are home.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6b. Why I built it. The believability slot. */}
      <section className="ln-sec">
        <div className="ln-wrap ln-narrow ln-founder">
          {/* object-position pulls the crop up to the face, since the source
              is a full portrait rather than a headshot. */}
          <img
            src="/sunny.jpg"
            alt="Sunny Binjola"
            width={92}
            height={92}
            className="ln-founder-photo"
            loading="lazy"
          />
          <div>
            <p className="ln-founder-quote">
              I was already doing this by hand, one coach at a time.
            </p>
            <p className="ln-founder-body">
              I coach men. I also run an agency that cleans up marketing and
              admin for other coaches. Funnels, follow up, all the unglamorous
              machinery behind a practice.
            </p>
            <p className="ln-founder-body">
              After enough of them I stopped seeing different problems. It was
              the same week every time. Leads going cold. Posts that never got
              published. Marketing moved to tomorrow again. Their best hours
              going to work nobody would ever thank them for.
            </p>
            <p className="ln-founder-body">
              Almost none of them could fix it by hiring. A good assistant costs
              more than they had, takes months to find, and longer to be useful.
              Some tried AI and got generic mush back, because nobody had shown
              them how to make it sound like them. So they did it all
              themselves, at eleven at night.
            </p>
            <p className="ln-founder-body">
              This is the work my agency does, built into software, at a price a
              working coach can actually pay.
            </p>
            <p className="ln-founder-name">Sunny Binjola</p>
            <p className="ln-founder-role">
              Men&apos;s embodiment coach. Founder, Coach Assistant.
            </p>
          </div>
        </div>
      </section>

      {/* 7. Never do */}
      <section className="ln-sec">
        <div className="ln-wrap ln-narrow">
          <div className="ln-promise">
            <h2>What it will never do.</h2>
            <ul className="ln-nots">
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Send anything to anyone without you reading it first. Nothing
                leaves without your yes.
              </li>
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Sit in a session pretending to be you. That room is yours and it
                always will be.
              </li>
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Post as you on your own accounts. It writes, you publish.
              </li>
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Email you for the sake of it. Quiet week, quiet inbox.
              </li>
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Touch what your clients told you. Their words are not training
                data and never will be.
              </li>
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Lock your work in. Export everything, delete everything, any
                time you want.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 8. Who it is for, and the close */}
      <section className="ln-sec-tight">
        <div className="ln-wrap ln-narrow">
          <div className="ln-forwho">
            <p>
              Built for <strong>coaches who do real inner work</strong>. Men&apos;s
              work, embodiment, somatic, depth. People whose whole value is being
              fully present in a room, which is exactly what admin steals. If you
              want a bot to blast strangers, this is the wrong tool.
            </p>
          </div>
        </div>

        <div className="ln-wrap ln-narrow ln-close" style={{ marginTop: "4rem" }}>
          <h2 className="ln-h2">Two minutes and it knows you.</h2>
          <p className="ln-lead" style={{ margin: "0 auto 2rem" }}>
            Answer three questions. See what kind of assistant your practice
            actually needs.
          </p>
          <a href="/meet" className="ln-btn ln-btn-lg">Meet your assistant</a>
          <p className="ln-fine">Free to start. No credit card.</p>
        </div>
      </section>

      <footer className="ln-wrap ln-foot">
        <span>Coach Assistant by ElevateAI Systems</span>
        <span>
          <a href="/login">Sign in</a>
          {"  ·  "}
          <a href="mailto:sunny.binjola@gmail.com">sunny.binjola@gmail.com</a>
        </span>
      </footer>
    </div>
  );
}

function BrandLeaf() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="3" y="4" width="39" height="39" rx="9.8" fill="#0B6E23" />
      <path d="M14.2 30.5C13.6 24 15.2 18.8 19.9 15.6C23.5 13.2 27.7 13.4 32.1 10.2C33.9 18.5 31.6 25.6 25.7 28.8C21.9 30.9 18 30.7 15.4 29.6L14.2 30.5Z" fill="#FAF8F3" />
      <path d="M13.4 32.1C15.8 26.9 19.8 22.9 25.3 20.1" stroke="#FAF8F3" strokeWidth="2.7" strokeLinecap="round" />
    </svg>
  );
}

/** HERO VISUAL SLOT.
 *
 *  Holds the identity line: the belief the reader already has and has never
 *  seen written down. It gives permission before the page asks for anything,
 *  which is why it sits above the fold rather than in the body.
 *
 *  WHEN THE PHOTO ARRIVES: replace this block with the image, and move this
 *  card down to open the "chief of staff" section, where it reads as the
 *  reframe that sets up the solution.
 *
 *    <img src="/hero-session.jpg" alt="Sunny mid session with a client"
 *         width={720} height={880} className="ln-hero-photo" /> */
function HeroVisual() {
  return (
    <div className="ln-ask">
      <p className="ln-ask-q">
        Great coaches are not great admins. You were never supposed to be both.
      </p>
      <div className="ln-ask-rule" aria-hidden />
      <p className="ln-ask-resolve">
        Coach Assistant is great at the second one, so you can stay great at{" "}
        <strong>the first</strong>.
      </p>
    </div>
  );
}

