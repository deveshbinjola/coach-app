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
  ApiKey,
  AgentActivity,
  WebhookEndpoint,
  LeadSource,
} from "@/lib/types";

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
    if (
      !confirm(
        "Disconnect Gmail? Coach Platform will stop syncing your inbox. Your existing logged messages stay; future emails won't auto-import until you reconnect."
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      const { error: delErr } = await supabase
        .from("cp_coach_integrations")
        .delete()
        .eq("id", gmail.id);
      if (delErr) {
        alert(delErr.message);
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

  return (
    <div className="space-y-5">
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
              className="inline-flex h-11 items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-5 text-[length:var(--t-caption)] font-extrabold text-[color:var(--navy)] hover:bg-[var(--brand-strong)] transition disabled:opacity-50"
            >
              {checkingOut ? "Opening checkout..." : "Upgrade"}
            </button>
          </div>
        </section>
      )}

      {/* Gmail OAuth callback banner — only renders when the coach was just
          bounced back from /api/integrations/gmail/callback. Auto-fades in
          UX terms is handled by the next page navigation removing the
          query params; we don't auto-dismiss here so the message sticks. */}
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
            Gmail didn't connect
          </p>
          <p className="text-[length:var(--t-caption)] text-[#B42318] mt-1">
            Reason: <code className="font-mono">{gmailFlash.reason ?? "unknown"}</code>. Try again,
            or check the Edge Function logs if this keeps happening.
          </p>
        </div>
      )}

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

        <div className="mt-4 pt-4 border-t border-gray-100">
          <Toggle
            label="Email me when a draft is ready"
            hint="Off keeps things quiet. Drafts still appear in Command."
            value={settings.auto_draft_email_notification}
            onChange={(v) => patch("auto_draft_email_notification", v)}
            saving={savingKey === "auto_draft_email_notification"}
            disabled={!settings.auto_draft_on_new_lead}
          />
          {!settings.auto_draft_on_new_lead && (
            <p className="text-[11px] text-gray-500 italic mt-1 ml-1">
              Auto response is off, so notifications will stay quiet.
            </p>
          )}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">Weekly reach</h2>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-5 leading-[var(--leading-base)]">
          The number of people you want to personally reach each week. Command
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

      <section className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">Gmail</h2>
            <p className="text-sm text-gray-600 mb-1">
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
          <div className="mt-4 p-4 rounded-lg bg-surface border border-gray-200">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  Connected as
                </div>
                <div className="text-sm font-bold text-navy mt-0.5 truncate">
                  {gmail.account_email ?? "Gmail account"}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
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
                  className="text-xs font-semibold text-gray-700 hover:text-navy underline decoration-dotted underline-offset-4"
                >
                  Reconnect
                </a>
                <button
                  type="button"
                  onClick={disconnectGmail}
                  disabled={disconnecting || syncing}
                  className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </div>

            {/* Sync result toast — fades out via the next sync clearing it. */}
            {syncResult && (
              <div
                className={`mt-3 p-3 rounded-md text-xs ${
                  syncResult.kind === "success"
                    ? "bg-brand-soft text-green-900 border border-[color-mix(in_srgb,var(--brand)_40%,transparent)]"
                    : syncResult.kind === "info"
                      ? "bg-gray-100 text-gray-700 border border-gray-200"
                      : "bg-red-50 text-red-800 border border-red-200"
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
              className="inline-flex items-center gap-3 p-3 rounded-lg border-2 border-gray-300 bg-white text-gray-800 font-semibold hover:bg-gray-50 hover:border-gray-400 transition"
            >
              <GoogleIcon />
              <span>Connect Gmail</span>
            </a>
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              You'll be redirected to Google to grant read-only access. We
              never see your password and you can disconnect any time.
            </p>
          </div>
        )}
      </section>

      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] leading-[var(--leading-tight)]">
              Advanced settings
            </h2>
            <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
              Capture links, agent access, and technical controls for power users.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--r-md)] border border-[var(--border)] px-3 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] hover:border-[var(--border-strong)] transition"
            aria-expanded={advancedOpen}
          >
            {advancedOpen ? "Hide" : "Open"}
          </button>
        </div>

        {advancedOpen && (
          <div className="mt-5 space-y-4 border-t border-[var(--border-faint)] pt-5">
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
                className="mt-3 inline-flex h-9 items-center justify-center rounded-[var(--r-md)] bg-[var(--navy)] px-3 text-[length:var(--t-caption)] font-bold text-[color:var(--brand)] hover:opacity-90 transition"
              >
                Open API docs
              </a>
            </div>

            <BrandOsIntegrationPanel />
            <ApiKeysPanel />
            <WebhooksPanel />
          </div>
        )}
      </section>

    </div>
  );
}

function BrandOsIntegrationPanel() {
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
          <p className="text-sm text-gray-600">
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

// ---------- API keys panel (Phase 8.5) ----------

function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  // Phase 11 — let coaches pick scope at create time. Default read+write
  // (full agent access). Read-only is for less-trusted agents.
  const [newKeyScope, setNewKeyScope] = useState<"read" | "read_write">(
    "read_write"
  );
  const [showCreate, setShowCreate] = useState(false);
  // Set when a key is freshly created — full secret shown once, then cleared.
  const [justCreated, setJustCreated] = useState<{ raw: string; key: ApiKey } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function loadKeys() {
    setLoading(true);
    try {
      const res = await fetch("/api/keys");
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Failed to load keys");
        return;
      }
      setKeys(j.keys ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadKeys();
  }, []);

  async function createKey() {
    if (!newKeyName.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const scopes =
        newKeyScope === "read" ? ["read"] : ["read", "write"];
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Failed to create key");
        return;
      }
      setJustCreated({ raw: j.raw, key: j.key });
      setNewKeyName("");
      setNewKeyScope("read_write");
      setShowCreate(false);
      // Refresh list so the new key appears (without the raw secret).
      loadKeys();
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this key? Any agent using it will start failing immediately.")) {
      return;
    }
    setRevoking(id);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Failed to revoke");
        return;
      }
      loadKeys();
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">API keys</h2>
          <p className="text-sm text-gray-600">
            Keys for plugging your AI agent (Claude Desktop, Cursor, n8n,
            custom GPTs, anything) into Coach Platform. Read your focus
            queue, log messages, create leads — agent-first.
          </p>
        </div>
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-brand text-navy font-extrabold text-sm hover:bg-[#00E03A] transition whitespace-nowrap"
          >
            + Generate key
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mt-4 p-4 rounded-lg bg-surface border border-gray-200">
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
            Key name (helps you tell keys apart)
          </label>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Claude Desktop"
            maxLength={100}
            className="w-full p-2 rounded border border-gray-300 text-sm focus:outline-none focus:border-brand"
          />

          <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mt-3 mb-1">
            Scope
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ScopeOption
              active={newKeyScope === "read_write"}
              onClick={() => setNewKeyScope("read_write")}
              title="Read + Write"
              hint="Full agent access. Read everything, create leads, log messages, update fields, request drafts. Default for trusted agents like Claude Desktop."
            />
            <ScopeOption
              active={newKeyScope === "read"}
              onClick={() => setNewKeyScope("read")}
              title="Read-only"
              hint="Can only fetch — focus queue, leads, messages, voice. Cannot mutate. Use for less-trusted agents (custom GPTs, public bots, automations you're testing)."
            />
          </div>

          <div className="flex gap-2 flex-wrap mt-4">
            <button
              type="button"
              onClick={createKey}
              disabled={creating || !newKeyName.trim()}
              className="px-4 py-2 rounded bg-brand text-navy font-extrabold text-sm hover:bg-[#00E03A] transition disabled:opacity-50"
            >
              {creating ? "Generating…" : "Generate"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewKeyName("");
                setNewKeyScope("read_write");
              }}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:text-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Just-created flash — shows the raw key ONCE, plus an install
          snippet pre-filled with that key (also won't be available again). */}
      {justCreated && (
        <div className="mt-4 p-4 rounded-lg border-2 border-brand bg-[#F0FFF4]">
          <p className="text-sm font-extrabold text-navy">
            🔑 Save this key now — we won't show it again.
          </p>

          <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mt-3 mb-1">
            Raw key
          </label>
          <div className="p-3 rounded bg-white border border-gray-200 font-mono text-xs break-all select-all">
            {justCreated.raw}
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(justCreated.raw)}
            className="mt-1.5 text-xs font-bold bg-navy text-white px-3 py-1.5 rounded hover:bg-[#1A1F2C]"
          >
            Copy raw key
          </button>

          {/* Phase 9 — Claude Desktop / Cursor MCP config snippet, pre-filled
              with the raw key. Coach pastes into their MCP client config and
              their agent is connected. Two clicks total. */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-bold text-navy hover:text-brand-strong">
              ⚡ Connect to Claude Desktop / Cursor →
            </summary>
            <div className="mt-3">
              <p className="text-xs text-gray-700 leading-relaxed mb-2">
                Paste the snippet below into your MCP client config:
              </p>
              <ul className="text-[11px] text-gray-600 space-y-0.5 mb-3 list-disc pl-5">
                <li>
                  <b>Claude Desktop (macOS):</b>{" "}
                  <code className="px-1 bg-gray-100 rounded">
                    ~/Library/Application Support/Claude/claude_desktop_config.json
                  </code>
                </li>
                <li>
                  <b>Cursor:</b>{" "}
                  <code className="px-1 bg-gray-100 rounded">
                    ~/.cursor/mcp.json
                  </code>
                </li>
              </ul>
              <pre className="p-3 rounded bg-navy text-[#E5E7EB] text-[11px] overflow-x-auto leading-relaxed font-mono">
{`{
  "mcpServers": {
    "coach-platform": {
      "command": "npx",
      "args": ["-y", "@elevate-ai/coach-platform-mcp"],
      "env": {
        "COACH_PLATFORM_API_KEY": "${justCreated.raw}"
      }
    }
  }
}`}
              </pre>
              <button
                type="button"
                onClick={() => {
                  const snippet = `{
  "mcpServers": {
    "coach-platform": {
      "command": "npx",
      "args": ["-y", "@elevate-ai/coach-platform-mcp"],
      "env": {
        "COACH_PLATFORM_API_KEY": "${justCreated.raw}"
      }
    }
  }
}`;
                  navigator.clipboard.writeText(snippet);
                }}
                className="mt-2 text-xs font-bold bg-brand text-navy px-3 py-1.5 rounded hover:bg-[#00E03A]"
              >
                Copy MCP config
              </button>
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                Restart Claude Desktop / Cursor after saving. The MCP server
                auto-installs on first run via npx. You'll see tools like{" "}
                <code className="px-1 bg-gray-100 rounded">
                  get_focus_queue
                </code>{" "}
                and{" "}
                <code className="px-1 bg-gray-100 rounded">create_lead</code>{" "}
                appear in your agent's tool list.
              </p>
            </div>
          </details>

          <button
            type="button"
            onClick={() => setJustCreated(null)}
            className="mt-3 text-xs font-semibold text-gray-700 hover:text-navy"
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Key list */}
      <div className="mt-5">
        {loading ? (
          <p className="text-xs text-gray-500">Loading keys…</p>
        ) : !keys || keys.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            No keys yet. Generate one to start plugging agents in.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-4 p-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-navy">
                      {k.name}
                    </span>
                    {k.revoked_at ? (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200 px-1.5 py-0.5 rounded">
                        Revoked
                      </span>
                    ) : (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider bg-brand-soft text-green-900 border border-[color-mix(in_srgb,var(--brand)_40%,transparent)] px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 font-mono">
                    {k.key_prefix}… · {(k.scopes ?? []).join(" + ")}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at && (
                      <> · last used {new Date(k.last_used_at).toLocaleDateString()}</>
                    )}
                    {!k.last_used_at && !k.revoked_at && <> · never used</>}
                  </div>
                </div>
                {!k.revoked_at && (
                  <button
                    type="button"
                    onClick={() => revokeKey(k.id)}
                    disabled={revoking === k.id}
                    className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                  >
                    {revoking === k.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
        Use as <code className="px-1 bg-gray-100 rounded">Authorization: Bearer cp_live_…</code> on any{" "}
        <code className="px-1 bg-gray-100 rounded">/api/v1/*</code> endpoint.
        Full reference and MCP tool list:{" "}
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener"
          className="text-brand-strong font-bold underline decoration-dotted hover:text-navy"
        >
          📚 API docs →
        </a>
      </p>

      {/* Agent activity hidden — moves to /developers route alongside API
          keys + webhooks. Component preserved for that future surface.
          {<AgentActivityPanel />} */}
    </section>
  );
}

// ---------- Phase 11: Recent agent activity ----------

function AgentActivityPanel() {
  const [activity, setActivity] = useState<AgentActivity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      // RLS scopes us to this coach's rows automatically.
      const { data } = await supabase
        .from("cp_agent_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      setActivity((data as AgentActivity[]) ?? []);
      setLoading(false);
    })();
    // We don't refetch on every render; the page reload picks up new
    // activity. Could add a "Refresh" button if coaches ever want it.
  }, []);

  return (
    <div className="mt-6 pt-5 border-t border-gray-200">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-extrabold text-navy">
            Recent agent activity
          </h3>
          <p className="text-[11px] text-gray-500">
            Last 20 calls from your agents. Trust feature — verify what
            they're doing.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : !activity || activity.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          No agent activity yet. When an agent calls the API, every request
          shows up here.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden text-xs">
          {activity.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 p-2.5 hover:bg-surface"
            >
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${methodColor(a.method)}`}
              >
                {a.method}
              </span>
              <code className="font-mono text-[11px] truncate min-w-0 flex-1 text-navy">
                {a.path}
              </code>
              <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">
                {ago(a.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function methodColor(m: string): string {
  switch (m.toUpperCase()) {
    case "GET":
      return "bg-brand-soft text-green-900 border border-[color-mix(in_srgb,var(--brand)_40%,transparent)]";
    case "POST":
      return "bg-blue-50 text-blue-900 border border-blue-200";
    case "PATCH":
      return "bg-amber-50 text-amber-900 border border-amber-200";
    case "DELETE":
      return "bg-red-50 text-red-900 border border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border border-gray-200";
  }
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}


// ---------- helpers ----------

// ---------- Phase 12: Inbound webhooks ----------

const WEBHOOK_SOURCES: LeadSource[] = [
  "ig",
  "linkedin",
  "referral",
  "quiz",
  "in_person",
  "podcast",
  "newsletter",
  "other",
];

function WebhooksPanel() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState<LeadSource>("quiz");
  const [newDetail, setNewDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks");
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Failed to load webhooks");
        return;
      }
      setEndpoints(j.endpoints ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!newName.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          default_source: newSource,
          default_source_detail: newDetail.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Failed to create webhook");
        return;
      }
      setNewName("");
      setNewSource("quiz");
      setNewDetail("");
      setShowCreate(false);
      // Auto-reveal the URL of the just-created endpoint so the coach
      // can copy it immediately. Tokens aren't secret-once-only here
      // (unlike API keys) — coaches can re-copy any time.
      setRevealedToken(j.endpoint?.token ?? null);
      load();
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    const verb = current ? "Pause" : "Resume";
    if (!confirm(`${verb} this webhook? ${current ? "Inbound calls will start failing immediately." : "Inbound calls will start working again."}`)) {
      return;
    }
    const res = await fetch(`/api/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !current }),
    });
    if (res.ok) load();
  }

  function urlFor(token: string): string {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://app.elevateaisystem.com";
    return `${base}/api/v1/webhooks/leads/${token}`;
  }

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">Inbound webhooks</h2>
          <p className="text-sm text-gray-600">
            Per-source URLs you can paste into Tally, Typeform, Calendly, or
            anything that POSTs JSON. Leads flow in automatically. The
            Auto-Response Engine drafts a first-touch reply for each.
          </p>
        </div>
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-brand text-navy font-extrabold text-sm hover:bg-[#00E03A] transition whitespace-nowrap"
          >
            + New webhook URL
          </button>
        )}
      </div>

      {showCreate && (
        <div className="mt-4 p-4 rounded-lg bg-surface border border-gray-200 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
              Name (helps you tell endpoints apart)
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tally — Newsletter signup"
              maxLength={100}
              className="w-full p-2 rounded border border-gray-300 text-sm focus:outline-none focus:border-brand"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                Default source
              </label>
              <select
                value={newSource}
                onChange={(e) => setNewSource(e.target.value as LeadSource)}
                className="w-full p-2 rounded border border-gray-300 text-sm font-medium focus:outline-none focus:border-brand"
              >
                {WEBHOOK_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                Default source detail (optional)
              </label>
              <input
                type="text"
                value={newDetail}
                onChange={(e) => setNewDetail(e.target.value)}
                placeholder="IG quiz — masculine leadership"
                maxLength={200}
                className="w-full p-2 rounded border border-gray-300 text-sm focus:outline-none focus:border-brand"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={create}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 rounded bg-brand text-navy font-extrabold text-sm hover:bg-[#00E03A] transition disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create webhook"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewName("");
                setNewDetail("");
              }}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:text-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {revealedToken && (
        <div className="mt-4 p-4 rounded-lg border-2 border-brand bg-[#F0FFF4]">
          <p className="text-sm font-extrabold text-navy">
            ✓ Webhook URL ready. Paste this anywhere that POSTs JSON:
          </p>
          <div className="mt-2 p-3 rounded bg-white border border-gray-200 font-mono text-xs break-all select-all">
            {urlFor(revealedToken)}
          </div>
          <div className="mt-2 flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(urlFor(revealedToken))
              }
              className="text-xs font-bold bg-navy text-white px-3 py-1.5 rounded hover:bg-[#1A1F2C]"
            >
              Copy URL
            </button>
            <button
              type="button"
              onClick={() => setRevealedToken(null)}
              className="text-xs font-semibold text-gray-700 hover:text-navy"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : !endpoints || endpoints.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            No webhook URLs yet. Generate one to start piping leads in from
            external tools.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
            {endpoints.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 p-3 flex-wrap"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-navy">
                      {e.name}
                    </span>
                    {e.active ? (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider bg-brand-soft text-green-900 border border-[color-mix(in_srgb,var(--brand)_40%,transparent)] px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-300 px-1.5 py-0.5 rounded">
                        Paused
                      </span>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-200 px-1.5 py-0.5 rounded">
                      {e.default_source}
                      {e.default_source_detail
                        ? ` · ${e.default_source_detail}`
                        : ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 font-mono break-all">
                    {urlFor(e.token)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {e.total_received} received
                    {e.last_used_at
                      ? ` · last used ${ago(e.last_used_at)}`
                      : " · never used"}
                  </div>
                </div>
                <div className="flex gap-3 shrink-0 items-start">
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(urlFor(e.token))
                    }
                    className="text-xs font-semibold text-navy hover:text-brand-strong"
                  >
                    Copy URL
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(e.id, e.active)}
                    className="text-xs font-semibold text-gray-700 hover:text-red-700"
                  >
                    {e.active ? "Pause" : "Resume"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {endpoints && endpoints.length > 0 && (
        <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
          POST any JSON to a webhook URL. We extract <code className="px-1 bg-gray-100 rounded">full_name</code>,{" "}
          <code className="px-1 bg-gray-100 rounded">email</code>,{" "}
          <code className="px-1 bg-gray-100 rounded">phone</code>, and{" "}
          <code className="px-1 bg-gray-100 rounded">notes</code> from common
          field name patterns. Tally and Typeform structures are detected
          automatically. Anything we can't parse goes into notes so nothing
          is lost.
        </p>
      )}
    </section>
  );
}

/** Scope selector card — one per option. Phase 11. */
function ScopeOption({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-lg border-2 transition ${
        active
          ? "border-brand bg-[#F0FFF4]"
          : "border-gray-200 bg-white hover:border-gray-400"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
            active
              ? "border-brand bg-brand"
              : "border-gray-300 bg-white"
          }`}
        />
        <span className="text-sm font-bold text-navy">{title}</span>
      </div>
      <p className="text-[11px] text-gray-600 leading-relaxed pl-6">{hint}</p>
    </button>
  );
}

/** Tiny pulsing dot for the "Syncing…" button state. CSS-only animation. */
function SpinnerDot() {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full bg-navy animate-pulse"
      aria-hidden
    />
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
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

// ---------- helpers ----------

function Toggle({
  label,
  hint,
  value,
  onChange,
  saving,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  saving: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label
          className={`block font-semibold text-sm ${disabled ? "text-gray-400" : "text-navy"}`}
        >
          {label}
        </label>
        {hint && (
          <p
            className={`text-xs mt-0.5 ${disabled ? "text-gray-400" : "text-gray-600"}`}
          >
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled || saving}
        onClick={() => onChange(!value)}
        className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
          value ? "bg-brand" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition transform ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onSave,
  saving,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onSave: (next: number) => void;
  saving: boolean;
  min: number;
  max: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const dirty = parseInt(draft, 10) !== value;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="text-sm font-semibold text-navy sr-only">
        {label}
      </label>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-center font-bold tabular-nums focus:outline-none focus:border-brand"
      />
      {suffix && (
        <span className="text-sm text-gray-600 font-medium">{suffix}</span>
      )}
      <button
        type="button"
        disabled={!dirty || saving}
        onClick={() => {
          const n = parseInt(draft, 10);
          if (Number.isFinite(n) && n >= min && n <= max) onSave(n);
        }}
        className="ml-auto inline-flex items-center px-4 py-2 rounded-lg bg-brand text-navy font-extrabold text-sm hover:bg-[#00E03A] transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
