import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import type {
  connectedPayload,
  onAuthenticatePayload,
  onRequestPayload,
} from "@hocuspocus/server";

import { prisma } from "../../lib/database/client";
import { resolveContentAccess } from "../../lib/domain/collaboration/access";
import {
  loadCollaborationYDocState,
  storeCollaborationYDocState,
} from "../../lib/domain/collaboration/documents";
import { verifyCollaborationToken } from "../../lib/domain/collaboration/tokens";

const port = Number(process.env.PORT || process.env.HOCUSPOCUS_PORT || 1234);
const accessRevalidationIntervalMs = Number(
  process.env.HOCUSPOCUS_ACCESS_REVALIDATION_MS || 30_000
);
const startedAt = Date.now();

function validateProductionConfiguration() {
  if (process.env.NODE_ENV !== "production") return;

  if (!process.env.COLLABORATION_TOKEN_SECRET) {
    throw new Error("COLLABORATION_TOKEN_SECRET is required in production");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in production");
  }
}

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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sendJsonAndStop(
  response: onRequestPayload["response"],
  status: number,
  payload: Record<string, unknown>
): never {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
  throw null;
}

async function handleHealthRequest(data: onRequestPayload) {
  const url = new URL(data.request.url ?? "/", `http://${data.request.headers.host ?? "localhost"}`);

  if (url.pathname === "/healthz") {
    sendJsonAndStop(data.response, 200, {
      ok: true,
      service: "digital-garden-hocuspocus",
      uptimeMs: Date.now() - startedAt,
    });
  }

  if (url.pathname === "/readyz") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      sendJsonAndStop(data.response, 200, {
        ok: true,
        service: "digital-garden-hocuspocus",
        database: "ready",
        uptimeMs: Date.now() - startedAt,
      });
    } catch (error) {
      sendJsonAndStop(data.response, 503, {
        ok: false,
        service: "digital-garden-hocuspocus",
        database: "unavailable",
        error: getErrorMessage(error),
      });
    }
  }
}

function isConfirmedAccessRevocation(error: unknown) {
  const message = getErrorMessage(error);
  return (
    message.includes("Content not found") ||
    message.includes("View access required") ||
    message.includes("Collaboration access revoked") ||
    message.includes("Collaboration token access is stale") ||
    message.includes("Collaboration token is not valid")
  );
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

validateProductionConfiguration();

const server = new Server({
  name: "digital-garden-hocuspocus",
  port,
  debounce: Number(process.env.HOCUSPOCUS_STORE_DEBOUNCE_MS || 2000),
  maxDebounce: Number(process.env.HOCUSPOCUS_STORE_MAX_DEBOUNCE_MS || 10000),

  onRequest: handleHealthRequest,

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

  // beforeHandleMessage is intentionally omitted: running a DB access-check
  // on every Y.js protocol message (awareness updates, sync handshakes, etc.)
  // caused hundreds of DB queries per minute and transient failures that
  // triggered connection-close → reconnect loops. The periodic interval in
  // `connected` (below) is sufficient for access revalidation.

  async connected(data: connectedPayload) {
    const interval = setInterval(() => {
      revalidateConnectionAccess(data).catch((error) => {
        if (isConfirmedAccessRevocation(error)) {
          console.warn(
            `[hocuspocus] closing revoked collaboration connection for ${data.documentName}:`,
            getErrorMessage(error)
          );
          closeRevokedConnection(data);
          clearInterval(interval);
          return;
        }

        console.warn(
          `[hocuspocus] transient access revalidation failure for ${data.documentName}:`,
          getErrorMessage(error)
        );
      });
    }, accessRevalidationIntervalMs);

    // Send a Y.js stateless keepalive every 25 seconds so the client's
    // messageReconnectTimeout (90s) is never exceeded on idle documents.
    // Without this, the HocuspocusProvider closes idle WebSocket connections
    // after 30s of no data frames (WebSocket pings are control frames and
    // don't count), causing visible "Connecting..." banners every ~30s.
    const keepaliveInterval = setInterval(() => {
      try {
        data.connection.sendStateless(JSON.stringify({ type: "keepalive" }));
      } catch {
        // Connection may have closed before interval fires; safe to ignore.
      }
    }, 25_000);

    data.connection.onClose(() => {
      clearInterval(interval);
      clearInterval(keepaliveInterval);
    });
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) =>
        loadCollaborationYDocState(prisma, documentName),
      store: async ({ documentName, state }) => {
        // Errors thrown here propagate through Hocuspocus's storeDocumentHooks,
        // which re-throws any Error with a .message. That rejection is unhandled
        // at the call site (no await / no .catch), crashing the Node process and
        // dropping all active connections. Log and continue instead.
        try {
          await storeCollaborationYDocState(prisma, documentName, state);
        } catch (error) {
          console.error(`[hocuspocus] store failed for ${documentName}:`, error);
        }
      },
    }),
  ],
});

server.listen(port);

console.log(`[hocuspocus] listening on ws://localhost:${port} (build: collaboration-crash-fix)`);
