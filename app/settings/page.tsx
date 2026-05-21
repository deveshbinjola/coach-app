// /settings — redesigned.
//
// Status-aware collapsible cards inside editorial-numbered sections. The
// idea: Settings is a map, not a scroll. Each panel collapses to a single
// row showing its title, status pip, one-line summary, and an expand
// chevron. Rows that need attention land on top and open by default.
// Completed rows sit at the bottom, closed.
//
// Resonance management (pain points, tags, sacred zones) moved out of
// Settings — pain points + tags live on /leads/resonance now, sacred
// zones live inline on /content. Settings keeps cross-cutting controls
// only: identity, brand, delivery, advanced.

import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import SettingsForm from "@/components/SettingsForm";
import AudienceSettingsPanel from "@/components/settings/AudienceSettingsPanel";
import BrandKitPanel from "@/components/settings/BrandKitPanel";
import EmailSendingPanel from "@/components/settings/EmailSendingPanel";
import NavigationSettingsPanel from "@/components/settings/NavigationSettingsPanel";
import OnboardingResetPanel from "@/components/settings/OnboardingResetPanel";
import CollapsibleCard, { type SettingsStatus } from "@/components/settings/CollapsibleCard";
import EditorialSettingsSection from "@/components/settings/EditorialSettingsSection";
import type { CoachSettings, CoachIntegration } from "@/lib/types";
import type { AudienceSelf, AudienceServes, VoiceProfileSlug } from "@/lib/voice-profiles";
import { DEFAULT_BRAND_KIT } from "@/lib/brand-kit";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const STATUS_WEIGHT: Record<SettingsStatus, number> = {
  attention: 0,
  set_up: 1,
  done: 2,
  neutral: 3,
};

type Slot = {
  key: string;
  title: string;
  status: SettingsStatus;
  ctaLabel?: string;
  summary?: string;
  panel: React.ReactNode;
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { gmail?: string; reason?: string; upgrade?: string };
}) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch settings row + Gmail + audience + Resend status in parallel.
  // The resend select runs against cp_coach_settings so we can compute the
  // delivery status server-side and order the card correctly.
  const [
    { data: settings, error },
    { data: gmailIntegration },
    { data: coachRow },
    { data: resendRow },
  ] = await Promise.all([
    supabase.rpc("ensure_coach_settings").single(),
    supabase
      .from("cp_coach_integrations")
      .select("*")
      .eq("provider", "gmail")
      .maybeSingle(),
    user?.id
      ? supabase
          .from("cp_coaches")
          .select("audience_self, audience_serves, voice_profile_slug, nav_show_all")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user?.id
      ? supabase
          .from("cp_coach_settings")
          .select("resend_api_key_ciphertext, resend_from_email")
          .eq("coach_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const navUnlocks = user?.id
    ? await loadNavUnlocks(supabase, user.id)
    : { voice: false, content: false };
  if (user?.id) {
    try { cookies().set("nav-unlocks", JSON.stringify(navUnlocks), { path: "/", sameSite: "lax", maxAge: 86400 }); } catch {}
  }

  const hasLead = navUnlocks._milestones?.hasLead ?? false;
  const hasVoice = navUnlocks._milestones?.hasVoice ?? false;
  const showAllNav = (coachRow as { nav_show_all?: boolean } | null)?.nav_show_all === true;

  const audienceSelf = (coachRow as { audience_self?: string } | null)?.audience_self as AudienceSelf | null ?? null;
  const audienceServes = (coachRow as { audience_serves?: string } | null)?.audience_serves as AudienceServes | null ?? null;
  const voiceProfileSlug = (coachRow as { voice_profile_slug?: string } | null)?.voice_profile_slug as VoiceProfileSlug | null ?? null;

  // ─── Compute statuses + summaries ────────────────────────────────────

  // Identity: audience
  const audienceCount = [audienceSelf, audienceServes, voiceProfileSlug].filter(Boolean).length;
  const audienceStatus: SettingsStatus =
    audienceCount === 0 ? "attention" : audienceCount < 3 ? "set_up" : "done";
  const audienceCta = audienceStatus === "attention" ? "Pick your audience" : undefined;
  const audienceSummary = audienceCount === 0
    ? "Not set — your voice and surfaces will be generic."
    : audienceServes && voiceProfileSlug
      ? `Serves ${labelServes(audienceServes)} · voice: ${voiceProfileSlug}`
      : `${audienceCount} of 3 fields set`;

  // Identity: brand kit
  const s = (settings ?? {}) as Partial<CoachSettings>;
  const hasLogo = Boolean(s.brand_logo_url);
  const customPrimary = s.brand_primary_hex && s.brand_primary_hex.toLowerCase() !== DEFAULT_BRAND_KIT.primaryHex.toLowerCase();
  const brandStatus: SettingsStatus = hasLogo ? "done" : customPrimary ? "set_up" : "set_up";
  const brandSummary = `${s.brand_primary_hex ?? DEFAULT_BRAND_KIT.primaryHex} · ${s.brand_font_family ?? DEFAULT_BRAND_KIT.fontFamily}${hasLogo ? " · logo uploaded" : ""}`;

  // Delivery: email sending
  const hasByok = Boolean(resendRow && (resendRow as Record<string, unknown>).resend_api_key_ciphertext && (resendRow as Record<string, unknown>).resend_from_email);
  const hasPlatform = true; // RESEND_API_KEY assumed configured for platform fallback
  const emailStatus: SettingsStatus = hasByok ? "done" : hasPlatform ? "set_up" : "attention";
  const emailCta = !hasByok && !hasPlatform ? "Connect" : undefined;
  const emailSummary = hasByok
    ? `Sending from ${(resendRow as Record<string, unknown>)?.resend_from_email as string}`
    : hasPlatform
      ? "Using Elevate sender (fallback)"
      : "Email won't send — connect Resend";

  // Advanced (Gmail / reach / API keys): always neutral
  const advancedStatus: SettingsStatus = "neutral";
  const advancedSummary = gmailIntegration
    ? `Gmail connected · reach target ${(settings as CoachSettings | null)?.reach_target_per_week ?? "—"}/wk`
    : `Reach target ${(settings as CoachSettings | null)?.reach_target_per_week ?? "—"}/wk · Gmail not connected`;

  // ─── Build slots ─────────────────────────────────────────────────────

  const identitySlots: Slot[] = [
    {
      key: "audience",
      title: "Audience",
      status: audienceStatus,
      ctaLabel: audienceCta,
      summary: audienceSummary,
      panel: (
        <AudienceSettingsPanel
          initialSelf={audienceSelf}
          initialServes={audienceServes}
          initialSlug={voiceProfileSlug}
        />
      ),
    },
    {
      key: "brand_kit",
      title: "Brand kit",
      status: brandStatus,
      summary: brandSummary,
      panel: (
        <BrandKitPanel
          initial={{
            primary:    s.brand_primary_hex    ?? DEFAULT_BRAND_KIT.primaryHex,
            accent:     s.brand_accent_hex     ?? DEFAULT_BRAND_KIT.accentHex,
            background: s.brand_background_hex ?? DEFAULT_BRAND_KIT.backgroundHex,
            text:       s.brand_text_hex       ?? DEFAULT_BRAND_KIT.textHex,
            fontFamily: s.brand_font_family    ?? DEFAULT_BRAND_KIT.fontFamily,
            fontWeight: s.brand_font_weight    ?? DEFAULT_BRAND_KIT.fontWeight,
            logoUrl:    s.brand_logo_url       ?? null,
          }}
        />
      ),
    },
  ];

  const deliverySlots: Slot[] = [
    {
      key: "email",
      title: "Email sending",
      status: emailStatus,
      ctaLabel: emailCta,
      summary: emailSummary,
      panel: <EmailSendingPanel />,
    },
  ];

  const advancedSlots: Slot[] = [
    {
      key: "advanced",
      title: "Integrations · reach · webhooks",
      status: advancedStatus,
      summary: advancedSummary,
      panel: (
        <SettingsForm
          initial={settings as CoachSettings}
          gmailIntegration={(gmailIntegration as CoachIntegration | null) ?? null}
          gmailFlash={
            searchParams.gmail
              ? { state: searchParams.gmail, reason: searchParams.reason }
              : null
          }
          upgradeIntent={searchParams.upgrade ?? null}
        />
      ),
    },
    {
      key: "navigation",
      title: "Navigation",
      status: (hasLead && hasVoice ? "done" : "set_up") as SettingsStatus,
      summary: hasLead && hasVoice
        ? "All tabs unlocked"
        : `${[hasLead && "Lead added", hasVoice && "Voice set up"].filter(Boolean).join(" · ") || "Getting started"} — ${showAllNav ? "showing all tabs" : "progressive unlock active"}`,
      panel: (
        <NavigationSettingsPanel
          showAll={showAllNav}
          hasLead={hasLead}
          hasVoice={hasVoice}
        />
      ),
    },
    {
      key: "onboarding_reset",
      title: "Reset onboarding",
      status: "neutral",
      summary: "Replay the welcome questions and reset reality-question answers.",
      panel: <OnboardingResetPanel />,
    },
  ];

  // Sort each section's slots: attention → set_up → done → neutral.
  const sortBySlot = (a: Slot, b: Slot) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
  identitySlots.sort(sortBySlot);
  deliverySlots.sort(sortBySlot);
  advancedSlots.sort(sortBySlot);

  // Things that need attention across all sections — surfaced as a hero.
  const needsAttention = [...identitySlots, ...deliverySlots, ...advancedSlots].filter(
    (s) => s.status === "attention"
  );

  return (
    <div className="min-h-screen">
      <Header
        email={user?.email ?? ""}
        name={userDisplayName(user?.user_metadata)}
        avatarUrl={userAvatarUrl(user?.user_metadata)}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-2xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">

        <div className="mb-8">
          <p className="text-[length:var(--t-label)] uppercase tracking-[0.15em] font-bold text-[color:var(--brand-strong)]">
            Settings
          </p>
          <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)] mt-1">
            {needsAttention.length > 0
              ? `${needsAttention.length} ${needsAttention.length === 1 ? "thing wants" : "things want"} your attention.`
              : "Everything's set."}
          </h1>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2 leading-relaxed">
            Items that need you sit at the top of each section. Completed items collapse to the bottom — click to expand. Resonance and sacred zones moved to <a className="underline" href="/leads/resonance">/leads/resonance</a> and <a className="underline" href="/content">/content</a>.
          </p>
        </div>

        {error || !settings ? (
          <div className="rounded-[var(--r-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-6">
            <p className="text-[length:var(--t-caption)] text-[#B42318]">
              Could not load settings: {error?.message ?? "Unknown error"}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <EditorialSettingsSection number={1} kicker="Identity & Brand" lede="Who you are, who you serve, how you look.">
              {identitySlots.map((slot) => (
                <CollapsibleCard
                  key={slot.key}
                  title={slot.title}
                  status={slot.status}
                  ctaLabel={slot.ctaLabel}
                  summary={slot.summary}
                >
                  {slot.panel}
                </CollapsibleCard>
              ))}
            </EditorialSettingsSection>

            <EditorialSettingsSection number={2} kicker="Delivery" lede="How your work goes out.">
              {deliverySlots.map((slot) => (
                <CollapsibleCard
                  key={slot.key}
                  title={slot.title}
                  status={slot.status}
                  ctaLabel={slot.ctaLabel}
                  summary={slot.summary}
                >
                  {slot.panel}
                </CollapsibleCard>
              ))}
            </EditorialSettingsSection>

            <EditorialSettingsSection number={3} kicker="Advanced">
              {advancedSlots.map((slot) => (
                <CollapsibleCard
                  key={slot.key}
                  title={slot.title}
                  status={slot.status}
                  ctaLabel={slot.ctaLabel}
                  summary={slot.summary}
                >
                  {slot.panel}
                </CollapsibleCard>
              ))}
            </EditorialSettingsSection>
          </div>
        )}
      </main>
    </div>
  );
}

function labelServes(s: AudienceServes): string {
  if (s === "men")   return "men";
  if (s === "women") return "women";
  return "everyone";
}
