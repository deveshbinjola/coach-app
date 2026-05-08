// Test factories for Lead / LeadMessage / Content / VoiceProfile.
//
// Why factories over inline literals: every test that pokes one
// scoring field has to satisfy ~20 other fields in the type. Without
// helpers, tests turn into 30-line object spreads that obscure what
// they're actually testing. Factories return a "valid base" with
// sensible defaults; tests pass `{ overrides }` and read like prose.
//
// Defaults are stable and test-friendly:
//   - Fixed `created_at` / `updated_at` — date math in tests is
//     deterministic if you pin `now` and the row's timestamps.
//   - Lead defaults to a "warm, no signals" baseline so the score
//     formula has obvious arithmetic to assert.
//   - LeadMessage defaults to "AI-drafted, sent, unedited" so trust
//     math is easy to reason about.

import type {
  Lead,
  LeadMessage,
  Content,
  VoiceProfile,
} from "@/lib/types";

export const TEST_NOW = new Date("2026-05-01T12:00:00.000Z").getTime();
export const TEST_COACH_ID = "00000000-0000-0000-0000-000000000001";
export const TEST_LEAD_ID = "00000000-0000-0000-0000-000000000010";

export function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id:                       TEST_LEAD_ID,
    coach_id:                 TEST_COACH_ID,
    full_name:                "Test Lead",
    email:                    null,
    phone:                    null,
    source:                   "ig",
    source_detail:            null,
    referred_by_lead_id:      null,
    status:                   "contacted",
    temperature:              "warm",
    notes:                    null,
    tags:                     [],
    last_contact_at:          null,
    next_followup_at:         null,
    next_honest_action:       null,
    pain_signal:              [],
    discovery_call_completed: false,
    income_band:              null,
    readiness_signal:         null,
    fit_notes:                null,
    disqualified_reason:      null,
    auto_draft_eligible:      true,
    deal_value:               null,
    created_at:               new Date(TEST_NOW - 24 * 60 * 60 * 1000).toISOString(),
    updated_at:               new Date(TEST_NOW - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

export function makeMessage(overrides: Partial<LeadMessage> = {}): LeadMessage {
  return {
    id:             "00000000-0000-0000-0000-000000000100",
    coach_id:       TEST_COACH_ID,
    lead_id:        TEST_LEAD_ID,
    channel:        "ig",
    direction:      "outbound",
    content:        "Hey — saw your post. Worth a quick chat?",
    ai_drafted:     true,
    sent_at:        new Date(TEST_NOW - 60 * 60 * 1000).toISOString(),
    purpose:        "first_response",
    external_id:    null,
    synced_from:    null,
    original_draft: "Hey — saw your post. Worth a quick chat?",
    was_edited:     false,
    created_at:     new Date(TEST_NOW - 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

export function makeContent(overrides: Partial<Content> = {}): Content {
  return {
    id:                 "00000000-0000-0000-0000-000000000200",
    coach_id:           TEST_COACH_ID,
    title:              "Pattern recognition is the only edge",
    body:               "Most coaches confuse motion with progress. The honest test of a system is whether it changes what someone does today, or just how it sounds in a pitch deck.",
    platform:           "linkedin",
    content_type:       "post",
    status:             "draft",
    pillar:             "authority",
    scheduled_at:       null,
    published_at:       null,
    metricool_post_id:  null,
    performance:        {},
    brand_os_generated: false,
    created_at:         new Date(TEST_NOW - 60 * 60 * 1000).toISOString(),
    updated_at:         new Date(TEST_NOW - 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

export function makeVoiceProfile(
  overrides: Partial<VoiceProfile> = {}
): VoiceProfile {
  return {
    id:              "00000000-0000-0000-0000-000000000300",
    coach_id:        TEST_COACH_ID,
    voice_json:      {
      tone:        ["direct", "warm"],
      vocabulary:  { use: ["honest", "the work"], avoid: ["circle back", "synergy"] },
      openers:     ["Saw your post", "Quick read"],
      closers:     ["Worth a chat?"],
      ctas:        ["Want me to walk you through it?"],
    } as Record<string, unknown>,
    sample_messages: [],
    version:         1,
    active:          true,
    created_at:      new Date(TEST_NOW - 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

// Helper: ISO timestamp `hours` before TEST_NOW.
export function hoursAgo(hours: number): string {
  return new Date(TEST_NOW - hours * 60 * 60 * 1000).toISOString();
}

// Helper: ISO timestamp `days` before TEST_NOW.
export function daysAgo(days: number): string {
  return hoursAgo(days * 24);
}
