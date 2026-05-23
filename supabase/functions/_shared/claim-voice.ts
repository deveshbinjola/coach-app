// Pure decision logic for claiming a pending voice profile on first login.
// Zero imports on purpose: this file is imported by BOTH the Deno edge
// function (claim-voice-profile) and the Vitest suite. Keep it dependency-free.

export type PendingRow = {
  id: string;
  voice_json: unknown;
  sample_messages: string[];
};

export type ClaimDecision = { action: "insert" | "mark_only" | "none" };

/**
 * Decide what to do with a pending voice profile.
 * - No pending row             -> "none"   (nothing to claim)
 * - Coach already has a voice   -> "mark_only" (don't clobber their in-app voice;
 *                                  still mark the pending row claimed so it stops matching)
 * - Otherwise                   -> "insert" (activate the magnet voice)
 */
export function decideClaimAction(
  hasExistingVoiceProfile: boolean,
  pending: PendingRow | null,
): ClaimDecision {
  if (!pending) return { action: "none" };
  if (hasExistingVoiceProfile) return { action: "mark_only" };
  return { action: "insert" };
}
