export default function FirstRunCommandCenter() {
  return (
    <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface-elevated)_0%,var(--surface-elevated)_60%,var(--brand-soft)_100%)] p-6 sm:p-8 shadow-[var(--shadow-sm)]">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-7 items-start">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-faint)] bg-white/70 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)]">
            Coach OS
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
            Setup
          </div>
          <h2 className="font-display mt-4 text-3xl sm:text-5xl font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            Start with one real conversation.
          </h2>
          <p className="mt-3 max-w-2xl text-[length:var(--t-body)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
            The operating system gets useful after it has a lead, a voice, or a real message to learn from. Capture one conversation first, then the board turns into what to do next.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <a
              href="/leads/capture"
              className="inline-flex h-11 items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-4 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text-inverse)] hover:bg-[var(--brand-strong)] transition"
            >
              Capture first lead
            </a>
            <a
              href="/voice"
              className="inline-flex h-11 items-center justify-center rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] hover:border-[var(--border-strong)] transition"
            >
              Build voice
            </a>
          </div>
        </div>

        <div className="rounded-[var(--r-lg)] bg-[var(--navy)] p-4 text-[color:var(--text-inverse)] shadow-[var(--shadow-md)]">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand-bright)]">
            Activation path
          </div>
          <div className="mt-4 space-y-3">
            <FirstRunStep step={1} title="Capture a lead" body="Paste a DM, call note, or screenshot." />
            <FirstRunStep step={2} title="Build voice" body="Answer 5 questions or paste captions." />
            <FirstRunStep step={3} title="Send one reply" body="Let the system learn from what you edit." />
          </div>
        </div>
      </div>
    </section>
  );
}

function FirstRunStep({ step, title, body }: { step: number; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-[var(--r-md)] border border-white/10 bg-white/[0.06] p-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] font-extrabold text-white/55 tabular-nums">
        {step}
      </span>
      <div>
        <div className="text-[length:var(--t-caption)] font-extrabold">
          {title}
        </div>
        <div className="mt-0.5 text-[length:var(--t-caption)] text-white/55">
          {body}
        </div>
      </div>
    </div>
  );
}
