// Sacred zones — the moat: AI that refuses to write things.
//
// A coach can mark certain content kinds "sacred" (e.g. their weekly
// newsletter essay). For a sacred kind, the platform will NOT generate a
// net-new piece in that voice. It WILL still repurpose an existing piece
// into that kind — the teacher writes the source, the platform fans it out.
//
// Stored at cp_coaches.sacred_zones (jsonb array of content-kind strings).
// Enforced server-side in /api/content/draft. See
// docs/2026-05-14-resonance-layer-spec.md.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Content kinds that can be marked sacred. Mirrors the DraftKind union in
 *  /api/content/draft so the toggle and the enforcement speak the same
 *  vocabulary. */
export const SACRED_ZONE_KINDS = [
  "instagram_caption",
  "linkedin_post",
  "newsletter",
  "carousel",
] as const;

export type SacredZoneKind = (typeof SACRED_ZONE_KINDS)[number];

export const SACRED_ZONE_LABEL: Record<SacredZoneKind, string> = {
  instagram_caption: "Instagram caption",
  linkedin_post: "LinkedIn post",
  newsletter: "Newsletter",
  carousel: "Carousel",
};

/** Coerce an unknown jsonb value into a clean SacredZoneKind[]. */
export function parseSacredZones(value: unknown): SacredZoneKind[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is SacredZoneKind =>
      typeof v === "string" &&
      (SACRED_ZONE_KINDS as readonly string[]).includes(v),
  );
}

/** Load a coach's sacred zones. Empty array if the coach row or column is
 *  missing — sacred zones are opt-in, absence means "nothing is sacred". */
export async function loadSacredZones(
  db: SupabaseClient,
  coachId: string,
): Promise<SacredZoneKind[]> {
  const { data } = await db
    .from("cp_coaches")
    .select("sacred_zones")
    .eq("id", coachId)
    .maybeSingle();
  return parseSacredZones(data?.sacred_zones);
}

export function isSacred(zones: SacredZoneKind[], kind: string): boolean {
  return (SACRED_ZONE_KINDS as readonly string[]).includes(kind)
    ? zones.includes(kind as SacredZoneKind)
    : false;
}

export type SacredCheck =
  | { ok: true }
  | { ok: false; reason: string };

/** The enforcement rule. A net-new draft in a sacred kind is refused; a
 *  repurpose (a sourceContentId is present) is allowed. */
export function checkSacred(
  zones: SacredZoneKind[],
  kind: string,
  hasSource: boolean,
): SacredCheck {
  if (!isSacred(zones, kind)) return { ok: true };
  if (hasSource) return { ok: true };
  const label = SACRED_ZONE_LABEL[kind as SacredZoneKind] ?? kind;
  return {
    ok: false,
    reason:
      `${label} is a sacred zone. The AI can repurpose an existing piece ` +
      `into it, but it won't write a net-new one. Pick a source piece to ` +
      `repurpose, or unmark ${label} as sacred in Settings.`,
  };
}
