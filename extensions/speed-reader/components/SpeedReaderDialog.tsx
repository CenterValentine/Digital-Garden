"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Controls } from "./Controls";
import { WordDisplay } from "./WordDisplay";
import { SessionSummary } from "./SessionSummary";
import { tokenize, type Chunk } from "../lib/tokenizer";
import { getChunkDelay } from "../lib/timing";
import { normalizePdfText } from "../lib/pdf-compat";
import { useSpeedReaderStore } from "../state/speed-reader-store";
import { useSpeedReaderMetricsStore } from "../state/metrics-store";
import { ensureReaderFontsLoaded, resolveTheme } from "../lib/theme";
import {
  loadSpeedReaderSource,
  type LoadProgress,
} from "../lib/load-source";
import {
  SPEED_READER_OPEN_EVENT,
  type SpeedReaderOpenEventDetail,
} from "../events";

type Phase = "idle" | "loading" | "ready" | "playing" | "paused" | "done" | "error";

export function SpeedReaderDialog() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [rawText, setRawText] = useState<string>("");
  const [position, setPosition] = useState(0);
  const [sourceTitle, setSourceTitle] = useState<string | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [allowOcr, setAllowOcr] = useState(false);
  const [pendingContentId, setPendingContentId] = useState<string | null>(null);
  const [showPdfCompatWarning, setShowPdfCompatWarning] = useState(false);

  const sessionStartRef = useRef<number | null>(null);
  const accumulatedReadingMsRef = useRef(0);
  const lastResumeAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set to Date.now() whenever playback starts or resumes. The playback loop
  // uses it to compute the crescendo ramp; null means ramp is not active.
  const rampStartRef = useRef<number | null>(null);

  const wpm = useSpeedReaderStore((s) => s.wpm);
  const polish = useSpeedReaderStore((s) => s.polish);
  const autoStart = useSpeedReaderStore((s) => s.polish.autoStart);
  const font = useSpeedReaderStore((s) => s.font);
  const fontSizeRem = useSpeedReaderStore((s) => s.fontSizeRem);
  const themePref = useSpeedReaderStore((s) => s.theme);
  const orpColor = useSpeedReaderStore((s) => s.orpColor);
  const pdfCompatMode = useSpeedReaderStore((s) => s.pdfCompatMode);
  const setPdfCompatMode = useSpeedReaderStore((s) => s.setPdfCompatMode);
  const recordSession = useSpeedReaderMetricsStore((s) => s.recordSession);

  const prefersDark = usePrefersDark();
  const theme = useMemo(
    () => resolveTheme(themePref, prefersDark, orpColor),
    [themePref, prefersDark, orpColor]
  );

  const total = chunks.length;
  const currentChunk = chunks[position] ?? null;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const closeDialog = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPhase("idle");
    setChunks([]);
    setPosition(0);
    setSourceTitle(null);
    setErrorMessage(null);
    setWarning(null);
    setProgress(null);
    setPendingContentId(null);
    sessionStartRef.current = null;
    accumulatedReadingMsRef.current = 0;
    lastResumeAtRef.current = null;
  }, [clearTimer]);

  const beginLoad = useCallback(
    async (contentId: string, opts: { withOcr: boolean; pdfCompat: boolean }) => {
      setPhase("loading");
      setErrorMessage(null);
      setWarning(null);
      setProgress({ stage: "fetching" });
      try {
        const result = await loadSpeedReaderSource(contentId, {
          allowOcr: opts.withOcr,
          onProgress: setProgress,
        });
        const raw = result.text;
        setRawText(raw);
        const text = opts.pdfCompat ? normalizePdfText(raw) : raw;
        const tokenized = tokenize(text);
        if (tokenized.length === 0) {
          setPhase("error");
          setErrorMessage(
            "No readable text found. Try enabling OCR for image content."
          );
          return;
        }
        setSourceTitle(result.title);
        setChunks(tokenized);
        setPosition(0);
        setWarning(result.warning ?? null);
        setPhase("ready");
      } catch (err) {
        setPhase("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Could not load content"
        );
      }
    },
    []
  );

  // Re-tokenize from already-fetched rawText when PDF compat mode is applied.
  const applyPdfCompatToggle = useCallback(
    (nextMode: boolean) => {
      setPdfCompatMode(nextMode);
      if (!rawText) return;
      const text = nextMode ? normalizePdfText(rawText) : rawText;
      const tokenized = tokenize(text);
      setChunks(tokenized.length > 0 ? tokenized : chunks);
      setPosition(0);
      setPhase((p) => (p === "playing" ? "ready" : p));
    },
    [rawText, chunks, setPdfCompatMode]
  );

  const handlePdfCompatToggle = useCallback(() => {
    const nextMode = !pdfCompatMode;
    const hasContent = phase === "ready" || phase === "playing" || phase === "paused";
    if (hasContent) {
      // Pause and show warning before applying.
      clearTimer();
      if (phase === "playing") setPhase("paused");
      setShowPdfCompatWarning(true);
    } else {
      applyPdfCompatToggle(nextMode);
    }
  }, [pdfCompatMode, phase, clearTimer, applyPdfCompatToggle]);

  // Open trigger: listen for the global event from the toolbar button.
  useEffect(() => {
    const handler = (event: Event) => {
      ensureReaderFontsLoaded();
      const detail = (event as CustomEvent<SpeedReaderOpenEventDetail>).detail;
      const contentId = detail?.sourceContentId ?? null;
      setOpen(true);
      setSourceTitle(detail?.sourceTitle ?? null);
      setAllowOcr(false);
      if (contentId) {
        setPendingContentId(contentId);
        void beginLoad(contentId, { withOcr: false, pdfCompat: useSpeedReaderStore.getState().pdfCompatMode });
      } else {
        setPhase("error");
        setErrorMessage("No content selected to read.");
      }
    };
    window.addEventListener(SPEED_READER_OPEN_EVENT, handler);
    return () => window.removeEventListener(SPEED_READER_OPEN_EVENT, handler);
  }, [beginLoad]);

  // Auto-start: when content finishes loading and autoStart is on, start
  // playing after a 1 s delay so the reader isn't launched mid-sentence.
  useEffect(() => {
    if (phase !== "ready" || !autoStart) return;
    const timer = setTimeout(() => {
      sessionStartRef.current = Date.now();
      lastResumeAtRef.current = Date.now();
      rampStartRef.current = Date.now();
      setPhase("playing");
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, autoStart]);

  // Playback loop. Each tick computes the next chunk's delay using
  // current WPM + polish settings, so live slider adjustments take
  // effect on the very next slide.
  useEffect(() => {
    if (phase !== "playing") return;
    if (position >= total) {
      finishSession();
      return;
    }
    const chunk = chunks[position];

    // Crescendo ramp: lerp from 50 % → 100 % of target WPM over 3 s after
    // each play/resume. Uses a smoothstep curve for a more natural feel.
    const RAMP_DURATION_MS = 3000;
    const effectiveWpm = (() => {
      if (!polish.crescendoResume || rampStartRef.current === null) return wpm;
      const elapsed = Date.now() - rampStartRef.current;
      const t = Math.min(1, elapsed / RAMP_DURATION_MS);
      const eased = t * t * (3 - 2 * t); // smoothstep
      return Math.round(wpm * 0.5 + wpm * 0.5 * eased);
    })();

    const delay = getChunkDelay(chunk, effectiveWpm, polish);
    timerRef.current = setTimeout(() => {
      setPosition((p) => p + 1);
    }, delay);
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finishSession is stable via refs
  }, [phase, position, total, wpm, polish, chunks, clearTimer]);

  const restart = useCallback(() => {
    clearTimer();
    setPosition(0);
    accumulatedReadingMsRef.current = 0;
    sessionStartRef.current = Date.now();
    lastResumeAtRef.current = Date.now();
    rampStartRef.current = Date.now();
    setPhase("playing");
  }, [clearTimer]);

  const togglePlay = useCallback(() => {
    if (phase === "ready") {
      sessionStartRef.current = Date.now();
      lastResumeAtRef.current = Date.now();
      rampStartRef.current = Date.now();
      setPhase("playing");
      return;
    }
    if (phase === "playing") {
      if (lastResumeAtRef.current !== null) {
        accumulatedReadingMsRef.current += Date.now() - lastResumeAtRef.current;
        lastResumeAtRef.current = null;
      }
      clearTimer();
      rampStartRef.current = null;
      setPhase("paused");
      return;
    }
    if (phase === "paused") {
      lastResumeAtRef.current = Date.now();
      rampStartRef.current = Date.now();
      setPhase("playing");
      return;
    }
    if (phase === "done") {
      restart();
    }
  }, [phase, clearTimer, restart]);

  const stepBack = useCallback(() => {
    setPosition((p) => Math.max(0, p - 5));
  }, []);

  const stepForward = useCallback(() => {
    setPosition((p) => Math.min(total, p + 5));
  }, [total]);

  function finishSession() {
    clearTimer();
    if (lastResumeAtRef.current !== null) {
      accumulatedReadingMsRef.current += Date.now() - lastResumeAtRef.current;
      lastResumeAtRef.current = null;
    }
    const durationMs = accumulatedReadingMsRef.current;
    const wordsRead = total;
    if (durationMs > 1000 && wordsRead > 0) {
      const avgWpm = Math.round((wordsRead / durationMs) * 60_000);
      recordSession({
        startedAt: sessionStartRef.current ?? Date.now(),
        durationMs,
        wordsRead,
        avgWpm,
        sourceTitle: sourceTitle ?? undefined,
      });
    }
    setPhase("done");
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog();
      } else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (phase === "playing" || phase === "paused" || phase === "done") {
          restart();
        }
      } else if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        stepBack();
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        stepForward();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, phase, togglePlay, restart, stepBack, stepForward, closeDialog]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Speed reader"
      className="fixed inset-0 z-[260] flex flex-col"
      style={{ background: theme.background }}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3"
        style={{
          background: theme.surface,
          borderBottom: `1px solid ${theme.controlBorder}`,
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
        }}
      >
        <div className="flex flex-col">
          <div
            className="text-xs uppercase tracking-widest"
            style={{ color: theme.textMuted }}
          >
            Speed Reader
          </div>
          {sourceTitle && (
            <div
              className="text-sm font-medium"
              style={{ color: theme.textPrimary }}
            >
              {sourceTitle}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={closeDialog}
          className="rounded-md px-3 py-1.5 text-sm"
          style={{
            color: theme.textMuted,
            background: theme.controlBg,
            border: `1px solid ${theme.controlBorder}`,
          }}
        >
          Close
        </button>
      </div>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {phase === "loading" && (
          <LoadingState progress={progress} theme={theme} />
        )}
        {phase === "error" && (
          <ErrorState
            message={errorMessage ?? "Something went wrong"}
            theme={theme}
            offerOcr={
              !!pendingContentId &&
              !allowOcr &&
              !!errorMessage &&
              /OCR|image/i.test(errorMessage)
            }
            onEnableOcr={() => {
              if (!pendingContentId) return;
              setAllowOcr(true);
              void beginLoad(pendingContentId, { withOcr: true, pdfCompat: pdfCompatMode });
            }}
            onClose={closeDialog}
          />
        )}
        {(phase === "ready" || phase === "playing" || phase === "paused") && (
          <>
            {warning && (
              <div
                className="mx-auto mt-4 max-w-md rounded-md px-3 py-2 text-center text-sm"
                style={{
                  background: theme.controlBg,
                  border: `1px solid ${theme.controlBorder}`,
                  color: theme.textMuted,
                }}
              >
                {warning}
                {pendingContentId && !allowOcr && (
                  <button
                    type="button"
                    onClick={() => {
                      setAllowOcr(true);
                      setWarning(null);
                      void beginLoad(pendingContentId, { withOcr: true, pdfCompat: pdfCompatMode });
                    }}
                    className="ml-3 underline"
                    style={{ color: theme.orpAccent }}
                  >
                    Run OCR
                  </button>
                )}
              </div>
            )}
            <WordDisplay
              chunk={currentChunk}
              font={font}
              fontSizeRem={fontSizeRem}
              theme={theme}
              polish={polish}
            />
          </>
        )}
        {phase === "done" && (
          <SessionSummary
            wordsRead={total}
            durationMs={accumulatedReadingMsRef.current}
            avgWpm={
              accumulatedReadingMsRef.current > 0
                ? Math.round((total / accumulatedReadingMsRef.current) * 60_000)
                : 0
            }
            theme={theme}
            onRestart={restart}
            onClose={closeDialog}
          />
        )}
      </div>

      {/* PDF compat warning — shown before applying mid-session */}
      {showPdfCompatWarning && (
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 text-sm"
          style={{
            background: "rgba(202, 138, 4, 0.15)",
            borderTop: "1px solid rgba(202, 138, 4, 0.3)",
            color: "#92400e",
          }}
        >
          <span>
            Changing PDF compatibility mode will re-parse the text and reset your position to the beginning.
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setShowPdfCompatWarning(false)}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{ background: "rgba(0,0,0,0.08)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPdfCompatWarning(false);
                applyPdfCompatToggle(!pdfCompatMode);
              }}
              className="rounded px-3 py-1 text-xs font-medium text-white"
              style={{ background: "#b45309" }}
            >
              Apply &amp; Reset
            </button>
          </div>
        </div>
      )}

      {/* Footer controls — only show while reading */}
      {(phase === "ready" || phase === "playing" || phase === "paused") && (
        <Controls
          playing={phase === "playing"}
          onTogglePlay={togglePlay}
          onRestart={restart}
          onStepBack={stepBack}
          onStepForward={stepForward}
          onClose={closeDialog}
          onSeek={(newPos) => {
            clearTimer();
            setPosition(newPos);
          }}
          onPdfCompatToggle={handlePdfCompatToggle}
          pdfCompatMode={pdfCompatMode}
          position={position}
          total={total}
          theme={theme}
        />
      )}
    </div>
  );
}

function subscribeDarkMq(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getDarkSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribeDarkMq, getDarkSnapshot, () => false);
}

interface LoadingStateProps {
  progress: LoadProgress | null;
  theme: ReturnType<typeof resolveTheme>;
}

function LoadingState({ progress, theme }: LoadingStateProps) {
  const label = (() => {
    if (!progress) return "Loading…";
    switch (progress.stage) {
      case "fetching":
        return "Loading content…";
      case "extracting":
        return progress.detail ?? "Extracting text…";
      case "ocring":
        return "Running OCR (this may take a few seconds)…";
      case "tokenizing":
        return "Preparing…";
      default:
        return "Loading…";
    }
  })();
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3"
      style={{ color: theme.textPrimary }}
    >
      <div
        className="h-6 w-6 animate-spin rounded-full border-2"
        style={{
          borderColor: theme.controlBorder,
          borderTopColor: theme.orpAccent,
        }}
      />
      <div className="text-sm" style={{ color: theme.textMuted }}>
        {label}
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  theme: ReturnType<typeof resolveTheme>;
  offerOcr: boolean;
  onEnableOcr: () => void;
  onClose: () => void;
}

function ErrorState({
  message,
  theme,
  offerOcr,
  onEnableOcr,
  onClose,
}: ErrorStateProps) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ color: theme.textPrimary }}
    >
      <div className="max-w-md text-sm" style={{ color: theme.textMuted }}>
        {message}
      </div>
      <div className="flex gap-2">
        {offerOcr && (
          <button
            type="button"
            onClick={onEnableOcr}
            className="rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ background: theme.orpAccent }}
          >
            Run OCR
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{
            background: theme.controlBg,
            border: `1px solid ${theme.controlBorder}`,
            color: theme.textPrimary,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
