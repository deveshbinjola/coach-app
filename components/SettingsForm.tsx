"use client";

// SettingsForm — client-side editor for cp_coach_settings.
//
// One row, three toggles. Each control writes-on-change with optimistic UI;
// failures revert and surface an inline error. RLS guarantees the coach can
// only update their own row, so we don't have to pass coach_id explicitly.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type {
  CoachSettings,
  CoachIntegration,
} from "@/lib/types";
import { useError, useConfirm } from "@/components/ui";
// Settings panels — split out into components/settings/ in a recent refactor
// (this file dropped from 1,396 → ~600 lines as a result). Each panel owns
// its own data-fetch + local state; the orchestrator below just wires them
// in alongside the toggles row + Gmail integration card.
import BrandOsIntegrationPanel from "./settings/BrandOsIntegrationPanel";
import ApiKeysPanel             from "./settings/ApiKeysPanel";
import SessionIntegrationsPanel from "./settings/SessionIntegrationsPanel";
import WebhooksPanel            from "./settings/WebhooksPanel";
import Toggle                   from "./settings/Toggle";
import NumberField              from "./settings/NumberField";
import { timeAgo }              from "./settings/utils";

export default function SettingsForm({
  initial,
  gmailIntegration,
  gmailFlash,
  upgradeIntent,
}: {
  initial: CoachSettings;
  gmailIntegration: CoachIntegration | null;
  /** Banner state from the OAuth callback — `connected` on success, `error`
   *  with a `reason` string on failure. Null = no banner. */
  gmailFlash: { state: string; reason?: string } | null;
  upgradeIntent: string | null;
}) {
  const [settings, setSettings] = useState<CoachSettings>(initial);
  const [savingKey, setSavingKey] = useState<keyof CoachSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Replaces window.confirm() for the Gmail-disconnect prompt.
  const { ConfirmDialog, askConfirm } = useConfirm();
  const [gmail, setGmail] = useState<CoachIntegration | null>(gmailIntegration);
  const [disconnecting, setDisconnecting] = useState(false);
  // Gmail sync state — drives the "Sync now" button + result toast.
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    kind: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  type SettingsTab = "general" | "integrations" | "developer";
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    if (gmailFlash) return "integrations";
    return "general";
  });
  const supabase = createClient();

  async function startCheckout() {
    setCheckingOut(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload?.url) {
        setError(payload?.error ?? "Could not start checkout.");
        return;
      }
      window.location.href = payload.url;
    } catch (err) {
      setError(String(err));
    } finally {
      setCheckingOut(false);
    }
  }

  async function patch<K extends keyof CoachSettings>(
    key: K,
    value: CoachSettings[K]
  ) {
    setError(null);
    const previous = settings[key];
    // Optimistic update.
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavingKey(key);
    const { error: updErr } = await supabase
      .from("cp_coach_settings")
      .update({ [key]: value })
      .eq("coach_id", settings.coach_id);
    setSavingKey(null);
    if (updErr) {
      setSettings((prev) => ({ ...prev, [key]: previous }));
      setError(updErr.message);
    }
  }

  async function disconnectGmail() {
    if (!gmail) return;
    const ok = await askConfirm({
      title:        "Disconnect Gmail?",
      description:  "Coach Platform will stop syncing your inbox. Existing logged messages stay; future emails won't auto-import until you reconnect.",
      confirmLabel: "Disconnect",
      destructive:  true,
    });
    if (!ok) return;
    setDisconnecting(true);
    try {
      const { error: delErr } = await supabase
        .from("cp_coach_integrations")
        .delete()
        .eq("id", gmail.id);
      if (delErr) {
        setError(delErr.message);
        return;
      }
      setGmail(null);
    } finally {
      setDisconnecting(false);
    }
  }

  // "Sync now" — manually invoke the gmail-sync Edge Function. The function
  // does its own auth via the user JWT that supabase.functions.invoke() adds.
  async function syncGmail() {
    if (!gmail) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "gmail-sync",
        { body: {} }
      );
      if (invokeErr) {
        setSyncResult({ kind: "error", message: invokeErr.message });
        return;
      }
      // The function returns either { ok, messages_found, messages_synced }
      // on success or { skipped: "..." } on a no-op.
      const r = data as
        | { ok: true; messages_found: number; messages_matched: number; messages_synced: number }
        | { skipped: string }
        | { error: string };

      if ("error" in r) {
        setSyncResult({ kind: "error", message: r.error });
      } else if ("skipped" in r) {
        setSyncResult({
          kind: "info",
          message: `Sync skipped: ${r.skipped}.`,
        });
      } else {
        setSyncResult({
          kind: "success",
          message: `Synced ${r.messages_synced} of ${r.messages_matched} matched (out of ${r.messages_found} recent).`,
        });
        // Optimistic local update of last_synced_at so the panel shows
        // "just now" without a full page refresh.
        setGmail({ ...gmail, last_synced_at: new Date().toISOString() });
      }
    } catch (err) {
      setSyncResult({ kind: "error", message: String(err) });
    } finally {
      setSyncing(false);
    }
  }

  const TABS: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: "General" },
    { id: "integrations", label: "Integrations" },
    { id: "developer", label: "Developer" },
  ];

  return (
    <div className="space-y-5">
      {ConfirmDialog}
      {error && (
        <div className="rounded-[var(--r-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
          <p className="text-[length:var(--t-caption)] text-[#B42318]">{error}</p>
        </div>
      )}

      {upgradeIntent === "voice-imports" && (
        <section className="rounded-[var(--r-lg)] border border-[color-mix(in_srgb,var(--brand)_34%,var(--border))] bg-[linear-gradient(135deg,var(--surface-elevated)_0%,var(--surface-elevated)_66%,var(--brand-soft)_100%)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-lg">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                Voice imports
              </div>
              <h2 className="mt-2 text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] leading-[var(--leading-tight)]">
                Upgrade for heavier voice training.
              </h2>
              <p className="mt-1.5 text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                The free plan includes one Instagram import each month. Upgrade
                when you want to pull in more source material and build a deeper
                Voice Asset.
              </p>
            </div>
            <button
              type="button"
              onClick={startCheckout}
              disabled={checkingOut}
              className="inline-flex h-11 items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-5 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text-inverse)] hover:bg-[var(--brand-strong)] transition disabled:opacity-50"
            >
              {checkingOut ? "Opening checkout..." : "Upgrade"}
            </button>
          </div>
        </section>
      )}

      {/* ── Tab bar ── */}
      <nav className="flex gap-1 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-[var(--r-md)] px-4 py-2 text-[length:var(--t-caption)] font-extrabold transition ${
              activeTab === tab.id
                ? "bg-[var(--surface)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text)] hover:bg-[var(--surface-deep)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── General tab ── */}
      {activeTab === "general" && (
        <>
          <section className="card p-6">
            <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">Auto response</h2>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-5 leading-[var(--leading-base)]">
              Draft a first reply when a new lead arrives. You still review before
              anything is sent.
            </p>

            <Toggle
              label="Draft a first response when a new lead arrives"
              hint="Requires an active voice profile."
              value={settings.auto_draft_on_new_lead}
              onChange={(v) => patch("auto_draft_on_new_lead", v)}
              saving={savingKey === "auto_draft_on_new_lead"}
            />

            <div className="mt-4 pt-4 border-t border-[var(--border-faint)]">
              <Toggle
                label="Email me when a draft is ready"
                hint="Off keeps things quiet. Drafts still appear in Home."
                value={settings.auto_draft_email_notification}
                onChange={(v) => patch("auto_draft_email_notification", v)}
                saving={savingKey === "auto_draft_email_notification"}
                disabled={!settings.auto_draft_on_new_lead}
              />
              {!settings.auto_draft_on_new_lead && (
                <p className="text-[11px] text-[color:var(--text-faint)] italic mt-1 ml-1">
                  Auto response is off, so notifications will stay quiet.
                </p>
              )}
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">Weekly reach</h2>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-5 leading-[var(--leading-base)]">
              The number of people you want to personally reach each week. Home
              uses this to show whether the board is moving.
            </p>

            <NumberField
              label="Target"
              value={settings.reach_target_per_week}
              onSave={(v) => patch("reach_target_per_week", v)}
              saving={savingKey === "reach_target_per_week"}
              min={1}
              max={500}
              suffix="people / week"
            />
          </section>
        </>
      )}

      {/* ── Integrations tab ── */}
      {activeTab === "integrations" && (
        <>
          {gmailFlash?.state === "connected" && (
            <div className="rounded-[var(--r-lg)] border-2 border-[var(--brand)] bg-[var(--brand-soft)] p-4">
              <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
                ✓ Gmail connected
              </p>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">
                Coach Platform will start syncing your inbox shortly. New emails
                from leads will appear in their conversation history automatically.
              </p>
            </div>
          )}
          {gmailFlash?.state === "error" && (
            <div className="rounded-[var(--r-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
              <p className="text-[length:var(--t-caption)] font-bold text-[#B42318]">
                Gmail didn&apos;t connect
              </p>
              <p className="text-[length:var(--t-caption)] text-[#B42318] mt-1">
                Reason: <code className="font-mono">{gmailFlash.reason ?? "unknown"}</code>. Try again,
                or check the Edge Function logs if this keeps happening.
              </p>
            </div>
          )}

          <section className="card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">Gmail</h2>
                <p className="text-sm text-[color:var(--text-muted)] mb-1">
                  Log lead emails automatically. Outbound counts toward reach,
                  inbound resets the reply clock. The app does not send email for
                  you from here.
                </p>
              </div>
              {gmail && gmail.status === "active" && (
                <span className="inline-flex items-center text-[10px] font-extrabold uppercase tracking-wider bg-brand text-navy px-2 py-0.5 rounded">
                  ✓ Connected
                </span>
              )}
            </div>

            {gmail ? (
              <div className="mt-4 p-4 rounded-[var(--r-md)] bg-surface border border-[var(--border)]">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)] font-bold">
                      Connected as
                    </div>
                    <div className="text-sm font-bold text-navy mt-0.5 truncate">
                      {gmail.account_email ?? "Gmail account"}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-faint)] mt-1">
                      Connected{" "}
                      {new Date(gmail.connected_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                      {gmail.last_synced_at ? (
                        <>
                          {" · last sync "}
                          {timeAgo(gmail.last_synced_at)}
                        </>
                      ) : (
                        " · awaiting first sync"
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 shrink-0 items-center flex-wrap">
                    <button
                      type="button"
                      onClick={syncGmail}
                      disabled={syncing || disconnecting}
                      className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-brand text-navy px-3 py-1.5 rounded hover:bg-[#00E03A] transition disabled:opacity-50"
                    >
                      {syncing ? (
                        <>
                          <SpinnerDot /> Syncing…
                        </>
                      ) : (
                        <>↻ Sync now</>
                      )}
                    </button>
                    <a
                      href="/api/integrations/gmail/connect"
                      className="text-xs font-semibold text-[color:var(--text-muted)] hover:text-navy underline decoration-dotted underline-offset-4"
                    >
                      Reconnect
                    </a>
                    <button
                      type="button"
                      onClick={disconnectGmail}
                      disabled={disconnecting || syncing}
                      className="text-xs font-semibold text-[color:var(--danger)] hover:text-[color:var(--danger)] disabled:opacity-50"
                    >
                      {disconnecting ? "Disconnecting…" : "Disconnect"}
                    </button>
                  </div>
                </div>

                {syncResult && (
                  <div
                    className={`mt-3 p-3 rounded-md text-xs ${
                      syncResult.kind === "success"
                        ? "bg-brand-soft text-[color:var(--success)] border border-[color-mix(in_srgb,var(--brand)_40%,transparent)]"
                        : syncResult.kind === "info"
                          ? "bg-[var(--surface-deep)] text-[color:var(--text-muted)] border border-[var(--border)]"
                          : "bg-[var(--danger-soft)] text-[color:var(--danger)] border border-[var(--danger-border)]"
                    }`}
                  >
                    {syncResult.message}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <a
                  href="/api/integrations/gmail/connect"
                  className="inline-flex items-center gap-3 p-3 rounded-[var(--r-md)] border-2 border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] font-semibold hover:bg-[var(--surface-deep)] hover:border-[var(--border-strong)] transition"
                >
                  <GoogleIcon />
                  <span>Connect Gmail</span>
                </a>
                <p className="text-[11px] text-[color:var(--text-faint)] mt-2 leading-relaxed">
                  You&apos;ll be redirected to Google to grant read-only access. We
                  never see your password and you can disconnect any time.
                </p>
              </div>
            )}
          </section>

          <section className="card p-6">
            <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">Connections</h2>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)] mb-4">
              Link your Brand OS agent and session capture tools.
            </p>
            <div className="space-y-4">
              <BrandOsIntegrationPanel />
              <SessionIntegrationsPanel />
            </div>
          </section>
        </>
      )}

      {/* ── Developer tab ── */}
      {activeTab === "developer" && (
        <>
          <section className="card p-6">
            <div className="rounded-[var(--r-md)] bg-[var(--surface-deep)] p-4">
              <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                API reference
              </div>
              <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
                Use this when connecting your own automations, intake tools, or AI assistant.
              </p>
              <a
                href="/api/docs"
                target="_blank"
                rel="noopener"
                className="mt-3 inline-flex h-9 items-center justify-center rounded-[var(--r-md)] bg-[var(--navy)] px-3 text-[length:var(--t-caption)] font-bold text-[color:var(--brand-bright)] hover:opacity-90 transition"
              >
                Open API docs
              </a>
            </div>
          </section>

          <ApiKeysPanel />
          <WebhooksPanel />
        </>
      )}

    </div>
  );
}

// ── Tiny inline helpers used only by the main SettingsForm ─────────────────
//
// SpinnerDot and GoogleIcon are small enough that extracting them into
// their own files would be more ceremony than value. Each is used in
// exactly one place inside this file.

/** Tiny pulsing dot for the "Syncing…" button state. CSS-only animation. */
function SpinnerDot() {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full bg-navy animate-pulse"
      aria-hidden
    />
  );
}

/** Same multi-color Google G we use on the login page. Inlined so the
 *  Connect button renders instantly with no network hop. */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
    </svg>
  );
}
