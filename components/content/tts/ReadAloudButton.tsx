/**
 * ReadAloudButton — "Listen" affordance (Audio subsystem).
 *
 * Resolves narratable text by content type + source (`resolveContentText`) and
 * hands it to the shared TTS controller. While any playback is active it becomes
 * a Stop button.
 *
 *   - Toolbar (source "content"): reads THE CONTENT — note text, or a file's
 *     server-extracted document text. Never the sidecar note.
 *   - Sidecar Notes panel (source "note", variant "icon"): reads that note.
 */

"use client";

import { useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useTextToSpeech } from "@/lib/features/tts";
import {
  resolveContentText,
  type ReadAloudSource,
} from "@/lib/features/tts/resolve-content-text";
import { usePdfTextReaderStore } from "@/state/pdf-text-reader-store";

interface ReadAloudButtonProps {
  contentId: string | null;
  /** Content type of the surface — routes how text is resolved. */
  contentType?: string | null;
  /** "content" → the content's own text; "note" → a sidecar note. */
  source?: ReadAloudSource;
  /** "toolbar" → labelled pill; "icon" → compact icon-only. */
  variant?: "toolbar" | "icon";
}

export function ReadAloudButton({
  contentId,
  contentType = null,
  source = "content",
  variant = "toolbar",
}: ReadAloudButtonProps) {
  const tts = useTextToSpeech();
  const [resolving, setResolving] = useState(false);
  const active = tts.isActive;
  const loading = resolving || tts.status === "loading";

  const handleClick = async () => {
    if (active) {
      tts.stop();
      return;
    }
    if (!contentId) {
      toast.error("Nothing to read.");
      return;
    }
    // File content (PDF/doc): launch the draggable text reader rather than
    // reading blindly — it shows the extracted text and supports select → Speak.
    if (source === "content" && contentType === "file") {
      usePdfTextReaderStore.getState().openReader(contentId);
      return;
    }
    setResolving(true);
    try {
      const { text, label } = await resolveContentText(
        contentId,
        contentType,
        source,
      );
      if (!text) {
        toast.info(
          source === "note"
            ? "This note has no narratable text."
            : "No readable text in this content.",
        );
        return;
      }
      tts.play(text, { label });
    } finally {
      setResolving(false);
    }
  };

  const Icon = loading ? Loader2 : active ? Square : Volume2;
  const title = active ? "Stop reading" : "Read aloud";

  if (variant === "icon") {
    return (
      <button
        onClick={handleClick}
        className="flex items-center justify-center rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
        title={title}
        type="button"
        aria-label={title}
      >
        <Icon className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={title}
      type="button"
    >
      <Icon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      <span className="whitespace-nowrap">{active ? "Stop" : "Listen"}</span>
    </button>
  );
}
