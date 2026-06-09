"use client";

// SnapshotReveal · Brand OS v5 · Tier 1 free output
//
// Renders the 3 reveal cards (Archetype, Voice Texture, The Move) + 3 pillar
// seeds + the $7 Full Round offer. Designed for slow scroll. No screenshot
// optimization. Levin check: design for phone-down, not story-share.
//
// Data shape comes from snapshot-generator.ts (lib/brand-os/).

import { Badge, Button, Card } from "@/components/ui";

export type SnapshotPayload = {
  firstName?: string;
  archetype: "sage" | "lover" | "warrior" | "magician" | "creator" | "ruler";
  archetypeStatement: string;       // 2-3 sentence Sage description, personalized
  voiceTexture: [string, string, string]; // three sensory words
  voiceSourceQuote?: string;        // optional inline reference to the source paragraph
  theMoveYouMissed: string;         // the diagnostic, triangulated
  pillarSeeds: {
    cornerstone: string;            // from wound
    edge: string;                   // from dissent
    teaching: string;               // from refrain
  };
};

type SnapshotRevealProps = {
  payload: SnapshotPayload;
  onContinueToFullRound: () => void; // routes to $7 checkout, then FullRoundRunner
};

const ARCHETYPE_DISPLAY: Record<SnapshotPayload["archetype"], string> = {
  sage: "The Sage",
  lover: "The Lover",
  warrior: "The Warrior",
  magician: "The Magician",
  creator: "The Creator",
  ruler: "The Ruler",
};

export default function SnapshotReveal({ payload, onContinueToFullRound }: SnapshotRevealProps) {
  const { firstName, archetype, archetypeStatement, voiceTexture, theMoveYouMissed, pillarSeeds } = payload;

  return (
    <div className="snapshot-reveal mx-auto max-w-2xl px-6 py-16">
      <div className="mb-6">
        <Badge tone="muted">Brand OS · Snapshot · for {firstName ?? "you"}</Badge>
      </div>

      <h1 className="mb-3 font-serif text-4xl font-bold leading-tight text-ink">
        What we saw <em className="italic text-green">in you.</em>
      </h1>
      <p className="mb-12 max-w-md text-muted">
        Read this slow. Put your phone down before you finish. This is for you, not for the feed.
      </p>

      {/* Card 01 · Archetype */}
      <Card className="mb-8 py-8">
        <div className="mb-3 font-mono text-xs uppercase tracking-widest text-green">
          01 · Your Brand Archetype
        </div>
        <h2 className="mb-4 font-serif text-2xl font-bold text-ink">
          You are <em className="italic text-green">{ARCHETYPE_DISPLAY[archetype]}.</em>
        </h2>
        <p className="text-base leading-relaxed text-ink">{archetypeStatement}</p>
      </Card>

      {/* Card 02 · Voice Texture */}
      <Card className="mb-8 py-8">
        <div className="mb-3 font-mono text-xs uppercase tracking-widest text-green">
          02 · Your Voice Texture
        </div>
        <h2 className="mb-4 font-serif text-2xl font-bold text-ink">
          Your voice runs <em className="italic text-green">{voiceTexture.join(", ").toLowerCase()}.</em>
        </h2>
        <div className="flex flex-wrap gap-2">
          {voiceTexture.map((word) => (
            <span
              key={word}
              className="rounded-md border border-green-line bg-green-soft px-3 py-2 font-mono text-sm font-semibold tracking-wider text-green"
            >
              {word.toUpperCase()}
            </span>
          ))}
        </div>
      </Card>

      {/* Card 03 · The Move */}
      <Card className="mb-12 py-8">
        <div className="mb-3 font-mono text-xs uppercase tracking-widest text-green">
          03 · The Move You Have Been Missing
        </div>
        <p className="font-serif text-xl italic leading-snug text-ink">{theMoveYouMissed}</p>
      </Card>

      {/* Pillar seeds */}
      <Card variant="flat" className="mb-12 py-6">
        <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-green">
          Three pillar seeds (preview only · the Full Round names them)
        </h3>
        <ul className="space-y-3">
          <PillarSeed label="Cornerstone · from your wound" text={pillarSeeds.cornerstone} />
          <PillarSeed label="Edge · from your dissent" text={pillarSeeds.edge} />
          <PillarSeed label="Teaching · from your refrain" text={pillarSeeds.teaching} />
        </ul>
      </Card>

      {/* Full Round offer */}
      <Card variant="elevated" className="px-10 py-12 text-center bg-[var(--ink)]">
        <div className="mb-3 font-mono text-xs uppercase tracking-widest text-green-neon">
          If this landed
        </div>
        <h2 className="mb-4 font-serif text-2xl font-bold text-bg">
          The Full Round goes <em className="italic text-green-neon">deeper.</em>
        </h2>
        <p className="mb-6 text-muted-on-dark">
          Eleven more questions. Twenty-two minutes. The draft is held twenty-four hours before
          you can publish it. Your voice profile populates the platform automatically.
        </p>
        <Button variant="primary" onClick={onContinueToFullRound}>
          Continue · $7
        </Button>
        <p className="mt-3 font-mono text-xs text-muted-on-dark">
          22 min · 24-hour hold · yours forever
        </p>
      </Card>
    </div>
  );
}

function PillarSeed({ label, text }: { label: string; text: string }) {
  return (
    <li>
      <div className="font-mono text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="font-serif text-base italic text-ink">{text}</div>
    </li>
  );
}
