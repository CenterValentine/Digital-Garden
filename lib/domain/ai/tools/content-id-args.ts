/**
 * Content-id-bearing tool args — Session 4b.
 *
 * The tool-call auto-association interceptor (in the chat route) needs to
 * know which tool input fields carry a ContentNode id, so it can upsert
 * an `auto` association when the model references content during a turn.
 *
 * This is a declarative annotation, not introspection: each entry maps a
 * tool name to the input field(s) that hold content node id(s). Editor
 * tools are intentionally absent — they operate on the in-scope
 * `ctx.contentId`, which is already snapshot-associated when the
 * conversation was created on that document, so re-associating would be
 * redundant.
 *
 * To make a NEW tool participate, add its name + the id-bearing field(s)
 * here. A field value may be a single id string or an array of id strings.
 */

export const CONTENT_ID_TOOL_ARGS: Record<string, readonly string[]> = {
  // Reads a specific note by id — the canonical cross-note reference.
  getCurrentNote: ["contentId"],
};

/**
 * Pull content node ids out of a tool call's input given the annotation.
 * Returns a de-duplicated list; empty when the tool isn't annotated or
 * the fields are absent/malformed.
 */
export function extractContentIdsFromToolCall(
  toolName: string,
  input: unknown,
): string[] {
  const fields = CONTENT_ID_TOOL_ARGS[toolName];
  if (!fields || !input || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  const ids = new Set<string>();
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.length > 0) {
      ids.add(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.length > 0) ids.add(item);
      }
    }
  }
  return Array.from(ids);
}
