// EditorialSettingsSection — numbered editorial break used to separate the
// big chapters of /settings ("No. 01 / Identity", "No. 02 / Voice", ...).
// Mirrors the editorial pattern used on /content but tuned for settings:
// no italic lede unless the section needs one, denser vertical rhythm.

import type { ReactNode } from "react";

type Props = {
  number: string | number;
  kicker: string;
  lede?: string;
  children: ReactNode;
};

export default function EditorialSettingsSection({ number, kicker, lede, children }: Props) {
  return (
    <section className="space-y-3">
      <header className="space-y-1.5 pt-2">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[color-mix(in_srgb,var(--text)_18%,transparent)]" aria-hidden />
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[color:var(--text-faint)] whitespace-nowrap">
            <span className="font-extrabold">No. {String(number).padStart(2, "0")}</span>
            <span className="opacity-40 font-light">/</span>
            <span className="font-semibold">{kicker}</span>
          </span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[color-mix(in_srgb,var(--text)_18%,transparent)]" aria-hidden />
        </div>
        {lede && (
          <p className="text-center font-light italic text-[length:var(--t-caption)] leading-relaxed text-[color:var(--text-muted)] max-w-xl mx-auto">
            {lede}
          </p>
        )}
      </header>
      <div className="space-y-2">
        {children}
      </div>
    </section>
  );
}
