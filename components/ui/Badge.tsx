// Badge — small status pill. Replaces the ad-hoc <span> badges scattered
// across the app. Six tones map to semantic meaning, not arbitrary color
// preferences. Pick the tone that matches the meaning.

import type { HTMLAttributes, ReactNode } from "react";

type Tone =
  | "neutral" // generic label
  | "brand"   // active / on / good
  | "warning" // attention needed
  | "danger"  // overdue / problem
  | "info"    // informational
  | "muted";  // archived / inactive

type Size = "xs" | "sm";

type Props = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  tone?: Tone;
  size?: Size;
  /** When true, renders UPPERCASE with letter-spacing. Use for status labels. */
  uppercase?: boolean;
  children: ReactNode;
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral:
    "bg-[var(--surface-deep)] text-[color:var(--text)] border border-[var(--border-faint)]",
  brand:
    "bg-[var(--brand-soft)] text-[color:var(--success)] border border-[color-mix(in_srgb,var(--brand)_30%,transparent)]",
  warning:
    "bg-[var(--warning-soft)] text-[#936300] border border-[color-mix(in_srgb,var(--warning)_25%,transparent)]",
  danger:
    "bg-[var(--danger-soft)] text-[#B42318] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)]",
  info:
    "bg-[var(--info-soft)] text-[color:var(--info)] border border-[color-mix(in_srgb,var(--info)_25%,transparent)]",
  muted:
    "bg-[var(--surface-deep)] text-[color:var(--text-muted)] border border-[var(--border-faint)]",
};

const SIZE_CLASSES: Record<Size, string> = {
  xs: "text-[10px] px-1.5 py-0.5 rounded-[var(--r-sm)]",
  sm: "text-xs px-2 py-1 rounded-[var(--r-sm)]",
};

export default function Badge({
  tone = "neutral",
  size = "sm",
  uppercase = false,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 font-bold whitespace-nowrap",
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
        uppercase ? "uppercase tracking-wider" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </span>
  );
}
