// The public front door at app.elevateaisystem.com.
//
// Copy rule for this page: a five year old could read it out loud and know
// what the thing does. No jargon, no "leverage", no "seamless", no
// "AI-powered". Short words, true sentences, and the boundary stated in
// public so the promise is checkable.
//
// Structure (each section a different layout family, per the design rules):
//   1. Hero            asymmetric split, copy + the demo
//   2. The week        editorial stack with hairlines
//   3. What it is      centred manifesto
//   4. How it works    numbered sequence
//   5. What it will not do   the one bold colour block
//   6. Close           centred CTA

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
              You did not become a coach <em>to type.</em>
            </h1>
            <p className="ln-hero-sub">
              Coach Assistant writes your messages in your own words, so you can
              be with people instead of your inbox.
            </p>
            <div className="ln-hero-cta">
              <a href="/meet" className="ln-btn ln-btn-lg">Meet your assistant</a>
              <a href="/login" className="ln-btn ln-btn-lg ln-btn-ghost">I have an account</a>
            </div>
          </div>

          <div className="ln-rise ln-rise-2">
            <PhoneDemo />
          </div>
        </div>
      </header>

      {/* 2. The week */}
      <section className="ln-sec ln-problem">
        <div className="ln-wrap ln-narrow">
          <p className="ln-eyebrow">Right now</p>
          <h2 className="ln-h2">This is your week.</h2>
          <ul className="ln-pains">
            <li className="ln-pain">
              <span className="ln-pain-when">Monday</span>
              Someone asks about coaching. You mean to reply properly, so you do not reply at all.
            </li>
            <li className="ln-pain">
              <span className="ln-pain-when">Wednesday</span>
              You write a post. It sounds like a stranger wearing your name.
            </li>
            <li className="ln-pain">
              <span className="ln-pain-when">Friday</span>
              A client has gone quiet. You will notice next week.
            </li>
            <li className="ln-pain">
              <span className="ln-pain-when">Sunday</span>
              It is eleven at night and you are still answering messages.
            </li>
          </ul>
        </div>
      </section>

      {/* 3. What it is */}
      <section className="ln-sec">
        <div className="ln-wrap ln-narrow ln-manifesto">
          <p className="ln-manifesto-line">
            So we built you <em>an assistant.</em>
          </p>
          <p className="ln-manifesto-sub">
            Not a chatbot. Not a course. Someone who works for you all day,
            knows your people, and writes the way you write. You stay the coach.
            It does the typing.
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
                  and remembers.
                </p>
              </div>
            </div>

            <div className="ln-step">
              <div className="ln-step-n">2</div>
              <div>
                <h3 className="ln-step-h">It learns how you talk</h3>
                <p className="ln-step-b">
                  Show it something you already wrote. It picks up your rhythm,
                  your words, the things you would never say. Now it sounds like
                  you and not like a robot.
                </p>
              </div>
            </div>

            <div className="ln-step">
              <div className="ln-step-n">3</div>
              <div>
                <h3 className="ln-step-h">It gets to work</h3>
                <p className="ln-step-b">
                  A message comes in and the reply is already written, waiting
                  for you to say yes. Someone goes quiet and you hear about it
                  the same day, not next month.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. What it will not do */}
      <section className="ln-sec">
        <div className="ln-wrap ln-narrow">
          <div className="ln-promise">
            <h2>What it will never do.</h2>
            <ul className="ln-nots">
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Send anything to anyone without you reading it first.
              </li>
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Sit in a session pretending to be you. That room is yours.
              </li>
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Email you for the sake of it. Quiet week, quiet inbox.
              </li>
              <li className="ln-not">
                <span className="ln-not-mark" aria-hidden>✕</span>
                Use anything your clients told you to sell anything to anyone.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 6. Close */}
      <section className="ln-sec-tight">
        <div className="ln-wrap ln-narrow ln-close">
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

/** The demo. A real message thread, which is what the product actually is:
 *  the same lead, answered twice, so the difference is the whole pitch. */
function PhoneDemo() {
  return (
    <div className="ln-phone">
      <div className="ln-screen">
        <div className="ln-thread">
          <p className="ln-from">New message</p>
          <div className="ln-bubble-in">
            Been following your work for a while. Curious about coaching. What
            does it look like to work with you?
          </div>

          <div className="ln-divider">Two replies</div>

          <div className="ln-draft ln-draft-bad">
            <div className="ln-draft-label">Any other AI</div>
            Hi there! Thanks so much for reaching out. Would you like to schedule
            a discovery call to see if working together is a good fit?
          </div>

          <div className="ln-draft ln-draft-good">
            <div className="ln-draft-label">Yours</div>
            Good to hear from you. Before logistics, what is the real reason you
            are reaching out? Not the tidy version. Tell me that and I will tell
            you if I am the right person.
          </div>
        </div>
        <div className="ln-phone-foot">
          <div className="ln-send">Send it</div>
        </div>
      </div>
    </div>
  );
}
