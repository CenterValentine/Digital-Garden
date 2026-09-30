"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ScriptureSessionDto } from "@/lib/domain/scripture/types";
import { contentTargetKey } from "@/lib/domain/reader/types";
import { scriptureApi } from "../lib/api";
import { ScriptureReader } from "./ScriptureReader";

/**
 * A scripture session from the file tree: resolve which collection it opens,
 * then read it with the session's own name and reading position.
 */
export function ScriptureSessionViewer({ contentId }: { contentId: string }) {
  const [session, setSession] = useState<ScriptureSessionDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    scriptureApi
      .session(contentId)
      .then((loaded) => !cancelled && setSession(loaded))
      .catch(
        (caught) =>
          !cancelled &&
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not open this session",
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm">
        <div>
          <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <ScriptureReader
      corpusId={session.corpusId}
      contentId={contentId}
      progressKey={contentTargetKey(contentId)}
      rootTitle={session.title}
    />
  );
}
