/**
 * Send the selection to a new note.
 *
 * The selected blocks become a new note's body; the selection in the host
 * note is replaced by a link to it. The new note lands NEXT TO the host —
 * same folder, immediately after it — so the structure the user already
 * keeps is where the extracted thought goes (never a scratch bucket). From
 * there the link's hover chooser can turn it into a card or window the
 * note back in place.
 *
 * Context-menu only, by design: it is an act of reorganisation, not
 * formatting. Its sibling, "Move to Note…" (move-selection.ts), targets an
 * existing or picker-placed note instead.
 */

import type { Editor, JSONContent } from "@tiptap/core";
import { toast } from "sonner";
import { captureSelectionBlocks, capturedStillThere, replaceCapturedRange } from "./selection-blocks";

export interface SelectionForNote {
  tiptapJson: { type: string; content: unknown[] };
  plainText: string;
}

const TITLE_MAX = 60;

function firstHeadingText(nodes: unknown[]): string | null {
  for (const raw of nodes) {
    const node = raw as JSONContent;
    if (!node || typeof node !== "object") continue;
    if (node.type === "heading") {
      const text = (node.content ?? [])
        .map((child) => (child.type === "text" ? child.text ?? "" : ""))
        .join("")
        .trim();
      if (text) return text;
    }
    if (Array.isArray(node.content)) {
      const nested = firstHeadingText(node.content);
      if (nested) return nested;
    }
  }
  return null;
}

/** A title for the new note: its first heading, else its first line, clipped at a word. */
export function suggestNoteTitle(capture: SelectionForNote): string {
  const heading = firstHeadingText(capture.tiptapJson.content);
  const firstLine = (heading ?? capture.plainText).split("\n").find((l) => l.trim()) ?? "";
  const flat = firstLine.replace(/\s+/g, " ").trim();
  if (flat.length <= TITLE_MAX) return flat || "Untitled";
  const cut = flat.slice(0, TITLE_MAX);
  const atWord = cut.lastIndexOf(" ");
  return (atWord > TITLE_MAX * 0.5 ? cut.slice(0, atWord) : cut).trim();
}

async function readPlacement(hostContentId: string): Promise<{ parentId: string | null; displayOrder: number | null }> {
  try {
    const res = await fetch(`/api/content/content/${encodeURIComponent(hostContentId)}`, {
      credentials: "include",
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { parentId?: string | null; displayOrder?: number | null };
    } | null;
    if (!res.ok || !body?.success || !body.data) return { parentId: null, displayOrder: null };
    return {
      parentId: body.data.parentId ?? null,
      displayOrder: typeof body.data.displayOrder === "number" ? body.data.displayOrder : null,
    };
  } catch {
    return { parentId: null, displayOrder: null };
  }
}

/**
 * Create the note and replace the selection with a link to it. Returns the
 * new note, or null when creation failed (the host is left untouched).
 */
export async function sendSelectionToNewNote(
  editor: Editor,
  hostContentId: string | null,
  title: string,
): Promise<{ id: string; title: string } | null> {
  const captured = captureSelectionBlocks(editor);
  if (!captured) return null;
  const finalTitle = title.trim() || "Untitled";

  const placement = hostContentId
    ? await readPlacement(hostContentId)
    : { parentId: null, displayOrder: null };

  let newId: string;
  try {
    const res = await fetch("/api/content/content", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: finalTitle,
        parentId: placement.parentId,
        tiptapJson: { type: "doc", content: captured.blocks },
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { id?: string };
      error?: string;
    } | null;
    if (!res.ok || !body?.success || !body.data?.id) {
      toast.error(body?.error || "Couldn't create the note");
      return null;
    }
    newId = body.data.id;
  } catch {
    toast.error("Couldn't create the note");
    return null;
  }

  // Right after the host among its siblings. Non-fatal: the note exists
  // either way, at the end of the folder.
  if (placement.displayOrder !== null) {
    await fetch("/api/content/content/move", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentId: newId,
        targetParentId: placement.parentId,
        newDisplayOrder: placement.displayOrder + 1,
      }),
    }).catch(() => {});
  }
  window.dispatchEvent(new CustomEvent("dg:tree-refresh"));

  // Replace the selection with the link — through the editor, so a collab
  // note writes into its Y.Doc. The positions were captured before the
  // network round-trips; if the text there has changed meanwhile (a remote
  // edit, the user kept typing), leave the host alone rather than cut the
  // wrong range.
  if (capturedStillThere(editor, captured)) {
    replaceCapturedRange(
      editor,
      captured,
      editor.schema.nodes.wikiLink.create({ targetId: newId, targetTitle: finalTitle }),
    );
  }

  toast.success(`Sent to “${finalTitle}”`, {
    action: {
      label: "Open",
      onClick: () =>
        window.dispatchEvent(
          new CustomEvent("open-wiki-link", { detail: { targetId: newId, targetTitle: finalTitle } }),
        ),
    },
  });
  return { id: newId, title: finalTitle };
}
