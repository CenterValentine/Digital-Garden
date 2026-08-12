import { createHash, timingSafeEqual } from "node:crypto";

import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import type {
  connectedPayload,
  onAuthenticatePayload,
  onRequestPayload,
} from "@hocuspocus/server";
import type { JSONContent } from "@tiptap/core";

import { prisma } from "../../lib/database/client";
import { resolveContentAccess } from "../../lib/domain/collaboration/access";
import {
  loadCollaborationYDocState,
  storeCollaborationYDocState,
} from "../../lib/domain/collaboration/documents";
import {
  applyNoteEdit,
  NoteEditRefused,
  type NoteEditMode,
  type NoteEditOutcome,
} from "../../lib/domain/collaboration/note-edit-ops";
import {
  getCollaborationDocumentName,
  verifyCollaborationToken,
} from "../../lib/domain/collaboration/tokens";

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

  // Warn rather than throw: a missing secret degrades AI writes to the app's own
  // fallback path, which is safe. Throwing here would brick the deploy that must
  // land BEFORE the app starts calling /internal/apply. `pnpm hocuspocus:env` is
  // the loud pre-deploy check.
  if (!process.env.COLLABORATION_WRITE_SECRET) {
    console.warn(
      "[hocuspocus] COLLABORATION_WRITE_SECRET is not set — /internal/apply will " +
        "return 503 and AI writes will fall back to writing NotePayload directly."
    );
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

/**
 * Writes a response and halts Hocuspocus's onRequest pipeline.
 *
 * `throw null` is REQUIRED here, not a shortcut. Hocuspocus's requestHandler
 * does:
 *
 *     catch (error) { if (error) { throw error; } }   // Server.ts
 *
 * i.e. a *falsy* throw means "a hook already answered this request, stop the
 * chain", and anything truthy is rethrown and crashes the process. Replacing
 * this with a named sentinel class looked safer but was rethrown on every
 * probe — do not "improve" it again.
 *
 * The companion rule: never wrap a call to this in a try that also handles
 * real failures, or that catch will swallow the stop-signal and double-write
 * the response (ERR_HTTP_HEADERS_SENT). Scope such trys to the fallible work
 * itself — see /readyz below.
 */
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
    // Scope the try to the DB probe ONLY — never wrap a sendJsonAndStop call,
    // whose null stop-signal must reach Hocuspocus uncaught.
    let databaseError: unknown = null;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      databaseError = error;
    }
    if (!databaseError) {
      sendJsonAndStop(data.response, 200, {
        ok: true,
        service: "digital-garden-hocuspocus",
        database: "ready",
        uptimeMs: Date.now() - startedAt,
      });
    } else {
      sendJsonAndStop(data.response, 503, {
        ok: false,
        service: "digital-garden-hocuspocus",
        database: "unavailable",
        error: getErrorMessage(databaseError),
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

// ── Internal apply endpoint (AI collab write path, Slice 1) ─────────────────
//
// Lets the app apply an AI/extension edit THROUGH the live document instead of
// writing NotePayload behind it. See
// docs/notes-feature/work-tracking/AI-COLLAB-WRITE-PATH-PLAN.md.
//
// Two hazards this code is shaped around, both documented above:
//   1. `sendJsonAndStop` throws `null` as a stop-signal, so it must never sit
//      inside a try that also handles real failures. Every fallible step below
//      records its outcome in `status`/`payload`; the response is sent AFTER.
//   2. A non-null throw escaping onRequest is rethrown into an async handler by
//      Hocuspocus, which crashes the process and drops every live connection.
//      Nothing here rethrows.

const INTERNAL_APPLY_PATH = "/internal/apply";
const MAX_INTERNAL_BODY_BYTES = 4 * 1024 * 1024;

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which itself leaks length — compare
  // fixed-size digests instead so every wrong secret costs the same.
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest()
  );
}

async function readJsonBody(
  request: onRequestPayload["request"]
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buffer.byteLength;
    if (total > MAX_INTERNAL_BODY_BYTES) {
      throw new Error("Request body too large");
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

interface InternalApplyBody {
  contentId: string;
  mode: NoteEditMode;
  content: JSONContent;
  destructiveApproved?: boolean;
  /** Verified against the row's owner — a second boundary behind the secret. */
  expectedOwnerId?: string;
}

function parseInternalApplyBody(raw: unknown): InternalApplyBody {
  if (!raw || typeof raw !== "object") throw new Error("Body must be an object");
  const body = raw as Record<string, unknown>;
  const { contentId, mode, content } = body;
  if (typeof contentId !== "string" || contentId.length === 0) {
    throw new Error("contentId is required");
  }
  if (mode !== "append" && mode !== "replace") {
    throw new Error('mode must be "append" or "replace"');
  }
  if (!content || typeof content !== "object") {
    throw new Error("content must be a TipTap document object");
  }
  return {
    contentId,
    mode,
    content: content as JSONContent,
    destructiveApproved: body.destructiveApproved === true,
    expectedOwnerId:
      typeof body.expectedOwnerId === "string" ? body.expectedOwnerId : undefined,
  };
}

async function handleInternalApplyRequest(data: onRequestPayload) {
  const url = new URL(
    data.request.url ?? "/",
    `http://${data.request.headers.host ?? "localhost"}`
  );
  if (url.pathname !== INTERNAL_APPLY_PATH) return;

  let status = 500;
  let payload: Record<string, unknown> = {
    ok: false,
    error: "internal error",
  };

  try {
    const secret = process.env.COLLABORATION_WRITE_SECRET;
    const provided = data.request.headers["x-dg-collab-write"];

    if (!secret) {
      // Unconfigured is not an error: the caller falls back to its own write path.
      status = 503;
      payload = { ok: false, error: "internal apply is not configured" };
    } else if (data.request.method !== "POST") {
      status = 405;
      payload = { ok: false, error: "POST required" };
    } else if (typeof provided !== "string" || !secretsMatch(provided, secret)) {
      status = 401;
      payload = { ok: false, error: "unauthorized" };
    } else {
      const body = parseInternalApplyBody(await readJsonBody(data.request));

      // Defense in depth behind the shared secret. Direct connections bypass
      // onAuthenticate entirely, so this is the only ownership check on this path.
      const node = await prisma.contentNode.findFirst({
        where: { id: body.contentId, deletedAt: null },
        select: { id: true, ownerId: true, contentType: true },
      });

      if (!node) {
        status = 404;
        payload = { ok: false, error: "content not found" };
      } else if (node.contentType !== "note") {
        // Non-note payloads are filtered out of both collaboration hooks, so a
        // collaborative write to one could never persist.
        status = 409;
        payload = { ok: false, error: "content is not a collaborative note" };
      } else if (body.expectedOwnerId && body.expectedOwnerId !== node.ownerId) {
        status = 403;
        payload = { ok: false, error: "owner mismatch" };
      } else {
        const documentName = getCollaborationDocumentName(body.contentId);
        const connection =
          await server.hocuspocus.openDirectConnection(documentName);
        try {
          const outcomes: NoteEditOutcome[] = [];
          await connection.transact((document) => {
            outcomes.push(
              applyNoteEdit(document, {
                mode: body.mode,
                content: body.content,
                destructiveApproved: body.destructiveApproved,
              })
            );
          });
          const outcome = outcomes[0];
          if (!outcome) throw new Error("edit produced no outcome");
          status = 200;
          payload = { ok: true, ...outcome };
        } finally {
          // Never let teardown mask the result — and never let it throw out of
          // this handler.
          try {
            await connection.disconnect();
          } catch (error) {
            console.error(
              `[hocuspocus] internal apply disconnect failed for ${body.contentId}:`,
              getErrorMessage(error)
            );
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof NoteEditRefused) {
      status = 409;
      payload = { ok: false, refused: error.reason, error: error.message };
    } else {
      status = 500;
      payload = { ok: false, error: getErrorMessage(error) };
      console.error("[hocuspocus] internal apply failed:", error);
    }
  }

  // OUTSIDE the try: its `throw null` must reach Hocuspocus uncaught.
  sendJsonAndStop(data.response, status, payload);
}

async function handleRequest(data: onRequestPayload) {
  // Order matters only in that each handler returns without responding when the
  // path is not its own. Whichever answers throws the null stop-signal, which
  // must propagate — so this function deliberately has no try/catch.
  await handleHealthRequest(data);
  await handleInternalApplyRequest(data);
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

  onRequest: handleRequest,

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
