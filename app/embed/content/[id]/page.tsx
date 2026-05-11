/**
 * Embed Content Page — served inside the browser extension iframe.
 *
 * Auth: two-path strategy for cross-site iframe environments (e.g. Vivaldi with
 * strict tracker blocking) where cookies are not reliably sent:
 *
 *   1. Cookie path  — reads session_token cookie (works when browser allows it)
 *   2. Token path   — reads ?_t=<session-uuid> URL param (no cookie required)
 *      The server validates _t directly against the Session table and sets the
 *      cookie in the 200 OK response so subsequent client-side API calls work.
 *
 * Dispatch: routes to the right viewer based on ContentNode.contentType.
 *   note         → EmbedContentClient  (full TipTap editor via MainPanelWorkspace)
 *   file         → FileViewer          (image/video/audio/PDF/office, self-fetching)
 *   folder       → FolderViewer        (list/gallery/kanban, self-fetching)
 *   external     → ExternalViewer      (OG preview + metadata)
 *   anything else→ EmbedFallback       (graceful "open in app" message)
 */

import { redirect } from "next/navigation";
import { getSession, validateSession } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { CONTENT_WITH_PAYLOADS } from "@/lib/domain/content";
import { EmbedContentClient } from "./EmbedContentClient";
import { EmbedViewerShell } from "./EmbedViewerShell";
import { EmbedFallback } from "./EmbedFallback";
import { FileViewer } from "@/components/content/viewer/FileViewer";
import { FolderViewer } from "@/components/content/viewer/FolderViewer";
import { ExternalViewer } from "@/components/content/viewer/ExternalViewer";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ _t?: string }>;

export default async function EmbedContentPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  // Path 1: cookie auth (works when browser allows cross-site cookies, or after
  // middleware has promoted the URL token to a cookie on a prior request).
  let session = await getSession();

  // Path 2: URL token auth (cross-site iframe fallback, no cookie required).
  // Middleware also handles this and sets the cookie, but we re-validate here so
  // the page works even if middleware didn't run (e.g. during dev fast-refresh).
  if (!session) {
    const { _t } = await searchParams;
    if (_t) {
      session = await validateSession(_t);
    }
  }

  if (!session) redirect("/sign-in");

  const { id } = await params;

  const content = await prisma.contentNode.findFirst({
    where: { id, ownerId: session.user.id, deletedAt: null },
    include: CONTENT_WITH_PAYLOADS,
  });

  if (!content) redirect("/sign-in");

  const { contentType, title } = content;

  // ── Note ─────────────────────────────────────────────────────────────────────
  if (contentType === "note") {
    return (
      <EmbedContentClient
        initialContentId={content.id}
        contentType={contentType}
      />
    );
  }

  // ── File (image / video / audio / PDF / office / other) ──────────────────────
  if (contentType === "file") {
    return (
      <EmbedViewerShell>
        <FileViewer contentId={content.id} title={title} />
      </EmbedViewerShell>
    );
  }

  // ── Folder ───────────────────────────────────────────────────────────────────
  if (contentType === "folder") {
    const fp = content.folderPayload;
    return (
      <EmbedViewerShell>
        <FolderViewer
          contentId={content.id}
          paneId="top-left"
          title={title}
          viewMode={
            (fp?.viewMode as "list" | "gallery" | "kanban" | "dashboard" | "canvas") ?? "list"
          }
          sortMode={fp?.sortMode ?? null}
          viewPrefs={(fp?.viewPrefs as Record<string, unknown>) ?? {}}
          includeReferencedContent={fp?.includeReferencedContent ?? false}
        />
      </EmbedViewerShell>
    );
  }

  // ── External link ─────────────────────────────────────────────────────────────
  if (contentType === "external" && content.externalPayload) {
    const ep = content.externalPayload;
    return (
      <EmbedViewerShell>
        <ExternalViewer
          contentId={content.id}
          title={title}
          url={ep.url}
          subtype={ep.subtype ?? undefined}
          readingStatus={
            ep.readingStatus as
              | "inbox"
              | "queue"
              | "reading"
              | "read"
              | "archived"
          }
          description={ep.description}
          resourceType={ep.resourceType}
          resourceRelationship={ep.resourceRelationship}
          userIntent={ep.userIntent}
          sourceDomain={ep.sourceDomain}
          sourceHostname={ep.sourceHostname}
          faviconUrl={ep.faviconUrl}
          preserveHtml={ep.preserveHtml}
          preservedHtmlCapturedAt={ep.preservedHtmlCapturedAt}
          captureMetadata={
            (ep.captureMetadata as Record<string, unknown>) ?? {}
          }
          preview={
            (ep.preview as {
              mode?: "none" | "open_graph";
              cached?: Record<string, unknown>;
            }) ?? {}
          }
        />
      </EmbedViewerShell>
    );
  }

  // ── Fallback for unsupported types ───────────────────────────────────────────
  return <EmbedFallback contentType={contentType} title={title} />;
}
