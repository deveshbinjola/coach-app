import type { Config } from "tailwindcss";

// Tailwind tokens are wired to the CSS variables defined in
// app/globals.css. Single source of truth — change a token in one
// place and it propagates through every utility class and every
// inline `var(--token)` reference.
//
// Why this matters: previously this config declared its own copies
// of `green` / `navy` / `bg` and they could (and did) drift away
// from globals.css. Devs reaching for what felt native would write
// the brand hex inline (bg-[#hex]) instead of bg-[var(--brand)]
// because the Tailwind path was clumsier than the hardcoded one.
// ~150 of the 222 hex violations in the recent audit traced back
// to that gap.
//
// With this config:
//   bg-brand        → background-color: var(--brand)
//   text-navy       → color: var(--navy)
//   border-border   → border-color: var(--border)
//   bg-surface-deep → background-color: var(--surface-deep)
//
// Opacity modifiers (`bg-brand/50`) WON'T work with this CSS-var
// pattern. If you need opacity, use the inline arbitrary value:
// `bg-[color-mix(in_srgb,var(--brand)_50%,transparent)]`. Worth
// the awkwardness to keep the token system canonical.

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        brand:           "var(--brand)",
        "brand-strong":  "var(--brand-strong)",
        // brand-soft is a pre-tinted background (~12% brand on transparent),
        // so callers don't have to compose `color-mix` for the common
        // "subtle brand wash" pattern.
        "brand-soft":    "var(--brand-soft)",

        // Navy
        navy:            "var(--navy)",
        "navy-soft":     "var(--navy-soft)",

        // Surfaces
        surface:            "var(--surface)",
        "surface-elevated": "var(--surface-elevated)",
        "surface-deep":     "var(--surface-deep)",
        "surface-dark":     "var(--surface-dark)",

        // Semantic
        success:       "var(--success)",
        warning:       "var(--warning)",
        danger:        "var(--danger)",
        "danger-soft": "var(--danger-soft)",
        info:          "var(--info)",

        // Legacy aliases — kept so the existing `bg-green` / `bg-bg`
        // usages don't break mid-sweep. Remove once all references
        // are migrated.
        green: "var(--brand)",
        bg:    "var(--surface)",
      },
      fontFamily: {
        sans:    ["Plus Jakarta Sans", "ui-sans-serif", "system-ui"],
        display: ["Fraunces", "Plus Jakarta Sans", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
