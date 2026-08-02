// /win — The Positioned-to-Win Scorecard. Public, no auth (top-of-funnel lead
// magnet). The whole flow is client-side; this server shell just sets metadata
// and renders it. Edge runtime for Cloudflare Pages.

import type { Metadata } from "next";
import ScorecardClient from "./ScorecardClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Are you still positioned to win? · Free Scorecard",
  description:
    "A 2-minute scorecard. Score your brand on the six things AI cannot copy, see the one gap holding you back, and get three moves to close it.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Are you still positioned to win, or about to get erased by an AI-native coach?",
    description:
      "Eight questions. Your positioning score, your one gap, and three moves to close it. Free.",
    type: "website",
  },
};

export default function WinPage() {
  return <ScorecardClient />;
}
