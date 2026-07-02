/**
 * resolveContentText — get the narratable text for a "read aloud" surface,
 * routed by content type and source (Audio subsystem).
 *
 * The crux: the TipTap editor registered under a content id is the CONTENT for a
 * note, but the SIDECAR note for a file/PDF/etc. So:
 *   - Toolbar "Listen" (source "content") on a note  → that note's editor text.
 *   - Toolbar "Listen" (source "content") on a file  → the file's server-extracted
 *     document text (FilePayload.searchText) — NOT the sidecar note.
 *   - Sidecar note button (source "note")            → the note editor under the id.
 */

"use client";

import { extractReadableText } from "@/lib/domain/editor/tts/extract-readable-text";
import { useEditorInstanceStore } from "@/state/editor-instance-store";

export type ReadAloudSource = "content" | "note";

export interface ResolvedText {
  text: string;
  label: string;
}

export async function resolveContentText(
  contentId: string,
  contentType: string | null,
  source: ReadAloudSource,
): Promise<ResolvedText> {
  // Read the live editor when the target IS a note — either the note content
  // itself, or a sidecar note invoked by its own button.
  if (source === "note" || contentType === "note") {
    const editor = useEditorInstanceStore.getState().getEditor(contentId);
    if (editor) {
      return { text: extractReadableText(editor.getJSON()), label: "Reading note" };
    }
    // Sidecar with no mounted editor — nothing to read.
    if (source === "note") return { text: "", label: "Reading note" };
  }

  // Non-note content: read the server-extracted document text.
  try {
    const res = await fetch(`/api/content/content/${contentId}`);
    if (!res.ok) return { text: "", label: "Reading document" };
    const json = (await res.json()) as { data?: ContentPayload } & ContentPayload;
    const data = json.data ?? json;
    const text =
      data.file?.searchText ??
      data.html?.searchText ??
      data.note?.searchText ??
      "";
    return {
      text: typeof text === "string" ? text : "",
      label: "Reading document",
    };
  } catch {
    return { text: "", label: "Reading document" };
  }
}

interface ContentPayload {
  file?: { searchText?: string };
  html?: { searchText?: string };
  note?: { searchText?: string };
}
