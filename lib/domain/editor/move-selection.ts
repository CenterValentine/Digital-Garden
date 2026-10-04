/**
 * Move the selection out of this note into another one.
 *
 * Two traces, one move: the selected blocks are appended to the END of the
 * target note (on their own line — one empty paragraph of buffer when the
 * target already has content), then the selection is either deleted
 * ("without a trace") or replaced by a link to the target, in the display
 * the user chose most recently (lib/domain/editor/link-views.ts) so nobody
 * is asked to pick one.
 *
 * The target is chosen with the shared tree picker (ContentTreePicker —
 * the owner-canonical picker, same affordances as the Note Window's): an
 * existing note, or a note created in place from the tree and named after
 * the selection's first heading or line.
 *
 * Writes:
 *  - the TARGET, when it is open in this session, through its live editor
 *    (collab-safe and instant); otherwise through `POST …/[id]/append`,
 *    which routes through the one collaboration-safe server writer;
 *  - the HOST, always through this editor (the selection's own Y.Doc).
 *
 * Positions are re-checked after the network round-trips: if the text
 * moved under a remote edit, the host is left alone and the copy in the
 * target stands (a duplicate is recoverable; a wrong deletion is not).
 */

import type { Editor, JSONContent } from "@tiptap/core";
import { toast } from "sonner";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { useSettingsStore } from "@/state/settings-store";
import { applyLinkView, lastUsedLinkView } from "./link-views";
import { invalidateLinkPreview } from "./link-preview";
import { captureSelectionBlocks, capturedStillThere, replaceCapturedRange } from "./selection-blocks";

export type MoveTrace = "none" | "link";

export interface MoveTarget {
  id: string;
  title: string;
  contentType: string;
}

function hasMeaningfulContent(doc: JSONContent): boolean {
  const walk = (node: JSONContent): boolean => {
    if (node.type === "text" && node.text?.trim()) return true;
    if (node.type && !["doc", "paragraph", "text"].includes(node.type)) return true;
    return (node.content ?? []).some(walk);
  };
  return walk(doc);
}

/** Append through the target's live editor when it is open here; else the server. */
async function appendToTarget(target: MoveTarget, blocks: JSONContent[]): Promise<boolean> {
  const live = useEditorInstanceStore.getState().editorsByContentId[target.id];
  if (live && !live.isDestroyed) {
    const doc = live.state.doc;
    // An empty note is TipTap's one mandatory empty paragraph: the blocks
    // replace it (the server writer does the same), so the note does not
    // start with a blank line forever. Otherwise append after a buffer.
    const ok = hasMeaningfulContent(doc.toJSON() as JSONContent)
      ? live.chain().insertContentAt(doc.content.size, [{ type: "paragraph" }, ...blocks]).run()
      : live.chain().insertContentAt({ from: 0, to: doc.content.size }, blocks).run();
    if (ok) {
      invalidateLinkPreview(target.id);
      return true;
    }
  }
  try {
    const res = await fetch(`/api/content/content/${encodeURIComponent(target.id)}/append`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { type: "doc", content: blocks }, buffer: true }),
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
    if (!res.ok || !body?.success) {
      toast.error(body?.error || `Couldn't move into “${target.title}”`);
      return false;
    }
    invalidateLinkPreview(target.id);
    return true;
  } catch {
    toast.error(`Couldn't move into “${target.title}”`);
    return false;
  }
}

async function fetchTitle(contentId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/content/content/${encodeURIComponent(contentId)}`, { credentials: "include" });
    const body = (await res.json().catch(() => null)) as { success?: boolean; data?: { title?: string } } | null;
    return res.ok && body?.success && body.data?.title ? body.data.title : null;
  } catch {
    return null;
  }
}

/**
 * The provenance stamp that follows the moved blocks when a link is left
 * behind: `From [[Host]]` — so the two notes point at each other, and the
 * moved text says where it came from.
 */
function provenanceStamp(host: { id: string; title: string }): JSONContent {
  return {
    type: "paragraph",
    content: [
      { type: "text", text: "From " },
      { type: "wikiLink", attrs: { targetId: host.id, targetTitle: host.title } },
    ],
  };
}

/**
 * Move the current selection into `target`. Returns true when the blocks
 * landed in the target (the host edit is best-effort after that).
 * `hostContentId` is the note the selection leaves; with a link trace, the
 * moved blocks end with a stamp linking back to it.
 */
export async function moveSelectionToNote(
  editor: Editor,
  target: MoveTarget,
  trace: MoveTrace,
  hostContentId: string | null = null,
): Promise<boolean> {
  const captured = captureSelectionBlocks(editor);
  if (!captured) return false;

  let outgoing = captured.blocks;
  if (trace === "link" && hostContentId) {
    const hostTitle = await fetchTitle(hostContentId);
    if (hostTitle) outgoing = [...captured.blocks, provenanceStamp({ id: hostContentId, title: hostTitle })];
  }

  const landed = await appendToTarget(target, outgoing);
  if (!landed) return false;

  const stillThere = capturedStillThere(editor, captured);
  if (stillThere) {
    if (trace === "none") {
      replaceCapturedRange(editor, captured, null);
    } else {
      const view = lastUsedLinkView();
      const link = editor.schema.nodes.wikiLink.create({
        targetId: target.id,
        targetTitle: target.title,
        view: view === "window" || view === "link" ? null : view,
      });
      replaceCapturedRange(editor, captured, link);
      // "Window" is a block, not a view attr: convert the link just placed.
      if (view === "window") {
        const pos = findLinkNear(editor, captured.blockFrom, target.id);
        if (pos !== null) {
          applyLinkView(editor, pos, "window", {
            windowHeight: useSettingsStore.getState().editor?.noteWindowDefaultHeight ?? null,
          });
        }
      }
    }
  }

  toast.success(
    stillThere
      ? `Moved to “${target.title}”`
      : `Copied to “${target.title}” — the selection here changed meanwhile, so it was left in place`,
    {
      action: {
        label: "Open",
        onClick: () =>
          window.dispatchEvent(
            new CustomEvent("open-wiki-link", { detail: { targetId: target.id, targetTitle: target.title } }),
          ),
      },
    },
  );
  return true;
}

/** The first wikiLink to `targetId` at or after `from` (bounded search). */
function findLinkNear(editor: Editor, from: number, targetId: string): number | null {
  let found: number | null = null;
  const end = Math.min(editor.state.doc.content.size, from + 64);
  editor.state.doc.nodesBetween(Math.max(0, from - 1), end, (node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "wikiLink" && node.attrs.targetId === targetId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}
