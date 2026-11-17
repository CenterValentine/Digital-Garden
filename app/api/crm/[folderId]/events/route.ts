/**
 * POST /api/crm/[folderId]/events — inbound CRM events.
 *
 * { type: "message.received", eventId, from, body, receivedAt? }
 *
 * Milestone 1 authenticates with the operator's session: the caller is the
 * inbox's local simulator. When n8n relays a live SMS provider this route
 * gains the workflows extension's service-token auth (Bearer dgwf_…, the
 * pattern in extensions/workflows/server/callback.ts) — the ingestion below
 * does not change. Replays are safe: see extensions/crm/server/events.ts.
 */

import type { NextRequest } from "next/server";
import { crmError, crmOk, crmRoute, readJson } from "@/extensions/crm/server/http";
import { ingestCrmEvent, parseInboundText } from "@/extensions/crm/server/events";

type Params = Promise<{ folderId: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  return crmRoute(request, "/api/crm/[folderId]/events", async (userId) => {
    const { folderId } = await params;
    const event = parseInboundText(await readJson(request));
    if (!event) {
      return crmError(
        400,
        "VALIDATION_ERROR",
        "Expected { type: \"message.received\", eventId, from, body }"
      );
    }
    return crmOk(await ingestCrmEvent(folderId, userId, event));
  });
}
