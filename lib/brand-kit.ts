// Brand kit registry — fonts + helpers.
//
// Coaches set tenant-level brand identity in /settings:
//   - 4 colors (primary / accent / background / text)
//   - Google Font family + weight
//   - Logo URL (uploaded to coach-brand-assets bucket)
//
// Stored on cp_coach_settings. The carousel renderer reads these values
// and applies them when carousel_default_style === 'brand_kit'.

export type BrandKit = {
  primaryHex:    string;
  accentHex:     string;
  backgroundHex: string;
  textHex:       string;
  fontFamily:    string;   // Google Font name e.g. "Playfair Display"
  fontWeight:    string;   // "400" | "500" | "600" | "700" | "800"
  logoUrl:       string | null;
};

/**
 * The accent a coach gets when they have not chosen one.
 *
 * This existed as a "#00FF41" literal in seven places (carousel rendering
 * client and server, funnel generation, the colour picker's own fallback).
 * Neon was the old agency brand and has not been the product's colour since
 * the warm-light system landed, so any coach who never opened the picker was
 * generating carousels and funnels in a colour we abandoned. That is wrong
 * output, not a stale style.
 *
 * One constant now, so the default cannot drift per call site again.
 */
export const DEFAULT_ACCENT_HEX = "#0B6E23";

/** The product's page colour. Matches --surface in globals.css and the paper
 *  on the landing, login and /meet, so a coach never sees the tone shift. */
export const DEFAULT_PAPER_HEX = "#FAF8F3";

/** Brand kit when none configured — neutral, prints anywhere. */
export const DEFAULT_BRAND_KIT: BrandKit = {
  primaryHex:    "#0A0F1C",
  accentHex:     "#0B6E23",
  backgroundHex: DEFAULT_PAPER_HEX,
  textHex:       "#0A0F1C",
  fontFamily:    "Plus Jakarta Sans",
  fontWeight:    "700",
  logoUrl:       null,
};

/** Read brand kit from a `cp_coach_settings` row (handles all nulls). */
export function brandKitFromSettings(settings: {
  brand_primary_hex?:    string | null;
  brand_accent_hex?:     string | null;
  brand_background_hex?: string | null;
  brand_text_hex?:       string | null;
  brand_font_family?:    string | null;
  brand_font_weight?:    string | null;
  brand_logo_url?:       string | null;
} | null | undefined): BrandKit {
  if (!settings) return DEFAULT_BRAND_KIT;
  return {
    primaryHex:    settings.brand_primary_hex    ?? DEFAULT_BRAND_KIT.primaryHex,
    accentHex:     settings.brand_accent_hex     ?? DEFAULT_BRAND_KIT.accentHex,
    backgroundHex: settings.brand_background_hex ?? DEFAULT_BRAND_KIT.backgroundHex,
    textHex:       settings.brand_text_hex       ?? DEFAULT_BRAND_KIT.textHex,
    fontFamily:    settings.brand_font_family    ?? DEFAULT_BRAND_KIT.fontFamily,
    fontWeight:    settings.brand_font_weight    ?? DEFAULT_BRAND_KIT.fontWeight,
    logoUrl:       settings.brand_logo_url       ?? null,
  };
}

// ============================================================
// CURATED GOOGLE FONT LIST
// 20 fonts hand-picked for coaches: 8 serif (editorial/embodied),
// 8 sans (modern/professional), 4 display (statement). Each loads
// from Google Fonts. Weights pre-declared so the <link> URL works.
// ============================================================

export type FontTone = "editorial" | "modern" | "warm" | "statement";

export type BrandFont = {
  family:  string;            // matches Google Fonts family name
  tone:    FontTone;
  weights: string[];          // weights to load (we always request these)
  preview: string;            // short tagline used in the picker
};

export const BRAND_FONTS: BrandFont[] = [
  // Serif — editorial / embodied / feminine
  { family: "Playfair Display", tone: "editorial", weights: ["400","500","700","800"], preview: "Editorial · timeless · feminine power" },
  { family: "Fraunces",         tone: "editorial", weights: ["400","500","700","800"], preview: "Modern serif · warm · soft authority" },
  { family: "Cormorant Garamond", tone: "editorial", weights: ["400","500","700"],     preview: "Classic · literary · luxurious" },
  { family: "DM Serif Display", tone: "statement",  weights: ["400"],                  preview: "Bold serif · poster type · statement" },
  { family: "Libre Caslon Text", tone: "editorial", weights: ["400","700"],            preview: "Newspaper-feel · trustworthy" },
  { family: "Lora",             tone: "warm",       weights: ["400","500","600","700"], preview: "Friendly serif · readable long-form" },

  // Sans — modern / professional / direct
  { family: "Plus Jakarta Sans", tone: "modern",    weights: ["400","500","600","700","800"], preview: "Modern sans · ElevateAI default" },
  { family: "Inter",            tone: "modern",     weights: ["400","500","600","700","800"], preview: "Clean sans · tech-feel · neutral" },
  { family: "Space Grotesk",    tone: "modern",     weights: ["400","500","600","700"],       preview: "Geometric sans · contemporary" },
  { family: "Manrope",          tone: "modern",     weights: ["400","500","600","700","800"], preview: "Rounded sans · friendly · clear" },
  { family: "Outfit",           tone: "modern",     weights: ["400","500","600","700","800"], preview: "Variable sans · soft geometric" },
  { family: "DM Sans",          tone: "modern",     weights: ["400","500","700"],             preview: "Low-contrast sans · approachable" },
  { family: "Work Sans",        tone: "modern",     weights: ["400","500","600","700"],       preview: "Subtle sans · professional" },

  // Warm / human
  { family: "Nunito",           tone: "warm",       weights: ["400","600","700","800"], preview: "Rounded · warm · approachable" },
  { family: "Karla",            tone: "warm",       weights: ["400","500","600","700"], preview: "Friendly sans · slightly informal" },

  // Display / statement
  { family: "Bricolage Grotesque", tone: "statement", weights: ["400","600","700","800"], preview: "Variable display · bold · expressive" },
  { family: "Crimson Pro",      tone: "editorial",  weights: ["400","600","700","800"], preview: "Classic serif · readable display" },
  { family: "Archivo",          tone: "statement",  weights: ["400","600","700","800"], preview: "Geometric display · strong presence" },
  { family: "Sora",             tone: "modern",     weights: ["400","500","600","700"], preview: "Geometric sans · futurist" },
  { family: "Albert Sans",      tone: "modern",     weights: ["400","500","600","700"], preview: "Refined sans · understated" },
];

/** Look up a font by family name. Returns null if not in the curated list. */
export function getBrandFont(family: string): BrandFont | null {
  return BRAND_FONTS.find((f) => f.family.toLowerCase() === family.toLowerCase()) ?? null;
}

/** Build the Google Fonts <link> URL that loads a font with all its weights.
 *  Falls back to Plus Jakarta Sans (always loaded sitewide) if family unknown. */
export function googleFontsHref(family: string): string {
  const font = getBrandFont(family);
  if (!font) {
    return "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
  }
  const familyParam = font.family.replace(/\s+/g, "+");
  const weightsParam = font.weights.join(";");
  return `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weightsParam}&display=swap`;
}

/** Build the CSS font-family stack — prepends the brand font, falls back
 *  to a sensible sibling if the font fails to load. */
export function fontFamilyStack(family: string): string {
  const font = getBrandFont(family);
  const fallback =
    font?.tone === "editorial" || font?.tone === "statement"
      ? "Georgia, 'Times New Roman', serif"
      : "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
  return `'${family}', ${fallback}`;
}

// ============================================================
// COLOR HELPERS
// ============================================================

/** Validate a hex color string. Accepts #RGB or #RRGGBB, case-insensitive. */
export function isValidHex(value: string): boolean {
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value);
}

/** Convert #RGB / #RRGGBB to a {r,g,b} triple. Returns null on invalid input. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isValidHex(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Rough relative luminance (0-1). Picks black/white text against a bg. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Returns the better-contrasting text color (#000 or #FFF) for a given bg. */
export function readableTextOn(bgHex: string): string {
  return luminance(bgHex) > 0.5 ? "#000000" : "#FFFFFF";
}
