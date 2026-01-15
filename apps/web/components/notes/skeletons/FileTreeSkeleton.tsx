/**
 * File Tree Skeleton (Server Component)
 *
 * Shows while file tree is loading.
 */

export function FileTreeSkeleton() {
  return (
    <div className="flex-1 animate-pulse space-y-2 p-4">
      {/* Folder skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-white/10" />
        <div className="h-4 w-32 rounded bg-white/10" />
      </div>

      {/* File skeletons */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="ml-6 flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-white/5" />
          <div className="h-4 w-40 rounded bg-white/5" />
        </div>
      ))}

      {/* Another folder */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-white/10" />
        <div className="h-4 w-28 rounded bg-white/10" />
      </div>

      {/* More file skeletons */}
      {[6, 7, 8].map((i) => (
        <div key={i} className="ml-6 flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-white/5" />
          <div className="h-4 w-36 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

