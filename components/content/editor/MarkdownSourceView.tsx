"use client";

/**
 * MarkdownSourceView (v3.2 T2)
 *
 * The editable *source* half of the rich-text ⇄ markdown toggle. A focused
 * monospace textarea seeded with `tiptapToMarkdown(...)`; the owning
 * MainPanelContent re-parses `value` through the T1-hardened
 * `markdownToTiptapResult` and commits it via the collab-correct write path
 * on toggle-back (or ⌘/Ctrl+↵ here).
 *
 * This component is intentionally dumb: it owns no conversion or persistence.
 * That keeps the collab-safety logic (never REST-write a Y.doc-backed note) in
 * one place — the parent — rather than smearing it across the editing surface.
 */

import { useEffect, useRef } from "react";

interface MarkdownSourceViewProps {
  /** Current markdown draft (controlled). */
  value: string;
  /** Fires on every keystroke. */
  onChange: (value: string) => void;
  /** Apply the draft back to the note (⌘/Ctrl+↵ shortcut). */
  onApply: () => void;
  /** Read-only view (e.g. system page templates). */
  editable?: boolean;
}

export function MarkdownSourceView({
  value,
  onChange,
  onApply,
  editable = true,
}: MarkdownSourceViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Land the caret in the source on entry so editing is immediate.
  useEffect(() => {
    if (editable) textareaRef.current?.focus();
  }, [editable]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-none flex items-center gap-2 px-6 pt-2 pb-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">Markdown source</span>
        <span className="opacity-70">
          {editable
            ? "— switch back to rich text (or press ⌘/Ctrl+↵) to apply"
            : "— read-only"}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        readOnly={!editable}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onApply();
          }
        }}
        placeholder="# Start writing markdown…"
        className="flex-1 w-full resize-none bg-transparent px-6 pb-6 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
        style={{
          fontFamily:
            '"JetBrains Mono", "Fira Code", ui-monospace, "Courier New", monospace',
        }}
      />
    </div>
  );
}
