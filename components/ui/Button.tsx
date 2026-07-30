"use client";

// Button — the canonical action element. Three variants:
//   - primary: navy bg, green text. The dominant action on a screen.
//   - ghost:   white bg, navy text, subtle border. Secondary actions.
//   - danger:  red on hover, no fill until hover. Destructive actions.
//
// Sizes: sm (compact, in tables/rows) and md (default, page CTAs).
//
// Built on top of design tokens — never hardcode colors here. If you
// need a new variant, add it to the list, not via inline style.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Optional icon shown before the label. Render as inline SVG. */
  leadingIcon?: ReactNode;
  /** Optional icon shown after the label. */
  trailingIcon?: ReactNode;
  /** When true, fills its container width. */
  block?: boolean;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  // Primary — green button + dark navy text. Matches the canonical brand
  // CTA pattern across the app (+ Add Lead, Mine my voice, hero buttons).
  // Was navy + green text before; that combo strained to read at the
  // lighter font weights from the polish pass and never felt confident.
  primary:
    "bg-[var(--brand)] text-[color:var(--text-inverse)] font-bold hover:enabled:bg-[var(--brand-strong)] hover:enabled:-translate-y-px transition disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "bg-[var(--surface-elevated)] text-[color:var(--text)] font-semibold border border-[var(--border)] hover:enabled:border-[var(--border-strong)] hover:enabled:bg-[var(--surface-deep)] transition disabled:opacity-50 disabled:cursor-not-allowed",
  danger:
    "bg-transparent text-[color:var(--danger)] font-semibold border border-[var(--danger)] hover:enabled:bg-[var(--danger-soft)] transition disabled:opacity-50 disabled:cursor-not-allowed",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 rounded-[var(--r-md)] gap-1.5",
  md: "text-sm px-5 py-2.5 rounded-[var(--r-md)] gap-2",
};

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    leadingIcon,
    trailingIcon,
    block = false,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        "inline-flex items-center justify-center whitespace-nowrap",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});

export default Button;
