/**
 * Workflow mastery tools (AI v3 core S6, umbrella B1/B2).
 *
 * The AI authors and runs Trellis workflows through the SAME doors the app
 * uses: graphs validate via workflowGraphSchema + validateGraph (builder
 * parity — node types and per-node configs both checked), runs start via
 * dispatchWorkflowFromContent (the one trigger door). No parallel engine
 * paths; a workflow the AI proposes is byte-identical in kind to one built
 * on the canvas, and the canvas IS the review surface after approval.
 *
 * Server-only (Prisma). Registered in the chat route beside the base tools.
 */

import { tool } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { addAutoAssociation } from "@/lib/features/conversations";
import { generateUniqueSlug } from "@/lib/domain/content";
import { renderNodeCatalogForAI } from "@/extensions/workflows/nodes/catalog-doc";
import {
  workflowGraphSchema,
  WDK_INTERPRETER_ENGINE,
} from "@/extensions/workflows/graph/schema";
import { validateGraph } from "@/extensions/workflows/graph/validate";
import {
  dispatchWorkflowFromContent,
  isDispatchFailure,
} from "@/extensions/workflows/server/dispatch";
import { pushWorkflowToN8n } from "@/extensions/workflows/server/engines/n8n/push";
import { N8N_PAYLOAD_ENGINE } from "@/extensions/workflows/server/engines/n8n/meta";
import { getContentWriteReceiptEnvelope } from "@/lib/domain/ai/content-write-receipts.server";
import type { ToolExecuteContext } from "./types";

/** Render schema/structural issues in a model-repairable form. */
function formatGraphIssues(
  issues: Array<{ nodeId?: string; edgeId?: string; message: string }>,
): string {
  const lines = issues
    .slice(0, 8)
    .map(
      (issue) =>
        `- ${issue.nodeId ? `node "${issue.nodeId}": ` : issue.edgeId ? `edge "${issue.edgeId}": ` : ""}${issue.message}`,
    );
  return (
    `GRAPH_INVALID — the workflow was NOT created. Fix these and call propose_workflow again:\n` +
    lines.join("\n") +
    `\nIf you have not called get_workflow_node_catalog this conversation, do that first — node type ids and config keys must match it exactly.`
  );
}

/**
 * Payload-engine → user-facing label. Engines are NOT interchangeable
 * (owner rule 2026-07-18): a workflow is written FOR its engine, and the
 * AI must keep modifications on the target's engine.
 */
function engineLabel(engine: string): "n8n" | "Trellis" {
  return engine === N8N_PAYLOAD_ENGINE ? "n8n" : "Trellis";
}

/**
 * Resolve which workflow a tool call refers to. Priority: explicit id >
 * title match > the workflow the user has OPEN (ctx.contentId is the open
 * content node for any non-chat type — set by the chat route). Returns an
 * error string (model-repairable) when nothing resolves.
 */
async function resolveWorkflowNode(
  ctx: ToolExecuteContext,
  workflowNodeId: string | undefined,
  name: string | undefined,
): Promise<
  | {
      id: string;
      title: string;
      enabled: boolean;
      engine: string;
      definition: unknown;
    }
  | string
> {
  if (workflowNodeId) {
    const node = await prisma.contentNode.findFirst({
      where: {
        id: workflowNodeId,
        ownerId: ctx.userId,
        contentType: "workflow",
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        workflowPayload: { select: { enabled: true, engine: true, definition: true } },
      },
    });
    if (!node?.workflowPayload) {
      return `No workflow with id ${workflowNodeId}. Call list_workflows to see what exists.`;
    }
    return {
      id: node.id,
      title: node.title,
      enabled: node.workflowPayload.enabled,
      engine: node.workflowPayload.engine,
      definition: node.workflowPayload.definition,
    };
  }
  if (name) {
    const matches = await prisma.contentNode.findMany({
      where: {
        ownerId: ctx.userId,
        contentType: "workflow",
        deletedAt: null,
        title: { contains: name, mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        workflowPayload: { select: { enabled: true, engine: true, definition: true } },
      },
    });
    if (matches.length === 0) {
      return `No workflow found matching "${name}". Call list_workflows to see what exists.`;
    }
    if (matches.length > 1) {
      return (
        `Multiple workflows match "${name}" — re-call with the intended workflowNodeId:\n` +
        matches.map((m) => `- "${m.title}" (id: ${m.id})`).join("\n")
      );
    }
    const only = matches[0];
    if (!only.workflowPayload) {
      return `Workflow "${only.title}" has no graph payload.`;
    }
    return {
      id: only.id,
      title: only.title,
      enabled: only.workflowPayload.enabled,
      engine: only.workflowPayload.engine,
      definition: only.workflowPayload.definition,
    };
  }
  // Neither id nor name: fall back to the workflow the user has open.
  if (ctx.contentId) {
    const open = await prisma.contentNode.findFirst({
      where: {
        id: ctx.contentId,
        ownerId: ctx.userId,
        contentType: "workflow",
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        workflowPayload: { select: { enabled: true, engine: true, definition: true } },
      },
    });
    if (open?.workflowPayload) {
      return {
        id: open.id,
        title: open.title,
        enabled: open.workflowPayload.enabled,
        engine: open.workflowPayload.engine,
        definition: open.workflowPayload.definition,
      };
    }
  }
  return "No workflow specified and none is open. Provide workflowNodeId or name (see list_workflows).";
}

export function createWorkflowTools(ctx: ToolExecuteContext) {
  return {
    get_workflow_node_catalog: tool({
      description:
        "Get the authoritative Trellis workflow authoring reference: the exact graph envelope shape, interpolation syntax, and every available node type with its config field keys and outputs. " +
        "ALWAYS call this before authoring a graph for propose_workflow or update_workflow — node type ids and config keys must match this catalog exactly, and it is cheaper to read it than to repair a rejected graph.",
      inputSchema: z.object({}),
      execute: async () => renderNodeCatalogForAI(),
    }),

    list_workflows: tool({
      description:
        "List the user's Trellis workflows (title, id, enabled state, trigger type, node count). " +
        "Use it to find a workflow's id before run_workflow, or to check whether a similar workflow already exists before proposing a new one.",
      inputSchema: z.object({
        query: z
          .string()
          .max(120)
          .optional()
          .describe("Optional case-insensitive title filter."),
      }),
      execute: async ({ query }) => {
        const rows = await prisma.contentNode.findMany({
          where: {
            ownerId: ctx.userId,
            contentType: "workflow",
            deletedAt: null,
            ...(query
              ? { title: { contains: query, mode: "insensitive" as const } }
              : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 25,
          select: {
            id: true,
            title: true,
            updatedAt: true,
            workflowPayload: { select: { enabled: true, engine: true, definition: true } },
          },
        });
        if (rows.length === 0) {
          return query
            ? `No workflows matching "${query}".`
            : "The user has no workflows yet.";
        }
        return rows
          .map((row) => {
            const parsed = workflowGraphSchema.safeParse(
              row.workflowPayload?.definition,
            );
            const trigger = parsed.success
              ? (parsed.data.nodes.find(
                  (n) => n.id === parsed.data.entryNodeId,
                )?.type ?? "none")
              : "unreadable-graph";
            const nodeCount = parsed.success ? parsed.data.nodes.length : 0;
            return `- "${row.title}" (id: ${row.id}) — engine: ${engineLabel(row.workflowPayload?.engine ?? "")}, ${row.workflowPayload?.enabled ? "enabled" : "disabled"}, trigger: ${trigger}, ${nodeCount} node(s), updated ${row.updatedAt.toISOString().slice(0, 10)}`;
          })
          .join("\n");
      },
    }),

    get_workflow: tool({
      description:
        "Read a Trellis workflow's full graph (nodes, edges, configs) plus its validation status. " +
        "With NO arguments it reads the workflow the user has OPEN — when the user says 'this workflow', call it with no arguments. " +
        "ALWAYS read a workflow before modifying it with update_workflow.",
      inputSchema: z.object({
        workflowNodeId: z
          .string()
          .uuid()
          .optional()
          .describe("Workflow content node id. Omit to read the open workflow."),
        name: z
          .string()
          .optional()
          .describe(
            "Title to resolve when there is no id and the target is not the open workflow.",
          ),
      }),
      execute: async ({ workflowNodeId, name }) => {
        const resolved = await resolveWorkflowNode(ctx, workflowNodeId, name);
        if (typeof resolved === "string") return resolved;
        const parsed = workflowGraphSchema.safeParse(resolved.definition);
        if (!parsed.success) {
          return `Workflow "${resolved.title}" (id: ${resolved.id}) has an unreadable graph: ${parsed.error.issues[0]?.message ?? "schema error"}. Author a full replacement via update_workflow.`;
        }
        const structural = validateGraph(parsed.data);
        const status = structural.valid
          ? "valid"
          : `INVALID —\n${structural.issues
              .slice(0, 5)
              .map((issue) => `- ${issue.message}`)
              .join("\n")}`;
        return `Workflow "${resolved.title}" (id: ${resolved.id}) — engine: ${engineLabel(resolved.engine)}, ${resolved.enabled ? "enabled" : "disabled"}, validation: ${status}\nGraph:\n${JSON.stringify(parsed.data, null, 1)}`;
      },
    }),

    update_workflow: tool({
      // Rewriting an automation is as consequential as creating one —
      // approval-gated; the card shows the replacement graph JSON.
      needsApproval: true,
      description:
        "Replace an existing workflow's graph with a new version you author — extend it, rewire it, or fix it. " +
        "With no id/name it targets the workflow the user has OPEN: this is the DEFAULT for 'build (on) this workflow' requests, including a blank workflow that only has its trigger yet. " +
        "The update stays on the workflow's CURRENT engine (engines are not interchangeable): n8n-engine workflows are automatically re-pushed so n8n stays in sync; use push_workflow_to_n8n only to CHANGE a Trellis workflow's engine. " +
        "ALWAYS call get_workflow first (it reports the engine) and author the replacement as a modification of what is there (keep existing node ids stable where possible). " +
        "Supply the COMPLETE graph, not a diff. Validation matches the visual builder; an invalid graph changes nothing.",
      inputSchema: z.object({
        workflowNodeId: z
          .string()
          .uuid()
          .optional()
          .describe("Workflow content node id. Omit to target the open workflow."),
        name: z
          .string()
          .optional()
          .describe("Title to resolve when there is no id and the target is not the open workflow."),
        graph: z
          .record(z.string(), z.unknown())
          .describe(
            "The COMPLETE replacement graph per get_workflow_node_catalog: { version, engine, entryNodeId, nodes, edges }.",
          ),
        newName: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe("Optional rename. Omit to keep the current title."),
      }),
      execute: async ({ workflowNodeId, name, graph, newName }) => {
        const resolved = await resolveWorkflowNode(ctx, workflowNodeId, name);
        if (typeof resolved === "string") return resolved;
        const parsed = workflowGraphSchema.safeParse(graph);
        if (!parsed.success) {
          return formatGraphIssues(
            parsed.error.issues.map((issue) => ({
              message: `${issue.path.join(".") || "graph"}: ${issue.message}`,
            })),
          );
        }
        const structural = validateGraph(parsed.data);
        if (!structural.valid) {
          return formatGraphIssues(structural.issues);
        }

        await prisma.workflowPayload.update({
          where: { contentId: resolved.id },
          data: { definition: parsed.data as unknown as Prisma.InputJsonValue },
        });
        // Touch the node so updatedAt reflects the change (list ordering,
        // sync consumers) and apply the optional rename in the same write.
        await prisma.contentNode.update({
          where: { id: resolved.id },
          data: { title: newName ?? resolved.title },
        });

        if (ctx.conversationId) {
          await addAutoAssociation(
            ctx.userId,
            ctx.conversationId,
            resolved.id,
            "tool-call",
          );
        }

        // Engine fidelity (owner rule): the update stays on the target's
        // engine. n8n-engine workflows re-push automatically — otherwise
        // the stored graph and the live n8n workflow silently diverge.
        let syncNote = "";
        if (resolved.engine === N8N_PAYLOAD_ENGINE) {
          try {
            const pushed = await pushWorkflowToN8n(ctx.userId, resolved.id);
            syncNote = ` This workflow runs on n8n — the update was re-pushed and is live there (${pushed.n8nUrl}).`;
          } catch (error) {
            syncNote = ` WARNING: this workflow runs on n8n but the re-push FAILED (${error instanceof Error ? error.message : "unknown error"}) — n8n still runs the OLD version until push_workflow_to_n8n succeeds. Relay this plainly.`;
          }
        }

        return JSON.stringify({
          __notePayload: true,
          kind: "updated",
          noun: "workflow",
          contentId: resolved.id,
          title: newName ?? resolved.title,
          ...(await getContentWriteReceiptEnvelope(
            ctx.userId,
            resolved.id,
            "updated",
            "workflow",
          )),
          note:
            "The canvas does NOT live-refresh: if the user has this workflow open they must reopen it to load the new graph before manual edits — saving a stale canvas would overwrite this change. Relay that in one short line." +
            syncNote,
        });
      },
    }),

    propose_workflow: tool({
      // Creating an automation is a mutating action with ongoing behavior
      // (its trigger may fire on future page captures) — approval-gated
      // like createNote/create_docx. The approval card shows the graph
      // JSON; after approval the created workflow opens on the canvas for
      // real review (the S6 gate).
      needsApproval: true,
      description:
        "Create a NEW workflow from a graph you author, targeting a specific execution engine. ENGINES ARE NOT INTERCHANGEABLE: use the engine the user names; when the user names NONE, the assumed default is n8n. " +
        "The authoring model is the same graph either way (call get_workflow_node_catalog FIRST and follow it exactly) — the engine determines where it executes; engine \"n8n\" also pushes + activates it on the user's n8n instance. " +
        "If a workflow is OPEN in this chat, prefer update_workflow — the default assumption is that workflow requests are about the open workflow; only create a separate NEW one when the user explicitly wants that or nothing is open. " +
        "Validation runs the same checks as the visual builder (envelope schema, node types, per-node config fields, edge structure); an invalid graph is rejected with repairable issues and nothing is created. " +
        "After creation, tell the user to click the card to review the workflow on the canvas before running it. " +
        "Check list_workflows first when the user might already have a similar workflow.",
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(255)
          .describe("Workflow title, named after what it does."),
        graph: z
          .record(z.string(), z.unknown())
          .describe(
            "The complete workflow graph object per get_workflow_node_catalog: { version, engine, entryNodeId, nodes, edges }.",
          ),
        engine: z
          .enum(["n8n", "trellis"])
          .optional()
          .describe(
            "Execution engine. Use the one the user names; when they name none, omit it — n8n is the assumed default.",
          ),
        parentId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional folder UUID. Defaults to the chat's target folder. Omit unless the user names a folder.",
          ),
      }),
      execute: async ({ name, graph, engine, parentId }) => {
        const parsed = workflowGraphSchema.safeParse(graph);
        if (!parsed.success) {
          return formatGraphIssues(
            parsed.error.issues.map((issue) => ({
              message: `${issue.path.join(".") || "graph"}: ${issue.message}`,
            })),
          );
        }
        const structural = validateGraph(parsed.data);
        if (!structural.valid) {
          return formatGraphIssues(structural.issues);
        }

        // Parent resolution mirrors createNote: explicit > target folder >
        // chat's own parent > vault root ("chats serve their location").
        let resolvedParentId: string | null = null;
        if (parentId) {
          const candidate = await prisma.contentNode.findFirst({
            where: {
              id: parentId,
              ownerId: ctx.userId,
              deletedAt: null,
              contentType: "folder",
            },
            select: { id: true },
          });
          if (candidate) resolvedParentId = candidate.id;
        }
        if (!resolvedParentId && ctx.targetFolderId) {
          resolvedParentId = ctx.targetFolderId;
        }
        if (!resolvedParentId && ctx.chatContentId) {
          const chatNode = await prisma.contentNode.findFirst({
            where: { id: ctx.chatContentId, ownerId: ctx.userId },
            select: { parentId: true },
          });
          resolvedParentId = chatNode?.parentId ?? null;
        }

        const slug = await generateUniqueSlug(name, ctx.userId);
        const node = await prisma.contentNode.create({
          data: {
            ownerId: ctx.userId,
            title: name,
            slug,
            contentType: "workflow",
            parentId: resolvedParentId,
            displayOrder: 0,
            workflowPayload: {
              create: {
                engine: WDK_INTERPRETER_ENGINE,
                definition: parsed.data as unknown as Prisma.InputJsonValue,
                enabled: true,
              },
            },
          },
          select: { id: true },
        });

        if (ctx.conversationId) {
          await addAutoAssociation(
            ctx.userId,
            ctx.conversationId,
            node.id,
            "tool-call",
          );
        }

        // Engine targeting (owner rule 2026-07-18): engines are not
        // interchangeable — n8n is the assumed default when the user
        // named none. n8n creation = create + push + activate in one
        // approved action; a failed push leaves an honest Trellis-engine
        // workflow pending push_workflow_to_n8n, never a silent nothing.
        const targetEngine = engine ?? "n8n";
        let engineNote: string;
        if (targetEngine === "n8n") {
          try {
            const pushed = await pushWorkflowToN8n(ctx.userId, node.id);
            engineNote = `Engine: n8n — pushed and activated (n8n workflow id ${pushed.workflowId}). n8n link to share with the user: ${pushed.n8nUrl}`;
          } catch (error) {
            engineNote = `Engine: n8n was requested but the push FAILED (${error instanceof Error ? error.message : "unknown error"}). The workflow exists on the Trellis engine for now — fix the n8n configuration, then push_workflow_to_n8n completes the switch. Relay this plainly; the failure is usually configuration, not the graph.`;
          }
        } else {
          engineNote = "Engine: Trellis (built-in interpreter).";
        }

        // __notePayload with noun renders the clickable open-on-canvas card
        // (same affordance family as createNote).
        return JSON.stringify({
          __notePayload: true,
          kind: "created",
          noun: "workflow",
          contentId: node.id,
          title: name,
          parentId: resolvedParentId,
          ...(await getContentWriteReceiptEnvelope(
            ctx.userId,
            node.id,
            "created",
            "workflow",
          )),
          note: engineNote,
        });
      },
    }),

    push_workflow_to_n8n: tool({
      // Outward-facing: creates/updates AND activates a workflow on the
      // user's external n8n instance and flips the engine — approval-gated.
      needsApproval: true,
      description:
        "SWITCH an existing Trellis-engine workflow to the n8n engine (compile → push → activate on the user's n8n instance), or force a re-sync after a failed automatic push. " +
        "You rarely need this directly: NEW n8n workflows push automatically via propose_workflow (n8n is the default engine), and updates to n8n-engine workflows re-push automatically via update_workflow. " +
        "Every node type compiles: n8n orchestrates, and step nodes call back into the app to execute; gates/delays/branches become native n8n nodes. " +
        "With no id/name it pushes the workflow the user has OPEN. After pushing, runs still start via run_workflow (same door), they just execute on n8n.",
      inputSchema: z.object({
        workflowNodeId: z
          .string()
          .uuid()
          .optional()
          .describe("Workflow content node id. Omit to push the open workflow."),
        name: z
          .string()
          .optional()
          .describe("Title to resolve when there is no id and the target is not the open workflow."),
      }),
      execute: async ({ workflowNodeId, name }) => {
        const resolved = await resolveWorkflowNode(ctx, workflowNodeId, name);
        if (typeof resolved === "string") return resolved;
        try {
          const result = await pushWorkflowToN8n(ctx.userId, resolved.id);
          if (ctx.conversationId) {
            await addAutoAssociation(
              ctx.userId,
              ctx.conversationId,
              resolved.id,
              "tool-call",
            );
          }
          return JSON.stringify({
            message: `Pushed "${resolved.title}" to n8n and activated it (n8n workflow id: ${result.workflowId}). View it there: ${result.n8nUrl} — share that link with the user. The workflow's engine is now n8n; future runs (run_workflow or the Run button) execute on n8n. Edits made here need a re-push to reach n8n.`,
            ...(await getContentWriteReceiptEnvelope(
              ctx.userId,
              resolved.id,
              "updated",
              "workflow",
            )),
          });
        } catch (error) {
          return `Push to n8n failed: ${error instanceof Error ? error.message : "unknown error"}. Relay this to the user — it is usually configuration (n8n connection or callback URL), not the graph.`;
        }
      },
    }),

    run_workflow: tool({
      // Runs execute steps with real side effects (AI calls, document
      // writes, exports) — approval-gated so the user sanctions each start.
      needsApproval: true,
      description:
        "Start a run of an EXISTING Trellis workflow. With no id/name it runs the workflow the user has OPEN ('run this workflow'). Otherwise identify it by workflowNodeId (from list_workflows or a workflow you just created) or by exact-enough name. " +
        "The run executes server-side; supervision gates inside the workflow pause it for the user's approval in their inbox and on the run detail page. " +
        "Optional `input` is passed to the run and is readable in node configs as {{input.path}}.",
      inputSchema: z.object({
        workflowNodeId: z
          .string()
          .uuid()
          .optional()
          .describe("The workflow content node id. Omit to run the open workflow."),
        name: z
          .string()
          .optional()
          .describe("Title to resolve when there is no id and the target is not the open workflow."),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional run input, available as {{input.path}}."),
      }),
      execute: async ({ workflowNodeId, name, input }) => {
        const resolved = await resolveWorkflowNode(ctx, workflowNodeId, name);
        if (typeof resolved === "string") return resolved;

        const result = await dispatchWorkflowFromContent(
          ctx.userId,
          resolved.id,
          input ?? {},
        );
        if (isDispatchFailure(result)) {
          return `Run failed to start (${result.code}): ${result.message}`;
        }

        if (ctx.conversationId) {
          await addAutoAssociation(
            ctx.userId,
            ctx.conversationId,
            resolved.id,
            "tool-call",
          );
        }
        return `Run started (run id: ${result.run.id}, status: ${result.run.status}). The user can follow it on the workflow's run list; supervision gates will appear in their inbox. Relay this in one line — do not poll.`;
      },
    }),
  };
}
