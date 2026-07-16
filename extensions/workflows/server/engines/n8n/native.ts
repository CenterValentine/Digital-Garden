import { randomUUID } from "crypto";

import { logger } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";

import { blankWorkflowGraph } from "../../../graph/schema";
import { createServiceTokenRecord } from "../../service-token";
import {
  createN8nHeaderAuthCredential,
  createN8nWorkflow,
  isN8nConfigured,
  n8nBaseUrl,
  setN8nWorkflowActive,
} from "./client";
import { N8N_ADAPTER_ENGINE, N8N_PAYLOAD_ENGINE } from "./meta";
import { buildSeedWorkflow } from "./seed";

export interface CreateNativeResult {
  contentId: string;
  n8nUrl: string;
  workflowId: string;
}

/**
 * Create an "n8n Flow": a workflow ContentNode whose authoring lives in n8n's
 * own editor (hybrid model). Seeds a starter n8n workflow (Webhook →
 * DG:Finish), mints a callback credential, and links it from a DG ContentNode
 * (metadata.n8n.mode = "native"). The Trellis graph is an unused placeholder —
 * this flow is authored in n8n, not our builder.
 */
export async function createNativeN8nFlow(
  ownerId: string,
  input: { parentId?: string | null; title?: string }
): Promise<CreateNativeResult> {
  if (!isN8nConfigured()) {
    throw new Error("n8n is not configured (set N8N_BASE_URL and N8N_API_KEY).");
  }
  const callbackBaseUrl = process.env.WORKFLOWS_CALLBACK_BASE_URL?.replace(/\/+$/, "");
  if (!callbackBaseUrl) {
    throw new Error(
      "WORKFLOWS_CALLBACK_BASE_URL is not set — n8n needs a public URL to call back to."
    );
  }
  const title = input.title?.trim() || "n8n Flow";

  // Callback credential (service token minted for this flow; n8n encrypts it).
  const minted = await createServiceTokenRecord(ownerId, {
    name: `n8n flow: ${title}`.slice(0, 120),
  });
  const cred = await createN8nHeaderAuthCredential(
    `DG Callback — ${title}`.slice(0, 120),
    minted.token
  );

  const webhookPath = randomUUID();
  const seed = buildSeedWorkflow({
    workflowName: title,
    callbackBaseUrl,
    webhookPath,
    credential: { id: cred.id, name: cred.name },
  });
  const wf = await createN8nWorkflow(seed);
  try {
    await setN8nWorkflowActive(wf.id, true);
  } catch (error) {
    logger.warn({
      layer: "route",
      event: "workflows_n8n:seed_activate_failed",
      summary: error instanceof Error ? error.message : String(error),
      attrs: { workflowId: wf.id },
    });
  }

  const { generateUniqueSlug } = await import("@/lib/domain/content");
  const slug = await generateUniqueSlug(title, ownerId);
  const parentId = input.parentId ?? null;
  const lastSibling = await prisma.contentNode.findFirst({
    where: { parentId, deletedAt: null },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  const displayOrder = (lastSibling?.displayOrder ?? -1) + 1;

  const node = await prisma.contentNode.create({
    data: {
      ownerId,
      title,
      slug,
      contentType: "workflow",
      parentId,
      displayOrder,
      workflowPayload: {
        create: {
          engine: N8N_PAYLOAD_ENGINE,
          definition: blankWorkflowGraph() as unknown as Prisma.InputJsonValue,
          enabled: true,
          metadata: {
            n8n: {
              workflowId: wf.id,
              webhookPath,
              credentialId: cred.id,
              credentialName: cred.name,
              mode: "native",
            },
          } as unknown as Prisma.InputJsonValue,
        },
      },
    },
    select: { id: true },
  });

  await prisma.workflowDefinition.upsert({
    where: { ownerId_slug: { ownerId, slug: `content:${node.id}` } },
    create: {
      ownerId,
      slug: `content:${node.id}`,
      name: title,
      engine: N8N_ADAPTER_ENGINE,
      engineRef: webhookPath,
    },
    update: {
      name: title,
      engine: N8N_ADAPTER_ENGINE,
      engineRef: webhookPath,
    },
  });

  return {
    contentId: node.id,
    n8nUrl: `${n8nBaseUrl()}/workflow/${wf.id}`,
    workflowId: wf.id,
  };
}
