// lib/nav-unlocks.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type NavUnlocks = {
  voice: boolean;
  content: boolean;
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

  if (showAll) {
    return { voice: true, content: true };
  }

  const hasLead = (leadCount ?? 0) > 0;
  const hasVoice = voiceProfile !== null;

  return {
    voice: hasLead,
    content: hasLead && hasVoice,
  };
}
