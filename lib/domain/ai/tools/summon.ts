/**
 * `summon` — load a tool's operating instructions on demand.
 *
 * The menu (see `./menu.ts`) tells the model a tool EXISTS in ~15 tokens.
 * This is how its schema arrives: activation adds it to the advertised set,
 * and `prepareStep` hands that set to the next step, where the provider
 * receives the real schema and can constrain the arguments against it.
 *
 * The result deliberately does NOT contain the schema. Serializing it into the
 * transcript would pay for it twice — once as text that cannot constrain
 * anything, once in the tools block where it belongs.
 *
 * Why a step is spent. The arguments are emitted in the same inference as the
 * tool name, so the instructions must be in place BEFORE the operative call,
 * never during it. Prediction is the way to avoid the step, not async: a run
 * that declares what it will touch has those tools activated before its first
 * inference, so the common paths cost nothing.
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { flattenSummonNames, resolveSummonNames } from "./menu";

export const SUMMON_TOOL_ID = "summon";

/**
 * Build the summon tool over a per-request activation set.
 *
 * `activated` is owned by the route and read by `prepareStep`; mutating it
 * here is the whole mechanism. The set is a RATCHET — tools are only ever
 * added within a turn, never removed, so the advertised prefix grows
 * monotonically and each summon costs at most one prefix change.
 */
/**
 * Rough size of one tool's schema as the provider sees it (description +
 * JSON schema, chars/4). Used only to TELL the model what a summon costs
 * per step — prod ecf1d0e5 (2026-09-28) summoned four whole families (23
 * tools, ~10k tokens) up front and paid for them on every one of 19 steps.
 */
export function estimateToolSchemaTokens(toolDef: unknown): number {
  if (!toolDef || typeof toolDef !== "object") return 0;
  const t = toolDef as { description?: unknown; inputSchema?: unknown };
  let schemaText = "";
  const schema = t.inputSchema as
    | { jsonSchema?: unknown; _zod?: unknown }
    | undefined;
  try {
    if (schema && typeof schema === "object") {
      if ("jsonSchema" in schema && schema.jsonSchema) {
        schemaText = JSON.stringify(schema.jsonSchema);
      } else if ("_zod" in schema) {
        schemaText = JSON.stringify(z.toJSONSchema(schema as unknown as z.ZodType));
      }
    }
  } catch {
    schemaText = "";
  }
  const description = typeof t.description === "string" ? t.description : "";
  return Math.ceil((description.length + schemaText.length) / 4);
}

export function createSummonTool(input: {
  /** Every tool registered this turn. */
  registered: ReadonlySet<string>;
  /** The route's live activation set — mutated on success. */
  activated: Set<string>;
  /** Already advertised in full; summoning one is a no-op worth saying so. */
  isAdvertised: (id: string) => boolean;
  /** Schema size per tool id, so the result can price the summon per step. */
  schemaTokensFor?: (id: string) => number;
}) {
  return tool({
    description:
      "Load the full instructions for tools listed in the summon menu, so you can call them. " +
      "Pass tool ids, or a family name to take a whole group (databases, reading, writing, web, browser, editor, runs, flashcards, workflows, media, dialog). " +
      "Name everything this step needs in ONE call — each summon costs a step. " +
      "The summoned tools become callable on your NEXT step, not this one; do not also emit the real call in this step.",
    inputSchema: z.object({
      names: z
        .union([z.array(z.string()), z.string()])
        .describe(
          'Tool ids or family names — e.g. ["query_database"] or ["databases"]',
        ),
    }),
    execute: async ({ names }) => {
      // Accepts an array, one name, or a JSON-encoded array in the string
      // slot — see `flattenSummonNames`.
      const requested = flattenSummonNames(names);
      if (requested.length === 0) {
        return "Nothing summoned — name at least one tool id or family from the menu.";
      }

      const { activate, unknown } = resolveSummonNames(requested, input.registered);

      const already = activate.filter(input.isAdvertised);
      const fresh = activate.filter((id) => !input.isAdvertised(id));
      for (const id of fresh) input.activated.add(id);

      const parts: string[] = [];
      if (fresh.length > 0) {
        const tokens = input.schemaTokensFor
          ? fresh.reduce((n, id) => n + input.schemaTokensFor!(id), 0)
          : 0;
        // The price rides the result (never silent): schemas are re-sent on
        // every remaining step, so a family summoned "just in case" is the
        // single most expensive line of the run.
        const priceNote =
          tokens > 0
            ? ` (≈${tokens.toLocaleString("en-US")} tokens of schema now ride on EVERY remaining step${fresh.length >= 8 ? " — summon only the tools this run will call, not whole families" : ""}.)`
            : "";
        parts.push(
          `Activated: ${fresh.join(", ")}. Their full schemas are available from your NEXT step — call them there.${priceNote}`,
        );
      }
      if (already.length > 0) {
        parts.push(
          `Already available, no summon needed: ${already.join(", ")}. Call them directly.`,
        );
      }
      if (unknown.length > 0) {
        parts.push(
          `Not a tool or family in this turn's menu: ${unknown.join(", ")}. Check the menu's ids rather than guessing.`,
        );
      }
      if (parts.length === 0) {
        return "Nothing summoned — none of those names matched the menu.";
      }
      return parts.join(" ");
    },
  });
}
