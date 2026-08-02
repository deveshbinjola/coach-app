import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";

// The Mirror blocked on the server with no loading UI.
export default function MirrorLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl p-6" aria-busy="true">
      <Skeleton width="w-48" height="h-8" shape="block" className="mb-6" />
      <div className="space-y-4" role="status" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-[var(--r-xl)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-6"
          >
            <Skeleton width="w-1/3" height="h-5" className="mb-3" />
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    </main>
  );
}
