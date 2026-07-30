// Avatar — initials chip in the navy/green brand pattern. Used in the
// header dropdown today; will spread to lead detail headers and elsewhere.

type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

type Props = {
  /** Full name. We compute up to 2 initials from this. */
  name: string;
  size?: Size;
  /** Inverted color (green bg, navy text). For dark contexts. */
  inverse?: boolean;
  className?: string;
};

export default function Avatar({
  name,
  size = "md",
  inverse = false,
  className = "",
}: Props) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "•";

  const colors = inverse
    ? "bg-[var(--brand)] text-[color:var(--text-inverse)]"
    : "bg-[var(--navy)] text-[color:var(--brand-bright)]";

  return (
    <span
      aria-label={name}
      className={[
        "inline-flex items-center justify-center rounded-full font-extrabold shrink-0",
        SIZE_CLASSES[size],
        colors,
        className,
      ].join(" ")}
    >
      {initials}
    </span>
  );
}
