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

export const metadata: Metadata = {
  title: "Coach Assistant · Your words, your people, handled",
  description:
    "An assistant that writes your messages in your own words, watches your leads, and remembers your people. Built for coaches.",
};

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return <LandingPage />;

  const redirectTo = await enforceOnboardingGate(supabase, user.id);
  if (redirectTo) redirect(redirectTo);

  redirect("/command-center");
}
