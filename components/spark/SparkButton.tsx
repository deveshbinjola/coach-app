"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import SparkModal from "./SparkModal";
import type { BrandKit } from "@/lib/brand-kit";

type Props = {
  text: string;
  brandKit?: BrandKit | null;
  className?: string;
};

export default function SparkButton({ text, brandKit, className = "" }: Props) {
  const [open, setOpen] = useState(false);

  if (!text || text.length < 10) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Generate visual"
        className={`group inline-flex items-center gap-1.5 rounded-full border border-[var(--border-faint)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-muted)] transition hover:border-[var(--brand-strong)] hover:bg-[var(--brand-soft)] hover:text-[color:var(--brand-strong)] ${className}`}
      >
        <Sparkles size={12} className="transition group-hover:text-[color:var(--brand-strong)]" aria-hidden />
        Visualize
      </button>
      {open && (
        <SparkModal
          text={text}
          brandKit={brandKit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
