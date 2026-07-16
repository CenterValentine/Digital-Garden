import { randomUUID } from "crypto";

import { logger } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";

import { workflowGraphSchema } from "../../../graph/schema";
import { validateGraph } from "../../../graph/validate";
import { createServiceTokenRecord } from "../../service-token";
import { compileGraphToN8n } from "./compiler";
import {
  N8N_ADAPTER_ENGINE,
  N8N_PAYLOAD_ENGINE,
  readN8nMetadata,
} from "./meta";
import {
  createN8nHeaderAuthCredential,
  createN8nWorkflow,
  isN8nConfigured,
  n8nBaseUrl,
  setN8nWorkflowActive,
  updateN8nWorkflow,
} from "./client";

export interface PushResult {
  workflowId: string;
  webhookUrl: string;
  n8nUrl: string;
}

/**
 * Compile a workflow's graph to n8n and push it (create or update), minting a
 * callback credential on first push. Idempotent by the metadata stored on the
 * payload: the n8n workflowId, webhook path, and credential id are reused on
 * re-push so Save just updates the same n8n workflow. Also flips the payload to
 * the n8n engine and syncs the WorkflowDefinition so dispatch routes to n8n.
 */
export async function pushWorkflowToN8n(
  ownerId: string,
  contentNodeId: string
): Promise<PushResult> {
  if (!isN8nConfigured()) {
    throw new Error(
      "n8n is not configured (set N8N_BASE_URL and N8N_API_KEY)."
    );
  }
  const callbackBaseUrl = process.env.WORKFLOWS_CALLBACK_BASE_URL?.replace(/\/+$/, "");
  if (!callbackBaseUrl) {
    throw new Error(
      "WORKFLOWS_CALLBACK_BASE_URL is not set — n8n needs a public URL to call back to."
    );
  }

  const node = await prisma.contentNode.findFirst({
    where: { id: contentNodeId, ownerId, contentType: "workflow", deletedAt: null },
    include: { workflowPayload: true },
  });
  if (!node?.workflowPayload) {
    throw new Error("Workflow not found.");
  }

  const parsed = workflowGraphSchema.safeParse(node.workflowPayload.definition);
  if (!parsed.success) {
    throw new Error(
      `Graph is invalid: ${parsed.error.issues[0]?.message ?? "schema error"}`
    );
  }
  const structural = validateGraph(parsed.data);
  if (!structural.valid) {
    throw new Error(
      `Graph failed validation: ${structural.issues[0]?.message ?? ""}`
    );
  }

  const meta = readN8nMetadata(node.workflowPayload.metadata);

  // Ensure a callback credential (mint a service token on first push; n8n
  // stores it encrypted, DG keeps only its hash).
  let credentialId = meta.credentialId;
  let credentialName = meta.credentialName;
  if (!credentialId) {
    const minted = await createServiceTokenRecord(ownerId, {
      name: `n8n workflow: ${node.title}`.slice(0, 120),
    });
    const cred = await createN8nHeaderAuthCredential(
      `DG Callback — ${node.title}`.slice(0, 120),
      minted.token
    );
    credentialId = cred.id;
    credentialName = cred.name;
  }

  const webhookPath = meta.webhookPath ?? randomUUID();

  const compiled = compileGraphToN8n(parsed.data, {
    workflowName: node.title,
    callbackBaseUrl,
    webhookPath,
    credential: { id: credentialId, name: credentialName ?? "DG Callback" },
  });

  let workflowId = meta.workflowId;
  if (workflowId) {
    await updateN8nWorkflow(workflowId, compiled);
  } else {
    const created = await createN8nWorkflow(compiled);
    workflowId = created.id;
  }

  // Activate so the production webhook (/webhook/<path>) is live. Best-effort:
  // the workflow is still visible/pushed even if activation fails.
  try {
    await setN8nWorkflowActive(workflowId, true);
  } catch (error) {
    logger.warn({
      layer: "route",
      event: "workflows_n8n:activate_failed",
      summary: error instanceof Error ? error.message : String(error),
      attrs: { workflowId },
    });
  }

  const existingMetadata =
    node.workflowPayload.metadata && typeof node.workflowPayload.metadata === "object"
      ? (node.workflowPayload.metadata as Record<string, unknown>)
      : {};
  const nextMetadata = {
    ...existingMetadata,
    n8n: { workflowId, webhookPath, credentialId, credentialName },
  };

  await prisma.workflowPayload.update({
    where: { contentId: contentNodeId },
    data: {
      engine: N8N_PAYLOAD_ENGINE,
      metadata: nextMetadata as unknown as Prisma.InputJsonValue,
    },
  });

  // Keep the dispatch-time definition in sync: engine "n8n", engineRef = path.
  await prisma.workflowDefinition.upsert({
    where: { ownerId_slug: { ownerId, slug: `content:${contentNodeId}` } },
    create: {
      ownerId,
      slug: `content:${contentNodeId}`,
      name: node.title,
      engine: N8N_ADAPTER_ENGINE,
      engineRef: webhookPath,
    },
    update: {
      name: node.title,
      engine: N8N_ADAPTER_ENGINE,
      engineRef: webhookPath,
    },
  });

  const base = n8nBaseUrl();
  return {
    workflowId,
    webhookUrl: `${base}/webhook/${webhookPath}`,
    n8nUrl: `${base}/workflow/${workflowId}`,
  };
}
