"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Upload, X, Loader2 } from "lucide-react";
import type { Editor } from "@tiptap/core";

import type { AudioEmbedAttrs } from "@/lib/domain/editor/extensions/blocks/audio-embed";

interface AudioPlayerProps {
  attrs: AudioEmbedAttrs;
  editor: Editor;
  getPos: () => number | undefined;
}

interface UploadResponse {
  success: boolean;
  data?: {
    contentId: string;
    fileName: string;
    fileSize: number;
  };
  error?: { code: string; message: string };
}

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ACCEPTED_MIME_PREFIX = "audio/";

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AudioPlayer({ attrs, editor, getPos }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const updateAttrs = useCallback(
    (updates: Partial<AudioEmbedAttrs>) => {
      const pos = getPos();
      if (pos === undefined) return;
      const node = editor.state.doc.nodeAt(pos);
      if (!node) return;
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        ...updates,
      });
      editor.view.dispatch(tr);
    },
    [editor, getPos],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!file.type.startsWith(ACCEPTED_MIME_PREFIX)) {
        setError(`Not an audio file (${file.type || "unknown type"})`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File too large (max 100 MB)`);
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("role", "referenced");

        const response = await fetch("/api/content/content/upload/simple", {
          method: "POST",
          body: formData,
        });
        const json = (await response.json()) as UploadResponse;

        if (!json.success || !json.data) {
          throw new Error(json.error?.message ?? "Upload failed");
        }

        updateAttrs({
          src: `/api/content/content/${json.data.contentId}/download?stream=true`,
          filename: json.data.fileName,
          fileSize: json.data.fileSize,
          mimeType: file.type,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [updateAttrs],
  );

  const handleFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void uploadFile(file);
      // Reset so picking the same file twice still triggers onChange.
      e.target.value = "";
    },
    [uploadFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void uploadFile(file);
    },
    [uploadFile],
  );

  // Detect duration once metadata loads. Skip if we already have it
  // (server-set on import path, or persisted from a prior load).
  useEffect(() => {
    if (!attrs.src || attrs.durationSeconds != null) return;
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => {
      const dur = audio.duration;
      if (Number.isFinite(dur)) updateAttrs({ durationSeconds: dur });
    };
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => audio.removeEventListener("loadedmetadata", onLoaded);
  }, [attrs.src, attrs.durationSeconds, updateAttrs]);

  // ── Empty state ──────────────────────────────────────────────────
  if (!attrs.src) {
    return (
      <div
        className={`audio-empty-state ${dragOver ? "audio-empty-state--drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem 1.5rem",
          minHeight: "120px",
          width: "100%",
          background: dragOver
            ? "var(--glass-1-background, rgba(59,130,246,0.08))"
            : "var(--glass-0-background, rgba(255,255,255,0.04))",
          backdropFilter: "var(--glass-0-backdrop-filter, blur(8px))",
          border: dragOver
            ? "2px dashed var(--color-accent, rgb(59,130,246))"
            : "2px dashed var(--color-border, rgba(255,255,255,0.15))",
          borderRadius: "0.75rem",
          cursor: uploading ? "wait" : "pointer",
          transition: "background 120ms ease, border-color 120ms ease",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFilePicked}
          style={{ display: "none" }}
        />
        {uploading ? (
          <>
            <Loader2 size={28} className="audio-empty-state__spinner" style={{ opacity: 0.7 }} />
            <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>Uploading…</span>
          </>
        ) : (
          <>
            <Upload size={28} style={{ opacity: 0.6 }} />
            <span style={{ fontSize: "0.875rem", opacity: 0.85, textAlign: "center" }}>
              <strong>Click to upload audio</strong>
              <br />
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                or drop an audio file here · max 100 MB
              </span>
            </span>
          </>
        )}
        {error ? (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--color-danger, rgb(248,113,113))",
              marginTop: "0.25rem",
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  // ── Player state ─────────────────────────────────────────────────
  return (
    <div
      className="audio-player"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        padding: "0.875rem 1rem",
        width: "100%",
        background: attrs.showBackground
          ? "var(--glass-1-background, rgba(255,255,255,0.06))"
          : "transparent",
        backdropFilter: attrs.showBackground
          ? "var(--glass-1-backdrop-filter, blur(12px))"
          : "none",
        border: attrs.showBackground
          ? "1px solid var(--color-border, rgba(255,255,255,0.1))"
          : "none",
        borderRadius: "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          fontSize: "0.8125rem",
          opacity: 0.85,
        }}
      >
        <Music size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
          title={attrs.filename ?? "audio"}
        >
          {attrs.filename ?? "Audio"}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            opacity: 0.6,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {[formatDuration(attrs.durationSeconds), formatFileSize(attrs.fileSize)]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => updateAttrs({ src: null, filename: null, durationSeconds: null, mimeType: null, fileSize: null })}
          title="Remove audio (clears upload reference)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            background: "transparent",
            border: "none",
            borderRadius: "0.375rem",
            color: "inherit",
            opacity: 0.5,
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>
      </div>
      <audio
        ref={audioRef}
        src={attrs.src}
        controls
        preload="metadata"
        aria-label={attrs.filename ?? "audio"}
        // Marker queried by FlashcardReviewOverlay to auto-play this
        // audio when the card flips to a side containing it.
        data-autoplay-on-flip={attrs.autoplayOnFlip ? "true" : undefined}
        style={{ width: "100%" }}
      />
    </div>
  );
}
