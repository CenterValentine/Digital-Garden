"use client";

/**
 * Right-sidebar "Model" tab for a chat open in the main pane — the console
 * view of CONTEXT-WINDOW-EDITOR-PLAN §7: the transcript on the left, what
 * the model will carry on the right. Reads the chat surface's publication
 * (model-context-store); the surface owns the engine and the marks.
 */

import { ContextLedger } from "./ai/ContextLedger";
import { useModelContextStore } from "@/state/model-context-store";

export function ModelContextTab({ contentId }: { contentId: string | null }) {
  const publication = useModelContextStore((s) =>
    contentId ? s.publications[contentId] : undefined,
  );
  if (!publication) {
    return (
      <div className="px-3 py-4 text-[12px] text-gray-500 dark:text-gray-400">
        Open a chat in the main pane to see what the model carries into its next request.
      </div>
    );
  }
  return (
    <ContextLedger
      messages={publication.messages}
      vendor={publication.vendor}
      actions={publication.actions}
    />
  );
}
