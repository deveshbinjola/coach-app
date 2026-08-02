"use client";

import { useEffect, useState } from "react";
import { Bug, X, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type Severity = "low" | "normal" | "high" | "critical";

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export default function BugReportButton() {
  const [authed, setAuthed] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("normal");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Only show for signed-in coaches. Public pages (login, referral) stay clean.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(Boolean(data.user)));
  }, []);

  function reset() {
    setTitle("");
    setDescription("");
    setSeverity("normal");
    setState("idle");
    setErrorMsg("");
  }

  function close() {
    setOpen(false);
    // Let the closing animation finish before clearing.
    setTimeout(reset, 200);
  }

  async function submit() {
    if (title.trim().length < 3) {
      setErrorMsg("Give the bug a short title.");
      setState("error");
      return;
    }
    setState("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          severity,
          page_url: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error || "Could not send. Try again.");
        setState("error");
        return;
      }
      setState("done");
      setTimeout(close, 1400);
    } catch {
      setErrorMsg("Network error. Try again.");
      setState("error");
    }
  }

  if (!authed) return null;

  return (
    <>
      {/* Floating trigger — clears the mobile tab bar, sits low-right on desktop */}
      <button
        type="button"
        aria-label="Report a bug"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] shadow-lg transition-colors hover:border-[color-mix(in_srgb,var(--brand)_45%,transparent)] hover:text-[color:var(--brand)] md:bottom-6 md:right-6"
      >
        <Bug className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm md:items-center"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Report a bug"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] bg-[var(--brand-soft)]">
                  <Bug className="h-4 w-4 text-[color:var(--brand)]" />
                </span>
                <h2 className="text-base font-bold text-[var(--text)]">Report a bug</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {state === "done" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-soft)]">
                  <Check className="h-6 w-6 text-[color:var(--brand)]" />
                </span>
                <p className="text-sm font-semibold text-[var(--text)]">Logged. Thank you.</p>
                <p className="text-xs text-[var(--text-muted)]">
                  It is in the queue. A fix gets proposed overnight.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
                    What went wrong
                  </label>
                  <input
                    type="text"
                    value={title}
                    autoFocus
                    maxLength={300}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Lead import fails on CSV upload"
                    className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors focus:border-[color-mix(in_srgb,var(--brand)_45%,transparent)]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
                    Details <span className="font-normal text-[var(--text-faint)]">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    rows={3}
                    maxLength={5000}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What were you doing? What did you expect to happen?"
                    className="w-full resize-none rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors focus:border-[color-mix(in_srgb,var(--brand)_45%,transparent)]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
                    Severity
                  </label>
                  <div className="flex gap-2">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSeverity(s.value)}
                        className={
                          "flex-1 rounded-[var(--r-md)] border px-2 py-1.5 text-xs font-semibold transition-colors " +
                          (severity === s.value
                            ? "border-[color-mix(in_srgb,var(--brand)_45%,transparent)] bg-[var(--brand-soft)] text-[color:var(--brand)]"
                            : "border-[var(--border-faint)] text-[var(--text-muted)] hover:border-[var(--border)]")
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {state === "error" && (
                  <p className="text-xs font-medium text-[color:var(--danger)]">{errorMsg}</p>
                )}

                <button
                  type="button"
                  onClick={submit}
                  disabled={state === "sending"}
                  className="mt-1 flex items-center justify-center gap-2 rounded-[var(--r-md)] bg-[var(--text)] px-4 py-2.5 text-sm font-bold text-[var(--text-inverse)] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {state === "sending" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Sending
                    </>
                  ) : (
                    "Send report"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
