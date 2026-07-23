/**
 * Lossless block fences ("dg-block") — v3.2 T2
 *
 * The verbatim-preservation floor beneath the turndown serializer
 * (markdown-serialize.ts). Any node the pretty path can't prove round-trips —
 * custom/data blocks (callouts, Excalidraw, publishing configs), configured
 * standard nodes (an image with a width), escaping edges turndown gets wrong —
 * is emitted as an opaque fenced block carrying its EXACT JSON (base64) and
 * restored verbatim. Same philosophy as the `unsupportedBlock` safety net:
 * preserve, never drop.
 *
 * Deliberately PURE (no TipTap-extension imports) so the `markdown:blocks:check`
 * CI gate — and markdown-serialize.ts — can use it under tsx without pulling in
 * extensions-server (code-block-lowlight crashes the tsx CJS transform).
 */

import type { JSONContent } from "@tiptap/core";

export const DG_BLOCK_PREFIX = "DGBLOCKv1:";

/** UTF-8-safe base64 encode that works in both Node and the browser. */
function toBase64(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "base64").toString("utf8");
  }
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Emit a custom node as an opaque, verbatim-preserving fenced code block. */
export function serializeUnknownBlock(node: JSONContent): string {
  const typeHint = typeof node.type === "string" ? node.type : "node";
  const payload = toBase64(JSON.stringify(node));
  // Single-line body: `<prefix><typeHint>:<base64>`. base64's alphabet has no
  // colon, so splitting the type hint back out is unambiguous. Emitted as a
  // standalone fenced code block (callers blank-line-separate segments).
  return "```\n" + DG_BLOCK_PREFIX + typeHint + ":" + payload + "\n```";
}

/** If this codeBlock is a dg-block fence, decode it back to the original node. */
function tryDecodeDgBlock(node: JSONContent): JSONContent | null {
  if (!node || node.type !== "codeBlock") return null;
  const text = node.content?.[0]?.text;
  if (typeof text !== "string" || !text.startsWith(DG_BLOCK_PREFIX)) return null;
  try {
    const rest = text.slice(DG_BLOCK_PREFIX.length);
    const sep = rest.indexOf(":");
    // Strip any whitespace the code-fence round-trip may have appended (marked
    // / generateJSON can add a trailing newline inside <code>). base64's
    // alphabet has no whitespace, so this is safe.
    const payload = (sep >= 0 ? rest.slice(sep + 1) : rest).replace(/\s+/g, "");
    return JSON.parse(fromBase64(payload)) as JSONContent;
  } catch {
    // Corrupted fence (e.g. the user hand-edited the base64) — leave it as a
    // code block rather than crash or drop surrounding content.
    return null;
  }
}

/** Walk a parsed doc, restoring dg-block fences to their exact nodes. */
export function restoreDgBlocks(doc: JSONContent): {
  json: JSONContent;
  restored: number;
} {
  let restored = 0;
  const walk = (node: JSONContent): JSONContent => {
    if (!Array.isArray(node.content)) return node;
    node.content = node.content.map((child) => {
      const decoded = tryDecodeDgBlock(child);
      if (decoded) {
        restored++;
        return decoded;
      }
      return walk(child);
    });
    return node;
  };
  const clone =
    typeof structuredClone === "function"
      ? structuredClone(doc)
      : (JSON.parse(JSON.stringify(doc)) as JSONContent);
  walk(clone);
  return { json: clone, restored };
}
