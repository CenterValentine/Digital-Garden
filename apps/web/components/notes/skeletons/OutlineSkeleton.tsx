/**
 * Outline Skeleton (Server Component)
 *
 * Shows while outline is loading.
 */

export function OutlineSkeleton() {
  return (
    <div className="flex-1 animate-pulse space-y-4 p-4">
      {/* Section skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-white/10" />
        <div className="space-y-1">
          <div className="h-4 w-32 rounded bg-white/5" />
          <div className="ml-4 h-4 w-28 rounded bg-white/5" />
          <div className="h-4 w-36 rounded bg-white/5" />
        </div>
      </div>

      {/* Another section */}
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="space-y-1">
          <div className="h-4 w-28 rounded bg-white/5" />
          <div className="h-4 w-32 rounded bg-white/5" />
        </div>
      </div>

      {/* Third section */}
      <div className="space-y-2">
        <div className="h-3 w-28 rounded bg-white/10" />
        <div className="space-y-1">
          <div className="h-4 w-36 rounded bg-white/5" />
          <div className="ml-4 h-4 w-32 rounded bg-white/5" />
          <div className="h-4 w-28 rounded bg-white/5" />
        </div>
      </div>
    </div>
  );
}

