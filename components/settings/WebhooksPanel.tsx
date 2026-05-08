"use client";

// WebhooksPanel — per-source inbound URLs the coach pastes into Tally,
// Typeform, Calendly, or any tool that POSTs JSON.
//
// Each endpoint owns its default source/source_detail so leads come in
// pre-attributed without requiring the upstream tool to send those
// fields. Token-based auth — no shared secret, the URL itself is the
// credential. Coaches can pause / resume / regenerate without touching
// the upstream config.

import { useEffect, useState } from "react";
import type { LeadSource, WebhookEndpoint } from "@/lib/types";
import { useConfirm } from "@/components/ui";
import { ago } from "./utils";

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

export default function WebhooksPanel() {
  const { ConfirmDialog, askConfirm } = useConfirm();
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
    const ok = await askConfirm({
      title:        `${verb} this webhook?`,
      description:  current
        ? "Inbound calls will start failing immediately. You can resume any time."
        : "Inbound calls will start working again right away.",
      confirmLabel: verb,
      destructive:  current,
    });
    if (!ok) return;
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
      {ConfirmDialog}
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
