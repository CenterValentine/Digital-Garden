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

export function createWorkflowTools(ctx: ToolExecuteContext) {
  return {
    get_workflow_node_catalog: tool({
      description:
        "Get the authoritative Trellis workflow authoring reference: the exact graph envelope shape, interpolation syntax, and every available node type with its config field keys and outputs. " +
        "ALWAYS call this before authoring a graph for propose_workflow — node type ids and config keys must match this catalog exactly, and it is cheaper to read it than to repair a rejected graph.",
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
            workflowPayload: { select: { enabled: true, definition: true } },
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
            return `- "${row.title}" (id: ${row.id}) — ${row.workflowPayload?.enabled ? "enabled" : "disabled"}, trigger: ${trigger}, ${nodeCount} node(s), updated ${row.updatedAt.toISOString().slice(0, 10)}`;
          })
          .join("\n");
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
        "Create a NEW Trellis workflow from a graph you author. Call get_workflow_node_catalog FIRST and follow it exactly. " +
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
        parentId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional folder UUID. Defaults to the chat's target folder. Omit unless the user names a folder.",
          ),
      }),
      execute: async ({ name, graph, parentId }) => {
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

        // __notePayload with noun renders the clickable open-on-canvas card
        // (same affordance family as createNote).
        return JSON.stringify({
          __notePayload: true,
          kind: "created",
          noun: "workflow",
          contentId: node.id,
          title: name,
          parentId: resolvedParentId,
        });
      },
    }),

    run_workflow: tool({
      // Runs execute steps with real side effects (AI calls, document
      // writes, exports) — approval-gated so the user sanctions each start.
      needsApproval: true,
      description:
        "Start a run of an EXISTING Trellis workflow. Identify it by workflowNodeId (from list_workflows or a workflow you just created) or by exact-enough name. " +
        "The run executes server-side; supervision gates inside the workflow pause it for the user's approval in their inbox and on the run detail page. " +
        "Optional `input` is passed to the run and is readable in node configs as {{input.path}}.",
      inputSchema: z.object({
        workflowNodeId: z
          .string()
          .uuid()
          .optional()
          .describe("The workflow content node id (preferred)."),
        name: z
          .string()
          .optional()
          .describe("Title to resolve when the id is unknown."),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional run input, available as {{input.path}}."),
      }),
      execute: async ({ workflowNodeId, name, input }) => {
        let nodeId = workflowNodeId ?? null;
        if (!nodeId && name) {
          const matches = await prisma.contentNode.findMany({
            where: {
              ownerId: ctx.userId,
              contentType: "workflow",
              deletedAt: null,
              title: { contains: name, mode: "insensitive" },
            },
            orderBy: { updatedAt: "desc" },
            take: 5,
            select: { id: true, title: true },
          });
          if (matches.length === 0) {
            return `No workflow found matching "${name}". Call list_workflows to see what exists.`;
          }
          if (matches.length > 1) {
            return (
              `Multiple workflows match "${name}" — re-call run_workflow with the intended workflowNodeId:\n` +
              matches
                .map((m) => `- "${m.title}" (id: ${m.id})`)
                .join("\n")
            );
          }
          nodeId = matches[0].id;
        }
        if (!nodeId) {
          return "Provide workflowNodeId or name to identify the workflow.";
        }

        const result = await dispatchWorkflowFromContent(
          ctx.userId,
          nodeId,
          input ?? {},
        );
        if (isDispatchFailure(result)) {
          return `Run failed to start (${result.code}): ${result.message}`;
        }

        if (ctx.conversationId) {
          await addAutoAssociation(
            ctx.userId,
            ctx.conversationId,
            nodeId,
            "tool-call",
          );
        }
        return `Run started (run id: ${result.run.id}, status: ${result.run.status}). The user can follow it on the workflow's run list; supervision gates will appear in their inbox. Relay this in one line — do not poll.`;
      },
    }),
  };
}
