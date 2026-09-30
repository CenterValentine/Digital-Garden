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
  getSpeedReaderPagedSource,
  SPEED_READER_OPEN_EVENT,
  type SpeedReaderOpenEventDetail,
  type SpeedReaderPagedSource,
} from "../events";

/** How long the page-end overlay shows before auto-continue turns the page. */
const AUTO_CONTINUE_DELAY_MS = 1800;

/** "pageEnd" = a paged source's page is finished; offer the next one. */
type Phase = "idle" | "loading" | "ready" | "playing" | "paused" | "pageEnd" | "done" | "error";

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
  // Paged source (the e-reader): read the visible page, then the next on request.
  const pagedSourceRef = useRef<SpeedReaderPagedSource | null>(null);
  const [pageLabel, setPageLabel] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  // Words from pages already finished this session (paged sources).
  const finishedPagesWordsRef = useRef(0);
  const [summaryWords, setSummaryWords] = useState(0);

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
  const autoContinuePages = useSpeedReaderStore((s) => s.autoContinuePages);
  const setAutoContinuePages = useSpeedReaderStore((s) => s.setAutoContinuePages);
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
    pagedSourceRef.current = null;
    setPageLabel(null);
    setAdvancing(false);
    finishedPagesWordsRef.current = 0;
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

  /** Paged source: tokenize a page. False when it has no readable words. */
  const showPage = useCallback((page: { text: string; label?: string }) => {
    setRawText(page.text);
    const text = useSpeedReaderStore.getState().pdfCompatMode ? normalizePdfText(page.text) : page.text;
    const tokenized = tokenize(text);
    if (tokenized.length === 0) return false;
    setChunks(tokenized);
    setPosition(0);
    setPageLabel(page.label ?? null);
    return true;
  }, []);

  const beginPagedLoad = useCallback(
    async (source: SpeedReaderPagedSource) => {
      setPhase("loading");
      setErrorMessage(null);
      setWarning(null);
      setProgress({ stage: "extracting", detail: "Reading this page…" });
      try {
        // An empty page (a cover, an image) → try the following one.
        let page = await source.current();
        for (let skipped = 0; page && !page.text.trim() && skipped < 5; skipped++) {
          page = await source.next();
        }
        if (!page || !showPage(page)) {
          setPhase("error");
          setErrorMessage("There's no readable text on this page.");
          return;
        }
        setPhase("ready");
      } catch (err) {
        setPhase("error");
        setErrorMessage(err instanceof Error ? err.message : "Could not read this page");
      }
    },
    [showPage]
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
      finishedPagesWordsRef.current = 0;
      const pagedSource = contentId ? getSpeedReaderPagedSource(contentId) : null;
      pagedSourceRef.current = pagedSource;
      setPageLabel(null);
      if (pagedSource) {
        // The e-reader: start from the page on screen, not the top of the book.
        setPendingContentId(null);
        void beginPagedLoad(pagedSource);
      } else if (contentId) {
        setPendingContentId(contentId);
        void beginLoad(contentId, { withOcr: false, pdfCompat: useSpeedReaderStore.getState().pdfCompatMode });
      } else {
        setPhase("error");
        setErrorMessage("No content selected to read.");
      }
    };
    window.addEventListener(SPEED_READER_OPEN_EVENT, handler);
    return () => window.removeEventListener(SPEED_READER_OPEN_EVENT, handler);
  }, [beginLoad, beginPagedLoad]);

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
    if (pagedSourceRef.current) {
      // End of the page: stop here (or roll on), never past what was asked.
      finishedPagesWordsRef.current += total;
      // Auto-continue still passes through the page-end overlay (briefly), so
      // the checkbox stays reachable to turn it back off.
      setPhase("pageEnd");
      return;
    }
    recordAndSummarize(total);
  }

  /** Paged source: turn the host's page and keep reading. */
  async function continueToNextPage() {
    const source = pagedSourceRef.current;
    if (!source) return;
    setAdvancing(true);
    try {
      let page = await source.next();
      for (let skipped = 0; page && !page.text.trim() && skipped < 5; skipped++) {
        page = await source.next();
      }
      if (!page || !showPage(page)) {
        recordAndSummarize(finishedPagesWordsRef.current); // end of the book
        return;
      }
      lastResumeAtRef.current = Date.now();
      // Seamless page turns: no crescendo ramp between pages.
      rampStartRef.current = null;
      setPhase("playing");
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : "Could not turn the page");
    } finally {
      setAdvancing(false);
    }
  }

  function recordAndSummarize(wordsRead: number) {
    const durationMs = accumulatedReadingMsRef.current;
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
    setSummaryWords(wordsRead);
    setPhase("done");
  }

  // Auto-continue: hold the page-end overlay a moment, then roll on.
  useEffect(() => {
    if (phase !== "pageEnd" || !autoContinuePages) return;
    const timer = setTimeout(() => void continueToNextPage(), AUTO_CONTINUE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- continueToNextPage reads refs + stable setters only
  }, [phase, autoContinuePages]);

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
        // End of a page: Space presses the focused "Continue" button instead.
        if (phase === "pageEnd") return;
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
      style={{ background: phase === "pageEnd" ? "transparent" : theme.background }}
    >
      {/* End of a page: the dialog turns see-through so the book's page shows
          behind the choice. */}
      {phase === "pageEnd" && (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: theme.background, opacity: 0.55 }} />
      )}
      {/* Header */}
      <div
        className="relative flex shrink-0 items-center justify-between px-4 py-3"
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
              {pageLabel && (
                <span className="ml-2 font-normal" style={{ color: theme.textMuted }}>
                  · {pageLabel}
                </span>
              )}
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
        {phase === "pageEnd" && (
          <PageEndState
            theme={theme}
            wordsSoFar={finishedPagesWordsRef.current}
            advancing={advancing}
            autoContinue={autoContinuePages}
            onAutoContinueChange={setAutoContinuePages}
            onContinue={() => void continueToNextPage()}
            onRereadPage={restart}
            onFinish={() => recordAndSummarize(finishedPagesWordsRef.current)}
          />
        )}
        {phase === "done" && (
          <SessionSummary
            wordsRead={summaryWords}
            durationMs={accumulatedReadingMsRef.current}
            avgWpm={
              accumulatedReadingMsRef.current > 0
                ? Math.round((summaryWords / accumulatedReadingMsRef.current) * 60_000)
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

interface PageEndStateProps {
  theme: ReturnType<typeof resolveTheme>;
  wordsSoFar: number;
  advancing: boolean;
  autoContinue: boolean;
  onAutoContinueChange: (on: boolean) => void;
  onContinue: () => void;
  onRereadPage: () => void;
  onFinish: () => void;
}

/** End of a paged source's page: continue, re-read, or finish the session. */
function PageEndState({
  theme,
  wordsSoFar,
  advancing,
  autoContinue,
  onAutoContinueChange,
  onContinue,
  onRereadPage,
  onFinish,
}: PageEndStateProps) {
  const secondary = {
    background: theme.controlBg,
    border: `1px solid ${theme.controlBorder}`,
    color: theme.textPrimary,
  };
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
    <div
      className="flex flex-col items-center gap-5 rounded-xl px-8 py-6 text-center shadow-xl"
      style={{
        color: theme.textPrimary,
        background: theme.surface,
        border: `1px solid ${theme.controlBorder}`,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div>
        <div className="text-sm uppercase tracking-widest" style={{ color: theme.textMuted }}>
          {autoContinue ? "Turning to the next page…" : "End of page"}
        </div>
        <div className="mt-1 text-sm" style={{ color: theme.textMuted }}>
          {wordsSoFar.toLocaleString()} words so far
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          autoFocus
          disabled={advancing}
          onClick={onContinue}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: theme.orpAccent }}
        >
          {advancing ? "Turning the page…" : "Continue to next page"}
        </button>
        <button type="button" onClick={onRereadPage} className="rounded-md px-4 py-2 text-sm font-medium" style={secondary}>
          Re-read this page
        </button>
        <button type="button" onClick={onFinish} className="rounded-md px-4 py-2 text-sm font-medium" style={secondary}>
          Finish
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: theme.textMuted }}>
        <input
          type="checkbox"
          checked={autoContinue}
          onChange={(event) => onAutoContinueChange(event.target.checked)}
        />
        Continue automatically to the next page
      </label>
    </div>
    </div>
  );
}
