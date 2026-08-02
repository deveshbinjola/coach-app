// Skeleton — the shape of what is loading, not a spinner.
//
// Six routes had a hand-rolled animate-pulse block and nine had nothing, so a
// coach on /inbox or /settings watched a frozen page and then a pop-in. A
// spinner says "wait"; a skeleton says "a list is coming, roughly this big",
// which is why it feels faster even when it is not.
//
// Deliberately not configurable beyond shape and size. Every bespoke skeleton
// in the app drifted on colour and radius; there is one answer here.

type Props = {
  /** Tailwind width class, e.g. "w-32" or "w-full". */
  width?: string;
  /** Tailwind height class. Defaults to a line of body text. */
  height?: string;
  /** Pill for avatars and chips, otherwise the standard card radius. */
  shape?: "line" | "block" | "circle";
  className?: string;
};

const SHAPE_CLASSES = {
  line: "rounded-[var(--r-sm)]",
  block: "rounded-[var(--r-md)]",
  circle: "rounded-full",
} as const;

export default function Skeleton({
  width = "w-full",
  height = "h-4",
  shape = "line",
  className = "",
}: Props) {
  return (
    <div
      // aria-hidden: the live region announcing "loading" belongs on the
      // container that swaps in the real content, not on each grey box.
      aria-hidden
      className={[
        width,
        height,
        SHAPE_CLASSES[shape],
        "bg-[var(--surface-deep)] motion-safe:animate-pulse",
        className,
      ].join(" ")}
    />
  );
}

/** A stack of lines with a short last one, the way a paragraph actually ends. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "w-2/3" : "w-full"} />
      ))}
    </div>
  );
}

/** Rows for list surfaces: /inbox, /clients, /sessions. */
export function SkeletonRows({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--border-faint)] p-3"
        >
          <Skeleton width="w-9" height="h-9" shape="circle" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton width="w-1/3" />
            <Skeleton width="w-2/3" height="h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
