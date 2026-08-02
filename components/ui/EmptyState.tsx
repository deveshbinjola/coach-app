// EmptyState — what a coach sees before they have anything.
//
// Six surfaces had a bespoke empty state and three had none. The bespoke ones
// drifted: different type scale, different spacing, some with an action and
// some leaving the coach staring at a sentence with nothing to click.
//
// An empty state has one job, and it is not decoration: say what goes here,
// and give the way to put something here. The action is not optional in
// practice, which is why it sits in the signature rather than in a wrapper.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  /** lucide only, to match the rest of the app. Never an emoji. */
  icon?: LucideIcon;
  title: string;
  /** One sentence. If it needs two, the surface is doing too much. */
  body?: string;
  /** The way out. Omit only when the coach genuinely cannot act yet. */
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({ icon: Icon, title, body, action, className = "" }: Props) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)]",
        "border border-dashed border-[var(--border)] bg-[var(--surface-elevated)]",
        "px-6 py-12 text-center",
        className,
      ].join(" ")}
    >
      {Icon && (
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-soft)]"
          aria-hidden
        >
          <Icon size={20} strokeWidth={1.8} className="text-[color:var(--brand)]" />
        </span>
      )}
      <h3 className="font-display text-lg font-bold text-[color:var(--text)]">{title}</h3>
      {body && (
        <p className="max-w-[42ch] text-sm leading-relaxed text-[color:var(--text-muted)]">{body}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
