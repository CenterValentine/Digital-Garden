/**
 * PdfTextReader — draggable extracted-text panel for file content (Audio subsystem).
 *
 * Opened by the toolbar "Listen" button for a PDF/doc. Shows the server-extracted
 * text in our own DOM (the native PDF viewer's iframe selection is unreachable),
 * so the user can:
 *   - hit Play to read the whole document, and
 *   - select text → right-click → "Speak selection".
 *
 * The panel floats over the viewer, drags by its header, and resizes from the
 * corner, so it stays out of the way.
 *
 * Structure: an outer store-gate renders the inner panel KEYED by contentId, so
 * each file gets a fresh mount (initial state = loading) — no synchronous
 * setState in effects (React Compiler's set-state-in-effect rule).
 */

"use client";

import { useEffect, useState } from "react";
import { GripVertical, Loader2, Play, Square, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { usePdfTextReaderStore } from "@/state/pdf-text-reader-store";
import { ttsController } from "@/lib/features/tts";
import { useTtsStore } from "@/state/tts-store";

export function PdfTextReader() {
  const { open, contentId, close } = usePdfTextReaderStore();
  if (!open || !contentId) return null;
  return <PdfTextReaderPanel key={contentId} contentId={contentId} onClose={close} />;
}

interface Position {
  x: number;
  y: number;
}

interface SpeakMenu {
  x: number;
  y: number;
  text: string;
}

function PdfTextReaderPanel({
  contentId,
  onClose,
}: {
  contentId: string;
  onClose: () => void;
}) {
  const ttsStatus = useTtsStore((s) => s.status);

  const [title, setTitle] = useState("Document text");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>(() => ({
    x: typeof window !== "undefined" ? Math.max(16, window.innerWidth - 460) : 600,
    y: 96,
  }));
  const [speakMenu, setSpeakMenu] = useState<SpeakMenu | null>(null);

  // Fresh mount per file (keyed) → fetch once; all setState are async (in then/
  // catch/finally), so no synchronous setState in the effect.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/content/content/${contentId}`)
      .then((res) => res.json())
      .then((json: { data?: ReaderPayload } & ReaderPayload) => {
        if (cancelled) return;
        const data = json.data ?? json;
        const extracted = data.file?.searchText ?? "";
        setTitle(data.title ?? "Document text");
        setText(extracted);
        if (!extracted) setError("No extracted text is available for this file.");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the document text.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const isPlaying = ttsStatus === "playing" || ttsStatus === "loading";

  // Drag by the header — window listeners live only for the drag (offset fixed
  // at grab time, so no stale-position issue).
  const startDrag = (e: React.PointerEvent) => {
    const offset = { x: e.clientX - position.x, y: e.clientY - position.y };
    const onMove = (ev: PointerEvent) => {
      setPosition({ x: ev.clientX - offset.x, y: ev.clientY - offset.y });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const playAll = () => {
    if (text) ttsController.play(text, { label: title });
  };

  const onContextMenu = (e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() ?? "";
    if (!selection) return; // nothing selected → let the native menu show
    e.preventDefault();
    setSpeakMenu({ x: e.clientX, y: e.clientY, text: selection });
  };

  return (
    <>
      <div
        className="fixed z-[70] flex flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900/95 text-white shadow-2xl backdrop-blur-md"
        style={{
          left: position.x,
          top: position.y,
          width: 440,
          height: "60vh",
          minWidth: 280,
          minHeight: 200,
          resize: "both",
        }}
        role="dialog"
        aria-label="Document text reader"
      >
        {/* Header / drag handle */}
        <div
          onPointerDown={startDrag}
          className="flex shrink-0 cursor-grab items-center gap-2 border-b border-white/10 bg-black/40 px-2 py-1.5 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 shrink-0 text-white/40" />
          <span className="flex-1 truncate text-xs font-medium text-white/80">
            {title}
          </span>
          <button
            type="button"
            onClick={() => (isPlaying ? ttsController.stop() : playAll())}
            disabled={!text}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
            title={isPlaying ? "Stop" : "Play whole document"}
          >
            {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isPlaying ? "Stop" : "Play"}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="Close"
            aria-label="Close reader"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — selectable text */}
        <div
          onContextMenu={onContextMenu}
          className="flex-1 select-text overflow-auto whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-white/90"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-white/50">
              {error}
            </div>
          ) : (
            text
          )}
        </div>

        {!loading && !error && (
          <div className="shrink-0 border-t border-white/10 bg-black/30 px-3 py-1 text-[10px] text-white/40">
            Select text, then right-click → Speak
          </div>
        )}
      </div>

      {/* Right-click "Speak" menu */}
      {speakMenu && (
        <>
          <div
            className="fixed inset-0 z-[80]"
            onClick={() => setSpeakMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setSpeakMenu(null);
            }}
          />
          <div
            className="fixed z-[81] min-w-[9rem] overflow-hidden rounded-md border border-white/10 bg-zinc-800 py-1 text-sm text-white shadow-xl"
            style={{ left: speakMenu.x, top: speakMenu.y }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/10"
              onClick={() => {
                ttsController.play(speakMenu.text, { label: "Reading selection" });
                setSpeakMenu(null);
              }}
            >
              <Volume2 className="h-4 w-4" /> Speak selection
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/10"
              onClick={() => {
                navigator.clipboard.writeText(speakMenu.text).catch(() => {});
                toast.success("Copied");
                setSpeakMenu(null);
              }}
            >
              Copy
            </button>
          </div>
        </>
      )}
    </>
  );
}

interface ReaderPayload {
  title?: string;
  file?: { searchText?: string };
}
