// Database types — should be regenerated via `supabase gen types typescript`
// when the schema changes. For now, hand-rolled to match the cp_* migration.

export type LeadStatus = "new" | "contacted" | "qualified" | "booked" | "client" | "closed_lost";
export type LeadTemperature = "on_fire" | "hot" | "warm" | "cold" | "dormant";
export type LeadSource = "ig" | "linkedin" | "referral" | "quiz" | "in_person" | "podcast" | "newsletter" | "other";
export type MessageChannel = "email" | "dm_ig" | "dm_linkedin" | "sms" | "call" | "other";
export type MessageDirection = "inbound" | "outbound" | "draft";

// "Next Honest Action" — what actually needs to happen next with this lead.
// Replaces vague "status" thinking with action-oriented follow-up state.
export type LeadNextAction =
  | "invite_to_call"
  | "follow_up_soft"
  | "send_resource"
  | "waiting_on_them"
  | "hold"
  | "close_loop";

// Pain signal — the emotional/contextual thread we're meeting them in.
// Multi-select. Feeds the AI drafter so messages land in the right register.
export type PainSignal =
  | "heartbreak"
  | "relationship_conflict"
  | "purpose_confusion"
  | "emotional_numbness"
  | "masculinity_identity"
  | "business_pressure"
  | "burnout";

// ── Qualification (P4) ──
// Income band = rough read on whether they can afford the $2K–$12K offer.
// Readiness = how close to a real buying decision they actually are.
// Both feed computeFitScore() in lib/lead-fit.ts — separate from pipeline
// score (which tracks warmth/activity). Fit = "should we even be talking."
export type LeadIncomeBand = "under_10k_mo" | "10k_30k_mo" | "30k_plus_mo" | "unknown";

export type LeadReadiness =
  | "researching"       // passively browsing, pre-intent
  | "comparing"         // comparing options, actively narrowing
  | "ready_now"         // willing to commit in <30 days
  | "dormant_explorer"  // curious but no urgency — long game
  | "tire_kicker";      // asks questions, never commits — be honest

export const LEAD_NEXT_ACTIONS: LeadNextAction[] = [
  "invite_to_call",
  "follow_up_soft",
  "send_resource",
  "waiting_on_them",
  "hold",
  "close_loop",
];

export const PAIN_SIGNALS: PainSignal[] = [
  "heartbreak",
  "relationship_conflict",
  "purpose_confusion",
  "emotional_numbness",
  "masculinity_identity",
  "business_pressure",
  "burnout",
];

export const LEAD_TEMPERATURES: LeadTemperature[] = [
  "on_fire",
  "hot",
  "warm",
  "cold",
  "dormant",
];

// Display labels — used in UI selectors, pills, and AI prompts.
export const NEXT_ACTION_LABEL: Record<LeadNextAction, string> = {
  invite_to_call: "Invite to call",
  follow_up_soft: "Follow up (soft)",
  send_resource: "Send resource",
  waiting_on_them: "Waiting on them",
  hold: "Hold",
  close_loop: "Close the loop",
};

export const PAIN_SIGNAL_LABEL: Record<PainSignal, string> = {
  heartbreak: "Heartbreak",
  relationship_conflict: "Relationship conflict",
  purpose_confusion: "Purpose confusion",
  emotional_numbness: "Emotional numbness",
  masculinity_identity: "Masculinity / identity",
  business_pressure: "Business pressure",
  burnout: "Burnout",
};

export const TEMPERATURE_LABEL: Record<LeadTemperature, string> = {
  on_fire: "🔥 On fire",
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  dormant: "Dormant",
};

export const LEAD_INCOME_BANDS: LeadIncomeBand[] = [
  "under_10k_mo",
  "10k_30k_mo",
  "30k_plus_mo",
  "unknown",
];

export const LEAD_READINESS_SIGNALS: LeadReadiness[] = [
  "researching",
  "comparing",
  "ready_now",
  "dormant_explorer",
  "tire_kicker",
];

export const INCOME_BAND_LABEL: Record<LeadIncomeBand, string> = {
  under_10k_mo: "< $10K/mo",
  "10k_30k_mo": "$10K–$30K/mo",
  "30k_plus_mo": "$30K+/mo",
  unknown: "Unknown / not asked",
};

export const READINESS_LABEL: Record<LeadReadiness, string> = {
  researching: "Researching",
  comparing: "Comparing options",
  ready_now: "Ready now",
  dormant_explorer: "Dormant explorer",
  tire_kicker: "Tire kicker",
};

export type Coach = {
  id: string;
  email: string;
  full_name: string | null;
  business_name: string | null;
  plan: "founding" | "standard";
  stripe_customer_id: string | null;
  onboarded_at: string | null;
  created_at: string;
};

export type Lead = {
  id: string;
  coach_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  /** Free-text attribution — which specific post/reel/newsletter brought them. */
  source_detail: string | null;
  /** Self-FK — the lead who referred this one. NULL if not a referral. */
  referred_by_lead_id: string | null;
  status: LeadStatus;
  temperature: LeadTemperature;
  notes: string | null;
  tags: string[];
  last_contact_at: string | null;
  next_followup_at: string | null;
  next_honest_action: LeadNextAction | null;
  pain_signal: PainSignal[];
  discovery_call_completed: boolean;
  /** Qualification (P4). NULL = not yet assessed. */
  income_band: LeadIncomeBand | null;
  readiness_signal: LeadReadiness | null;
  /** Qualitative note from the coach's read, e.g. "seems nervous about cost". */
  fit_notes: string | null;
  /** Set when the coach explicitly passes on this lead. Feeds the
   *  "why are we disqualifying" decision and tightens future targeting. */
  disqualified_reason: string | null;
  /** When true and status='new', the auto-response trigger fires and the
   *  Edge Function drafts a first-touch response. False for bulk imports
   *  (CSVs, Notion ZIPs) so we don't generate hundreds of drafts at once. */
  auto_draft_eligible: boolean;
  /** Phase 2 Decisions: deal value in CENTS, nullable.
   *  For status='client' = actual contract value.
   *  For non-terminal leads = expected value if they close.
   *  Cents avoid float drift on summed pipeline values. */
  deal_value: number | null;
  created_at: string;
  updated_at: string;
};

/** Why this message was drafted. Drives prompt branching in the Edge
 *  Function. Null on legacy rows from before Phase 7. */
export type MessagePurpose =
  | "first_response"  // auto-response engine: first-touch on a brand-new lead
  | "follow_up"       // continuing an active conversation
  | "rewarm"          // reactivating a silent lead
  | "ad_hoc";         // coach-initiated draft from Compose

export type LeadMessage = {
  id: string;
  lead_id: string;
  coach_id: string;
  channel: MessageChannel;
  direction: MessageDirection;
  content: string;
  ai_drafted: boolean;
  sent_at: string | null;
  /** Phase 7: why this draft exists. Null for pre-Phase-7 rows. */
  purpose: MessagePurpose | null;
  /** External system ID (e.g., Gmail message id) for dedupe. */
  external_id: string | null;
  /** Origin: 'compose', 'auto_response', 'gmail_sync', 'manual', etc. */
  synced_from: string | null;
  /** Voice Trust Loop: the AI's original draft text BEFORE the coach edited
   *  and sent. NULL for inbound, non-AI, or pre-Trust-Loop messages. */
  original_draft: string | null;
  /** Voice Trust Loop: true if the coach modified the draft before sending.
   *  NULL for inbound, non-AI, or pre-Trust-Loop messages. */
  was_edited: boolean | null;
  created_at: string;
};

/** Per-coach toggles and preferences. One row per coach. Auto-created on
 *  first read via the `ensure_coach_settings()` Postgres function. */
export type CoachSettings = {
  coach_id: string;
  auto_draft_on_new_lead: boolean;
  auto_draft_email_notification: boolean;
  reach_target_per_week: number;
  carousel_brand_name: string | null;
  carousel_handle: string | null;
  carousel_default_style:
    | "onyx_gold" | "forest_sand" | "editorial_gold" | "hard_facts" | "imported"
    | "dark_authority" | "clean_cream" | "accent_flash" | "midnight_citron" | "black_gold"
    | "brand_kit";
  carousel_accent_color: string;
  carousel_custom_style: Record<string, unknown> | null;
  // Brand kit — tenant-level identity for carousel rendering + future surfaces.
  brand_primary_hex:    string | null;
  brand_accent_hex:     string | null;
  brand_background_hex: string | null;
  brand_text_hex:       string | null;
  brand_font_family:    string | null;
  brand_font_weight:    string | null;
  brand_logo_url:       string | null;
  updated_at: string;
};

/** Phase 8: Per-coach external integrations (Gmail today, more later).
 *  refresh_token is sensitive — RLS keeps it scoped to the owning coach. */
export type CoachIntegration = {
  id: string;
  coach_id: string;
  provider: "gmail" | "cal_com" | "calendly" | "zoom" | "granola";
  account_email: string | null;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  scopes: string;
  last_synced_at: string | null;
  last_history_id: string | null;
  status: "active" | "revoked" | "paused";
  metadata: Record<string, unknown>;
  connected_at: string;
  updated_at: string;
};

/** Phase 8.5: Agent foundation. Per-coach API keys for the REST + MCP layer.
 *  The raw key is shown to the coach exactly once at creation; only its
 *  hash and prefix live in the DB. */
export type ApiKey = {
  id: string;
  coach_id: string;
  name: string;
  key_prefix: string;       // e.g. "cp_live_a3f2" — for UI identification
  scopes: string[];          // e.g. ["read"] or ["read","write"]
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Phase 11: One row per /api/v1/* call. Coaches inspect their own
 *  activity in /settings to verify what their agent has been doing. */
export type AgentActivity = {
  id: string;
  coach_id: string;
  api_key_id: string | null;
  method: string;
  path: string;
  status_code: number | null;
  summary: Record<string, unknown> | null;
  created_at: string;
};

/** Phase 12: Per-source inbound webhook URLs. Coaches paste these into
 *  Tally/Typeform/Calendly/etc. and leads flow in automatically. */
export type WebhookEndpoint = {
  id: string;
  coach_id: string;
  token: string;
  name: string;
  default_source: LeadSource;
  default_source_detail: string | null;
  active: boolean;
  last_used_at: string | null;
  total_received: number;
  created_at: string;
  updated_at: string;
};

export type VoiceProfile = {
  id: string;
  coach_id: string;
  voice_json: Record<string, unknown>;
  sample_messages: string[];
  version: number;
  active: boolean;
  created_at: string;
};

export type VoiceTrainingSource = {
  id: string;
  coach_id: string;
  voice_profile_id: string | null;
  source_type: "sales_call" | "voice_note" | "workshop" | "instagram" | "linkedin" | "newsletter" | "paste";
  title: string;
  transcript: string;
  audio_filename: string | null;
  audio_mime_type: string | null;
  duration_minutes: number;
  extracted_rules: Array<{
    id: string;
    text: string;
    confidence: "preliminary" | "real";
    category?: "hook" | "story" | "cta" | "belief" | "offer" | "avoid" | "rhythm";
  }>;
  approved_rule_ids: string[];
  created_at: string;
};

// ── Content (Phase 9: Command Center) ──

export type ContentPlatform = "linkedin" | "instagram" | "twitter" | "facebook" | "newsletter";
export type ContentType     = "post" | "carousel" | "story" | "reel" | "thread" | "newsletter";
export type ContentStatus   = "draft" | "scheduled" | "published" | "failed";
export type ContentPillar   = "authority" | "story" | "offer" | "engagement";

export type ContentPerformance = {
  views?:    number;
  likes?:    number;
  comments?: number;
  shares?:   number;
  clicks?:   number;
  source_type?: "lead" | "content" | "manual";
  source_label?: string;
  source_id?: string;
  carousel_style?: "onyx_gold" | "forest_sand" | "editorial_gold" | "hard_facts" | "imported" | "dark_authority" | "clean_cream" | "accent_flash" | "midnight_citron" | "black_gold" | "brand_kit";
  carousel_hook?: "curiosity_gap" | "contrarian" | "identity_callout" | "number_outcome" | "pain_question";
  carousel_brand_name?: string;
  carousel_handle?: string;
  carousel_accent_color?: string;
  carousel_custom_style?: Record<string, unknown>;
  content_favorite?: boolean;
  content_archived?: boolean;
};

export type Content = {
  id:                  string;
  coach_id:            string;
  title:               string;
  body:                string | null;
  platform:            ContentPlatform;
  content_type:        ContentType;
  status:              ContentStatus;
  pillar:              ContentPillar | null;
  scheduled_at:        string | null;
  published_at:        string | null;
  metricool_post_id:   string | null;
  performance:         ContentPerformance;
  brand_os_generated:  boolean;
  created_at:          string;
  updated_at:          string;
};

// ── Client Rooms ──────────────────────────────────────────────────────────

export type ClientRoomStatus = "active" | "paused" | "completed";
export type ClientPaymentStatus = "unknown" | "unpaid" | "paid" | "payment_plan" | "overdue";
export type ClientTaskStatus = "open" | "done";
export type ClientEventSource = "manual" | "cal_com" | "calendly" | "google_calendar" | "zoom";
export type SessionWebhookProvider = "cal_com" | "calendly" | "zoom";

export type ClientRoom = {
  id: string;
  coach_id: string;
  lead_id: string;
  status: ClientRoomStatus;
  program_name: string;
  current_focus: string | null;
  next_session_at: string | null;
  payment_status: ClientPaymentStatus;
  created_at: string;
  updated_at: string;
};

export type ClientSession = {
  id: string;
  coach_id: string;
  client_room_id: string;
  title: string;
  session_at: string;
  notes: string;
  wins: string[];
  blockers: string[];
  commitments: string[];
  next_focus: string | null;
  follow_up_draft: string | null;
  content_ideas: string[];
  external_source: string | null;
  external_id: string | null;
  extraction_source: "manual" | "ai" | "fallback";
  created_at: string;
};

export type ClientTask = {
  id: string;
  coach_id: string;
  client_room_id: string;
  title: string;
  status: ClientTaskStatus;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ClientResource = {
  id: string;
  coach_id: string;
  client_room_id: string;
  title: string;
  url: string | null;
  note: string | null;
  created_at: string;
};

export type ClientEvent = {
  id: string;
  coach_id: string;
  client_room_id: string;
  title: string;
  starts_at: string;
  meeting_url: string | null;
  source: ClientEventSource;
  external_id: string | null;
  created_at: string;
};

export type SessionWebhookEndpoint = {
  id: string;
  coach_id: string;
  provider: SessionWebhookProvider;
  token: string;
  name: string;
  active: boolean;
  total_received: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export const SESSION_WEBHOOK_PROVIDER_LABEL: Record<SessionWebhookProvider, string> = {
  cal_com: "Cal.com",
  calendly: "Calendly",
  zoom: "Zoom",
};

export const CLIENT_PAYMENT_LABEL: Record<ClientPaymentStatus, string> = {
  unknown: "Unknown",
  unpaid: "Unpaid",
  paid: "Paid",
  payment_plan: "Payment plan",
  overdue: "Overdue",
};

export const PLATFORM_LABEL: Record<ContentPlatform, string> = {
  linkedin:  "LinkedIn",
  instagram: "Instagram",
  twitter:   "X / Twitter",
  facebook:  "Facebook",
  newsletter: "Newsletter",
};

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  draft:     "Draft",
  scheduled: "Scheduled",
  published: "Published",
  failed:    "Failed",
};

export const PILLAR_LABEL: Record<ContentPillar, string> = {
  authority:  "Authority",
  story:      "Story",
  offer:      "Offer",
  engagement: "Engagement",
};
