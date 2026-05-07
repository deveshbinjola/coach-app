#!/usr/bin/env node
// Coach Platform MCP server.
//
// Wraps the /api/v1/* REST surface as MCP tools so any MCP-compatible
// client (Claude Desktop, Cursor, custom GPT-via-bridge, etc.) can plug
// directly into a coach's pipeline.
//
// Configuration via env vars (clients pass these through their MCP config):
//   COACH_PLATFORM_API_KEY   — required, format: cp_live_...
//   COACH_PLATFORM_BASE_URL  — optional, defaults to production
//
// Six tools are exposed:
//   - get_focus_queue        — top N urgent leads ranked by SLA × score
//   - list_leads             — paginated list with optional filters
//   - get_lead               — single lead with last 100 messages
//   - create_lead            — add a new lead; auto-draft fires automatically
//   - log_message            — append inbound/outbound/draft to a lead
//   - get_voice_profile      — coach's active Brand OS voice profile

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CoachPlatformClient } from "./client.js";

const apiKey = process.env.COACH_PLATFORM_API_KEY;
if (!apiKey) {
  console.error(
    "[coach-platform-mcp] FATAL: COACH_PLATFORM_API_KEY env var is required.\n" +
      "Generate one at https://app.elevateaisystem.com/settings → API keys."
  );
  process.exit(1);
}

const baseUrl = process.env.COACH_PLATFORM_BASE_URL;
const client = new CoachPlatformClient({ apiKey, baseUrl });

const server = new McpServer({
  name: "coach-platform",
  version: "0.1.0",
});

// ---------- Read tools ----------

server.tool(
  "get_focus_queue",
  "Get the coach's top N urgent leads — ranked by SLA state (overdue > warning > on_pace) and lead score. Use this first when the coach asks 'who should I message today' or 'what's on my plate'. Returns the same ranking the dashboard's /today page uses.",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Number of leads to return (default 8, max 50)."),
  },
  async ({ limit }) => {
    const data = await client.getFocusQueue(limit);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_leads",
  "List the coach's leads with optional filters and pagination. For exploring the pipeline beyond the focus queue. Filter by status (new/contacted/qualified/booked/client/closed_lost) or temperature (on_fire/hot/warm/cold/dormant).",
  {
    status: z
      .enum([
        "new",
        "contacted",
        "qualified",
        "booked",
        "client",
        "closed_lost",
      ])
      .optional(),
    temperature: z
      .enum(["on_fire", "hot", "warm", "cold", "dormant"])
      .optional(),
    limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
    offset: z.number().int().min(0).optional().describe("For pagination."),
  },
  async (filters) => {
    const data = await client.listLeads(filters);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_lead",
  "Fetch a single lead by ID, including up to 100 of their most recent messages (oldest first). Use this when drafting a follow-up or summarizing where a relationship stands.",
  {
    lead_id: z.string().uuid().describe("UUID of the lead."),
  },
  async ({ lead_id }) => {
    const data = await client.getLead(lead_id);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_voice_profile",
  "Fetch the coach's active Brand OS voice profile — tone, vocabulary, openers, closers, sentence rhythm, do-nots. Pull this BEFORE drafting any message so your output sounds like the coach, not like a generic AI.",
  {},
  async () => {
    const data = await client.getVoice();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ---------- Write tools ----------

server.tool(
  "update_lead",
  "Update mutable fields on an existing lead — status, temperature, notes, pain_signal, next_honest_action, source, and more. Use this when the coach gives an instruction like 'mark Sarah as qualified', 'this one's gone cold', or 'add a note that he wants weekly support'. Read-only fields like full_name and id can't be changed via this tool.",
  {
    lead_id: z.string().uuid(),
    status: z
      .enum([
        "new",
        "contacted",
        "qualified",
        "booked",
        "client",
        "closed_lost",
      ])
      .optional(),
    temperature: z
      .enum(["on_fire", "hot", "warm", "cold", "dormant"])
      .optional(),
    source: z
      .enum([
        "ig",
        "linkedin",
        "referral",
        "quiz",
        "in_person",
        "podcast",
        "newsletter",
        "other",
      ])
      .optional(),
    source_detail: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    pain_signal: z
      .array(
        z.enum([
          "heartbreak",
          "relationship_conflict",
          "purpose_confusion",
          "emotional_numbness",
          "masculinity_identity",
          "business_pressure",
          "burnout",
        ])
      )
      .optional(),
    next_honest_action: z
      .enum([
        "invite_to_call",
        "follow_up_soft",
        "send_resource",
        "waiting_on_them",
        "hold",
        "close_loop",
      ])
      .optional()
      .nullable(),
    discovery_call_completed: z.boolean().optional(),
    income_band: z
      .enum(["under_10k_mo", "10k_30k_mo", "30k_plus_mo", "unknown"])
      .optional()
      .nullable(),
    readiness_signal: z
      .enum([
        "researching",
        "comparing",
        "ready_now",
        "dormant_explorer",
        "tire_kicker",
      ])
      .optional()
      .nullable(),
    fit_notes: z.string().optional().nullable(),
    next_followup_at: z.string().datetime().optional().nullable(),
  },
  async ({ lead_id, ...patch }) => {
    const data = await client.updateLead(lead_id, patch);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "request_auto_draft",
  "Trigger the Auto-Response Engine on demand to generate a fresh first-response draft for a specific lead. Use when a lead's auto-draft was discarded, never fired, or you want to regenerate one. The Edge Function is idempotent — won't duplicate an existing pending draft. Returns either { ok: true, ... } on success or { skipped: '...' } when a no-op (already drafted, no voice profile, etc.).",
  {
    lead_id: z.string().uuid(),
  },
  async ({ lead_id }) => {
    const data = await client.requestDraft(lead_id);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);


server.tool(
  "create_lead",
  "Add a new lead to the pipeline. The Auto-Response Engine will fire automatically and draft a first-touch message in the coach's voice (visible on /today within ~30 seconds). Returns the inserted lead row.",
  {
    full_name: z.string().min(1).describe("REQUIRED. The lead's full name."),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    source: z
      .enum([
        "ig",
        "linkedin",
        "referral",
        "quiz",
        "in_person",
        "podcast",
        "newsletter",
        "other",
      ])
      .optional()
      .describe("Where the lead came from. Default 'other'."),
    source_detail: z
      .string()
      .optional()
      .nullable()
      .describe(
        "Specifics about source — 'AMLT retreat', 'Reel: masculine leadership 2026-04-18'."
      ),
    temperature: z
      .enum(["on_fire", "hot", "warm", "cold", "dormant"])
      .optional()
      .describe("Default 'warm'."),
    notes: z
      .string()
      .optional()
      .nullable()
      .describe("Free-text context — what the lead said, what they want."),
    pain_signal: z
      .array(
        z.enum([
          "heartbreak",
          "relationship_conflict",
          "purpose_confusion",
          "emotional_numbness",
          "masculinity_identity",
          "business_pressure",
          "burnout",
        ])
      )
      .optional(),
    auto_draft_eligible: z
      .boolean()
      .optional()
      .describe(
        "Default true. Set false to skip the auto-response (e.g. backfill imports)."
      ),
  },
  async (lead) => {
    const data = await client.createLead(lead);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "log_message",
  "Log an inbound or outbound message against a lead. Use 'outbound' after the coach (or you, on their approval) sends a message — it will bump the lead's status from 'new' to 'contacted' and update last_contact_at. Use 'inbound' when a lead replies (resets the SLA clock). Use 'draft' to stage an unsent draft for review.",
  {
    lead_id: z.string().uuid(),
    content: z.string().min(1).describe("The message body (verbatim)."),
    direction: z
      .enum(["inbound", "outbound", "draft"])
      .describe(
        "'outbound' = coach sent this. 'inbound' = lead replied. 'draft' = pending coach review."
      ),
    channel: z
      .enum(["email", "dm_ig", "dm_linkedin", "sms", "call", "other"])
      .optional()
      .describe("Default 'other'."),
    ai_drafted: z
      .boolean()
      .optional()
      .describe("Set true if you (the agent) drafted this message."),
    purpose: z
      .enum(["first_response", "follow_up", "rewarm", "ad_hoc"])
      .optional()
      .nullable(),
  },
  async ({ lead_id, ...msg }) => {
    const data = await client.logMessage(lead_id, msg as any);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ---------- Boot ----------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // No console.log here — stdout is the MCP transport. Diagnostics go to stderr.
  console.error(
    `[coach-platform-mcp] Connected. Base URL: ${
      baseUrl ?? "https://app.elevateaisystem.com"
    }`
  );
}

main().catch((err) => {
  console.error("[coach-platform-mcp] Fatal:", err);
  process.exit(1);
});
