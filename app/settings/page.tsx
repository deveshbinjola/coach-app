// /settings — coach preferences page.
//
// Keep this page quiet. Settings is for controls the coach actually touches,
// not a roadmap, developer console, or admin panel.
//
// Settings live in cp_coach_settings, one row per coach, RLS-protected.
// We read via the ensure_coach_settings() RPC which auto-creates a default
// row if the coach hasn't visited /settings yet — so this page never
// has to handle a missing-row case.

import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import SettingsForm from "@/components/SettingsForm";
import AudienceSettingsPanel from "@/components/settings/AudienceSettingsPanel";
import type { CoachSettings, CoachIntegration } from "@/lib/types";
import type { AudienceSelf, AudienceServes, VoiceProfileSlug } from "@/lib/voice-profiles";

export const runtime = 'edge';

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  // The Gmail OAuth callback bounces back here with ?gmail=connected or
  // ?gmail=error&reason=... — surfaced as a banner by SettingsForm.
  searchParams: { gmail?: string; reason?: string; upgrade?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch settings row + Gmail integration + audience config in parallel.
  // ensure_coach_settings RPC creates the settings row on first read so we
  // never hit a missing-row case. Gmail integration is null when the coach
  // hasn't connected yet. Audience config falls back to defaults if null.
  const [{ data: settings, error }, { data: gmailIntegration }, { data: coachRow }] =
    await Promise.all([
      supabase.rpc("ensure_coach_settings").single(),
      supabase
        .from("cp_coach_integrations")
        .select("*")
        .eq("provider", "gmail")
        .maybeSingle(),
      user?.id
        ? supabase
            .from("cp_coaches")
            .select("audience_self, audience_serves, voice_profile_slug")
            .eq("id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  const audienceSelf = (coachRow as { audience_self?: string } | null)?.audience_self as AudienceSelf | null ?? null;
  const audienceServes = (coachRow as { audience_serves?: string } | null)?.audience_serves as AudienceServes | null ?? null;
  const voiceProfileSlug = (coachRow as { voice_profile_slug?: string } | null)?.voice_profile_slug as VoiceProfileSlug | null ?? null;

  return (
    <div className="min-h-screen">
      <Header
        email={user?.email ?? ""}
        name={userDisplayName(user?.user_metadata)}
        avatarUrl={userAvatarUrl(user?.user_metadata)}
      />
      <main className="max-w-2xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <div className="mb-8">
          <h1 className="text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
            Settings
          </h1>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5">
            The few controls that change how the app works for you.
          </p>
        </div>

        {error || !settings ? (
          <div className="rounded-[var(--r-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-6">
            <p className="text-[length:var(--t-caption)] text-[#B42318]">
              Could not load settings: {error?.message ?? "Unknown error"}
            </p>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2">
              If the migration hasn't been applied, the{" "}
              <code className="px-1 bg-[var(--surface-deep)] rounded font-mono">
                ensure_coach_settings
              </code>{" "}
              RPC won't exist yet.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <AudienceSettingsPanel
              initialSelf={audienceSelf}
              initialServes={audienceServes}
              initialSlug={voiceProfileSlug}
            />
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
          </div>
        )}
      </main>
    </div>
  );
}
