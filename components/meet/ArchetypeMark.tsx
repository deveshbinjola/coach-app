// ArchetypeMark — one flat geometric mark per assistant archetype.
// Drawn in a single color (defaults to paper, for use on the forest result
// card). Same geometry is mirrored in lib/meet-share-card.ts for the PNG.
//
//   closer          target: two rings + center dot (never lets one slip)
//   ghostwriter     three text bars, the last trailing off (writes like you)
//   operator        2x2 grid, one cell filled (systems, every box handled)
//   chief_of_staff  summit triangle over a baseline (sees the whole field)

import type { ArchetypeSlug } from "@/lib/assistant-interview";

export default function ArchetypeMark({
  slug,
  size = 44,
  color = "#FAF8F3",
}: {
  slug: ArchetypeSlug;
  size?: number;
  color?: string;
}) {
  const common = { width: size, height: size, viewBox: "0 0 44 44", fill: "none", "aria-hidden": true as const };

  switch (slug) {
    case "closer":
      return (
        <svg {...common}>
          <circle cx="22" cy="22" r="17" stroke={color} strokeWidth="3" />
          <circle cx="22" cy="22" r="9" stroke={color} strokeWidth="3" />
          <circle cx="22" cy="22" r="3" fill={color} />
        </svg>
      );
    case "ghostwriter":
      return (
        <svg {...common}>
          <rect x="6" y="10" width="32" height="4.5" rx="2.25" fill={color} />
          <rect x="6" y="20" width="24" height="4.5" rx="2.25" fill={color} />
          <rect x="6" y="30" width="13" height="4.5" rx="2.25" fill={color} />
          <circle cx="35" cy="32.25" r="3" fill={color} />
        </svg>
      );
    case "operator":
      return (
        <svg {...common}>
          <rect x="7" y="7" width="13" height="13" rx="3.5" stroke={color} strokeWidth="3" />
          <rect x="24" y="7" width="13" height="13" rx="3.5" stroke={color} strokeWidth="3" />
          <rect x="7" y="24" width="13" height="13" rx="3.5" stroke={color} strokeWidth="3" />
          <rect x="24" y="24" width="13" height="13" rx="3.5" fill={color} />
        </svg>
      );
    case "chief_of_staff":
      return (
        <svg {...common}>
          <path d="M22 8 L36 28 H8 Z" stroke={color} strokeWidth="3" strokeLinejoin="round" />
          <rect x="6" y="33" width="32" height="4" rx="2" fill={color} />
        </svg>
      );
  }
}
