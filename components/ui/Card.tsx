// Card — the canonical container. Two variants:
//   - flat (default): subtle border, no shadow. Granola-style restraint.
//   - elevated: soft shadow, no border. For "look at me" cards (the
//     auto-draft preview, the Just-landed band, etc.)
//
// Sizes refer to padding density. Most cards use md.

import type { HTMLAttributes, ReactNode } from "react";

type Variant = "flat" | "elevated";
type Padding = "none" | "sm" | "md" | "lg";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  padding?: Padding;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  flat: "bg-[var(--surface-elevated)] border border-[var(--border)] rounded-[var(--r-lg)]",
  elevated:
    "bg-[var(--surface-elevated)] rounded-[var(--r-lg)] shadow-[var(--shadow-md)]",
};

const PADDING_CLASSES: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-7",
};

export default function Card({
  variant = "flat",
  padding = "md",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <div
      className={[VARIANT_CLASSES[variant], PADDING_CLASSES[padding], className].join(
        " "
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
