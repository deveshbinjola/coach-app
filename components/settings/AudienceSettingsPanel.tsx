"use client";

// AudienceSettingsPanel — coaches can update their voice profile after
// onboarding. Identical UX to the two-question step in WelcomeFlow, just
// rendered as a /settings section.

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Badge, Button } from "@/components/ui";
import {
  getVoiceProfile,
  deriveProfileSlug,
  type AudienceSelf,
  type AudienceServes,
  type VoiceProfileSlug,
} from "@/lib/voice-profiles";

type Props = {
  initialSelf: AudienceSelf | null;
  initialServes: AudienceServes | null;
  initialSlug: VoiceProfileSlug | null;
};

export default function AudienceSettingsPanel({ initialSelf, initialServes, initialSlug }: Props) {
  const supabase = createClient();
  const [audienceSelf, setAudienceSelf] = useState<AudienceSelf | null>(initialSelf);
  const [audienceServes, setAudienceServes] = useState<AudienceServes | null>(initialServes);
  const [currentSlug, setCurrentSlug] = useState<VoiceProfileSlug | null>(initialSlug);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const previewSlug =
    audienceSelf && audienceServes ? deriveProfileSlug(audienceSelf, audienceServes) : null;
  const previewProfile = previewSlug ? getVoiceProfile(previewSlug) : null;
  const isDirty =
    audienceSelf !== initialSelf ||
    audienceServes !== initialServes ||
    previewSlug !== currentSlug;

  async function onSave() {
    if (!audienceSelf || !audienceServes) {
      setFlash({ kind: "err", msg: "Pick one option in each row." });
      return;
    }
    setFlash(null);
    setSaving(true);
    const slug = deriveProfileSlug(audienceSelf, audienceServes);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setFlash({ kind: "err", msg: "Signed out. Refresh and try again." });
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("cp_coaches")
      .update({
        audience_self: audienceSelf,
        audience_serves: audienceServes,
        voice_profile_slug: slug,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      setFlash({ kind: "err", msg: error.message });
      return;
    }
    setCurrentSlug(slug);
    setFlash({ kind: "ok", msg: `Updated. Voice profile: ${getVoiceProfile(slug).displayName}.` });
  }

  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-6 space-y-6">
      <div>
        <Badge tone="brand" size="xs" uppercase>Audience</Badge>
        <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)] mt-2">
          Voice profile
        </h2>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-[var(--leading-relaxed)]">
          Two answers branch every default the platform shows you — seed phrases, demo DMs, reply
          drafts, objection reframes. Change anytime.
        </p>
        {currentSlug && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] mt-2 font-mono">
            Current: <strong className="text-[color:var(--text)]">{getVoiceProfile(currentSlug).displayName}</strong>
          </p>
        )}
      </div>

      {/* Question 1 */}
      <div className="space-y-3">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
          1 · How do you describe your own work?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { v: "masculine",  label: "Masculine embodiment", hint: "Purpose, edge, integrity, action" },
            { v: "feminine",   label: "Feminine embodiment",  hint: "Somatic, nervous system, attachment, flow" },
            { v: "integrated", label: "Integrated / Both",     hint: "Neither dominates" },
          ] as const).map((opt) => {
            const active = audienceSelf === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setAudienceSelf(opt.v)}
                className={`text-left p-4 rounded-[var(--r-lg)] border transition ${
                  active
                    ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] ring-2 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--text-muted)]"
                }`}
              >
                <div className="font-bold text-[length:var(--t-body)] text-[color:var(--text)] mb-1">{opt.label}</div>
                <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">{opt.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Question 2 */}
      <div className="space-y-3">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
          2 · Who do you primarily work with?
        </p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { v: "men",   label: "Men" },
            { v: "women", label: "Women" },
            { v: "both",  label: "Both" },
          ] as const).map((opt) => {
            const active = audienceServes === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setAudienceServes(opt.v)}
                className={`text-center p-4 rounded-[var(--r-lg)] border transition font-bold ${
                  active
                    ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] ring-2 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)] text-[color:var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--text-muted)] text-[color:var(--text)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {previewProfile && (
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)] mb-2">
            Preview
          </p>
          <p className="text-[length:var(--t-body)] font-bold text-[color:var(--text)]">{previewProfile.displayName}</p>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">{previewProfile.description}</p>
        </div>
      )}

      {flash && (
        <p
          className={`text-[length:var(--t-caption)] ${flash.kind === "ok" ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"}`}
          role={flash.kind === "err" ? "alert" : "status"}
        >
          {flash.msg}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={!isDirty || saving || !audienceSelf || !audienceServes} className="h-12 px-6">
          {saving ? "Saving…" : "Save voice profile"}
        </Button>
      </div>
    </section>
  );
}
