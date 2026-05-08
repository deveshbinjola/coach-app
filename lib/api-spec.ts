// Public API spec for /api/v1/* — type + data only.
//
// Lives here (not in the docs page) so that:
//   1. The endpoint catalog can grow without bloating a 484-line page
//      file. Each new endpoint is one entry in the array, no JSX churn.
//   2. Other surfaces can import the same data — e.g. a future MCP
//      tool catalog, an OpenAPI generator, or in-app inline help.
//   3. The page renders this and stays focused on layout, not content.
//
// When you add a route under app/api/v1/**, append a matching entry
// here so /api/docs picks it up automatically.

export type Endpoint = {
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

export const ENDPOINTS: Endpoint[] = [
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
