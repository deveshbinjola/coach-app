"use client";

// Fires once per session on the Command Center: asks the claim-voice-profile
// edge function to activate any voice the coach built on the public
// Find Your Voice magnet (matched by email). No-op if nothing to claim or if
// they already have a voice. Shows a one-time confirmation when it activates one.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const SESSION_FLAG = "voice_claim_attempted";

export default function ClaimVoiceProfile() {
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_FLAG)) return;
    sessionStorage.setItem(SESSION_FLAG, "1");

    const supabase = createClient();
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("claim-voice-profile", {
          body: {},
        });
        if (error) return;
        if ((data as { claimed?: boolean })?.claimed) setClaimed(true);
      } catch {
        // Silent: claiming is best-effort. Coach can build voice in-app anyway.
      }
    })();
  }, []);

  if (!claimed) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-[var(--r-md)] border border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-[length:var(--t-caption)] text-[color:var(--text)]"
    >
      ✓ We loaded the voice you created. Every draft writes in it.
    </div>
  );
}
