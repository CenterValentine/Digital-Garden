/**
 * Tool-prefix measurement (DEVELOPMENT ONLY).
 *
 * Serializes every AI tool exactly as the provider receives it and reports its
 * size, plus what each advertisement scenario costs under the current policy
 * in `lib/domain/ai/tools/menu.ts`.
 *
 * WHY THIS IS A ROUTE AND NOT A SCRIPT. The tool graph cannot be loaded by
 * plain Node: `server-only` is unresolvable outside Next, TipTap's ESM-only
 * packages break under tsx's CJS loader, and forcing the ESM loader hits
 * `ERR_REQUIRE_CYCLE_MODULE` on a cycle Next's bundler tolerates. Stubbing the
 * heavy modules was tried and rejected — `insert_block`'s description is
 * GENERATED from the block registry, which is populated by `registerBlock()`
 * at import time of each TipTap block extension. Stub those and the single
 * largest tool (5,221 tokens, 17% of the prefix) measures as a fraction of
 * itself, which is worse than not measuring at all.
 *
 * So the measurement runs where the real chat route runs, with the real module
 * resolution. `scripts/measure-tool-prefix.ts` is the front door.
 *
 * Read it with:  pnpm tools:prefix:measure
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import {
  createBaseTools,
  createDataTools,
  createEditorTools,
  createFlashcardTools,
  createWorkflowTools,
} from "@/lib/domain/ai/tools";
import {
  coBrowseActTool,
  coBrowseOpenTool,
  listTabsTool,
  openTabAndReadTool,
  readCurrentPageTool,
  readPageInBrowserTool,
} from "@/lib/domain/ai/tools/registry";
import {
  CORE_TOOL_IDS,
  MODE_TOOL_IDS,
  TOOL_MENU,
  buildToolMenu,
} from "@/lib/domain/ai/tools/menu";
import type { ToolExecuteContext } from "@/lib/domain/ai/tools/types";

/**
 * chars/4 — the estimator used throughout this codebase (`context-diet.ts`,
 * `run-inspector/anomalies.ts`). JSON-Schema text tokenizes denser than prose,
 * so these run roughly 10-20% low in absolute terms; ratios are unaffected.
 */
const estimateTokens = (chars: number) => Math.ceil(chars / 4);

/** The summon tool is added by the route at request time, not by a factory. */
const SUMMON_ESTIMATED_TOKENS = 200;

type AnyTool = { description?: string; inputSchema?: unknown };

/** Bytes the provider receives for one tool: name + description + JSON Schema. */
function wireSize(name: string, t: AnyTool): { chars: number; schemaFailed: boolean } {
  let schema: unknown = {};
  let schemaFailed = false;
  try {
    schema = z.toJSONSchema(t.inputSchema as never, {
      target: "draft-7",
      io: "input",
    });
  } catch {
    // Reported rather than swallowed: a tool whose schema will not convert is
    // measured too low, and a silently low number is the failure this harness
    // exists to prevent.
    schemaFailed = true;
  }
  return {
    chars: JSON.stringify({
      name,
      description: t.description ?? "",
      input_schema: schema,
    }).length,
    schemaFailed,
  };
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "development only" }, { status: 404 });
  }

  // `execute` is never called — only the schema surface is measured.
  const ctx = {
    userId: "00000000-0000-0000-0000-000000000000",
    conversationId: null,
    contentId: null,
  } as unknown as ToolExecuteContext;

  const allTools: Record<string, AnyTool> = {
    ...createBaseTools(ctx),
    ...createFlashcardTools(ctx),
    ...createWorkflowTools(ctx),
    ...createDataTools(ctx),
    ...createEditorTools(ctx),
    // Client-executed tools, registered by the chat route when the browser
    // extension and co-browse panel are present.
    read_page_headless_or_browser: readPageInBrowserTool as AnyTool,
    open_tab_and_read: openTabAndReadTool as AnyTool,
    co_browse_open: coBrowseOpenTool as AnyTool,
    co_browse_act: coBrowseActTool as AnyTool,
    read_current_page: readCurrentPageTool as AnyTool,
    list_tabs: listTabsTool as AnyTool,
  };

  const rows = Object.entries(allTools)
    .map(([name, t]) => {
      const { chars, schemaFailed } = wireSize(name, t);
      return {
        name,
        chars,
        tokens: estimateTokens(chars),
        family: TOOL_MENU[name]?.family ?? null,
        core: CORE_TOOL_IDS.includes(name),
        modes: Object.entries(MODE_TOOL_IDS)
          .filter(([, ids]) => ids.includes(name))
          .map(([mode]) => mode),
        schemaFailed,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);

  const registered = new Set(Object.keys(allTools));
  const tokensOf = (ids: Iterable<string>) =>
    [...ids].reduce(
      (n, id) => n + (rows.find((r) => r.name === id)?.tokens ?? 0),
      0,
    );

  /** What one advertisement scenario costs, menu and summon included. */
  function scenario(label: string, modes: string[]) {
    const advertised = new Set<string>(
      CORE_TOOL_IDS.filter((id) => registered.has(id)),
    );
    for (const mode of modes) {
      for (const id of MODE_TOOL_IDS[mode] ?? []) {
        if (registered.has(id)) advertised.add(id);
      }
    }
    // Mirrors the route's predictive activation for an approved run.
    if (modes.includes("runs")) {
      for (const id of ["query_database", "describe_database"]) {
        if (registered.has(id)) advertised.add(id);
      }
    }
    const menuText = buildToolMenu({ registered, advertised, leadWith: [] }) ?? "";
    const menuTokens = estimateTokens(menuText.length);
    const advertisedTokens = tokensOf(advertised);
    return {
      label,
      modes,
      advertisedCount: advertised.size,
      advertisedTokens,
      menuTokens,
      menuListed: registered.size - advertised.size,
      summonTokens: SUMMON_ESTIMATED_TOKENS,
      totalTokens: advertisedTokens + menuTokens + SUMMON_ESTIMATED_TOKENS,
    };
  }

  const fullPrefixTokens = rows.reduce((n, r) => n + r.tokens, 0);

  return NextResponse.json({
    measuredAt: new Date().toISOString(),
    estimator: "chars/4",
    toolCount: rows.length,
    fullPrefixTokens,
    fullPrefixChars: rows.reduce((n, r) => n + r.chars, 0),
    schemaFailures: rows.filter((r) => r.schemaFailed).map((r) => r.name),
    // Tools with no menu entry are invisible under the current policy. The
    // drift gate blocks this; reported here so a red number is legible.
    missingMenuEntries: rows.filter((r) => !r.family).map((r) => r.name),
    scenarios: [
      scenario("plain chat", []),
      scenario("editor open", ["editor"]),
      scenario("co-browse run", ["browser", "runs"]),
      scenario("co-browse run + editor", ["browser", "runs", "editor"]),
    ],
    rows,
  });
}
