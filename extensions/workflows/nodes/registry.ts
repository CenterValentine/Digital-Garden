/**
 * Node executor registry — SERVER-ONLY (Prisma via the workflow server
 * modules; never import from "use client" components — the builder uses
 * nodes/metadata.ts). Executors receive their config ALREADY interpolated
 * by the interpreter and return the outputs stored at ctx.nodes[nodeId].
 *
 * Control nodes (gate/delay/branch) have no executor here — they use
 * suspension primitives or pure routing and are handled at the
 * interpreter's workflow level (Session 2).
 */

import { prisma } from "@/lib/database/client";
import { publishEvent } from "@/lib/domain/notifications/service";
import {
  extractJson,
  fetchPageText,
  generateViaChatRoute,
  getNoteText,
} from "../server/ai";
import {
  storeRunDocxArtifact,
  storeTextNote,
  textToTiptap,
} from "../server/documents";

export interface NodeExecuteContext {
  runId: string;
  ownerId: string;
  workflowName: string;
  input: Record<string, unknown>;
  nodes: Record<string, Record<string, unknown>>;
}

export type NodeExecutor = (
  ctx: NodeExecuteContext,
  config: Record<string, unknown>
) => Promise<Record<string, unknown>>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

const HTTP_RESPONSE_CAP = 1_000_000; // 1MB
const HTTP_TIMEOUT_MS = 15_000;

const NODE_EXECUTORS: Record<string, NodeExecutor> = {
  "ai-complete": async (ctx, config) => {
    const prompt = asString(config.prompt);
    const system = asString(
      config.system,
      "You are a precise assistant inside an automation. Answer directly with no preamble."
    );
    const maxOutputTokens =
      typeof config.maxOutputTokens === "number" &&
      Number.isFinite(config.maxOutputTokens)
        ? Math.min(Math.max(Math.round(config.maxOutputTokens), 50), 4000)
        : 700;
    const text = await generateViaChatRoute(
      ctx.ownerId,
      system,
      prompt,
      maxOutputTokens
    );
    if (text === null) {
      throw new Error(
        "No AI connection is configured — add one in Settings → AI."
      );
    }
    const json = config.expectJson === true ? extractJson(text) : null;
    return json ? { text, json } : { text };
  },

  "fetch-url": async (_ctx, config) => {
    const url = asString(config.url);
    const text = await fetchPageText(url);
    if (text === null) {
      throw new Error(`Could not fetch readable text from ${url || "(empty url)"}.`);
    }
    return { text };
  },

  "http-request": async (_ctx, config) => {
    const rawUrl = asString(config.url);
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error(`Invalid URL: ${rawUrl || "(empty)"}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only http/https URLs are allowed.");
    }
    const method = asString(config.method, "GET").toUpperCase();
    const headers: Record<string, string> = {};
    if (typeof config.headers === "object" && config.headers !== null) {
      for (const [key, value] of Object.entries(
        config.headers as Record<string, unknown>
      )) {
        if (typeof value === "string") headers[key] = value;
      }
    }
    const body = asString(config.body);
    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" || !body ? undefined : body,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const raw = await response.text();
    const text = raw.slice(0, HTTP_RESPONSE_CAP);
    const json =
      config.expectJson === true ? extractJson(text) : null;
    return json
      ? { status: response.status, text, json }
      : { status: response.status, text };
  },

  "get-content": async (ctx, config) => {
    const contentNodeId = asString(config.contentNodeId);
    const text = await getNoteText(ctx.ownerId, contentNodeId);
    if (text === null) {
      throw new Error(`Note ${contentNodeId || "(empty id)"} was not found.`);
    }
    return { text };
  },

  "store-content": async (ctx, config) => {
    const contentNodeId = await storeTextNote(ctx.ownerId, {
      title: asString(config.title),
      text: asString(config.body),
    });
    return { contentNodeId };
  },

  "export-docx": async (ctx, config) => {
    const title = asString(config.title, "Workflow document");
    const body = asString(config.body);
    const result = await storeRunDocxArtifact({
      runId: ctx.runId,
      ownerId: ctx.ownerId,
      title,
      tiptap: textToTiptap(body),
      searchText: `${title} ${body.slice(0, 2000)}`,
    });
    return {
      contentNodeId: result.contentNodeId,
      fileName: result.fileName,
    };
  },

  notify: async (ctx, config) => {
    await publishEvent(prisma, {
      kind: "workflow.notify",
      actorType: "extension",
      actorLabel: "Workflows",
      payload: {
        runId: ctx.runId,
        title: asString(config.title, "Workflow notification"),
        body: asString(config.body) || undefined,
        workflowName: ctx.workflowName,
      },
      subjectType: "workflowRun",
      subjectId: ctx.runId,
      recipients: [{ userId: ctx.ownerId }],
    });
    return {};
  },
};

export function getNodeExecutor(nodeType: string): NodeExecutor | null {
  return NODE_EXECUTORS[nodeType] ?? null;
}

// Boot-time coverage assertion (server module scope — fails fast on deploy,
// not mid-run): every "step" palette entry has an executor, every "control"
// entry does not. The standalone graph-check script can't import this module
// (server-only marker upstream), so the guarantee lives here.
import { NODE_TYPE_METADATA } from "./metadata";
for (const metadata of NODE_TYPE_METADATA) {
  const hasExecutor = NODE_EXECUTORS[metadata.id] !== undefined;
  if (metadata.execution === "step" && !hasExecutor) {
    throw new Error(
      `Workflow node type "${metadata.id}" is declared as a step but has no executor.`
    );
  }
  if (metadata.execution === "control" && hasExecutor) {
    throw new Error(
      `Workflow node type "${metadata.id}" is a control node and must not have an executor.`
    );
  }
}
