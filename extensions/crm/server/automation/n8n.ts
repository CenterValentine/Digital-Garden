import { logger } from "@/lib/core/logger";
import {
  n8nBaseUrl,
  postToN8nUrl,
} from "@/extensions/workflows/server/engines/n8n/client";
import type { CrmAutomationAdapter } from "./types";

/**
 * n8n executor — reuses the workflows extension's n8n client (base URL,
 * Cloudflare Access headers, timeout) rather than a second HTTP path.
 *
 * Contract: DG POSTs `{ type: "followup.pause", ... }` to
 * `${N8N_BASE_URL}/webhook/${CRM_N8N_WEBHOOK_PATH}`. The n8n flow owns the
 * timer (a Wait node per follow-up) and cancels it on this event. Remember
 * n8n's Webhook node nests the body under `.body` (#106).
 *
 * UNVERIFIED against a live n8n in milestone 1 — the simulator is the
 * default. A failed delivery is reported, never thrown: DG's paused state is
 * already the truth the operator sees.
 */
export const n8nCrmAutomation: CrmAutomationAdapter = {
  id: "n8n",
  label: "n8n",
  simulated: false,
  async pauseFollowUp(ref, reason) {
    const base = n8nBaseUrl();
    const path = process.env.CRM_N8N_WEBHOOK_PATH;
    if (!base || !path) {
      return {
        delivered: false,
        detail: "n8n is not configured (N8N_BASE_URL / CRM_N8N_WEBHOOK_PATH) — the pause is recorded here only.",
      };
    }
    try {
      const res = await postToN8nUrl(`${base}/webhook/${path}`, {
        type: "followup.pause",
        folderId: ref.folderId,
        opportunityId: ref.opportunityId,
        contactId: ref.contactId,
        reason,
      });
      const delivered = res.status >= 200 && res.status < 300;
      return {
        delivered,
        detail: delivered
          ? `n8n acknowledged the pause for “${ref.opportunityTitle}”.`
          : `n8n answered ${res.status} — the pause is recorded here only.`,
      };
    } catch (error) {
      logger.warn({
        layer: "external",
        event: "crm:n8n_pause_failed",
        summary: "n8n pause delivery failed",
        error,
      });
      return { delivered: false, detail: "n8n could not be reached — the pause is recorded here only." };
    }
  },
};
