// lib/nav-unlocks.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type NavUnlocks = {
  voice: boolean;
  content: boolean;
  /** Raw milestone state — used by Settings page. */
  _milestones?: { hasLead: boolean; hasVoice: boolean };
};

export async function loadNavUnlocks(
  supabase: SupabaseClient,
  coachId: string,
): Promise<NavUnlocks> {
  const [{ count: leadCount }, { data: voiceProfile }, { data: coachRow }] =
    await Promise.all([
      supabase
        .from("cp_leads")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .limit(1),
      supabase
        .from("cp_voice_profiles")
        .select("id")
        .eq("coach_id", coachId)
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("cp_coaches")
        .select("nav_show_all")
        .eq("id", coachId)
        .maybeSingle(),
    ]);

  const showAll = (coachRow as { nav_show_all?: boolean } | null)?.nav_show_all === true;

  const hasLead = (leadCount ?? 0) > 0;
  const hasVoice = voiceProfile !== null;

  if (showAll) {
    return { voice: true, content: true, _milestones: { hasLead, hasVoice } };
  }

  return {
    voice: hasLead,
    content: hasLead && hasVoice,
    _milestones: { hasLead, hasVoice },
  };
}
