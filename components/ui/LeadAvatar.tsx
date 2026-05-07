"use client";

// LeadAvatar — generated portrait via DiceBear, falls back to initials.
//
// Why DiceBear: the lead board reads as faceless when every conversation
// is "JS · MK · TR" in gray circles. Real photos aren't realistic at this
// stage (we don't have them). DiceBear seeds a stable illustrated portrait
// from the lead's name — same name always renders the same face — which
// turns the rescue queue into a board of *people* in the eye, not records.
//
// Style: "notionists" feels editorial-illustrated and matches our
// muted-warm aesthetic better than the cartoon styles. Free, no API key,
// no rate limit issues at our volume.

import { useState } from "react";

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = {
  sm: 28,
  md: 36,
  lg: 48,
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

type Props = {
  /** Full name. Used both as the DiceBear seed and to compute the
   *  initials fallback. Same name always renders the same face. */
  name: string;
  size?: Size;
  className?: string;
};

function initials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "•"
  );
}

export default function LeadAvatar({
  name,
  size = "md",
  className = "",
}: Props) {
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];
  // Seed the DiceBear style with the lead name. Background palette pulled
  // from our brand tokens so portraits sit on warm soft backgrounds, not
  // the default DiceBear pastel set.
  const url =
    `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name)}` +
    `&backgroundColor=f2f2ee,e5e5dd,fafaf8&radius=50`;

  if (failed) {
    return (
      <span
        aria-label={name}
        className={[
          "inline-flex items-center justify-center rounded-full font-extrabold shrink-0",
          "bg-[var(--surface-deep)] text-[color:var(--text-muted)]",
          SIZE_CLASSES[size],
          className,
        ].join(" ")}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      width={px}
      height={px}
      onError={() => setFailed(true)}
      className={[
        "rounded-full shrink-0 ring-1 ring-[var(--border)] bg-[var(--surface-deep)]",
        SIZE_CLASSES[size],
        className,
      ].join(" ")}
      aria-label={name}
    />
  );
}
