/**
 * Editor-facing OCR actions. OCR-PASTE-PLAN.md D1, D2, D7.
 *
 *   pasteImageAsText      — Cmd/Ctrl+Shift+V with an image on the clipboard
 *   pasteClipboardImageAsText — context menu "Paste text from image"
 *   imageNodeToText       — context menu on an image: "Extract text" (keeps
 *                           the image) / "Replace image with its text"
 *
 * Text lands at the editor's selection AT COMPLETION, not where it was when
 * the job started — the user may have moved on while recognition ran. The
 * image actions re-find their node at completion for the same reason.
 * Every insert goes through editor commands, so it is collab-safe (writes into
 * the Y.Doc for collaborative notes) and one undo step.
 */
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { toast } from "sonner";

import { aiTextToContent, getOcrEngine, ocrTextToContent } from "./index";
import type { OcrEngineId } from "./types";

interface Recognised {
  /** Raw engine text (line per visual line) — used verbatim inside code blocks. */
  raw: string;
  /** Reflowed blocks. Empty = no text found. */
  content: JSONContent[];
}

/** localStorage key: the "your image went to <provider>" notice has been shown. */
const AI_NOTICE_KEY = "dg:ocr-ai-notice-shown";

/** Once per browser: say where an AI-read image went. */
function noticeAiProvider(model: string | undefined) {
  try {
    if (localStorage.getItem(AI_NOTICE_KEY)) return;
    localStorage.setItem(AI_NOTICE_KEY, "1");
  } catch {
    return; // no storage: skip the notice rather than repeat it every time
  }
  toast.info(`Read by ${model ?? "your AI model"}`, {
    description:
      "⌥⌘V (Ctrl+Alt+V) sends the image to this AI provider to read it. ⇧⌘V reads on your device. Choose the model in Settings → AI → Feature Routing.",
    duration: 10000,
  });
}

async function recognise(image: Blob, engine: OcrEngineId = "local"): Promise<Recognised> {
  if (engine === "ai") {
    const id = toast.loading("Reading text with AI…");
    try {
      const result = await getOcrEngine("ai").recognize(image);
      noticeAiProvider(result.model);
      return { raw: result.text.trim(), content: aiTextToContent(result.text) };
    } finally {
      toast.dismiss(id);
    }
  }
  const id = toast.loading("Loading text recognition…");
  let shown = "";
  try {
    const result = await getOcrEngine().recognize(image, {
      onProgress: ({ stage, progress }) => {
        const label =
          stage === "recognizing"
            ? `Reading text from image… ${Math.round(progress * 100)}%`
            : "Loading text recognition…";
        if (label !== shown) {
          shown = label;
          toast.loading(label, { id });
        }
      },
    });
    return { raw: result.text.trim(), content: ocrTextToContent(result.text) };
  } finally {
    toast.dismiss(id);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function insideCodeBlock(editor: Editor): boolean {
  return Boolean(editor.state.selection.$from.parent.type.spec.code);
}

/** Insert recognised text at the current selection. Returns false when there was none. */
function insertRecognised(editor: Editor, out: Recognised): boolean {
  if (insideCodeBlock(editor)) {
    // A code block holds text only, and a code screenshot's line breaks are
    // the content — insert the raw lines, not the reflowed prose.
    if (!out.raw) return false;
    editor.chain().focus().insertContent(out.raw.replace(/\r\n?/g, "\n")).run();
    return true;
  }
  if (out.content.length === 0) return false;
  editor.chain().focus().insertContent(out.content).run();
  return true;
}

export async function pasteImageAsText(
  editor: Editor,
  image: Blob,
  opts: { pasteImageInstead?: () => void; engine?: OcrEngineId } = {},
): Promise<void> {
  const instead = opts.pasteImageInstead
    ? { label: "Paste image instead", onClick: opts.pasteImageInstead }
    : undefined;
  let out: Recognised;
  try {
    out = await recognise(image, opts.engine);
  } catch (error) {
    toast.error("Couldn't read text from that image", { description: describe(error), action: instead });
    return;
  }
  if (editor.isDestroyed) return;
  if (!insertRecognised(editor, out)) {
    toast("No text found in that image", { action: instead });
  }
}

/**
 * Context menu "Paste text from image". The clipboard read happens FIRST,
 * before anything is awaited, so it stays inside the user gesture (Safari
 * voids a gesture that awaits other work first).
 */
export async function pasteClipboardImageAsText(editor: Editor, engine: OcrEngineId = "local"): Promise<void> {
  // The context-menu portal holds focus; readText/read reject with "Document
  // is not focused" unless the editor is focused first.
  editor.commands.focus();
  let image: Blob | null = null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) {
        image = await item.getType(type);
        break;
      }
    }
  } catch {
    toast.error("The browser blocked reading the clipboard from a menu. Paste with ⇧⌘V (Ctrl+Shift+V) instead.", {
      duration: 8000,
    });
    return;
  }
  if (!image) {
    toast("There's no image on the clipboard");
    return;
  }
  await pasteImageAsText(editor, image, { engine });
}

// ── Image node → text ───────────────────────────────────────────────────────

interface ImageRef {
  src: string;
  contentId: string | null;
  /** Position when the action started — a hint for re-finding the node. */
  pos: number | null;
}

/**
 * The image node matching `ref`, nearest to its last known position — the
 * same image can appear twice, and the doc may have changed since the click.
 */
function locateImage(editor: Editor, ref: ImageRef): { pos: number; node: PMNode } | null {
  let best: { pos: number; node: PMNode } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image") return true;
    const same = ref.contentId ? node.attrs.contentId === ref.contentId : node.attrs.src === ref.src;
    if (same) {
      const distance = ref.pos === null ? 0 : Math.abs(pos - ref.pos);
      if (distance < bestDistance) {
        best = { pos, node };
        bestDistance = distance;
      }
    }
    return false;
  });
  return best;
}

/** Read the image the user right-clicked (`imgEl`) and add or swap in its text. */
export async function imageNodeToText(
  editor: Editor,
  imgEl: Element,
  mode: "extract" | "replace",
): Promise<void> {
  const src = imgEl.getAttribute("src");
  if (!src) return;
  let hint: number | null = null;
  const wrapper = imgEl.closest(".image-resize-wrapper");
  try {
    if (wrapper) hint = editor.view.posAtDOM(wrapper, 0);
  } catch {
    // Detached node view — fall back to the first match.
  }
  const ref: ImageRef = { src, contentId: imgEl.getAttribute("data-content-id"), pos: hint };

  let image: Blob;
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`The image could not be loaded (HTTP ${response.status}).`);
    image = await response.blob();
  } catch (error) {
    const crossOrigin = /^https?:/i.test(src) && new URL(src).origin !== window.location.origin;
    toast.error("Couldn't load that image", {
      description: crossOrigin
        ? "The site hosting it doesn't allow reading its pixels. Download it and paste it instead."
        : describe(error),
    });
    return;
  }

  let out: Recognised;
  try {
    out = await recognise(image);
  } catch (error) {
    toast.error("Couldn't read text from that image", { description: describe(error) });
    return;
  }
  if (editor.isDestroyed) return;
  // Nothing destructive on an empty result: "replace" keeps the image.
  if (out.content.length === 0) {
    toast("No text found in that image");
    return;
  }
  const found = locateImage(editor, ref);
  if (!found) {
    toast.error("The image was removed before its text was read");
    return;
  }
  const after = found.pos + found.node.nodeSize;
  const range = mode === "replace" ? { from: found.pos, to: after } : after;
  editor.chain().focus().insertContentAt(range, out.content).run();
}
