// components/ui/PageHeader.tsx
//
// The one page header for every workspace screen.
//
// Before this existed, seven screens each rolled their own opening. Home led
// with a display-serif greeting, Settings with an eyebrow, Automations with a
// bare title, Voice with a small title plus an inline subtitle, Content with
// nothing but tabs, and Leads opened straight onto a status bar with no page
// title at all. Same product, seven front doors.
//
// Everything optional here is genuinely optional. A screen that wants only a
// title passes only a title.

import type { ReactNode } from "react";

type Props = {
  /** Small uppercase label above the title. Rendered in caps by CSS, so pass
   *  it in sentence case. */
  eyebrow?: string;
  title: ReactNode;
  /** One line under the title: a date, a count, a state. Keep it short. */
  meta?: ReactNode;
  /** Right-aligned slot for controls that belong to the whole page, such as
   *  the coach/business mode toggle. */
  actions?: ReactNode;
  /** Rendered under the meta line, still inside the header block. For invites
   *  and banners that are part of the greeting rather than the page body. */
  children?: ReactNode;
};

export default function PageHeader({ eyebrow, title, meta, actions, children }: Props) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <SectionLabel className="mb-2">{eyebrow}</SectionLabel>}

        <h1 className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
          {title}
        </h1>

        {meta && (
          <p className="mt-1 text-[length:var(--t-caption)] leading-[var(--leading-snug)] text-[color:var(--text-muted)]">
            {meta}
          </p>
        )}

        {children}
      </div>

      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}

/** The section eyebrow: "VITAL SIGNS", "SHIP THIS WEEK", "WHERE THE MONEY IS".
 *  One size and one tracking, both from tokens. */
export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[length:var(--t-eyebrow)] tracking-[var(--tracking-eyebrow)] font-semibold uppercase text-[color:var(--text-faint)] ${className}`}
    >
      {children}
    </div>
  );
}
