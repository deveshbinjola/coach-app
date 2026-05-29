// Spark Visual — types and constants for the text-to-visual generator.

import type { BrandKit } from "./brand-kit";

export type VisualType = "infographic" | "flow" | "framework" | "quote";

export type VisualElement = {
  label: string;
  value?: string;
  icon?: string;
};

export type SparkVisualData = {
  type: VisualType;
  title: string;
  subtitle?: string;
  elements: VisualElement[];
};

export type SparkVisualResult = {
  variations: SparkVisualData[];
};

export const VISUAL_TYPE_META: Record<VisualType, { label: string; description: string }> = {
  infographic: { label: "Infographic", description: "Key points as a visual breakdown" },
  flow:        { label: "Process flow", description: "Steps connected in sequence" },
  framework:   { label: "Framework", description: "Named system as a structured diagram" },
  quote:       { label: "Insight card", description: "Hero quote or key takeaway" },
};

export const VISUAL_SIZE = { w: 1080, h: 1080 } as const;
export const VISUAL_SIZE_STORY = { w: 1080, h: 1920 } as const;

export type ExportSize = "square" | "portrait" | "story";

export const EXPORT_SIZES: Record<ExportSize, { w: number; h: number; label: string }> = {
  square:   { w: 1080, h: 1080, label: "Square (1:1)" },
  portrait: { w: 1080, h: 1350, label: "Portrait (4:5)" },
  story:    { w: 1080, h: 1920, label: "Story (9:16)" },
};
