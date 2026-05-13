// Coach-scoped Resend helpers.
//
// Encapsulates the BYOK fallback chain so every email-sending route follows
// the same precedence:
//
//   1. coach's own Resend (encrypted key on cp_coach_settings)
//   2. platform-owned Resend (RESEND_API_KEY env)
//   3. fail explicitly with 503 + clear message
//
// Each route just calls resolveResend(supabase, coachId) and ships.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto/secrets";

export type ResendSender = {
  /** Resolved API key — DO NOT log or return to client. */
  apiKey: string;
  /** From: header to use, e.g. `Marcus <hello@coachdomain.com>`. */
  from: string;
  /** Where this configuration came from — drives the "sent via your domain"
   *  vs "sent via Elevate" UI hint. */
  source: "coach" | "platform";
  /** Verified domain on the coach's account, if BYOK. Used for UI display. */
  verifiedDomain: string | null;
};

const DEFAULT_PLATFORM_FROM = "Brand OS <brand-os@elevateaisystem.com>";

/** Returns the best Resend sender available, or null if email is not
 *  configured at all (neither coach nor platform). */
export async function resolveResendSender(
  supabase: SupabaseClient,
  coachId: string
): Promise<ResendSender | null> {
  // 1. Try coach BYOK first.
  const { data: settings } = await supabase
    .from("cp_coach_settings")
    .select("resend_api_key_ciphertext, resend_api_key_iv, resend_from_email, resend_from_name, resend_verified_domain")
    .eq("coach_id", coachId)
    .maybeSingle();

  if (
    settings?.resend_api_key_ciphertext &&
    settings.resend_api_key_iv &&
    settings.resend_from_email
  ) {
    try {
      const apiKey = await decryptSecret({
        ciphertext_b64: settings.resend_api_key_ciphertext as string,
        iv_b64: settings.resend_api_key_iv as string,
      });
      const fromName = (settings.resend_from_name as string | null) ?? "";
      const fromEmail = settings.resend_from_email as string;
      const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
      return {
        apiKey,
        from,
        source: "coach",
        verifiedDomain: (settings.resend_verified_domain as string | null) ?? null,
      };
    } catch (err) {
      // Decryption failed — likely SECRETS_MASTER_KEY rotated/missing.
      // Fall through to platform key. Log for ops.
      console.error("[coach-resend] decryption failed for coach", coachId, err);
    }
  }

  // 2. Fall back to platform key.
  const platformKey = process.env.RESEND_API_KEY;
  if (platformKey) {
    return {
      apiKey: platformKey,
      from: process.env.RESEND_FROM ?? DEFAULT_PLATFORM_FROM,
      source: "platform",
      verifiedDomain: null,
    };
  }

  // 3. No sender available.
  return null;
}

/** Thin Resend POST wrapper. Throws on non-2xx. */
export async function resendSend(
  sender: ResendSender,
  payload: { to: string; subject: string; html: string; text?: string; reply_to?: string }
): Promise<{ id: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${sender.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: sender.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: payload.reply_to,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 400)}`);
  }
  return (await res.json()) as { id: string };
}
