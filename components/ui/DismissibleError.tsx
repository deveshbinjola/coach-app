"use client";

// DismissibleError — replaces native window.alert() in error paths.
//
// Why: every alert() call breaks the brand (Plus Jakarta + Fraunces +
// brand colors → then a bland system dialog pops up). It's also
// blocking, modal, and offers no recovery affordance beyond an OK
// button. This component renders an inline banner that matches the
// design system, animates in, and dismisses via button or auto-timer.
//
// Two ways to use:
//
// 1. Component form (when you already manage error state):
//    const [err, setErr] = useState<string | null>(null);
//    <DismissibleError message={err} onDismiss={() => setErr(null)} />
//
// 2. Hook form (for the common "set error from a try/catch" pattern):
//    const { error, setError, ErrorBanner } = useError();
//    try { ... } catch (e) { setError((e as Error).message); }
//    return <>{ErrorBanner} ...</>;

import { useEffect, useState, type ReactElement } from "react";
import { X } from "lucide-react";

type Props = {
  /** Error text. When null, the banner doesn't render. */
  message: string | null;
  /** Called when the dismiss button is clicked or the auto-timer expires. */
  onDismiss: () => void;
  /** Optional title shown above the message. Default: "Something went wrong." */
  title?: string;
  /** When true, the banner auto-dismisses after `autoDismissMs`.
   *  Default: false. Use for clipboard / non-critical errors. */
  autoDismiss?: boolean;
  /** Auto-dismiss delay. Default: 5000. */
  autoDismissMs?: number;
};

export default function DismissibleError({
  message,
  onDismiss,
  title = "Something went wrong.",
  autoDismiss = false,
  autoDismissMs = 5000,
}: Props) {
  useEffect(() => {
    if (!message || !autoDismiss) return;
    const id = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(id);
  }, [message, autoDismiss, autoDismissMs, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 flex items-start gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[length:var(--t-caption)] font-extrabold text-[#B42318]">
          {title}
        </p>
        <p className="text-[length:var(--t-caption)] text-[#B42318] mt-0.5 leading-[var(--leading-relaxed)] break-words">
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 rounded-[var(--r-sm)] p-1 text-[#B42318] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] transition"
      >
        <X size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

// ── useError hook ──────────────────────────────────────────────────────────
//
// Convenience: bundles state + render into one call. Saves the
// 3-line dance at every call site.

type UseErrorReturn = {
  error: string | null;
  setError: (msg: string | null) => void;
  /** Render this in JSX where you want the banner to appear. */
  ErrorBanner: ReactElement;
};

export function useError(opts?: { autoDismiss?: boolean }): UseErrorReturn {
  const [error, setError] = useState<string | null>(null);
  const ErrorBanner = (
    <DismissibleError
      message={error}
      onDismiss={() => setError(null)}
      autoDismiss={opts?.autoDismiss}
    />
  );
  return { error, setError, ErrorBanner };
}
