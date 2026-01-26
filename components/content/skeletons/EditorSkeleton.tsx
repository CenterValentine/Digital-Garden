/**
 * Editor Skeleton (Server Component)
 *
 * Shows while editor is loading.
 */

export function EditorSkeleton() {
  return (
    <div className="flex-1 animate-pulse overflow-auto p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Title skeleton */}
        <div className="h-8 w-3/4 rounded bg-white/10" />

        {/* Paragraph skeletons */}
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-white/5" />
          <div className="h-4 w-11/12 rounded bg-white/5" />
          <div className="h-4 w-4/5 rounded bg-white/5" />
        </div>

        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-white/5" />
          <div className="h-4 w-10/12 rounded bg-white/5" />
        </div>

        {/* Subheading */}
        <div className="h-6 w-1/2 rounded bg-white/8" />

        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-white/5" />
          <div className="h-4 w-full rounded bg-white/5" />
          <div className="h-4 w-9/12 rounded bg-white/5" />
        </div>
      </div>
    </div>
  );
}

