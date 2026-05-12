import { FocusContentWorkspace } from "@/components/content/FocusContentWorkspace";
import { Suspense } from "react";
import { EditorSkeleton } from "@/components/content/skeletons/EditorSkeleton";

type Params = Promise<{ id: string }>;

export default async function FocusContentPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Suspense fallback={<EditorSkeleton />}>
        <FocusContentWorkspace contentId={id} />
      </Suspense>
    </div>
  );
}
