import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import type {
  beforeHandleMessagePayload,
  connectedPayload,
  onAuthenticatePayload,
} from "@hocuspocus/server";

import { prisma } from "../../lib/database/client";
import { resolveContentAccess } from "../../lib/domain/collaboration/access";
import {
  loadCollaborationYDocState,
  storeCollaborationYDocState,
} from "../../lib/domain/collaboration/documents";
import { verifyCollaborationToken } from "../../lib/domain/collaboration/tokens";

const port = Number(process.env.HOCUSPOCUS_PORT || 1234);
const accessRevalidationIntervalMs = Number(
  process.env.HOCUSPOCUS_ACCESS_REVALIDATION_MS || 2000
);

interface CollaborationConnectionContext {
  contentId: string;
  userId: string;
  ownerId: string;
  accessLevel: "view" | "edit" | "owner";
  readOnly: boolean;
}

function getCollaborationContext(context: unknown): CollaborationConnectionContext {
  if (
    !context ||
    typeof context !== "object" ||
    !("contentId" in context) ||
    !("userId" in context) ||
    typeof context.contentId !== "string" ||
    typeof context.userId !== "string"
  ) {
    throw new Error("Collaboration connection context is missing");
  }

  return context as CollaborationConnectionContext;
}

async function revalidateConnectionAccess(
  data: Pick<connectedPayload, "connection" | "context">
) {
  const context = getCollaborationContext(data.context);

  const access = await resolveContentAccess(prisma, {
    contentId: context.contentId,
    userId: context.userId,
    require: "view",
  });

  if (!access.canView) {
    throw new Error("Collaboration access revoked");
  }

  // Downgrades from edit to view must take effect without waiting for reconnect.
  data.connection.readOnly = access.readOnly;
}

function closeRevokedConnection(data: Pick<connectedPayload, "connection">) {
  data.connection.sendStateless(
    JSON.stringify({
      type: "collaboration-access-revoked",
      message: "Collaboration access was revoked.",
    })
  );
  data.connection.close({
    code: 4403,
    reason: "Collaboration access revoked",
  });
}

const server = new Server({
  name: "digital-garden-hocuspocus",
  port,
  debounce: Number(process.env.HOCUSPOCUS_STORE_DEBOUNCE_MS || 2000),
  maxDebounce: Number(process.env.HOCUSPOCUS_STORE_MAX_DEBOUNCE_MS || 10000),

  async onAuthenticate(data: onAuthenticatePayload) {
    const tokenPayload = verifyCollaborationToken(data.token);

    if (tokenPayload.documentName !== data.documentName) {
      throw new Error("Collaboration token is not valid for this document");
    }

    const access = await resolveContentAccess(prisma, {
      contentId: tokenPayload.contentId,
      userId: tokenPayload.userId,
      require: "view",
    });

    if (tokenPayload.readOnly !== access.readOnly) {
      throw new Error("Collaboration token access is stale");
    }

    data.connectionConfig.readOnly = access.readOnly;

    return {
      contentId: tokenPayload.contentId,
      userId: tokenPayload.userId,
      ownerId: tokenPayload.ownerId,
      accessLevel: access.accessLevel,
      readOnly: access.readOnly,
    };
  },

  async beforeHandleMessage(data: beforeHandleMessagePayload) {
    try {
      await revalidateConnectionAccess(data);
    } catch (error) {
      closeRevokedConnection(data);
      throw error;
    }
  },

  async connected(data: connectedPayload) {
    const interval = setInterval(() => {
      revalidateConnectionAccess(data).catch((error) => {
        console.warn(
          `[hocuspocus] closing stale collaboration connection for ${data.documentName}:`,
          error instanceof Error ? error.message : error
        );
        closeRevokedConnection(data);
        clearInterval(interval);
      });
    }, accessRevalidationIntervalMs);

    data.connection.onClose(() => {
      clearInterval(interval);
    });
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) =>
        loadCollaborationYDocState(prisma, documentName),
      store: async ({ documentName, state }) =>
        storeCollaborationYDocState(prisma, documentName, state),
    }),
  ],
});

server.listen(port);

console.log(`[hocuspocus] listening on ws://localhost:${port}`);
