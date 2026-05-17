// /voice, single in-house Voice page.
//
// Replaced the iframe Brand OS embed with a native 5-question setup flow.
// The marketing site's Brand OS Agent still exists at elevateaisystem.com
// for top-of-funnel acquisition. coach-app builds the voice profile itself
// now so the in-app experience never depends on an external iframe.
//
// Two states:
//   1. No active cp_voice_profiles row, Native VoiceSetupFlow (5 Qs) with
//      the captions corpus path tucked below as the alternate route.
//   2. Active profile exists, Profile card + a "Refine voice"
//      affordance that lets the coach re-run setup any time.
//
// The previously separate /voice/mine page now redirects here. The captions
// path is inlined as an expandable section so coaches see all paths in one
// place: 5 questions, or paste captions.

import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import VoiceHomePanel from "@/components/VoiceHomePanel";
import type {
  Content,
  Lead,
  LeadMessage,
  VoiceProfile,
  VoiceTrainingSource,
} from "@/lib/types";
import type { BrandVoiceOverlay } from "@/lib/brand-os/voice-overlay";
import { resolveBrandOsRunState } from "@/lib/brand-os/run-state";

export const runtime = 'edge';

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // One active profile per coach. `maybeSingle()` returns null cleanly when
  // the coach hasn't set up their voice yet. No error, no throw.
  const { data: profile } = user?.id
    ? await supabase
        .from("cp_voice_profiles")
        .select("*")
        .eq("coach_id", user.id)
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const [editMessagesRes, contentRes, leadsRes, trainingSourcesRes, coachRowRes] = user?.id
    ? await Promise.all([
        supabase
          .from("cp_lead_messages")
          .select(
            "id, lead_id, coach_id, channel, direction, content, ai_drafted, sent_at, purpose, external_id, synced_from, original_draft, was_edited, created_at"
          )
          .eq("coach_id", user.id)
          .eq("ai_drafted", true)
          .not("original_draft", "is", null)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("cp_content")
          .select("*")
          .eq("coach_id", user.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("cp_leads")
          .select("*")
          .eq("coach_id", user.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("cp_voice_training_sources")
          .select("*")
          .eq("coach_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("cp_coaches")
          .select("voice_profile_slug, brand_voice_overlay")
          .eq("user_id", user.id)
          .maybeSingle(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: null }];

  // Resolve Brand OS state once on the server so the CTA + voice-lock both
  // know where the coach is (none / in_progress / complete_no_synthesis /
  // complete). Cheap query, runs in parallel with the rest above.
  const brandOsState = user?.id
    ? await resolveBrandOsRunState(supabase, user.id)
    : { kind: "none" as const };
  const brandOverlay = ((coachRowRes?.data as { brand_voice_overlay?: BrandVoiceOverlay | null } | null)?.brand_voice_overlay ?? null) as BrandVoiceOverlay | null;

  return (
    <div className="min-h-screen">
      <Header
        email={user?.email ?? ""}
        name={userDisplayName(user?.user_metadata)}
        avatarUrl={userAvatarUrl(user?.user_metadata)}
      />
      <main className="max-w-5xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
            Voice
          </h1>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
            Source of truth for every AI draft and outreach.
          </p>
        </div>

        <VoiceHomePanel
          profile={(profile as VoiceProfile | null) ?? null}
          messages={(editMessagesRes.data as LeadMessage[] | null) ?? []}
          content={(contentRes.data as Content[] | null) ?? []}
          leads={(leadsRes.data as Lead[] | null) ?? []}
          trainingSources={(trainingSourcesRes.data as VoiceTrainingSource[] | null) ?? []}
          voiceProfileSlug={
            ((coachRowRes?.data as { voice_profile_slug?: string } | null)?.voice_profile_slug as
              | "m-coach-m-aud" | "m-coach-w-aud" | "f-coach-w-aud" | "f-coach-m-aud" | "i-coach-single" | "i-coach-mixed"
              | undefined) ?? "m-coach-m-aud"
          }
          brandOverlay={brandOverlay}
          brandOsState={brandOsState}
        />
      </main>
    </div>
  );
}
