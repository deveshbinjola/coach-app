// Form primitives — Input, Textarea, Select. All consume design tokens.
// Linear-style: subtle border, soft focus ring (no harsh blue outline),
// generous touch target (40-44px tall on default size).

import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from "react";

const FIELD_BASE =
  "w-full bg-[var(--surface-elevated)] text-[color:var(--text)] " +
  "border border-[var(--border)] rounded-[var(--r-md)] " +
  "px-3 py-2.5 text-[length:var(--t-body)] " +
  "placeholder:text-[color:var(--text-faint)] " +
  "transition-[border-color,box-shadow] duration-[120ms] " +
  "focus:outline-none focus:border-[var(--brand-strong)] " +
  "disabled:bg-[var(--surface-deep)] disabled:cursor-not-allowed";

// ---------- Input ----------

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Optional label rendered above the input. */
  label?: string;
  /** Helper text below the input (e.g., format hints). */
  hint?: string;
  /** Validation error — when present, replaces hint and adds danger styling. */
  error?: string;
  /** Optional inline icon at the start of the input. */
  leadingIcon?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leadingIcon, className = "", id, ...rest },
  ref
) {
  const fieldId = id ?? rest.name;
  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={fieldId}
          className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leadingIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)] pointer-events-none">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={hint || error ? `${fieldId}-hint` : undefined}
          className={[
            FIELD_BASE,
            leadingIcon ? "pl-9" : "",
            error ? "border-[var(--danger)]" : "",
            className,
          ].join(" ")}
          {...rest}
        />
      </div>
      {(hint || error) && (
        <p
          id={`${fieldId}-hint`}
          className={`text-[length:var(--t-caption)] ${
            error ? "text-[color:var(--danger)]" : "text-[color:var(--text-muted)]"
          }`}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});

// ---------- Textarea ----------

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, hint, error, className = "", id, ...rest }, ref) {
    const fieldId = id ?? rest.name;
    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={fieldId}
            className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={hint || error ? `${fieldId}-hint` : undefined}
          className={[
            FIELD_BASE,
            "leading-[var(--leading-relaxed)] resize-y",
            error ? "border-[var(--danger)]" : "",
            className,
          ].join(" ")}
          {...rest}
        />
        {(hint || error) && (
          <p
            id={`${fieldId}-hint`}
            className={`text-[length:var(--t-caption)] ${
              error ? "text-[color:var(--danger)]" : "text-[color:var(--text-muted)]"
            }`}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

// ---------- Select ----------

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, hint, error, className = "", id, children, ...rest },
    ref
  ) {
    const fieldId = id ?? rest.name;
    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={fieldId}
            className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={hint || error ? `${fieldId}-hint` : undefined}
          className={[
            FIELD_BASE,
            "appearance-none bg-[length:14px_14px] bg-no-repeat bg-[right_12px_center] pr-9",
            error ? "border-[var(--danger)]" : "",
            className,
          ].join(" ")}
          // Inline data-uri chevron so we don't need an extra asset.
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235A5A6E' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
          }}
          {...rest}
        >
          {children}
        </select>
        {(hint || error) && (
          <p
            id={`${fieldId}-hint`}
            className={`text-[length:var(--t-caption)] ${
              error ? "text-[color:var(--danger)]" : "text-[color:var(--text-muted)]"
            }`}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);
