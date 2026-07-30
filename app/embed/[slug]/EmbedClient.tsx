// Client component for the embeddable quiz.
// Same as QuizPageClient but without the "Powered by" footer height
// and optimized for iframe embedding (no min-h-screen on error states).

"use client";

import { useEffect, useState } from "react";
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

type FunnelData = {
  id: string;
  slug: string;
  title: string;
  config: FunnelConfig;
  type: string;
};

export default function EmbedClient({ slug }: { slug: string }) {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    fetch(`/api/funnels/public?slug=${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => {
        setFunnel(data.funnel);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ backgroundColor: "#FAFAF8", minHeight: "400px" }}
      >
        <div className="inline-block w-8 h-8 border-2 border-[#0B6E23] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !funnel) {
    return (
      <div
        className="flex items-center justify-center px-4"
        style={{
          backgroundColor: "#FAFAF8",
          fontFamily: "Plus Jakarta Sans, sans-serif",
          color: "#0A0F1C",
          minHeight: "300px",
        }}
      >
        <div className="text-center">
          <p className="text-lg font-bold">Quiz not found</p>
          <p className="mt-1 text-sm opacity-60">
            This quiz may have been unpublished.
          </p>
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
