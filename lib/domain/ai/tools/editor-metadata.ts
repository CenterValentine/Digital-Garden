/**
 * AI Editor Tool Metadata (Client-Safe) — Sprint 39
 *
 * Static metadata about editor AI tools for the settings UI.
 * NO server-side imports — safe to use in client components.
 */

/** Editor tool IDs */
export const EDITOR_TOOL_IDS = [
  "read_first_chunk",
  "read_next_chunk",
  "read_previous_chunk",
  "apply_diff",
  "replace_document",
  "insert_image",
  "plan",
  "ask_user",
  "finish_with_summary",
] as const;

export type EditorToolId = (typeof EDITOR_TOOL_IDS)[number];

/** Tool metadata for the settings UI */
export const EDITOR_TOOL_METADATA: Record<
  EditorToolId,
  { name: string; description: string }
> = {
  read_first_chunk: {
    name: "Read Document",
    description: "Read the beginning of the currently open document",
  },
  read_next_chunk: {
    name: "Read Next",
    description: "Continue reading the next section of the document",
  },
  read_previous_chunk: {
    name: "Read Previous",
    description: "Navigate back to a previous section of the document",
  },
  apply_diff: {
    name: "Apply Edit",
    description: "Make targeted text replacements in the document",
  },
  replace_document: {
    name: "Replace Document",
    description: "Replace the entire document content with new text",
  },
  insert_image: {
    name: "Insert Image",
    description: "Insert an image from a URL into the document",
  },
  plan: {
    name: "Plan Edits",
    description: "Create a step-by-step plan for complex editing tasks",
  },
  ask_user: {
    name: "Ask User",
    description: "Ask clarifying questions before making edits",
  },
  finish_with_summary: {
    name: "Finish Editing",
    description: "Complete the editing task with a summary of changes",
  },
};
