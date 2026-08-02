import { SkeletonRows } from "@/components/ui/Skeleton";
import Skeleton from "@/components/ui/Skeleton";

// Funnels blocked on the server with no loading UI, so the coach sat on the
// previous page until the data popped in. The shape matches the real list.
export default function FunnelsLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl p-6" aria-busy="true">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton width="w-40" height="h-8" shape="block" />
        <Skeleton width="w-28" height="h-9" shape="block" />
      </div>
      <SkeletonRows rows={6} />
    </main>
  );
}
