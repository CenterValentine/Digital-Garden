interface TipTapNodeLike {
  type?: string;
  text?: string;
  content?: TipTapNodeLike[];
  attrs?: Record<string, unknown>;
}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "codeBlock",
  "callout",
  "horizontalRule",
  "sectionHeader",
  "cardPanel",
  "accordion",
  "tabs",
  "columns",
  "dailySummary",
  "weeklySummary",
]);

/**
 * Walk TipTap JSON, emitting plain text with paragraph breaks (\n\n)
 * between block-level nodes. The tokenizer treats double-newlines as
 * paragraph boundaries for punctuation pause timing.
 */
export function tiptapJsonToReaderText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const root = json as TipTapNodeLike;
  const parts: string[] = [];
  walk(root, parts, { inBlock: false });
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walk(
  node: TipTapNodeLike,
  out: string[],
  ctx: { inBlock: boolean }
) {
  if (!node) return;

  if (node.type === "text" && node.text) {
    out.push(node.text);
    return;
  }

  if (node.type === "wikiLink") {
    const label = (node.attrs?.label as string | undefined) || (node.attrs?.slug as string | undefined);
    if (label) out.push(label);
    return;
  }

  if (node.type === "tag") {
    const name = node.attrs?.tagName as string | undefined;
    if (name) out.push(name);
    return;
  }

  if (node.type === "horizontalRule") {
    out.push("\n\n");
    return;
  }

  const isBlock = node.type ? BLOCK_TYPES.has(node.type) : false;

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      walk(child, out, { inBlock: ctx.inBlock || isBlock });
    }
  }

  if (isBlock) {
    out.push("\n\n");
  }
}
