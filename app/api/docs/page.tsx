// /api/docs, public API reference for /api/v1/*.
//
// No auth needed. This page is meant to be browseable by humans and by
// agents that fetch URLs to learn what's available. Lives at
// app.elevateaisystem.com/api/docs.

export const dynamic = "force-static";

type Endpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  scope: "read" | "write";
  params?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  body?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  response: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/focus",
    summary:
      "Top N urgent leads ranked by SLA × score. The same ranking Command Center uses. Use this to answer 'who should I talk to today'.",
    scope: "read",
    params: [
      {
        name: "limit",
        type: "integer 1..50",
        required: false,
        description: "Default 8.",
      },
    ],
    response: `{
  "focus": [
    {
      "lead": { ...full lead row },
      "score": 95,
      "sla_state": "overdue",
      "sla_hours_elapsed": 192.4,
      "sla_label": "Silent · 8d"
    }
  ],
  "total_active": 87,
  "generated_at": "2026-04-26T18:00:00Z"
}`,
  },
  {
    method: "GET",
    path: "/api/v1/leads",
    summary: "List the coach's leads. Paginated, filterable.",
    scope: "read",
    params: [
      {
        name: "status",
        type: "string",
        required: false,
        description:
          "new | contacted | qualified | booked | client | closed_lost",
      },
      {
        name: "temperature",
        type: "string",
        required: false,
        description: "on_fire | hot | warm | cold | dormant",
      },
      {
        name: "limit",
        type: "integer 1..200",
        required: false,
        description: "Default 50.",
      },
      {
        name: "offset",
        type: "integer ≥0",
        required: false,
        description: "For pagination.",
      },
    ],
    response: `{
  "leads": [ { ...lead rows } ],
  "pagination": { "limit": 50, "offset": 0, "total": 332 }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/leads",
    summary:
      "Create a new lead. Auto-Response Engine fires automatically and appears in Command Center within ~30 seconds.",
    scope: "write",
    body: [
      {
        name: "full_name",
        type: "string",
        required: true,
        description: "REQUIRED.",
      },
      { name: "email", type: "string", required: false, description: "" },
      { name: "phone", type: "string", required: false, description: "" },
      {
        name: "source",
        type: "string",
        required: false,
        description:
          "ig | linkedin | referral | quiz | in_person | podcast | newsletter | other (default 'other')",
      },
      {
        name: "source_detail",
        type: "string",
        required: false,
        description: "Specifics (e.g. 'AMLT retreat').",
      },
      {
        name: "temperature",
        type: "string",
        required: false,
        description:
          "on_fire | hot | warm | cold | dormant (default 'warm')",
      },
      {
        name: "pain_signal",
        type: "string[]",
        required: false,
        description:
          "heartbreak, relationship_conflict, purpose_confusion, emotional_numbness, masculinity_identity, business_pressure, burnout",
      },
      { name: "notes", type: "string", required: false, description: "" },
      {
        name: "next_honest_action",
        type: "string",
        required: false,
        description:
          "invite_to_call | follow_up_soft | send_resource | waiting_on_them | hold | close_loop",
      },
      {
        name: "auto_draft_eligible",
        type: "boolean",
        required: false,
        description: "Default true. Set false to skip auto-response (e.g. backfill).",
      },
    ],
    response: `{
  "lead": { ...inserted lead row including id }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/leads/{id}",
    summary: "Fetch a single lead with up to 100 most recent messages.",
    scope: "read",
    response: `{
  "lead": { ...lead row },
  "messages": [ { ...message rows, oldest first } ]
}`,
  },
  {
    method: "PATCH",
    path: "/api/v1/leads/{id}",
    summary:
      "Update mutable fields on a lead. Whitelist: status, temperature, source, source_detail, email, phone, notes, pain_signal, next_honest_action, discovery_call_completed, income_band, readiness_signal, fit_notes, next_followup_at, last_contact_at, disqualified_reason. Other fields silently dropped.",
    scope: "write",
    body: [
      {
        name: "(any whitelisted field)",
        type: "varies",
        required: false,
        description: "At least one required.",
      },
    ],
    response: `{
  "lead": { ...updated lead row }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/leads/{id}/messages",
    summary:
      "Log an inbound, outbound, or draft message. Outbound bumps lead status from 'new' → 'contacted' and updates last_contact_at.",
    scope: "write",
    body: [
      {
        name: "content",
        type: "string",
        required: true,
        description: "REQUIRED. Message body.",
      },
      {
        name: "direction",
        type: "string",
        required: true,
        description: "REQUIRED. inbound | outbound | draft",
      },
      {
        name: "channel",
        type: "string",
        required: false,
        description:
          "email | dm_ig | dm_linkedin | sms | call | other (default 'other')",
      },
      {
        name: "ai_drafted",
        type: "boolean",
        required: false,
        description: "Set true if you (the agent) drafted this.",
      },
      {
        name: "purpose",
        type: "string",
        required: false,
        description:
          "first_response | follow_up | rewarm | ad_hoc",
      },
    ],
    response: `{
  "message": { ...inserted message row }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/leads/{id}/draft",
    summary:
      "Trigger the Auto-Response Engine on demand to generate a fresh first-response draft for this lead. Idempotent, won't duplicate an existing pending draft.",
    scope: "write",
    response: `{ "ok": true, "lead_id": "...", "channel": "email", "draft_length": 247 }
or
{ "skipped": "already_drafted" | "no_voice_profile" | "auto_draft_disabled" | ... }`,
  },
  {
    method: "GET",
    path: "/api/v1/voice",
    summary:
      "Coach's active Brand OS voice profile. Pull this BEFORE drafting any message so output sounds like the coach.",
    scope: "read",
    response: `{
  "voice": {
    "id": "...",
    "version": 3,
    "voice_json": { ...full voice profile },
    "sample_messages": [ "...", ... ],
    "active": true,
    "created_at": "..."
  }
}
or
{ "voice": null, "message": "No active voice profile..." }`,
  },
  {
    method: "POST",
    path: "/api/v1/voice",
    summary:
      "Import a Brand OS Step 2 voice artifact as the coach's active voice profile. Deactivates the previous active version and inserts a new one.",
    scope: "write",
    body: [
      {
        name: "voice_json",
        type: "object",
        required: true,
        description:
          "Full Brand OS voice artifact. Accepts voice_json, voice, or brand_os_voice as aliases.",
      },
      {
        name: "sample_messages",
        type: "string[]",
        required: false,
        description:
          "Up to 10 actual coach-written samples. Strongly recommended for voice fidelity.",
      },
    ],
    response: `{
  "voice": {
    "id": "...",
    "version": 4,
    "voice_json": { ...full voice profile },
    "sample_messages": [ "...", ... ],
    "active": true,
    "created_at": "..."
  },
  "message": "Voice profile imported. Future drafts will use this active voice."
}`,
  },
];

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#1A1A2E]">
      <div className="max-w-4xl mx-auto p-8">
        <header className="mb-10 pb-6 border-b border-gray-200">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#00CC34]">
            ⚡ Coach Platform API · v1
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight mt-2">
            REST + MCP reference
          </h1>
          <p className="text-base text-gray-700 mt-3 leading-relaxed max-w-2xl">
            The agent surface for Coach Platform. Plug your AI agent (Claude
            Desktop, Cursor, custom GPT, n8n, anything) into your pipeline.
            All endpoints require Bearer authentication.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-xl font-extrabold mb-3">Authentication</h2>
          <p className="text-sm text-gray-700 mb-3 leading-relaxed">
            Generate an API key at{" "}
            <a
              href="/settings"
              className="text-[#00CC34] font-bold underline decoration-dotted"
            >
              /settings → API keys
            </a>
            . Pass it as a Bearer token on every request:
          </p>
          <pre className="p-4 rounded-lg bg-[#0A0F1C] text-[#E5E7EB] text-xs font-mono overflow-x-auto">
{`curl https://app.elevateaisystem.com/api/v1/focus \\
  -H "Authorization: Bearer cp_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
          </pre>
          <p className="text-xs text-gray-600 mt-3">
            Keys carry <code className="px-1 bg-gray-100 rounded">read</code>{" "}
            and <code className="px-1 bg-gray-100 rounded">write</code> scopes
            by default. Read-only endpoints work with either; mutating
            endpoints (POST, PATCH) require write scope.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-extrabold mb-3">MCP server</h2>
          <p className="text-sm text-gray-700 mb-2 leading-relaxed">
            For Claude Desktop / Cursor / any MCP-compatible client, install{" "}
            <code className="px-1 bg-gray-100 rounded">
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

        <footer className="mt-16 pt-6 border-t border-gray-200 text-xs text-gray-500">
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
    GET: "bg-[#00FF41]/15 text-green-900 border-[#00FF41]/40",
    POST: "bg-blue-50 text-blue-900 border-blue-200",
    PATCH: "bg-amber-50 text-amber-900 border-amber-200",
    DELETE: "bg-red-50 text-red-900 border-red-200",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span
          className={`text-[11px] font-extrabold uppercase tracking-wider px-2 py-1 rounded border ${methodColors[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <code className="text-sm font-mono font-bold text-[#0A0F1C]">
          {endpoint.path}
        </code>
        <span
          className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${
            endpoint.scope === "write"
              ? "bg-amber-100 text-amber-900"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {endpoint.scope} scope
        </span>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed mb-4">
        {endpoint.summary}
      </p>

      {endpoint.params && endpoint.params.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500 mb-2">
            Query parameters
          </h3>
          <ParamTable rows={endpoint.params} />
        </div>
      )}

      {endpoint.body && endpoint.body.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500 mb-2">
            Request body (JSON)
          </h3>
          <ParamTable rows={endpoint.body} />
        </div>
      )}

      <div>
        <h3 className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500 mb-2">
          Response (200)
        </h3>
        <pre className="p-3 rounded bg-[#0A0F1C] text-[#E5E7EB] text-[11px] font-mono overflow-x-auto leading-relaxed">
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
        <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-200">
          <th className="py-1.5 pr-3 font-bold">Field</th>
          <th className="py-1.5 pr-3 font-bold">Type</th>
          <th className="py-1.5 pr-3 font-bold">Req?</th>
          <th className="py-1.5 font-bold">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.name} className="border-b border-gray-100 align-top">
            <td className="py-1.5 pr-3 font-mono font-semibold text-[#0A0F1C]">
              {p.name}
            </td>
            <td className="py-1.5 pr-3 font-mono text-gray-600">{p.type}</td>
            <td className="py-1.5 pr-3">
              {p.required ? (
                <span className="text-amber-700 font-bold">yes</span>
              ) : (
                <span className="text-gray-400">no</span>
              )}
            </td>
            <td className="py-1.5 text-gray-600 leading-relaxed">
              {p.description || "None"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
