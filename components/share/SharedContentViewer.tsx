"use client";

import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { useEffect } from "react";

import { MarkdownEditor } from "@/components/content/editor/MarkdownEditor";

const SHARE_PRESENCE_INTERVAL_MS = 15_000;
const VISITOR_ADJECTIVES = ["Silver", "Quiet", "Golden", "Bright", "Gentle", "Blue"];
const VISITOR_TRAITS = ["Windy", "Curious", "Clever", "Sunny", "Brisk", "Calm"];
const VISITOR_ANIMALS = ["Raccoon", "Fox", "Heron", "Otter", "Finch", "Badger"];

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

export function SharedContentViewer({ content }: SharedContentViewerProps) {
  const editHref = `/content?content=${encodeURIComponent(content.id)}`;

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

    void heartbeat();
    const interval = window.setInterval(heartbeat, SHARE_PRESENCE_INTERVAL_MS);
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
                can continue in the workspace editor.
              </p>
            </div>
            {content.canEdit ? (
              <Link
                href={editHref}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Open in editable workspace
              </Link>
            ) : null}
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
