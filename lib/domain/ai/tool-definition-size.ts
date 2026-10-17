/**
 * How many characters the assembled tool definitions put into a request
 * (CONTEXT-WINDOW-EDITOR-PLAN §6). Providers bill tool names, descriptions
 * and input schemas as prompt tokens but never itemise them; the context
 * ledger needs a measured figure, not a guess. Serializes the same shape
 * the SDK sends — name, description, JSON schema — and returns null when a
 * schema cannot be serialized, so an estimate never masquerades as a
 * measurement. Server-only (schemas are zod objects).
 */

import { z } from "zod/v4";

type ToolLike = {
  description?: unknown;
  inputSchema?: unknown;
};

function jsonSchemaOf(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema ?? null;
  // AI SDK `jsonSchema()` wrappers expose the JSON schema directly.
  const wrapped = schema as { jsonSchema?: unknown };
  if (wrapped.jsonSchema !== undefined) return wrapped.jsonSchema;
  // zod v4 schemas serialize through the library's own converter.
  if ("_zod" in (schema as Record<string, unknown>)) {
    return z.toJSONSchema(schema as z.ZodType, { unrepresentable: "any" });
  }
  return schema;
}

/** Characters of the serialized tool set, or null when it cannot be measured. */
export function measureToolDefinitionChars(
  tools: Record<string, unknown>,
  activeIds?: Iterable<string>,
): number | null {
  try {
    const ids = activeIds ? [...activeIds] : Object.keys(tools);
    let total = 0;
    for (const id of ids) {
      const t = tools[id] as ToolLike | undefined;
      if (!t) continue;
      total += JSON.stringify({
        name: id,
        description: typeof t.description === "string" ? t.description : "",
        parameters: jsonSchemaOf(t.inputSchema),
      }).length;
    }
    return total;
  } catch {
    return null;
  }
}
