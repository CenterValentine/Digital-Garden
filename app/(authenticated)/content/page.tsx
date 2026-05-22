/**
 * Notes Page - Main entry point
 *
 * Renders the main panel with editor/viewer. When the URL carries a
 * ?content=<id> param AND that id's response is already in the server-side
 * cache, we inline the data into the page so the client mounts with
 * content in props — skipping a post-hydration round trip on warm reloads.
 *
 * Cold first-ever loads fall through to the client's normal fetch effect.
 */

import { MainPanelWorkspace } from "@/components/content/MainPanelWorkspace";
import { EditorSkeleton } from "@/components/content/skeletons/EditorSkeleton";
import { Suspense } from "react";
import { getCurrentSession } from "@/lib/infrastructure/auth/middleware";
import { safeGetInitialContent } from "@/lib/domain/content/get-initial-content";

type NotesPageProps = {
  // Next.js 16 App Router: searchParams is a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const params = await searchParams;
  const contentParam = params.content;
  const contentId = typeof contentParam === "string" ? contentParam : null;

  // Skip auth+cache lookup if there's no content id in the URL — that's the
  // "open /content cold" path. The client restores from localStorage and
  // fetches as usual.
  let initialContent = null;
  if (contentId) {
    const session = await getCurrentSession();
    if (session?.user?.id) {
      initialContent = await safeGetInitialContent(contentId, session.user.id);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Workspace loads progressively */}
      <Suspense fallback={<EditorSkeleton />}>
        <MainPanelWorkspace initialContent={initialContent} />
      </Suspense>
    </div>
  );
}
