// /voice/mine — legacy URL.
//
// Voice was previously split into /voice (profile display + Brand OS iframe)
// and /voice/mine (paste-captions corpus path). Both are now consolidated on
// /voice. This route exists only to keep old bookmarks and in-app links
// working — it server-side redirects to /voice.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function VoiceMineRedirect() {
  redirect("/voice");
}
