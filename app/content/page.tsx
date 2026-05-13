import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import ContentWorkspace from "@/components/content/ContentWorkspace";
import type { ResonanceHook, StripPillar } from "@/components/content/BrandOsPillarStrip";
import type { BuyerMirror } from "@/components/content/BuyerMirrorBanner";
import type { CoachSettings, Content, Lead, VoiceProfile, VoiceTrainingSource } from "@/lib/types";
import type { BrandOsSynthesis } from "@/app/api/brand-os/synthesize/route";
import { detectCorpusDelta, type BrandVoiceOverlay, type VoiceCorpusSnapshot } from "@/lib/brand-os/voice-overlay";

export const runtime = 'edge';

export const dynamic = "force-dynamic";

export default async function ContentPage({
  searchParams,
}: {
  searchParams?: { lead?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Load workspace data + Brand OS overlay + latest synthesis (for hooks)
  // in one round trip.
  const [
    profileRes, leadsRes, contentRes, trainingSourcesRes, settingsRes,
    coachRes, latestRunRes,
  ] = await Promise.all([
    supabase
      .from("cp_voice_profiles")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cp_leads")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("cp_content")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("cp_voice_training_sources")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("ensure_coach_settings").single(),
    supabase
      .from("cp_coaches")
      .select("brand_voice_overlay, brand_voice_corpus_baseline")
      .eq("user_id", user.id)
      .maybeSingle(),
    // Latest completed Brand OS run for this coach, for the resonance hooks.
    supabase
      .from("cp_brand_os_runs")
      .select("synthesis_json, synthesized_at")
      .eq("coach_id", user.id)
      .not("synthesis_json", "is", null)
      .order("synthesized_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const overlay = (coachRes.data?.brand_voice_overlay as BrandVoiceOverlay | null) ?? null;
  const corpusBaseline = (coachRes.data?.brand_voice_corpus_baseline as VoiceCorpusSnapshot | null) ?? null;
  const synthesis = (latestRunRes.data?.synthesis_json as BrandOsSynthesis | null) ?? null;

  // Detect whether the coach has imported enough new voice samples since
  // their last overlay save to warrant a re-tune banner. Threshold lives
  // in detectCorpusDelta — currently 3+ new sources OR 5000+ new chars.
  const corpusDelta = overlay
    ? await detectCorpusDelta(supabase, user.id, corpusBaseline)
    : null;
  const voiceRetune = corpusDelta
    ? { newSources: corpusDelta.new_sources, newChars: corpusDelta.new_chars }
    : null;

  // Pillars come from the overlay (already trimmed). Hooks from the full
  // synthesis (overlay doesn't carry hooks — they're content angles, not
  // voice DNA).
  const brandPillars: StripPillar[] = overlay?.pillars ?? [];
  const brandHooks: ResonanceHook[] = (synthesis?.resonance_hooks ?? []).slice(0, 5).map((h) => ({
    headline: h.headline,
    angle:    h.angle,
    pillar:   h.pillar,
  }));
  const hasRunBrandOs = Boolean(overlay || synthesis);

  // Buyer Mirror — pulled from the full synthesis so we can show body
  // state + the 11pm sentence + graveyard in the expandable banner.
  // Falls back to overlay fields if synthesis isn't present (defensive).
  const buyerMirror: BuyerMirror | null =
    synthesis?.buyer_mirror
      ? {
          name:              synthesis.buyer_mirror.name ?? "",
          one_line_portrait: synthesis.buyer_mirror.one_line_portrait ?? "",
          body_state:        synthesis.buyer_mirror.body_state ?? "",
          secret_sentence:   synthesis.buyer_mirror.secret_sentence ?? "",
          graveyard:         synthesis.buyer_mirror.graveyard ?? "",
        }
      : overlay
        ? {
            name:              overlay.buyer_mirror_name,
            one_line_portrait: overlay.buyer_mirror_portrait,
            body_state: "",
            secret_sentence: "",
            graveyard: "",
          }
        : null;

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <ContentWorkspace
          profile={(profileRes.data as VoiceProfile | null) ?? null}
          leads={(leadsRes.data as Lead[] | null) ?? []}
          content={(contentRes.data as Content[] | null) ?? []}
          trainingSources={(trainingSourcesRes.data as VoiceTrainingSource[] | null) ?? []}
          seedLeadId={searchParams?.lead ?? ""}
          settings={(settingsRes.data as CoachSettings | null) ?? null}
          brandPillars={brandPillars}
          brandHooks={brandHooks}
          hasRunBrandOs={hasRunBrandOs}
          buyerMirror={buyerMirror}
          voiceRetune={voiceRetune}
        />
      </main>
    </div>
  );
}
