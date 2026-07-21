import { randomUUID } from "crypto";

import { logger } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";

import { createServiceTokenRecord } from "../../service-token";
import {
  createN8nHeaderAuthCredential,
  createN8nWorkflow,
  getN8nWorkflow,
  isN8nConfigured,
  n8nBaseUrl,
} from "./client";
import type { N8nNode, N8nWorkflow } from "./types";

/**
 * The shared, per-user "DG Error Handler" n8n workflow: an Error Trigger →
 * HTTP Request that POSTs the failed execution id to /callback/error. Each n8n
 * Flow's `settings.errorWorkflow` points at this, so a crashed flow reports its
 * failure back to DG (which maps the execution id → run → finish(failed)).
 * The user can open + customize it from DG settings.
 */

const ERROR_TRIGGER_NAME = "Error Trigger";
const REPORT_NAME = "DG: Report failure";

export function buildErrorHandlerWorkflow(opts: {
  callbackBaseUrl: string;
  credential: { id: string; name: string };
}): N8nWorkflow {
  const trigger: N8nNode = {
    id: randomUUID(),
    name: ERROR_TRIGGER_NAME,
    type: "n8n-nodes-base.errorTrigger",
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
  };
  const report: N8nNode = {
    id: randomUUID(),
    name: REPORT_NAME,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [280, 0],
    parameters: {
      method: "POST",
      url: `${opts.callbackBaseUrl}/api/workflows/callback/error`,
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ ({ "engineExecutionId": String($json.execution?.id ?? ""), "message": String($json.execution?.error?.message ?? "The n8n workflow errored.") }) }}`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
    },
    credentials: {
      httpHeaderAuth: { id: opts.credential.id, name: opts.credential.name },
    },
  };
  return {
    name: "DG Error Handler",
    nodes: [trigger, report],
    connections: {
      [ERROR_TRIGGER_NAME]: {
        main: [[{ node: REPORT_NAME, type: "main", index: 0 }]],
      },
    },
    settings: {},
  };
}

interface StoredErrorHandler {
  workflowId?: string;
  credentialId?: string;
}

function readStoredErrorHandler(settings: unknown): StoredErrorHandler {
  if (settings && typeof settings === "object" && "workflows" in settings) {
    const workflows = (settings as { workflows?: unknown }).workflows;
    if (workflows && typeof workflows === "object" && "n8nErrorHandler" in workflows) {
      const handler = (workflows as { n8nErrorHandler?: unknown }).n8nErrorHandler;
      if (handler && typeof handler === "object" && !Array.isArray(handler)) {
        return handler as StoredErrorHandler;
      }
    }
  }
  return {};
}

export interface EnsureErrorHandlerResult {
  workflowId: string;
  editorUrl: string;
  created: boolean;
}

/**
 * Get-or-create the owner's DG Error Handler workflow (idempotent by the id
 * stored in User.settings.workflows.n8nErrorHandler). Returns its id + editor
 * deep-link. Callers set each flow's `settings.errorWorkflow` to this id.
 */
export async function ensureN8nErrorHandler(
  ownerId: string
): Promise<EnsureErrorHandlerResult> {
  if (!isN8nConfigured()) {
    throw new Error("n8n is not configured (set N8N_BASE_URL and N8N_API_KEY).");
  }
  const callbackBaseUrl = process.env.WORKFLOWS_CALLBACK_BASE_URL?.replace(/\/+$/, "");
  if (!callbackBaseUrl) {
    throw new Error(
      "WORKFLOWS_CALLBACK_BASE_URL is not set — n8n needs a public URL to call back to."
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { settings: true },
  });
  const stored = readStoredErrorHandler(user?.settings);
  if (stored.workflowId) {
    const existing = await getN8nWorkflow(stored.workflowId);
    if (existing) {
      return {
        workflowId: stored.workflowId,
        editorUrl: `${n8nBaseUrl()}/workflow/${stored.workflowId}`,
        created: false,
      };
    }
    // Stored id no longer exists in n8n — fall through and recreate.
  }

  const minted = await createServiceTokenRecord(ownerId, {
    name: "n8n error handler",
  });
  const cred = await createN8nHeaderAuthCredential(
    "DG Callback — Error Handler",
    minted.token
  );
  const wf = await createN8nWorkflow(
    buildErrorHandlerWorkflow({
      callbackBaseUrl,
      credential: { id: cred.id, name: cred.name },
    })
  );

  const currentSettings =
    user?.settings && typeof user.settings === "object" && !Array.isArray(user.settings)
      ? { ...(user.settings as Record<string, unknown>) }
      : {};
  const currentWorkflows =
    currentSettings.workflows && typeof currentSettings.workflows === "object"
      ? { ...(currentSettings.workflows as Record<string, unknown>) }
      : {};
  currentWorkflows.n8nErrorHandler = {
    workflowId: wf.id,
    credentialId: cred.id,
  };
  currentSettings.workflows = currentWorkflows;

  await prisma.user.update({
    where: { id: ownerId },
    data: { settings: currentSettings as unknown as Prisma.InputJsonValue },
  });

  logger.info({
    layer: "route",
    event: "workflows_n8n:error_handler_created",
    summary: "created per-user DG error handler",
    attrs: { ownerId, workflowId: wf.id },
  });

  return {
    workflowId: wf.id,
    editorUrl: `${n8nBaseUrl()}/workflow/${wf.id}`,
    created: true,
  };
}

/** Read the stored DG Error Handler (no create), for the settings status view. */
export async function getStoredN8nErrorHandler(
  ownerId: string
): Promise<{ workflowId: string; editorUrl: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { settings: true },
  });
  const stored = readStoredErrorHandler(user?.settings);
  if (!stored.workflowId) return null;
  return {
    workflowId: stored.workflowId,
    editorUrl: `${n8nBaseUrl()}/workflow/${stored.workflowId}`,
  };
}
