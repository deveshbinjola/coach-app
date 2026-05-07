// Thin fetch wrapper around the Coach Platform REST API.
//
// Auth: Bearer token (cp_live_...). The MCP server reads it from the
// COACH_PLATFORM_API_KEY env var on startup. Base URL is configurable so
// the same package can target dev (http://localhost:3000) or prod
// (https://app.elevateaisystem.com) without code changes.

const DEFAULT_BASE_URL = "https://app.elevateaisystem.com";

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

export class CoachPlatformClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(opts: { baseUrl?: string; apiKey: string }) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = opts.apiKey;
  }

  async request<T = unknown>(
    path: string,
    opts: RequestOptions = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) {
      let errorBody: string;
      try {
        errorBody = await res.text();
      } catch {
        errorBody = res.statusText;
      }
      throw new Error(
        `Coach Platform API error ${res.status}: ${errorBody}`
      );
    }
    return (await res.json()) as T;
  }

  // ---------- Convenience methods (typed wrappers) ----------

  getFocusQueue(limit?: number) {
    return this.request("/api/v1/focus", { query: { limit } });
  }

  listLeads(filters: {
    status?: string;
    temperature?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    return this.request("/api/v1/leads", { query: filters });
  }

  getLead(leadId: string) {
    return this.request(`/api/v1/leads/${encodeURIComponent(leadId)}`);
  }

  updateLead(
    leadId: string,
    patch: Record<string, unknown>
  ) {
    return this.request(`/api/v1/leads/${encodeURIComponent(leadId)}`, {
      method: "PATCH",
      body: patch,
    });
  }

  requestDraft(leadId: string) {
    return this.request(
      `/api/v1/leads/${encodeURIComponent(leadId)}/draft`,
      { method: "POST" }
    );
  }

  createLead(lead: {
    full_name: string;
    email?: string | null;
    phone?: string | null;
    source?: string;
    source_detail?: string | null;
    temperature?: string;
    notes?: string | null;
    pain_signal?: string[];
    next_honest_action?: string | null;
    auto_draft_eligible?: boolean;
  }) {
    return this.request("/api/v1/leads", { method: "POST", body: lead });
  }

  logMessage(
    leadId: string,
    msg: {
      content: string;
      direction: "inbound" | "outbound" | "draft";
      channel?: string;
      ai_drafted?: boolean;
      synced_from?: string;
      purpose?: string;
    }
  ) {
    return this.request(
      `/api/v1/leads/${encodeURIComponent(leadId)}/messages`,
      { method: "POST", body: msg }
    );
  }

  getVoice() {
    return this.request("/api/v1/voice");
  }
}
