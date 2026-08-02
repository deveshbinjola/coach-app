"use client";

// ApiKeysPanel — generate, list, and revoke keys that external agents
// (Claude Desktop, Cursor, n8n, custom GPTs) use to hit /api/v1/*.
//
// Two design choices worth flagging:
//
//   1. Just-created flash shows the raw secret ONCE. We never display
//      it again — coaches who lose it have to issue a new key. This
//      matches the GitHub / Stripe / etc. industry pattern.
//
//   2. Scope is decided at create-time, not editable later. Coaches
//      who want to swap a read-only key for a read+write one issue
//      a new key and revoke the old. Forces them to think about
//      which agent gets which scope.

import { useEffect, useState } from "react";
import type { ApiKey } from "@/lib/types";
import { Badge, Button, useConfirm } from "@/components/ui";
import ScopeOption from "./ScopeOption";
import { BookOpen, Key, Zap } from "lucide-react";

export default function ApiKeysPanel() {
  const { ConfirmDialog, askConfirm } = useConfirm();
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
    const ok = await askConfirm({
      title:        "Revoke this key?",
      description:  "Any agent using it will start failing immediately. You can issue a new key any time.",
      confirmLabel: "Revoke",
      destructive:  true,
    });
    if (!ok) return;
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
      {ConfirmDialog}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-[length:var(--t-h2)] font-extrabold mb-1 text-[color:var(--text)] leading-[var(--leading-tight)]">API keys</h2>
          <p className="text-sm text-[color:var(--text-muted)]">
            Keys for plugging your AI agent (Claude Desktop, Cursor, n8n,
            custom GPTs, anything) into Coach Platform. Read your focus
            queue, log messages, create leads — agent-first.
          </p>
        </div>
        {!showCreate && (
          <Button onClick={() => setShowCreate(true)} className="whitespace-nowrap">
            + Generate key
          </Button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mt-4 p-4 rounded-[var(--r-md)] bg-surface border border-[var(--border)]">
          <label className="block text-[length:var(--t-eyebrow)] uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)] font-bold mb-1">
            Key name (helps you tell keys apart)
          </label>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Claude Desktop"
            maxLength={100}
            className="w-full p-2 rounded border border-[var(--border)] text-sm focus:outline-none focus:border-brand"
          />

          <label className="block text-[length:var(--t-eyebrow)] uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)] font-bold mt-3 mb-1">
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
            <Button onClick={createKey} disabled={creating || !newKeyName.trim()}>
              {creating ? "Generating…" : "Generate"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                setNewKeyName("");
                setNewKeyScope("read_write");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Just-created flash — shows the raw key ONCE, plus an install
          snippet pre-filled with that key (also won't be available again). */}
      {justCreated && (
        <div className="mt-4 p-4 rounded-[var(--r-md)] border-2 border-brand bg-[#F0FFF4]">
          <p className="text-sm font-extrabold text-navy">
            <Key size={14} strokeWidth={2.2} className="mr-1.5 inline align-[-2px]" aria-hidden />Save this key now — we won't show it again.
          </p>

          <label className="block text-[length:var(--t-eyebrow)] uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)] font-bold mt-3 mb-1">
            Raw key
          </label>
          <div className="p-3 rounded bg-[var(--surface-elevated)] border border-[var(--border)] font-mono text-xs break-all select-all">
            {justCreated.raw}
          </div>
          <Button
            size="sm"
            onClick={() => navigator.clipboard.writeText(justCreated.raw)}
            className="mt-1.5 bg-navy text-white hover:enabled:bg-navy-soft"
          >
            Copy raw key
          </Button>

          {/* Phase 9 — Claude Desktop / Cursor MCP config snippet, pre-filled
              with the raw key. Coach pastes into their MCP client config and
              their agent is connected. Two clicks total. */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-bold text-navy hover:text-brand-strong">
              <Zap size={14} strokeWidth={2.2} className="mr-1.5 inline align-[-2px]" aria-hidden />Connect to Claude Desktop / Cursor
            </summary>
            <div className="mt-3">
              <p className="text-xs text-[color:var(--text-muted)] leading-relaxed mb-2">
                Paste the snippet below into your MCP client config:
              </p>
              <ul className="text-[11px] text-[color:var(--text-muted)] space-y-0.5 mb-3 list-disc pl-5">
                <li>
                  <b>Claude Desktop (macOS):</b>{" "}
                  <code className="px-1 bg-[var(--surface-deep)] rounded">
                    ~/Library/Application Support/Claude/claude_desktop_config.json
                  </code>
                </li>
                <li>
                  <b>Cursor:</b>{" "}
                  <code className="px-1 bg-[var(--surface-deep)] rounded">
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
              <Button
                size="sm"
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
                className="mt-2"
              >
                Copy MCP config
              </Button>
              <p className="text-[11px] text-[color:var(--text-faint)] mt-2 leading-relaxed">
                Restart Claude Desktop / Cursor after saving. The MCP server
                auto-installs on first run via npx. You'll see tools like{" "}
                <code className="px-1 bg-[var(--surface-deep)] rounded">
                  get_focus_queue
                </code>{" "}
                and{" "}
                <code className="px-1 bg-[var(--surface-deep)] rounded">create_lead</code>{" "}
                appear in your agent's tool list.
              </p>
            </div>
          </details>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setJustCreated(null)}
            className="mt-3"
          >
            I've saved it — dismiss
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 rounded bg-[var(--danger-soft)] border border-[var(--danger-border)] text-sm text-[color:var(--danger)]">
          {error}
        </div>
      )}

      {/* Key list */}
      <div className="mt-5">
        {loading ? (
          <p className="text-xs text-[color:var(--text-faint)]">Loading keys…</p>
        ) : !keys || keys.length === 0 ? (
          <p className="text-xs text-[color:var(--text-faint)] italic">
            No keys yet. Generate one to start plugging agents in.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-faint)] border border-[var(--border)] rounded-[var(--r-md)] overflow-hidden">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-4 p-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-navy">
                      {k.name}
                    </span>
                    {k.revoked_at ? (
                      <Badge tone="danger" size="xs" uppercase>
                        Revoked
                      </Badge>
                    ) : (
                      <Badge tone="brand" size="xs" uppercase>
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-[color:var(--text-faint)] mt-0.5 font-mono">
                    {k.key_prefix}… · {(k.scopes ?? []).join(" + ")}
                  </div>
                  <div className="text-[11px] text-[color:var(--text-faint)] mt-0.5">
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at && (
                      <> · last used {new Date(k.last_used_at).toLocaleDateString()}</>
                    )}
                    {!k.last_used_at && !k.revoked_at && <> · never used</>}
                  </div>
                </div>
                {!k.revoked_at && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => revokeKey(k.id)}
                    disabled={revoking === k.id}
                  >
                    {revoking === k.id ? "Revoking…" : "Revoke"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-[color:var(--text-faint)] mt-3 leading-relaxed">
        Use as <code className="px-1 bg-[var(--surface-deep)] rounded">Authorization: Bearer cp_live_…</code> on any{" "}
        <code className="px-1 bg-[var(--surface-deep)] rounded">/api/v1/*</code> endpoint.
        Full reference and MCP tool list:{" "}
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener"
          className="text-brand-strong font-bold underline decoration-dotted hover:text-navy"
        >
          <BookOpen size={14} strokeWidth={2.2} className="mr-1.5 inline align-[-2px]" aria-hidden />API docs
        </a>
      </p>

      {/* Agent activity hidden — moves to /developers route alongside API
          keys + webhooks. Component preserved for that future surface.
          {<AgentActivityPanel />} */}
    </section>
  );
}
