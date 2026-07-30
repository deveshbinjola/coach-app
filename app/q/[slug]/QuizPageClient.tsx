// Client component for the public quiz page.
// Receives the funnel from the server (no client fetch, no loading flash)
// and renders the QuizPlayer.

"use client";

import { useEffect } from "react";
import QuizPlayer from "@/components/funnels/QuizPlayer";

type FunnelConfig = {
  intro: {
    headline: string;
    subhead: string;
    cta_label: string;
  };
  questions: Array<{
    id: string;
    text: string;
    choices: Array<{
      key: string;
      text: string;
      scores: Record<string, number>;
    }>;
  }>;
  results: Array<{
    key: string;
    pillar_name: string;
    headline: string;
    body: string;
    cta_text: string;
    cta_url: string;
  }>;
  branding: {
    primary_hex: string;
    accent_hex: string;
    background_hex: string;
    font_family: string;
  };
};

export type FunnelData = {
  id: string;
  slug: string;
  title: string;
  config: FunnelConfig;
  type: string;
};

export default function QuizPageClient({ funnel }: { funnel: FunnelData | null }) {
  useEffect(() => {
    if (funnel) {
      document.title = funnel.config?.intro?.headline || funnel.title || "Quiz";
    }
  }, [funnel]);

  // Not found / unpublished
  if (!funnel) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          backgroundColor: "#FAFAF8",
          fontFamily: "Plus Jakarta Sans, sans-serif",
          color: "#0A0F1C",
        }}
      >
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-extrabold">Quiz not found</h1>
          <p className="mt-3 text-lg opacity-60">
            This quiz may have been unpublished or the link is incorrect.
          </p>
          <a
            href="https://elevateaisystem.com"
            className="inline-block mt-6 px-6 py-3 rounded-xl font-bold text-sm"
            style={{
              backgroundColor: "#0B6E23",
              color: "#FAF8F3",
            }}
          >
            Visit ElevateAI
          </a>
        </div>
      </div>
    );
  }

  return (
    <QuizPlayer
      funnelId={funnel.id}
      config={funnel.config}
    />
  );
}
