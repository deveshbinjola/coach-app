"use client";

// Confirm — replaces native window.confirm() with a styled, async-aware
// modal. Use the useConfirm() hook for the imperative-await ergonomics
// callers actually want.
//
// Pattern at call site:
//
//   const { ConfirmDialog, askConfirm } = useConfirm();
//
//   async function deleteKey() {
//     const ok = await askConfirm({
//       title:        "Revoke this key?",
//       description:  "Any agent using it will start failing immediately.",
//       confirmLabel: "Revoke",
//       destructive:  true,
//     });
//     if (!ok) return;
//     // ... actual delete logic
//   }
//
//   return (
//     <>
//       ...
//       <ConfirmDialog />
//     </>
//   );
//
// Why this shape: window.confirm() is sync but blocks. Modal-based
// confirm has to be async (the user takes time to click). Wrapping
// it as a Promise<boolean> keeps the call site reading top-to-bottom
// — just `await askConfirm(...)`, then act on the answer — instead
// of inverting control flow into onConfirm callbacks.

import { useState, type ReactElement } from "react";
import Modal from "./Modal";

export type ConfirmOptions = {
  title:        string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?:  string;
  /** Renders the confirm button in danger-red. Use for delete /
   *  revoke / disconnect / pause-webhook style actions. */
  destructive?: boolean;
};

type State = {
  open:    boolean;
  options: ConfirmOptions;
  resolve: (v: boolean) => void;
};

type UseConfirmReturn = {
  /** Render this in JSX once per component. */
  ConfirmDialog: ReactElement;
  /** Call from event handlers; await the boolean result. */
  askConfirm:    (options: ConfirmOptions) => Promise<boolean>;
};

export function useConfirm(): UseConfirmReturn {
  const [state, setState] = useState<State | null>(null);

  function askConfirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, options, resolve });
    });
  }

  function close(value: boolean) {
    if (state) state.resolve(value);
    setState(null);
  }

  const ConfirmDialog = (
    <Modal
      open={state?.open ?? false}
      onClose={() => close(false)}
      size="sm"
      title={state?.options.title ?? ""}
    >
      {state ? (
        <div className="space-y-5">
          {state.options.description && (
            <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)]">
              {state.options.description}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => close(false)}
              className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] hover:bg-[var(--surface-deep)] transition"
            >
              {state.options.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              className={
                state.options.destructive
                  ? "inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] bg-[var(--danger)] text-white text-[length:var(--t-caption)] font-extrabold hover:bg-[color-mix(in_srgb,var(--danger)_85%,black)] transition"
                  : "inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-extrabold hover:bg-[var(--brand-strong)] transition"
              }
            >
              {state.options.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );

  return { ConfirmDialog, askConfirm };
}
