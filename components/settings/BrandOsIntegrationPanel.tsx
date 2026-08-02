"use client";

// BrandOsIntegrationPanel — advanced section showing the API endpoint
// + payload shape Brand OS uses to push voice profiles into the app.
// Hidden from coaches who don't need endpoint language by virtue of
// living below the fold on /settings; surfaced for technical users
// or anyone configuring the Brand OS Agent integration directly.

export default function BrandOsIntegrationPanel() {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.elevateaisystem.com";
  const endpoint = `${origin}/api/v1/voice`;

  return (
    <section className="card p-6" id="brand-os-import">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">
            Brand OS handoff
          </h2>
          <p className="text-sm text-[color:var(--text-muted)]">
            Technical import path for Brand OS Agent. Keep this here so normal
            coaches do not see endpoint language on the Voice page.
          </p>
        </div>
        <span className="inline-flex items-center text-[10px] font-extrabold uppercase tracking-wider bg-[var(--brand-soft)] text-[color:var(--success)] border border-[color-mix(in_srgb,var(--brand)_30%,transparent)] px-2 py-1 rounded">
          Advanced
        </span>
      </div>

      <div className="mt-4 rounded-[var(--r-md)] bg-[var(--surface-deep)] p-4">
        <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
          Import active voice profile
        </div>
        <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
          Brand OS should call this after it builds the voice artifact. Use a
          write API key from this Advanced Settings section.
        </p>
        <code className="mt-3 block rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] px-3 py-2 text-[11px] leading-[var(--leading-base)] text-[color:var(--text)] break-all">
          POST {endpoint}
        </code>
        <pre className="mt-2 rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] px-3 py-2 text-[11px] leading-[var(--leading-base)] text-[color:var(--text)] overflow-x-auto">
{`{
  "voice_json": { "tone": ["direct"] },
  "sample_messages": ["Real coach-written message"]
}`}
        </pre>
      </div>
    </section>
  );
}
