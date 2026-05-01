/**
 * Server component: renders a TipTap JSON document to HTML.
 * Uses server-safe extensions (no React, no DOM).
 */

import { generateHTML } from "@tiptap/core";
import { getServerExtensions } from "@/lib/domain/editor";
import type { JSONContent } from "@tiptap/core";

interface TipTapContentProps {
  bodyJson: JSONContent;
  className?: string;
}

export function TipTapContent({ bodyJson, className }: TipTapContentProps) {
  let html = "";
  try {
    html = generateHTML(bodyJson, getServerExtensions());
  } catch {
    html = "<p><em>Content could not be rendered.</em></p>";
  }

  return (
    <div
      className={className ?? "prose prose-invert max-w-none"}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
