"use client";

import { useEffect, useMemo, useState } from "react";
import { MarkdownEditor } from "@/components/content/editor/MarkdownEditor";
import type { JSONContent } from "@tiptap/core";

type OverlayKind = "note" | "external";

type FrameAuth = {
  token: string;
};

interface OverlayFrameClientProps {
  kind: OverlayKind;
  contentId: string;
}

function useFrameAuth() {
  const [auth, setAuth] = useState<FrameAuth | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "dg-extension-auth") return;
      if (!event.data?.token || typeof event.data.token !== "string") return;
      setAuth({ token: event.data.token });
    };

    window.addEventListener("message", handleMessage);
    window.parent?.postMessage({ type: "dg-overlay-ready" }, "*");
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return auth;
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error?.message || "Request failed");
  }
  return json.data as T;
}

export function OverlayFrameClient({ kind, contentId }: OverlayFrameClientProps) {
  const auth = useFrameAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [noteContent, setNoteContent] = useState<JSONContent | null>(null);
  const [external, setExternal] = useState<Record<string, unknown> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const endpoint = useMemo(
    () =>
      kind === "note"
        ? `/api/integrations/browser-extension/content/${contentId}/note`
        : `/api/integrations/browser-extension/content/${contentId}/external`,
    [contentId, kind]
  );

  useEffect(() => {
    if (!auth) return;
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiFetch<any>(endpoint, auth.token);
        if (!active) return;
        setTitle(data.title || "");
        if (kind === "note") {
          setNoteContent(data.note?.tiptapJson || { type: "doc", content: [{ type: "paragraph" }] });
        } else {
          setExternal(data.external || {});
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load overlay content");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [auth, endpoint, kind]);

  const saveNote = async (content: JSONContent) => {
    if (!auth) return;
    setIsSaving(true);
    try {
      const data = await apiFetch<any>(endpoint, auth.token, {
        method: "PATCH",
        body: JSON.stringify({ tiptapJson: content }),
      });
      setNoteContent(data.note?.tiptapJson || content);
    } finally {
      setIsSaving(false);
    }
  };

  const saveExternal = async () => {
    if (!auth || !external) return;
    setIsSaving(true);
    try {
      const data = await apiFetch<any>(endpoint, auth.token, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          url: external.url,
          canonicalUrl: external.canonicalUrl,
          description: external.description,
          resourceType: external.resourceType,
          resourceRelationship: external.resourceRelationship,
          userIntent: external.userIntent,
          faviconUrl: external.faviconUrl,
          preview: external.preview,
          captureMetadata: external.captureMetadata,
          matchMetadata: external.matchMetadata,
          preserveHtml: external.preserveHtml,
        }),
      });
      setTitle(data.title || title);
      setExternal(data.external || external);
    } finally {
      setIsSaving(false);
    }
  };

  if (!auth) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f1115] text-sm text-white/70">
        Waiting for trusted browser extension…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f1115] text-sm text-white/70">
        Loading {kind}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f1115] p-6 text-center text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (kind === "note") {
    return (
      <div className="flex h-screen flex-col bg-[#0f1115] text-white">
        <div className="border-b border-white/10 px-3 py-2 text-sm font-medium">
          {title || "Note"}
          {isSaving ? <span className="ml-2 text-xs text-white/50">Saving…</span> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <MarkdownEditor
            contentId={contentId}
            content={
              noteContent || {
                type: "doc",
                content: [{ type: "paragraph" }],
              }
            }
            onSave={saveNote}
            editable
            compact
            placeholder="Add notes about this webpage..."
            className="h-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#0f1115] text-white">
      <div className="border-b border-white/10 px-3 py-2 text-sm font-medium">
        External link
        {isSaving ? <span className="ml-2 text-xs text-white/50">Saving…</span> : null}
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
          placeholder="Title"
        />
        <input
          value={String(external?.url || "")}
          onChange={(event) =>
            setExternal((current) => ({ ...(current || {}), url: event.target.value }))
          }
          className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
          placeholder="URL"
        />
        <textarea
          value={String(external?.description || "")}
          onChange={(event) =>
            setExternal((current) => ({
              ...(current || {}),
              description: event.target.value,
            }))
          }
          className="min-h-24 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
          placeholder="Description"
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["resourceType", "Resource Type"],
            ["resourceRelationship", "Relationship"],
            ["userIntent", "User Intent"],
          ].map(([key, label]) => (
            <input
              key={key}
              value={String((external as any)?.[key] || "")}
              onChange={(event) =>
                setExternal((current) => ({
                  ...(current || {}),
                  [key]: event.target.value,
                }))
              }
              className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              placeholder={label}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => void saveExternal()}
          className="rounded-md bg-[#c9a54c] px-3 py-2 text-sm font-semibold text-black"
        >
          Save external link
        </button>
      </div>
    </div>
  );
}
