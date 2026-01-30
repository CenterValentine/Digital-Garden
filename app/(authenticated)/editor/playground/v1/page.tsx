import { Suspense } from "react";
import { PlaygroundSidebar } from "./components/PlaygroundSidebar";
import { PlaygroundMain } from "./components/PlaygroundMain";
import { ExampleLoadingSkeleton } from "./components/ExampleLoadingSkeleton";

export default function PlaygroundPage() {
  return (
    <div className="flex h-full">
      <Suspense fallback={<div className="w-60 border-r border-white/10" />}>
        <PlaygroundSidebar />
      </Suspense>
      <Suspense fallback={<ExampleLoadingSkeleton />}>
        <PlaygroundMain />
      </Suspense>
    </div>
  );
}
