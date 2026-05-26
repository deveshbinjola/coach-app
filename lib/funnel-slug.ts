// Slug generation for quiz funnels.
//
// Auto-generates a readable slug from the quiz title + random suffix.
// Coach can override with their own slug before publishing.
//
// Format: "honest-money-quiz-a7k2" (title kebab + 4-char random)

/**
 * Generate a funnel slug from a title string.
 * Produces: kebab-case-title-XXXX where XXXX is a 4-char random suffix.
 */
export function generateFunnelSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  const suffix = randomSuffix(4);
  return base ? `${base}-${suffix}` : suffix;
}

/**
 * Validate a coach-provided slug override.
 * Rules: 3-60 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens.
 */
export function validateSlug(slug: string): { valid: boolean; reason?: string } {
  if (slug.length < 3) return { valid: false, reason: "Slug must be at least 3 characters." };
  if (slug.length > 60) return { valid: false, reason: "Slug must be 60 characters or fewer." };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return { valid: false, reason: "Slug must be lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen." };
  }
  if (/--/.test(slug)) return { valid: false, reason: "Slug cannot contain consecutive hyphens." };
  return { valid: true };
}

function randomSuffix(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
