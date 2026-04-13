"use client";

import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { useEffect, useState } from "react";

import { MarkdownEditor } from "@/components/content/editor/MarkdownEditor";

const SHARE_PRESENCE_INTERVAL_MS = 10_000;
const VISITOR_ADJECTIVES = ["Silver", "Quiet", "Golden", "Bright", "Gentle", "Blue"];
const VISITOR_TRAITS = ["Windy", "Curious", "Clever", "Sunny", "Brisk", "Calm"];
const VISITOR_ANIMALS = ["Raccoon", "Fox", "Heron", "Otter", "Finch", "Badger"];

interface SharePresenceSession {
  sessionId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  surfaceCount: number;
  transportState: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

interface PresenceSnapshotResponse {
  success: boolean;
  data?: {
    presenceByContentId: Record<string, SharePresenceSession[]>;
  };
}

type SharedContentType =
  | "folder"
  | "note"
  | "file"
  | "html"
  | "template"
  | "code"
  | "external"
  | "chat"
  | "visualization"
  | "data"
  | "hope"
  | "workflow";

interface SharedContentViewerProps {
  content: {
    id: string;
    title: string;
    contentType: SharedContentType;
    isPublished: boolean;
    accessLevel: "public" | "view" | "edit" | "owner";
    canEdit: boolean;
    isSignedIn: boolean;
    note?: {
      tiptapJson: JSONContent;
    } | null;
    code?: {
      code: string;
      language: string;
    } | null;
    html?: {
      html: string;
    } | null;
    external?: {
      url: string;
      subtype: string | null;
      preview: Record<string, unknown>;
    } | null;
    file?: {
      fileName: string;
      mimeType: string;
      fileSize: string;
      uploadStatus: string;
    } | null;
    data?: Record<string, unknown> | null;
    visualization?: Record<string, unknown> | null;
    chat?: {
      messages: Array<{ role: string; content: string; timestamp: string }>;
    } | null;
    hope?: Record<string, unknown> | null;
    workflow?: Record<string, unknown> | null;
  };
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Math.random().toString(36).slice(2)}:${Date.now()}`;
}

function getSessionStorageId(key: string, prefix: string) {
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = createId(prefix);
  window.sessionStorage.setItem(key, next);
  return next;
}

function getSessionStorageValue(key: string, createValue: () => string) {
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = createValue();
  window.sessionStorage.setItem(key, next);
  return next;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getVisitorName(seed: string) {
  const hash = hashString(seed);
  return [
    VISITOR_ADJECTIVES[hash % VISITOR_ADJECTIVES.length],
    VISITOR_TRAITS[Math.floor(hash / 7) % VISITOR_TRAITS.length],
    VISITOR_ANIMALS[Math.floor(hash / 17) % VISITOR_ANIMALS.length],
  ].join(" ");
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  return (words[0]?.slice(0, 2) || "?").toUpperCase();
}

function SharePresenceDiscs({ sessions }: { sessions: SharePresenceSession[] }) {
  if (sessions.length === 0) return null;

  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-rose-500",
  ];

  return (
    <div
      className="group/presence flex items-center overflow-visible pr-1"
      aria-label={`${sessions.length} other viewer${sessions.length === 1 ? "" : "s"}`}
    >
      {sessions.slice(0, 6).map((session, index) => {
        const displayName =
          session.displayName?.trim() || getVisitorName(session.sessionId || session.userId);
        const colorIndex = hashString(session.userId || session.sessionId) % colors.length;

        return (
          <div
            key={session.sessionId}
            className="group/card relative -ml-2 first:ml-0 transition-all duration-150 group-hover/presence:ml-1"
            style={{ zIndex: sessions.length - index }}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-background text-xs font-semibold uppercase text-white shadow-sm ${
                colors[colorIndex]
              }`}
              aria-label={displayName}
            >
              {session.avatarUrl && !session.isAnonymous ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                getInitials(displayName)
              )}
            </div>
            <div className="pointer-events-none absolute right-0 top-10 z-50 w-44 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity delay-300 group-hover/card:opacity-100">
              <p className="truncate font-medium">{displayName}</p>
              <p className="text-muted-foreground">
                {session.isAnonymous ? "Public viewer" : "Signed-in viewer"}
              </p>
            </div>
          </div>
        );
      })}
      {sessions.length > 6 ? (
        <div className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-semibold text-muted-foreground transition-all duration-150 group-hover/presence:ml-1">
          +{sessions.length - 6}
        </div>
      ) : null}
    </div>
  );
}

export function SharedContentViewer({ content }: SharedContentViewerProps) {
  const editHref = `/content?content=${encodeURIComponent(content.id)}`;
  const shareHref = `/share/${encodeURIComponent(content.id)}`;
  const signInHref = `/sign-in?redirect=${encodeURIComponent(shareHref)}`;
  const [presenceSessions, setPresenceSessions] = useState<SharePresenceSession[]>([]);

  useEffect(() => {
    const sessionId = getSessionStorageId("dg-share-session-id", "share-session");
    const browserContextId = getSessionStorageId("dg-share-browser-context-id", "share-browser");
    const displayName = getSessionStorageValue(
      "dg-share-visitor-name",
      () => getVisitorName(browserContextId)
    );

    const heartbeat = async () => {
      try {
        await fetch("/api/collaboration/presence/heartbeat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId: content.id,
            sessionId,
            browserContextId,
            displayName,
            surfaceCount: 1,
            activePaneIds: [],
            activeTabIds: [],
            transportState: "localOnly",
            lastKnownServerRevision: null,
          }),
        });
      } catch {
        // Public viewer presence is advisory.
      }
    };

    const fetchPresence = async () => {
      try {
        const params = new URLSearchParams({
          contentIds: content.id,
          excludeSessionId: sessionId,
        });
        const response = await fetch(`/api/collaboration/presence?${params.toString()}`, {
          credentials: "include",
        });
        if (!response.ok) return;

        const result = (await response.json()) as PresenceSnapshotResponse;
        if (!result.success || !result.data) return;

        setPresenceSessions(result.data.presenceByContentId[content.id] ?? []);
      } catch {
        // Public viewer presence is advisory.
      }
    };

    const tick = async () => {
      await Promise.allSettled([heartbeat(), fetchPresence()]);
    };

    void tick();
    const interval = window.setInterval(tick, SHARE_PRESENCE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [content.id]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="mb-8 border-b border-border pb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            <span>Shared Content</span>
            <span aria-hidden="true">/</span>
            <span>{content.accessLevel === "public" ? "View only" : content.accessLevel}</span>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">{content.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Public share links are view-only. Signed-in collaborators with edit access
                can continue in the content editor.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <SharePresenceDiscs sessions={presenceSessions} />
              {content.canEdit || !content.isSignedIn ? (
                <Link
                  href={content.canEdit ? editHref : signInHref}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  {content.canEdit ? "Open in editor" : "Sign in to edit"}
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <section className="min-h-0 flex-1 rounded-xl border border-border bg-card/60">
          {content.contentType === "note" || content.contentType === "template" ? (
            <div className="min-h-[60vh] px-2 py-4 sm:px-6">
              <MarkdownEditor
                contentId={content.id}
                title={content.title}
                content={
                  content.note?.tiptapJson ?? {
                    type: "doc",
                    content: [{ type: "paragraph" }],
                  }
                }
                editable={false}
                collaborationEnabled={false}
                placeholder="This shared note is empty."
              />
            </div>
          ) : content.contentType === "code" ? (
            <pre className="min-h-[60vh] overflow-auto p-6 text-sm">
              <code>{content.code?.code ?? ""}</code>
            </pre>
          ) : content.contentType === "html" ? (
            <iframe
              title={content.title}
              sandbox=""
              srcDoc={content.html?.html ?? ""}
              className="min-h-[70vh] w-full rounded-xl bg-white"
            />
          ) : content.contentType === "external" ? (
            <div className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">External link</p>
              <a
                href={content.external?.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="break-all text-lg font-medium text-primary hover:underline"
              >
                {content.external?.url}
              </a>
              <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
                {formatJson(content.external?.preview)}
              </pre>
            </div>
          ) : content.contentType === "file" ? (
            <div className="space-y-3 p-6">
              <p className="text-sm text-muted-foreground">File metadata</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="font-medium">{content.file?.fileName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">MIME type</dt>
                  <dd className="font-medium">{content.file?.mimeType}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Size</dt>
                  <dd className="font-medium">{content.file?.fileSize} bytes</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Upload status</dt>
                  <dd className="font-medium">{content.file?.uploadStatus}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <pre className="min-h-[60vh] overflow-auto p-6 text-sm">
              {formatJson(
                content.data ??
                  content.visualization ??
                  content.chat ??
                  content.hope ??
                  content.workflow
              )}
            </pre>
          )}
        </section>
      </div>
    </main>
  );
}
