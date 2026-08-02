// /api/docs, public API reference for /api/v1/*.
//
// No auth needed. This page is meant to be browseable by humans and by
// agents that fetch URLs to learn what's available. Lives at
// app.elevateaisystem.com/api/docs.
//
// Endpoint catalog moved to lib/api-spec.ts so this page can stay
// focused on layout while the spec grows. Add new entries there.

import { ENDPOINTS, type Endpoint } from "@/lib/api-spec";

export const dynamic = "force-static";


export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-[var(--surface)] text-[color:var(--text)]">
      <div className="max-w-4xl mx-auto p-8">
        <header className="mb-10 pb-6 border-b border-[var(--border)]">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#00CC34]">
            Coach Platform API · v1
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight mt-2">
            REST + MCP reference
          </h1>
          <p className="text-base text-[color:var(--text-muted)] mt-3 leading-relaxed max-w-2xl">
            The agent surface for Coach Platform. Plug your AI agent (Claude
            Desktop, Cursor, custom GPT, n8n, anything) into your pipeline.
            All endpoints require Bearer authentication.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-xl font-extrabold mb-3">Authentication</h2>
          <p className="text-sm text-[color:var(--text-muted)] mb-3 leading-relaxed">
            Generate an API key at{" "}
            <a
              href="/settings"
              className="text-[#00CC34] font-bold underline decoration-dotted"
            >
              /settings → API keys
            </a>
            . Pass it as a Bearer token on every request:
          </p>
          <pre className="p-4 rounded-[var(--r-md)] bg-[var(--navy)] text-[#E5E7EB] text-xs font-mono overflow-x-auto">
{`curl https://app.elevateaisystem.com/api/v1/focus \\
  -H "Authorization: Bearer cp_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
          </pre>
          <p className="text-xs text-[color:var(--text-muted)] mt-3">
            Keys carry <code className="px-1 bg-[var(--surface-deep)] rounded">read</code>{" "}
            and <code className="px-1 bg-[var(--surface-deep)] rounded">write</code> scopes
            by default. Read-only endpoints work with either; mutating
            endpoints (POST, PATCH) require write scope.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-extrabold mb-3">MCP server</h2>
          <p className="text-sm text-[color:var(--text-muted)] mb-2 leading-relaxed">
            For Claude Desktop / Cursor / any MCP-compatible client, install{" "}
            <code className="px-1 bg-[var(--surface-deep)] rounded">
              @elevate-ai/coach-platform-mcp
            </code>{" "}
            via the snippet shown when you generate a key. The MCP server
            wraps every endpoint below as a tool the agent can call directly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-extrabold mb-4">Endpoints</h2>
          <div className="space-y-6">
            {ENDPOINTS.map((ep, i) => (
              <EndpointCard key={i} endpoint={ep} />
            ))}
          </div>
        </section>

        <footer className="mt-16 pt-6 border-t border-[var(--border)] text-xs text-[color:var(--text-faint)]">
          Coach Platform v1 · Built by{" "}
          <a
            href="https://www.elevateaisystem.com"
            className="text-[#00CC34] underline"
          >
            ElevateAI System
          </a>
          . Questions:{" "}
          <a
            href="mailto:sunny.binjola@gmail.com"
            className="text-[#00CC34] underline"
          >
            sunny.binjola@gmail.com
          </a>
          .
        </footer>
      </div>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const methodColors: Record<Endpoint["method"], string> = {
    GET: "bg-[var(--brand-soft)] text-[color:var(--success)] border-[var(--brand)]/40",
    POST: "bg-[var(--info-soft)] text-[color:var(--info)] border-[var(--info)]",
    PATCH: "bg-[var(--warning-soft)] text-[color:var(--warning)] border-[var(--warning-border)]",
    DELETE: "bg-[var(--danger-soft)] text-[color:var(--danger)] border-[var(--danger-border)]",
  };

  return (
    <div className="bg-[var(--surface-elevated)] rounded-[var(--r-lg)] border border-[var(--border)] p-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span
          className={`text-[11px] font-extrabold uppercase tracking-wider px-2 py-1 rounded border ${methodColors[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <code className="text-sm font-mono font-bold text-[var(--navy)]">
          {endpoint.path}
        </code>
        <span
          className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${
            endpoint.scope === "write"
              ? "bg-[var(--warning-soft)] text-[color:var(--warning)]"
              : "bg-[var(--surface-deep)] text-[color:var(--text-muted)]"
          }`}
        >
          {endpoint.scope} scope
        </span>
      </div>
      <p className="text-sm text-[color:var(--text-muted)] leading-relaxed mb-4">
        {endpoint.summary}
      </p>

      {endpoint.params && endpoint.params.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-[color:var(--text-faint)] mb-2">
            Query parameters
          </h3>
          <ParamTable rows={endpoint.params} />
        </div>
      )}

      {endpoint.body && endpoint.body.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-[color:var(--text-faint)] mb-2">
            Request body (JSON)
          </h3>
          <ParamTable rows={endpoint.body} />
        </div>
      )}

      <div>
        <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-[color:var(--text-faint)] mb-2">
          Response (200)
        </h3>
        <pre className="p-3 rounded bg-[var(--navy)] text-[#E5E7EB] text-[11px] font-mono overflow-x-auto leading-relaxed">
          {endpoint.response}
        </pre>
      </div>
    </div>
  );
}

function ParamTable({
  rows,
}: {
  rows: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wider text-[color:var(--text-faint)] font-bold border-b border-[var(--border)]">
          <th className="py-1.5 pr-3 font-bold">Field</th>
          <th className="py-1.5 pr-3 font-bold">Type</th>
          <th className="py-1.5 pr-3 font-bold">Req?</th>
          <th className="py-1.5 font-bold">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.name} className="border-b border-[var(--border-faint)] align-top">
            <td className="py-1.5 pr-3 font-mono font-semibold text-[var(--navy)]">
              {p.name}
            </td>
            <td className="py-1.5 pr-3 font-mono text-[color:var(--text-muted)]">{p.type}</td>
            <td className="py-1.5 pr-3">
              {p.required ? (
                <span className="text-[color:var(--warning)] font-bold">yes</span>
              ) : (
                <span className="text-[color:var(--text-faint)]">no</span>
              )}
            </td>
            <td className="py-1.5 text-[color:var(--text-muted)] leading-relaxed">
              {p.description || "None"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
