"use client";

// Modal / Sheet — the ONE overlay component. Centered modal on desktop,
// bottom sheet on mobile. No `confirm()` or `alert()` anywhere — they
// don't translate to native and look cheap.
//
// Usage:
//   <Modal open={x} onClose={() => setX(false)} title="Discard draft?">
//     <p>This can't be undone.</p>
//     <div className="flex gap-2 justify-end mt-5">
//       <Button variant="ghost" onClick={...}>Cancel</Button>
//       <Button variant="danger" onClick={...}>Discard</Button>
//     </div>
//   </Modal>

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Optional copy under the title (1-2 sentences). */
  description?: string;
  /** Max width of the modal. Default 'md' (480px). 'xl' is near-fullscreen
   *  for workspace-style flows like Compose. */
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
};

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  // `xl` — workspace mode. Wide enough for filter-rail + draft-pane layouts.
  // Mobile already goes full-width via the responsive root in this file.
  xl: "max-w-[1280px] sm:w-[95vw]",
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Focus the dialog when it opens for accessibility.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Backdrop — click to dismiss. Subtle, not opaque. */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[var(--navy)]/40 backdrop-blur-sm animate-[fadeIn_var(--t-base)_ease]"
        aria-hidden
      />

      {/* Panel — full-width sheet on mobile, centered card on desktop */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={[
          "relative w-full sm:w-auto sm:min-w-[400px]",
          SIZE_CLASSES[size],
          "bg-[var(--surface-elevated)] rounded-t-[var(--r-xl)] sm:rounded-[var(--r-xl)]",
          // outline-none plus a shadow on the same element overwrote the global
          // :focus-visible glow, so the dialog had no visible focus state at
          // all. Keep the elevation shadow, put the focus ring back explicitly.
          "shadow-[var(--shadow-lg)] outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
          "max-h-[90vh] overflow-y-auto",
          "animate-[slideUp_var(--t-base)_cubic-bezier(0.4,0,0.2,1)]",
        ].join(" ")}
      >
        <div className="p-5 sm:p-6">
          {title && (
            <h2
              id="modal-title"
              className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] leading-[var(--leading-tight)]"
            >
              {title}
            </h2>
          )}
          {description && (
            <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-2 leading-[var(--leading-base)]">
              {description}
            </p>
          )}
          <div className={title || description ? "mt-4" : ""}>{children}</div>
        </div>
      </div>

      {/* Animations defined inline to avoid a separate CSS file. */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px) }
          to { opacity: 1; transform: translateY(0) }
        }
        @media (max-width: 640px) {
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(100%) }
            to { opacity: 1; transform: translateY(0) }
          }
        }
      `}</style>
    </div>
  );
}
