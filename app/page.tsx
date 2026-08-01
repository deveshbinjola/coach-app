// Root — the public front door, and the gate for anyone signed in.
//
// Signed out: the landing page. This used to bounce straight to /login,
// which meant the product had no place to explain itself to someone
// arriving cold.
//
// Signed in: straight through to the platform, gate check first.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { enforceOnboardingGate } from "@/lib/onboarding";
import LandingPage from "@/components/landing/LandingPage";
import "./landing.css";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const TITLE = "Coach Assistant · Great coaches are not great admins";
const DESCRIPTION =
  "An assistant that writes your messages in your own words, answers leads while they are warm, and hands you your day already sorted. Built for coaches who do real inner work.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Without these, every share of this link renders as a bare URL.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Coach Assistant",
    url: "https://app.elevateaisystem.com/",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return <LandingPage />;

  const redirectTo = await enforceOnboardingGate(supabase, user.id);
  if (redirectTo) redirect(redirectTo);

  redirect("/command-center");
}
