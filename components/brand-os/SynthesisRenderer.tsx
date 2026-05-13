"use client";

// SynthesisRenderer — client component that lazily triggers /api/brand-os/
// synthesize on mount (if cache is empty) and renders the visual
// deliverable. Owns the toolbar (Print, Download .md, Copy .md, Email).

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import type { BrandOsSynthesis } from "@/app/api/brand-os/synthesize/route";

type Props = {
  runId: string;
  initialSynthesis: BrandOsSynthesis | null;
  defaultEmail: string;
};

type Status = "idle" | "generating" | "ready" | "error";

export default function SynthesisRenderer({ runId, initialSynthesis, defaultEmail }: Props) {
  const [synthesis, setSynthesis] = useState<BrandOsSynthesis | null>(initialSynthesis);
  const [status, setStatus] = useState<Status>(initialSynthesis ? "ready" : "idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (synthesis || status !== "idle") return;
    void generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(force: boolean) {
    setStatus("generating");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/brand-os/synthesize${force ? "?force=true" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setSynthesis(data.synthesis as BrandOsSynthesis);
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Could not generate.");
      setStatus("error");
    }
  }

  if (status === "generating") return <GeneratingState />;
  if (status === "error") return <ErrorState message={errorMsg} onRetry={() => generate(true)} />;
  if (!synthesis) return <GeneratingState />;

  return (
    <div className="space-y-8">
      <Toolbar runId={runId} defaultEmail={defaultEmail} onRegenerate={() => generate(true)} />
      <PositioningCard s={synthesis} />
      <VoiceDnaCard s={synthesis} />
      <BuyerMirrorCard s={synthesis} />
      <PillarsCard s={synthesis} />
      <KeywordsCard s={synthesis} />
      <HooksCard s={synthesis} />
      <StrengthsGapsCard s={synthesis} />
      <NextStepsCard s={synthesis} />
      <RegenerateFooter onRegenerate={() => generate(true)} />
    </div>
  );
}

// ─── States ────────────────────────────────────────────────

function GeneratingState() {
  return (
    <Card className="p-8 text-center space-y-3">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--brand-soft)] border border-[color-mix(in_srgb,var(--brand)_30%,transparent)]">
        <span className="animate-pulse text-2xl">●</span>
      </div>
      <h2 className="font-display text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
        Generating your Brand OS…
      </h2>
      <p className="text-[color:var(--text-muted)]">
        Reading every answer · Pulling your voice DNA · Refining pillars · ~15 seconds.
      </p>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <Card className="p-6 space-y-3 border-[var(--danger)]">
      <Badge tone="danger" size="xs" uppercase>Synthesis failed</Badge>
      <p className="text-[color:var(--text)]">{message ?? "Something went wrong generating your output."}</p>
      <Button onClick={onRetry}>Try again</Button>
    </Card>
  );
}

// ─── Toolbar ──────────────────────────────────────────────

function Toolbar({ runId, defaultEmail, onRegenerate }: { runId: string; defaultEmail: string; onRegenerate: () => void }) {
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [copying, setCopying] = useState(false);

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/brand-os/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
      setStatus({ kind: "ok", msg: `Sent to ${email} — check your inbox.` });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not send." });
    } finally {
      setSending(false);
    }
  }

  async function copyMd() {
    setCopying(true);
    try {
      const res = await fetch(`/api/brand-os/download-md?runId=${runId}`);
      if (!res.ok) throw new Error("Download failed.");
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setStatus({ kind: "ok", msg: "Copied as Markdown — paste into ChatGPT / Claude / Gemini." });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Copy failed." });
    } finally {
      setCopying(false);
    }
  }

  return (
    <Card className="p-4 space-y-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => window.print()} variant="ghost">Print / Save PDF</Button>
        <a
          href={`/api/brand-os/download-md?runId=${runId}`}
          className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-body)] font-bold hover:border-[var(--text-muted)] transition"
          download
        >
          ↓ Download .md
        </a>
        <Button variant="ghost" onClick={copyMd} disabled={copying}>
          {copying ? "Copying…" : "Copy as Markdown"}
        </Button>
        <Button variant="ghost" onClick={onRegenerate}>
          ↻ Regenerate
        </Button>
      </div>

      <form onSubmit={sendEmail} className="flex items-center gap-2 flex-wrap pt-2 border-t border-[var(--border)]">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email this to me"
          className="flex-1 min-w-[200px] h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-caption)] focus:border-[var(--brand-strong)] focus:outline-none"
          required
        />
        <Button type="submit" disabled={sending || !email}>
          {sending ? "Sending…" : "Email me the deliverable"}
        </Button>
      </form>

      {status && (
        <p className={`text-[length:var(--t-caption)] ${status.kind === "ok" ? "text-[color:var(--brand-strong)]" : "text-[color:var(--danger)]"}`}>
          {status.msg}
        </p>
      )}

      <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
        <strong>Pro move:</strong> Download the .md file, paste into ChatGPT / Claude / Gemini, then say <em>"Use this as my brand context for everything we work on."</em> Your AI will write in your voice from now on.
      </p>
    </Card>
  );
}

// ─── Section cards ────────────────────────────────────────

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="space-y-1 mb-4">
      <Badge tone="brand" size="xs" uppercase>{label}</Badge>
      <h2 className="font-display text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)] leading-tight">
        {title}
      </h2>
    </div>
  );
}

function PositioningCard({ s }: { s: BrandOsSynthesis }) {
  return (
    <Card className="p-6 sm:p-8 space-y-5 border-[var(--brand-strong)]">
      <SectionHeader label="Positioning" title="Who you are, sharper." />
      <div className="space-y-2">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">What you do</p>
        <p className="text-[length:var(--t-h3)] font-display font-extrabold leading-snug text-[color:var(--text)]">
          {s.positioning_line}
        </p>
      </div>
      <div className="space-y-2 pt-3 border-t border-[var(--border)]">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">Signature line</p>
        <blockquote className="border-l-4 border-[var(--brand-strong)] pl-4 py-2 text-[color:var(--text)] italic leading-relaxed text-[length:var(--t-body)]">
          {s.signature_line}
        </blockquote>
      </div>
    </Card>
  );
}

function VoiceDnaCard({ s }: { s: BrandOsSynthesis }) {
  return (
    <Card className="p-6 sm:p-8 space-y-4">
      <SectionHeader label="Voice DNA" title="How you sound — what AI can't fake." />
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">Tone</p>
          <p className="text-[color:var(--text)]">{s.voice_dna.tone}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">Rhythm</p>
          <p className="text-[color:var(--text)]">{s.voice_dna.rhythm}</p>
        </div>
      </div>
      <div className="pt-3 border-t border-[var(--border)] space-y-2">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">Signature moves</p>
        <ul className="space-y-1">
          {(s.voice_dna.signature_moves ?? []).map((m, i) => (
            <li key={i} className="text-[color:var(--text)] flex gap-2"><span className="text-[color:var(--brand-strong)] font-bold">→</span> <span>{m}</span></li>
          ))}
        </ul>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-[var(--border)]">
        <div className="space-y-2">
          <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--brand-strong)]">Use ✓</p>
          <div className="flex flex-wrap gap-1.5">
            {(s.voice_dna.vocab_yes ?? []).map((v, i) => (
              <span key={i} className="font-mono text-[length:var(--t-caption)] px-2 py-1 rounded-[var(--r-sm)] bg-[var(--brand-soft)] text-[color:var(--success)] border border-[color-mix(in_srgb,var(--brand)_30%,transparent)]">
                {v}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--danger)]">Never ✕</p>
          <div className="flex flex-wrap gap-1.5">
            {(s.voice_dna.vocab_no ?? []).map((v, i) => (
              <span key={i} className="font-mono text-[length:var(--t-caption)] px-2 py-1 rounded-[var(--r-sm)] bg-[var(--danger-soft)] text-[#B42318] line-through border border-[color-mix(in_srgb,var(--danger)_25%,transparent)]">
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function BuyerMirrorCard({ s }: { s: BrandOsSynthesis }) {
  return (
    <Card className="p-6 sm:p-8 space-y-4">
      <SectionHeader label="Buyer Mirror" title={`${s.buyer_mirror.name} — the one person you're writing to.`} />
      <p className="text-[color:var(--text)] leading-relaxed">{s.buyer_mirror.one_line_portrait}</p>

      <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-[var(--border)]">
        <div className="space-y-1">
          <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">Body state · 6am Tuesday</p>
          <p className="text-[color:var(--text)] leading-relaxed">{s.buyer_mirror.body_state}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">Already tried (graveyard)</p>
          <p className="text-[color:var(--text)] leading-relaxed">{s.buyer_mirror.graveyard}</p>
        </div>
      </div>

      <div className="pt-3 border-t border-[var(--border)] space-y-2">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">What they'd say at 11pm, drink in hand, one trusted friend</p>
        <blockquote className="border-l-4 border-[var(--brand-strong)] pl-4 py-2 italic text-[color:var(--text)] text-[length:var(--t-body)]">
          {s.buyer_mirror.secret_sentence}
        </blockquote>
      </div>
    </Card>
  );
}

function PillarsCard({ s }: { s: BrandOsSynthesis }) {
  return (
    <Card className="p-6 sm:p-8 space-y-4">
      <SectionHeader label="Content Pillars" title="The 3 things you'll keep talking about." />
      <div className="grid gap-3 sm:grid-cols-3">
        {(s.pillars ?? []).map((p, i) => (
          <div key={i} className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 space-y-2">
            <p className="font-mono text-[length:var(--t-caption)] text-[color:var(--text-faint)]">PILLAR {i + 1}</p>
            <h3 className="font-display text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] leading-tight">{p.name}</h3>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">{p.why}</p>
            <div className="pt-2 border-t border-[var(--border)] space-y-1">
              <p className="text-[length:var(--t-caption)]"><span className="font-bold text-[color:var(--text-faint)] uppercase tracking-wider">Enemy:</span> <span className="text-[color:var(--text)]">{p.enemy}</span></p>
              <p className="text-[length:var(--t-caption)]"><span className="font-bold text-[color:var(--text-faint)] uppercase tracking-wider">Proof:</span> <span className="text-[color:var(--text)]">{p.proof}</span></p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function KeywordsCard({ s }: { s: BrandOsSynthesis }) {
  return (
    <Card className="p-6 sm:p-8 space-y-3">
      <SectionHeader label="Keywords" title="Words to claim — SEO, captions, hashtags." />
      <div className="flex flex-wrap gap-2">
        {(s.keywords ?? []).map((k, i) => (
          <span key={i} className="font-mono text-[length:var(--t-caption)] px-3 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[color:var(--text)]">
            {k}
          </span>
        ))}
      </div>
    </Card>
  );
}

function HooksCard({ s }: { s: BrandOsSynthesis }) {
  return (
    <Card className="p-6 sm:p-8 space-y-4">
      <SectionHeader label="Ship This Week" title="5 content angles, ready to draft." />
      <div className="space-y-3">
        {(s.resonance_hooks ?? []).map((h, i) => (
          <div key={i} className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 space-y-1">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h4 className="font-display font-extrabold text-[color:var(--text)] text-[length:var(--t-body)] leading-snug">
                {i + 1}. {h.headline}
              </h4>
              <Badge tone="muted" size="xs" uppercase>{h.pillar}</Badge>
            </div>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">{h.angle}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StrengthsGapsCard({ s }: { s: BrandOsSynthesis }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="p-6 space-y-3">
        <SectionHeader label="What's Working" title="Lean into this." />
        <p className="text-[color:var(--text)] leading-relaxed">{s.what_great}</p>
        <ul className="space-y-1 pt-2 border-t border-[var(--border)]">
          {(s.strengths ?? []).map((x, i) => (
            <li key={i} className="text-[color:var(--text)] flex gap-2 text-[length:var(--t-caption)]">
              <span className="text-[color:var(--brand-strong)] font-bold">✓</span><span>{x}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-6 space-y-3">
        <SectionHeader label="What to Work On" title="Sharpen this." />
        <p className="text-[color:var(--text)] leading-relaxed">{s.what_not}</p>
        <ul className="space-y-1 pt-2 border-t border-[var(--border)]">
          {(s.gaps ?? []).map((x, i) => (
            <li key={i} className="text-[color:var(--text)] flex gap-2 text-[length:var(--t-caption)]">
              <span className="text-[color:var(--warning)] font-bold">→</span><span>{x}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function NextStepsCard({ s }: { s: BrandOsSynthesis }) {
  return (
    <Card className="p-6 sm:p-8 space-y-4">
      <SectionHeader label="Next 7–30 Days" title="Do these, in this order." />
      <ol className="space-y-3">
        {(s.next_steps ?? []).map((n, i) => (
          <li key={i} className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 space-y-1">
            <div className="flex items-start gap-3">
              <span className="font-display text-[length:var(--t-h3)] font-extrabold text-[color:var(--brand-strong)] shrink-0">{i + 1}.</span>
              <div className="space-y-1 flex-1 min-w-0">
                <h4 className="font-bold text-[color:var(--text)] leading-snug">{n.action}</h4>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]"><span className="font-bold">Why:</span> {n.why}</p>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]"><span className="font-bold">When:</span> {n.when}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function RegenerateFooter({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <div className="text-center py-4 print:hidden">
      <Button variant="ghost" onClick={onRegenerate}>↻ Regenerate this output</Button>
      <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] mt-2">
        Re-runs the synthesis from your answers. Useful if you've edited an answer or want a fresh take.
      </p>
    </div>
  );
}
