import { logger } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";

import { revokeServiceToken } from "../../service-token";
import {
  deleteN8nCredential,
  deleteN8nWorkflow,
  isN8nConfigured,
  setN8nWorkflowActive,
} from "./client";

/**
 * Engine-side lifecycle for n8n Flows, keyed off the DG content lifecycle:
 *   trash (soft delete) → deactivate the n8n workflow (webhook stops firing)
 *   restore from trash  → reactivate it
 *   purge (hard delete) → delete the n8n workflow + callback credential,
 *                         revoke the flow's service token, and drop the
 *                         WorkflowDefinition (cascades that flow's runs).
 *
 * Every operation is best-effort: an unreachable n8n must never block a
 * delete/restore/purge. Failures are logged and swallowed.
 */

interface N8nFlowMeta {
  workflowId?: string;
  credentialId?: string;
  serviceTokenId?: string;
  mode?: string;
}

/** Read `metadata.n8n` off the flow's WorkflowPayload (null for non-n8n flows). */
async function loadN8nMeta(contentId: string): Promise<N8nFlowMeta | null> {
  const payload = await prisma.workflowPayload.findUnique({
    where: { contentId },
    select: { metadata: true },
  });
  const metadata = payload?.metadata;
  if (metadata && typeof metadata === "object" && "n8n" in metadata) {
    const n8n = (metadata as { n8n?: unknown }).n8n;
    if (n8n && typeof n8n === "object" && !Array.isArray(n8n)) {
      return n8n as N8nFlowMeta;
    }
  }
  return null;
}

function warn(event: string, contentId: string, error: unknown) {
  logger.warn({
    layer: "route",
    event: `workflows_n8n:${event}`,
    summary: error instanceof Error ? error.message : String(error),
    attrs: { contentId },
  });
}

/** Trash: stop the production webhook so a trashed flow can't be dispatched engine-side. */
export async function deactivateN8nFlowForContent(contentId: string): Promise<void> {
  if (!isN8nConfigured()) return;
  const meta = await loadN8nMeta(contentId);
  if (!meta?.workflowId) return;
  try {
    await setN8nWorkflowActive(meta.workflowId, false);
  } catch (error) {
    warn("trash_deactivate_failed", contentId, error);
  }
}

/** Restore: bring the production webhook back so the restored flow runs again. */
export async function reactivateN8nFlowForContent(contentId: string): Promise<void> {
  if (!isN8nConfigured()) return;
  const meta = await loadN8nMeta(contentId);
  if (!meta?.workflowId) return;
  try {
    await setN8nWorkflowActive(meta.workflowId, true);
  } catch (error) {
    warn("restore_reactivate_failed", contentId, error);
  }
}

/**
 * Purge: full engine-side teardown. MUST run BEFORE the ContentNode hard
 * delete — the WorkflowPayload row (and its n8n ids) cascades away with it.
 */
export async function teardownN8nFlowForContent(
  contentId: string,
  ownerId: string
): Promise<void> {
  const meta = await loadN8nMeta(contentId);

  if (meta && isN8nConfigured()) {
    if (meta.workflowId) {
      try {
        await deleteN8nWorkflow(meta.workflowId);
      } catch (error) {
        warn("purge_workflow_delete_failed", contentId, error);
      }
    }
    if (meta.credentialId) {
      try {
        await deleteN8nCredential(meta.credentialId);
      } catch (error) {
        warn("purge_credential_delete_failed", contentId, error);
      }
    }
  }
  if (meta?.serviceTokenId) {
    try {
      await revokeServiceToken(ownerId, meta.serviceTokenId);
    } catch (error) {
      warn("purge_token_revoke_failed", contentId, error);
    }
  }

  // Drop the dispatch definition (cascades this flow's runs) so the workflows
  // panel stops listing a flow that no longer exists anywhere.
  try {
    await prisma.workflowDefinition.deleteMany({
      where: { ownerId, slug: `content:${contentId}` },
    });
  } catch (error) {
    warn("purge_definition_delete_failed", contentId, error);
  }
}
