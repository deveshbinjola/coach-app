// Shared Zod helpers for /api/v1/* request body validation.
//
// Before this module: every route did `let body: any` then a forest of
// `if (typeof body.x !== "string") return apiError(...)` checks. Easy
// to drift across routes; impossible to type the body downstream.
//
// After: each route declares a Zod schema once, calls parseBody(), and
// gets a typed object or a 400 with the validation error verbatim.
//
// Why Zod (not zod-only-runtime / valibot / yup): smaller install than
// yup, more mature than valibot, generates TypeScript types from the
// schema so the route handler body is fully typed downstream.

import type { NextRequest } from "next/server";
import { z, type ZodError, type ZodType } from "zod";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/**
 * Parse + validate a JSON request body against a Zod schema.
 *
 * Returns a tagged union — caller does:
 *
 *   const parsed = await parseBody(request, MySchema);
 *   if (!parsed.ok) return apiError(parsed.error, parsed.status);
 *   const body = parsed.data;  // fully typed as z.infer<typeof MySchema>
 *
 * Validation errors are flattened into a single human-readable message
 * (best-effort), with HTTP 400. JSON parse failures are also 400.
 */
export async function parseBody<T>(
  request: NextRequest,
  schema: ZodType<T>
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      status: 400,
      error: formatZodError(result.error),
    };
  }
  return { ok: true, data: result.data };
}

/** Render a ZodError into a single-line caller-friendly message. */
export function formatZodError(error: ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "body";
    return `${path}: ${issue.message}`;
  });
  return issues.join("; ");
}

// ── Shared primitive schemas — reused across routes ─────────────────────────

/** Trim + treat empty-string as null. Use for optional text fields. */
export const TrimmedStringOrNull = z
  .string()
  .max(2000)
  .transform((s) => s.trim())
  .transform((s) => (s.length === 0 ? null : s));

/** Required non-empty trimmed string with a max length. */
export function nonEmptyString(max: number) {
  return z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "must not be empty")
    .refine((s) => s.length <= max, `must be ${max} characters or fewer`);
}

// ── Domain enums — kept here so routes don't re-import the full types
//    file just to constrain a single field. Mirror lib/types.ts.

export const LeadSourceSchema = z.enum([
  "ig",
  "linkedin",
  "referral",
  "quiz",
  "in_person",
  "podcast",
  "newsletter",
  "other",
]);

export const LeadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "booked",
  "client",
  "closed_lost",
]);

export const LeadTemperatureSchema = z.enum([
  "on_fire",
  "hot",
  "warm",
  "cold",
  "dormant",
]);

export const PainSignalSchema = z.enum([
  "money",
  "time",
  "purpose",
  "discipline",
  "relationships",
  "health",
  "other",
]);

export const MessageChannelSchema = z.enum([
  "email",
  "dm_ig",
  "dm_linkedin",
  "sms",
  "call",
  "other",
]);

export const MessageDirectionSchema = z.enum(["inbound", "outbound", "draft"]);

export const MessagePurposeSchema = z.enum([
  "first_response",
  "follow_up",
  "rewarm",
  "ad_hoc",
]);
