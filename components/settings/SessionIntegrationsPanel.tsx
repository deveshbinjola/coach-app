"use client";

import { useEffect, useState } from "react";
import {
  SESSION_WEBHOOK_PROVIDER_LABEL,
  type CoachIntegration,
  type SessionWebhookEndpoint,
  type SessionWebhookProvider,
} from "@/lib/types";
import { Badge, Button, useConfirm } from "@/components/ui";
import { ago } from "./utils";

const PROVIDERS: SessionWebhookProvider[] = ["cal_com", "calendly", "zoom"];
type ConnectProvider = SessionWebhookProvider | "granola";

export default function SessionIntegrationsPanel() {
  const { ConfirmDialog, askConfirm } = useConfirm();
  const [endpoints, setEndpoints] = useState<SessionWebhookEndpoint[] | null>(null);
  const [integrations, setIntegrations] = useState<CoachIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingProvider, setCreatingProvider] = useState<SessionWebhookProvider | null>(null);
  const [revealed, setRevealed] = useState<SessionWebhookEndpoint | null>(null);
  const [calKey, setCalKey] = useState("");
  const [granolaKey, setGranolaKey] = useState("");
  const [connectingCal, setConnectingCal] = useState(false);
  const [connectingGranola, setConnectingGranola] = useState(false);
  const [syncingGranola, setSyncingGranola] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/session-webhooks");
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error ?? "Failed to load session integrations.");
        return;
      }
      setEndpoints(payload.endpoints ?? []);
      setIntegrations(payload.integrations ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = ["calendly", "zoom"].find((provider) => params.get(provider) === "connected");
    const failed = ["calendly", "zoom"].find((provider) => params.get(provider) === "error");
    if (connected) {
      setFlash(`${labelFor(connected as SessionWebhookProvider)} connected.`);
    } else if (failed) {
      setFlash(`${labelFor(failed as SessionWebhookProvider)} did not connect: ${params.get("reason") ?? "unknown"}.`);
    }
    load();
  }, []);

  async function connectCalCom() {
    if (!calKey.trim()) return;
    setConnectingCal(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch("/api/integrations/cal-com/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: calKey.trim() }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error ?? "Could not connect Cal.com.");
        return;
      }
      setCalKey("");
      setFlash("Cal.com connected.");
      await load();
    } finally {
      setConnectingCal(false);
    }
  }

  async function connectGranola() {
    if (!granolaKey.trim()) return;
    setConnectingGranola(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch("/api/integrations/granola/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: granolaKey.trim() }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error ?? "Could not connect Granola.");
        return;
      }
      setGranolaKey("");
      setFlash("Granola connected.");
      await load();
    } finally {
      setConnectingGranola(false);
    }
  }

  async function syncGranola() {
    setSyncingGranola(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch("/api/integrations/granola/sync", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error ?? "Could not sync Granola.");
        return;
      }
      setFlash(
        `Granola sync complete. Imported ${payload.imported ?? 0}, unmatched ${payload.unmatched?.length ?? 0}.`
      );
      await load();
    } finally {
      setSyncingGranola(false);
    }
  }

  async function create(provider: SessionWebhookProvider) {
    setCreatingProvider(provider);
    setError(null);
    try {
      const res = await fetch("/api/session-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          name: `${SESSION_WEBHOOK_PROVIDER_LABEL[provider]} sessions`,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error ?? "Could not create session webhook.");
        return;
      }
      setRevealed(payload.endpoint);
      await load();
    } finally {
      setCreatingProvider(null);
    }
  }

  async function toggle(endpoint: SessionWebhookEndpoint) {
    const nextActive = !endpoint.active;
    const ok = await askConfirm({
      title: `${nextActive ? "Resume" : "Pause"} ${SESSION_WEBHOOK_PROVIDER_LABEL[endpoint.provider]}?`,
      description: nextActive
        ? "New session events will start importing again."
        : "New session events from this provider will stop importing.",
      confirmLabel: nextActive ? "Resume" : "Pause",
      destructive: !nextActive,
    });
    if (!ok) return;

    const res = await fetch(`/api/session-webhooks/${endpoint.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: nextActive }),
    });
    if (!res.ok) {
      const payload = await res.json();
      setError(payload?.error ?? "Could not update endpoint.");
      return;
    }
    await load();
  }

  function urlFor(endpoint: Pick<SessionWebhookEndpoint, "provider" | "token">) {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://app.elevateaisystem.com";
    return `${base}/api/v1/webhooks/sessions/${endpoint.provider}/${endpoint.token}`;
  }

  return (
    <section className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
      {ConfirmDialog}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 max-w-xl">
          <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
            Session integrations
          </div>
          <p className="mt-1 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
            Booking and transcript events feed Client Rooms. Use Cal.com or Calendly for scheduling, and Zoom for recording readiness.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <ProviderConnectCard
          provider="calendly"
          integration={integrations.find((item) => item.provider === "calendly")}
          connectHref="/api/integrations/calendly/connect"
          copy="OAuth connect. Creates the booking webhook automatically."
        />
        <ProviderConnectCard
          provider="zoom"
          integration={integrations.find((item) => item.provider === "zoom")}
          connectHref="/api/integrations/zoom/connect"
          copy="OAuth connect. Needed for private cloud recording transcripts."
        />
        <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] p-3">
          <ProviderHeader
            provider="cal_com"
            integration={integrations.find((item) => item.provider === "cal_com")}
          />
          <p className="mt-2 text-[11px] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
            Paste a Cal.com API key. We use it for booking sync when available.
          </p>
          <input
            type="password"
            value={calKey}
            onChange={(event) => setCalKey(event.target.value)}
            className="mt-3 min-h-10 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[length:var(--t-caption)] outline-none focus:border-[var(--brand-strong)]"
            placeholder="Cal.com API key"
          />
          <Button
            size="sm"
            onClick={connectCalCom}
            disabled={!calKey.trim() || connectingCal}
            className="mt-2 w-full"
          >
            {connectingCal ? "Connecting..." : "Connect Cal.com"}
          </Button>
        </div>
        <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] p-3">
          <ProviderHeader
            provider="granola"
            integration={integrations.find((item) => item.provider === "granola")}
          />
          <p className="mt-2 text-[11px] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
            Paste a Granola API key. Sync notes into Client Rooms as session memory.
          </p>
          <input
            type="password"
            value={granolaKey}
            onChange={(event) => setGranolaKey(event.target.value)}
            className="mt-3 min-h-10 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[length:var(--t-caption)] outline-none focus:border-[var(--brand-strong)]"
            placeholder="Granola API key"
          />
          <div className="mt-2 grid gap-2">
            <Button
              size="sm"
              onClick={connectGranola}
              disabled={!granolaKey.trim() || connectingGranola}
              block
            >
              {connectingGranola ? "Connecting..." : "Connect Granola"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={syncGranola}
              disabled={syncingGranola || !integrations.some((item) => item.provider === "granola" && item.status === "active")}
              block
            >
              {syncingGranola ? "Syncing..." : "Sync notes"}
            </Button>
          </div>
        </div>
      </div>

      {flash ? (
        <div className="mt-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_35%,var(--border))] bg-[var(--brand-soft)] p-3 text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
          {flash}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {PROVIDERS.map((provider) => (
          <Button
            key={provider}
            variant="ghost"
            size="sm"
            onClick={() => create(provider)}
            disabled={creatingProvider === provider}
          >
            {creatingProvider === provider
              ? "Creating..."
              : `New ${SESSION_WEBHOOK_PROVIDER_LABEL[provider]} URL`}
          </Button>
        ))}
      </div>

      {revealed ? (
        <div className="mt-4 rounded-[var(--r-md)] border-2 border-[var(--brand)] bg-[var(--brand-soft)] p-3">
          <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
            {SESSION_WEBHOOK_PROVIDER_LABEL[revealed.provider]} URL ready
          </p>
          <div className="mt-2 rounded-[var(--r-sm)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-2 font-mono text-[11px] break-all select-all">
            {urlFor(revealed)}
          </div>
          <div className="mt-2 flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => navigator.clipboard.writeText(urlFor(revealed))}
              className="bg-[var(--navy)] text-[color:var(--brand)] hover:enabled:bg-[var(--navy-soft)]"
            >
              Copy URL
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRevealed(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-[length:var(--t-caption)] text-[color:var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            Loading...
          </p>
        ) : !endpoints || endpoints.length === 0 ? (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            No session URLs yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-faint)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border-faint)]">
            {endpoints.map((endpoint) => (
              <li
                key={endpoint.id}
                className="flex items-start justify-between gap-3 p-3 flex-wrap"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                      {endpoint.name}
                    </span>
                    <Badge tone={endpoint.active ? "brand" : "muted"} size="xs" uppercase>
                      {endpoint.active ? "Active" : "Paused"}
                    </Badge>
                    <Badge tone="neutral" size="xs" uppercase>
                      {SESSION_WEBHOOK_PROVIDER_LABEL[endpoint.provider]}
                    </Badge>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[color:var(--text-faint)] break-all">
                    {urlFor(endpoint)}
                  </div>
                  <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                    {endpoint.total_received} received
                    {endpoint.last_used_at
                      ? `, last used ${ago(endpoint.last_used_at)}`
                      : ", never used"}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(urlFor(endpoint))}
                  >
                    Copy
                  </Button>
                  <Button
                    variant={endpoint.active ? "danger" : "ghost"}
                    size="sm"
                    onClick={() => toggle(endpoint)}
                  >
                    {endpoint.active ? "Pause" : "Resume"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
        Cal.com and Calendly events match by attendee email. Zoom recording events attach when the meeting id or topic matches a saved client event. Private Zoom transcript downloads require OAuth, so v1 stores the recording or transcript link when Zoom sends it.
      </p>
    </section>
  );
}

function ProviderConnectCard({
  provider,
  integration,
  connectHref,
  copy,
}: {
  provider: SessionWebhookProvider;
  integration?: CoachIntegration;
  connectHref: string;
  copy: string;
}) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] p-3">
      <ProviderHeader provider={provider} integration={integration} />
      <p className="mt-2 text-[11px] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
        {copy}
      </p>
      <a
        href={connectHref}
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-3 text-[length:var(--t-caption)] font-extrabold text-[color:var(--navy)] transition hover:bg-[var(--brand-strong)]"
      >
        {integration?.status === "active" ? "Reconnect" : `Connect ${labelFor(provider)}`}
      </a>
    </div>
  );
}

function ProviderHeader({
  provider,
  integration,
}: {
  provider: ConnectProvider;
  integration?: CoachIntegration;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
          {labelFor(provider)}
        </div>
        {integration?.account_email ? (
          <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
            {integration.account_email}
          </div>
        ) : null}
      </div>
      <Badge tone={integration?.status === "active" ? "brand" : "muted"} size="xs" uppercase>
        {integration?.status === "active" ? "Connected" : "Not connected"}
      </Badge>
    </div>
  );
}

function labelFor(provider: ConnectProvider) {
  return provider === "granola" ? "Granola" : SESSION_WEBHOOK_PROVIDER_LABEL[provider];
}
