"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, lazy, useMemo } from "react";
import { ExampleLoadingSkeleton } from "./ExampleLoadingSkeleton";

export function PlaygroundMain() {
  const searchParams = useSearchParams();
  const activeExample = searchParams.get("example") || "default-text-editor";

  // Dynamic import based on active example (lazy load for isolation)
  const ExampleComponent = useMemo(() => {
    switch (activeExample) {
      case "default-text-editor":
        return lazy(() => import("../examples/DefaultTextEditor"));
      case "formatting":
        return lazy(() => import("../examples/Formatting"));
      case "images":
        return lazy(() => import("../examples/Images"));
      case "long-texts":
        return lazy(() => import("../examples/LongTexts"));
      case "markdown-shortcuts":
        return lazy(() => import("../examples/MarkdownShortcuts"));
      case "minimal-setup":
        return lazy(() => import("../examples/MinimalSetup"));
      case "tables":
        return lazy(() => import("../examples/Tables"));
      case "tasks":
        return lazy(() => import("../examples/Tasks"));
      case "text-direction":
        return lazy(() => import("../examples/TextDirection"));
      default:
        return lazy(() => import("../examples/DefaultTextEditor"));
    }
  }, [activeExample]);

  return (
    <div className="flex-1 overflow-auto bg-gray-900">
      <Suspense fallback={<ExampleLoadingSkeleton />}>
        {/* Key forces full remount on example change = true isolation */}
        <ExampleComponent key={activeExample} />
      </Suspense>
    </div>
  );
}
