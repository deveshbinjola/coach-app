// Tiny server helper to pull a coach's surface emphasis flags for the
// Header. Cheap query, called once per page. Returns undefined if the
// coach hasn't completed onboarding yet (Header treats absent emphasis
// as "all visible / all equal").

import type { SupabaseClient } from "@supabase/supabase-js";

export type HeaderEmphasis = { content: boolean; leads: boolean; clients: boolean };

export async function loadHeaderEmphasis(
  supabase: SupabaseClient,
  coachId: string,
): Promise<HeaderEmphasis | undefined> {
  const { data } = await supabase
    .from("cp_coaches")
    .select("emphasize_content, emphasize_leads, emphasize_clients")
    .eq("id", coachId)
    .maybeSingle();
  if (!data) return undefined;
  return {
    content: (data.emphasize_content as boolean | null) ?? true,
    leads:   (data.emphasize_leads as boolean | null) ?? true,
    clients: (data.emphasize_clients as boolean | null) ?? true,
  };
}
