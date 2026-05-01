/**
 * Server component: renders a TipTap JSON document to HTML.
 *
 * TipTap v3's generateHTML calls DOMSerializer.serializeFragment which needs
 * a real DOM document. We bypass the TipTap wrapper and call ProseMirror
 * directly, passing a jsdom document so it works in Node.js server components.
 */

import { DOMSerializer, Node } from "@tiptap/pm/model";
import { getSchema } from "@tiptap/core";
import { JSDOM } from "jsdom";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import type { JSONContent } from "@tiptap/core";

interface TipTapContentProps {
  bodyJson: JSONContent;
  className?: string;
}

// Ensure every node has a content array — ProseMirror fromJSON is tolerant
// of missing content but the recursive normalisation avoids edge-case errors.
function normalizeDoc(node: JSONContent): JSONContent {
  if (!node || typeof node !== "object") return node;
  return {
    ...node,
    content: (node.content ?? []).map(normalizeDoc),
  };
}

function generateHTMLServer(doc: JSONContent): string {
  const extensions = getServerExtensions();
  const schema = getSchema(extensions);
  const contentNode = Node.fromJSON(schema, doc);

  const { document: jsdomDocument } = new JSDOM("").window;
  const serializer = DOMSerializer.fromSchema(schema);
  const fragment = serializer.serializeFragment(contentNode.content, {
    document: jsdomDocument,
  });

  const container = jsdomDocument.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}

export function TipTapContent({ bodyJson, className }: TipTapContentProps) {
  let html = "";
  try {
    html = generateHTMLServer(normalizeDoc(bodyJson));
  } catch (err) {
    console.error("[TipTapContent] generateHTMLServer failed:", err);
    html = "<p><em>Content could not be rendered.</em></p>";
  }

  return (
    <div
      className={className ?? "public-prose"}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
