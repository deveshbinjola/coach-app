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
  const [{ count: leadCount }, { data: voiceProfile }] = await Promise.all([
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
  ]);

  const hasLead = (leadCount ?? 0) > 0;
  const hasVoice = voiceProfile !== null;

  // Full nav for everyone — no progressive reveal. Every section is visible
  // from the first load so the menu never changes shape under the coach.
  // (_milestones is still surfaced for the Settings page.)
  return { voice: true, content: true, _milestones: { hasLead, hasVoice } };
}
