/**
 * Client side of /api/canvas/* (CANVAS-ARCHIVE-PLAN.md).
 */

import type {
  CanvasImportSummary,
  CanvasProgressEvent,
  CanvasStreamEvent,
  ConflictResolution,
} from "@/lib/domain/canvas/types";
import type { ModuleChangeSummary } from "@/lib/domain/canvas/plan";

/** "+ → Canvas Course…" opens the import dialog with this event. */
export const CANVAS_IMPORT_OPEN_EVENT = "dg:canvas-import-open";
/** Fired after an import or re-import changes the tree. */
export const CANVAS_CHANGED_EVENT = "dg:canvas-changed";

export function openCanvasImport(parentId: string | null): void {
  window.dispatchEvent(new CustomEvent(CANVAS_IMPORT_OPEN_EVENT, { detail: { parentId } }));
}

export interface CanvasConnection {
  id: string;
  baseUrl: string;
  displayName: string | null;
  connected: boolean;
  tokenHint: string | null;
  lastUsedAt: string | null;
}

export interface CanvasCourse {
  id: string;
  name: string;
  courseCode: string | null;
  term: string | null;
  state: "completed" | "active";
  imported: { contentId: string; title: string } | null;
}

export interface CanvasProvenance {
  contentId: string;
  canvasType: string;
  status: string;
  importedAt: string;
  sourceKind: "api" | "cartridge";
  sourceLabel: string;
  course: { rootId: string | null; title: string | null; htmlUrl: string | null };
  module: { id: string; title: string | null; contentId: string | null } | null;
  htmlUrl: string | null;
  titleLocked: boolean;
}

export interface CourseChangeReport {
  courseRootId: string;
  courseTitle: string;
  sourceKind: "api" | "cartridge";
  modules: ModuleChangeSummary[];
  course: { syllabusChanged: boolean; syllabusConflict: boolean; syllabusNew: boolean; syllabusRemoved: boolean };
  conflicts: Array<{ linkKey: string; title: string; contentId: string; moduleId: string | null; kind: string }>;
  unchanged: boolean;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const json = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: { message?: string } }
    | null;
  if (!response.ok || !json?.success) {
    throw new Error(json?.error?.message ?? `Canvas request failed (${response.status})`);
  }
  return json.data as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const canvasClient = {
  connections: () => call<{ connections: CanvasConnection[] }>("/api/canvas/connection"),
  saveConnection: (baseUrl: string, token: string) =>
    call<{ connection: CanvasConnection }>("/api/canvas/connection", jsonInit("PUT", { baseUrl, token })),
  disconnect: (id: string) =>
    call<{ disconnected: boolean }>(`/api/canvas/connection?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  courses: (connectionId?: string) =>
    call<{ connection: CanvasConnection; courses: CanvasCourse[] }>(
      `/api/canvas/courses${connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ""}`
    ),
  linked: () => call<{ ids: string[] }>("/api/canvas/linked"),
  provenance: (contentId: string) =>
    call<{ provenance: CanvasProvenance | null }>(`/api/canvas/provenance/${encodeURIComponent(contentId)}`),
  check: (courseRootId: string, cartridgeContentId?: string | null) =>
    call<CourseChangeReport>("/api/canvas/check", jsonInit("POST", { courseRootId, cartridgeContentId })),
};

/**
 * Run a streaming operation, calling `onProgress` per line; resolves with
 * the final summary, rejects with the server's message.
 */
export async function runCanvasStream(
  url: string,
  body: unknown,
  onProgress: (event: CanvasProgressEvent) => void
): Promise<CanvasImportSummary> {
  const response = await fetch(url, { credentials: "include", ...jsonInit("POST", body) });
  if (!response.ok || !response.body) {
    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message ?? `Canvas request failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let summary: CanvasImportSummary | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as CanvasStreamEvent;
    if (event.type === "progress") onProgress(event);
    else if (event.type === "done") summary = event;
    else if (event.type === "error") throw new Error(event.message);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handle(buffer);
  if (!summary) throw new Error("The import ended without a result. Check the course folder and try again.");
  window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
  window.dispatchEvent(new CustomEvent(CANVAS_CHANGED_EVENT));
  return summary;
}

export function importCourse(
  input: { connectionId: string; courseId: string; parentId: string | null },
  onProgress: (event: CanvasProgressEvent) => void
) {
  return runCanvasStream("/api/canvas/import", input, onProgress);
}

export function importCartridge(
  input: { fileContentId: string; parentId: string | null },
  onProgress: (event: CanvasProgressEvent) => void
) {
  return runCanvasStream("/api/canvas/cartridge", input, onProgress);
}

export function reimportCourse(
  input: {
    courseRootId: string;
    moduleIds: string[];
    includeCourse: boolean;
    resolutions: Record<string, ConflictResolution>;
    cartridgeContentId?: string | null;
  },
  onProgress: (event: CanvasProgressEvent) => void
) {
  return runCanvasStream("/api/canvas/reimport", input, onProgress);
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload a course export as a hidden file node and return its id. Direct to
 * storage (presigned), so large exports never pass through a function body;
 * falls back to the simple upload route when no storage config is set up.
 */
export async function uploadCartridge(file: File, parentId: string | null): Promise<string> {
  const mimeType = "application/zip";
  try {
    const initiated = await call<{ contentId?: string; uploadUrl?: string; isDuplicate?: boolean; existingContentId?: string }>(
      "/api/content/content/upload/initiate",
      jsonInit("POST", {
        fileName: file.name,
        fileSize: file.size,
        mimeType,
        checksum: await sha256Hex(file),
        parentId,
        role: "referenced",
      })
    );
    if (initiated.isDuplicate && initiated.existingContentId) return initiated.existingContentId;
    if (!initiated.contentId || !initiated.uploadUrl) throw new Error("Upload couldn't start");
    const put = await fetch(initiated.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
    await call("/api/content/content/upload/finalize", jsonInit("POST", { contentId: initiated.contentId, uploadSuccess: put.ok }));
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    return initiated.contentId;
  } catch (error) {
    if (!(error instanceof Error) || !/storage provider/i.test(error.message)) throw error;
    const form = new FormData();
    form.append("file", file);
    if (parentId) form.append("parentId", parentId);
    const uploaded = await call<{ contentId?: string }>("/api/content/content/upload/simple", { method: "POST", body: form });
    if (!uploaded.contentId) throw new Error("Upload failed");
    return uploaded.contentId;
  }
}
