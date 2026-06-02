// components/funnels/QuizCreateModal.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SpeakOrType from "@/components/voice/SpeakOrType";
import type { FunnelConfig } from "@/lib/funnel-config";

type Draft = { title: string; type: string; config: FunnelConfig; generated_from_run_id: string | null };
type Phase = "ask" | "generating" | "review" | "error";

const PLACEHOLDER =
  "e.g. Help stressed founders figure out if they're actually burnt out or just bored, and point them toward my reset program.";

export default function QuizCreateModal({
  open, onClose, hasBrandOs,
}: { open: boolean; onClose: () => void; hasBrandOs: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ask");
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [title, setTitle] = useState("");
  const [ctaUrls, setCtaUrls] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset to a clean ask state every time the modal opens.
  useEffect(() => {
    if (open) {
      setPhase("ask");
      setBrief("");
      setDraft(null);
      setTitle("");
      setCtaUrls([]);
      setErrorMsg(null);
      setSaving(false);
    }
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function generate() {
    setPhase("generating");
    setErrorMsg(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch("/api/funnels/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Generation failed.");
        setPhase("error");
        return;
      }
      const d = data.draft as Draft;
      setDraft(d);
      setTitle(d.title);
      setCtaUrls(d.config.results.map((r) => r.cta_url ?? ""));
      setPhase("review");
    } catch {
      setErrorMsg("That took too long. Try again or shorten your brief.");
      setPhase("error");
    } finally {
      clearTimeout(timeout);
    }
  }

  async function save() {
    if (!draft) return;
    const blanks = ctaUrls.filter((u) => !u.trim()).length;
    if (blanks > 0) {
      const ok = window.confirm(
        `${blanks} result${blanks === 1 ? " has" : "s have"} no link — takers will hit a dead end. Save anyway?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    const config: FunnelConfig = {
      ...draft.config,
      results: draft.config.results.map((r, i) => ({ ...r, cta_url: ctaUrls[i] ?? "" })),
    };
    try {
      const res = await fetch("/api/funnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, type: draft.type, config,
          generated_from_run_id: draft.generated_from_run_id, brief,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? "Save failed."); setPhase("error"); setSaving(false); return; }
      router.push(`/funnels/${data.funnel.id}/edit`);
    } catch {
      setErrorMsg("Save failed."); setPhase("error"); setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/30 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-[var(--surface-elevated)] w-full sm:max-w-[560px] sm:rounded-[var(--r-xl)] shadow-[var(--shadow-lg)] overflow-y-auto max-h-screen sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "ask" && (
          <div className="p-6 sm:p-8">
            <span className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" /> Soma
            </span>
            <h1 className="font-display text-[26px] font-bold tracking-tight leading-tight mt-4 text-[color:var(--text)]">
              What do you want this quiz to do?
            </h1>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5">
              Tell me who it&apos;s for and what they&apos;ll discover. Type it, or tap the mic and just say it.
            </p>
            <div className="mt-5">
              <SpeakOrType value={brief} onChange={setBrief} placeholder={PLACEHOLDER} maxLength={500} />
            </div>
            <div className="flex items-center justify-between mt-5 gap-3">
              <button onClick={generate} className="text-[length:var(--t-caption)] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--text)] border-b border-dashed border-[var(--border)]">
                Let Soma draft from my brand
              </button>
              <button onClick={generate} disabled={!brief.trim()} className="rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] font-extrabold text-[14px] px-5 py-3 hover:bg-[var(--brand-strong)] disabled:opacity-40 transition">
                Generate quiz
              </button>
            </div>
          </div>
        )}

        {phase === "generating" && (
          <div className="p-14 text-center">
            <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-[radial-gradient(circle_at_50%_40%,var(--brand),var(--brand-strong)_70%)] motion-safe:animate-pulse" />
            <h2 className="font-display text-[20px] font-bold text-[color:var(--text)]">Building your quiz…</h2>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5">Shaping 5 questions and 3 results around your brief, in your voice.</p>
          </div>
        )}

        {phase === "review" && draft && (
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" /> Soma
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--brand-strong)] bg-[var(--brand-soft)] rounded-full px-2.5 py-1">Draft</span>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="font-display text-[22px] font-bold tracking-tight mt-4 w-full bg-transparent outline-none border-b border-transparent focus:border-[var(--border)] text-[color:var(--text)]"
            />
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">{draft.config.intro.subhead}</p>

            <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-faint)] overflow-hidden">
              {draft.config.questions.map((q, i) => (
                <div key={q.id} className="flex gap-3 px-4 py-3 text-[14px] border-t first:border-t-0 border-[var(--border-faint)]">
                  <span className="font-display font-bold text-[color:var(--text-faint)] w-4">{i + 1}</span>
                  <span className="text-[color:var(--text)]">{q.text}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2.5">
              {draft.config.results.map((r, i) => (
                <div key={r.key} className="rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3.5 py-3">
                  <div className="text-[13px] font-extrabold text-[color:var(--text)]">→ {r.pillar_name}</div>
                  <input
                    value={ctaUrls[i] ?? ""}
                    onChange={(e) => setCtaUrls((prev) => prev.map((u, j) => (j === i ? e.target.value : u)))}
                    placeholder="Where should this result send them? (your offer link)"
                    className={`mt-2 w-full text-[13px] bg-[var(--surface-elevated)] rounded-[var(--r-sm)] px-3 py-2 outline-none border ${ctaUrls[i]?.trim() ? "border-[var(--border-faint)]" : "border-[var(--warning)]"}`}
                  />
                  {!ctaUrls[i]?.trim() && (
                    <div className="text-[11px] text-[color:var(--text-muted)] mt-1">No link yet — add your offer so this result doesn&apos;t dead-end.</div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button onClick={() => setPhase("ask")} className="text-[13px] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)]">↻ Regenerate</button>
              <div className="flex-1" />
              <button onClick={onClose} className="rounded-[var(--r-md)] border border-[var(--border)] px-4 py-2.5 text-[14px] font-bold text-[color:var(--text)] hover:bg-[var(--surface-deep)]">Discard</button>
              <button onClick={save} disabled={saving} className="rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] px-5 py-2.5 text-[14px] font-extrabold hover:bg-[var(--brand-strong)] disabled:opacity-50">{saving ? "Saving…" : "Save quiz"}</button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="p-8 text-center">
            {!hasBrandOs ? (
              <>
                <h2 className="font-display text-[20px] font-bold text-[color:var(--text)]">Soma needs your Brand OS first</h2>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2">It powers your quiz&apos;s voice and archetypes.</p>
                <a href="/brand-os" className="inline-block mt-5 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] px-5 py-3 text-[14px] font-extrabold">Build my Brand OS</a>
              </>
            ) : (
              <>
                <h2 className="font-display text-[20px] font-bold text-[color:var(--text)]">That didn&apos;t come together</h2>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2">{errorMsg ?? "Try again or tweak your brief."}</p>
                <div className="flex items-center justify-center gap-3 mt-5">
                  <button onClick={() => setPhase("ask")} className="rounded-[var(--r-md)] border border-[var(--border)] px-4 py-2.5 text-[14px] font-bold">Back</button>
                  <button onClick={generate} className="rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] px-5 py-2.5 text-[14px] font-extrabold">Try again</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
