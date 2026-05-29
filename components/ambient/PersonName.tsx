// components/ambient/PersonName.tsx
"use client";

import { usePersonPanel } from "@/components/ambient/PersonPanelProvider";

type Props = {
  leadId: string;
  name: string;
  context?: string;
};

export default function PersonName({ leadId, name, context }: Props) {
  const { openPanel } = usePersonPanel();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openPanel(leadId);
      }}
      className="inline-flex items-center gap-1.5 text-left font-bold text-[color:var(--text)] hover:underline hover:decoration-dashed hover:underline-offset-2 transition-colors cursor-pointer"
    >
      {name}
      {context && (
        <span className="text-[length:var(--t-micro)] font-normal text-[color:var(--text-faint)]">
          ({context})
        </span>
      )}
    </button>
  );
}
