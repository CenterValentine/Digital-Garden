/**
 * Local OCR engine — Tesseract.js running in a dedicated Web Worker, in the
 * browser. Shared by every caller on the page (editor paste, the image context
 * menu, the speed reader, the AI's image-reading tool). OCR-PASTE-PLAN.md D3/D4.
 *
 * Weight model ("bursty start, idle termination"):
 *   - Nothing loads at page load. The first `recognize()` dynamically imports
 *     tesseract.js (a 63 KB chunk) and spawns ONE worker, which fetches its
 *     WASM core from this origin (`/ocr`, copied by scripts/copy-ocr-assets.mjs)
 *     and the English language pack from the CDN (cached in IndexedDB after the
 *     first run, so later spawns skip the download).
 *   - Every later call reuses that worker; jobs queue inside it.
 *   - IDLE_MS after the last job finishes, the worker is terminated and its
 *     WASM heap released. The next call respawns it (warm: core is in the HTTP
 *     cache, language pack in IndexedDB).
 *
 * Client-only. Never import from a server module.
 */
import type { LoggerMessage, PSM, Worker as TesseractWorker } from "tesseract.js";

import { useSettingsStore } from "@/state/settings-store";

import { normalizeOcrLanguages, OCR_BASE_LANGUAGE } from "./languages";
import { readingOrderText, type OcrLine } from "./layout";
import { tableMarkdown } from "./table";
import {
  LAYOUT_PSM,
  needsSparsePass,
  pickBetterRead,
  preprocessForOcr,
  readsAsNoText,
  type OcrLayout,
} from "./preprocess";
import type { OcrEngine, OcrProgress, OcrResult } from "./types";

/** How long an idle worker survives before it is terminated. */
export const OCR_IDLE_MS = 120_000;

/**
 * Executable assets are self-hosted (the panel embed's `script-src 'self'`
 * forbids CDN code there, and a Worker cannot carry SRI). `workerBlobURL:
 * false` matters: by default tesseract.js spawns the worker from a `blob:`
 * URL, which `script-src 'self'` also blocks.
 */
const WORKER_PATH = "/ocr/worker.min.js";
const CORE_PATH = "/ocr";
/*
 * Language packs are data, not code, so they stay on the CDN. No `langPath`
 * is passed: tesseract.js then fetches each language from its own package,
 * `@tesseract.js-data/<code>/4.0.0_best_int` — one base URL cannot address
 * per-language packages, so the earlier `eng@1.0.0` pin could not serve a
 * second language. Every package's current release is 1.0.0 (checked
 * 2026-10-08). Cached in IndexedDB per language after the first download.
 */

let workerPromise: Promise<TesseractWorker> | null = null;
/** The "+"-joined languages the live worker was created with. */
let workerLanguages: string | null = null;

/** The user's languages (Settings → Editor & Files → Text recognition). */
function configuredLanguages(): string {
  try {
    return normalizeOcrLanguages(useSettingsStore.getState().editor?.ocrLanguages).join("+");
  } catch {
    return OCR_BASE_LANGUAGE;
  }
}
let activeJobs = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let jobCounter = 0;
/**
 * Whole reads run one at a time. A read sets a worker-wide parameter (the
 * layout mode) between its two passes; queuing only the worker's own jobs
 * would let a second image be read in the first one's sparse mode.
 */
let readQueue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(read: () => Promise<T>): Promise<T> {
  const run = readQueue.then(read, read);
  readQueue = run.catch(() => undefined);
  return run;
}
const progressListeners = new Map<string, (p: OcrProgress) => void>();

function routeLog(message: LoggerMessage) {
  const listener = progressListeners.get(message.userJobId);
  if (!listener) return;
  listener({
    stage: message.status === "recognizing text" ? "recognizing" : "loading",
    progress: typeof message.progress === "number" ? message.progress : 0,
  });
}

function spawnWorker(languages: string): Promise<TesseractWorker> {
  workerLanguages = languages;
  const pending = (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    return createWorker(languages, OEM.LSTM_ONLY, {
      workerPath: WORKER_PATH,
      corePath: CORE_PATH,
      workerBlobURL: false,
      logger: routeLog,
    });
  })();
  // A failed spawn (asset blocked, offline on first run) must not poison the
  // module: forget it so the next call tries again.
  pending.catch(() => {
    if (workerPromise === pending) workerPromise = null;
  });
  return pending;
}

function cancelIdleTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleTermination() {
  cancelIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (activeJobs === 0) void terminateLocalOcr();
  }, OCR_IDLE_MS);
}

/** Terminate the worker now (idle timeout, or a crashed worker). Safe to call anytime. */
export async function terminateLocalOcr(): Promise<void> {
  cancelIdleTimer();
  const pending = workerPromise;
  // Detach first: a call arriving while terminate() is in flight spawns fresh.
  workerPromise = null;
  workerLanguages = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Spawn failed or the worker already died — nothing left to release.
  }
}

async function recognize(
  image: Blob,
  opts?: { onProgress?: (p: OcrProgress) => void },
): Promise<OcrResult> {
  // Cancel BEFORE the first await so an idle timer firing mid-call cannot
  // terminate the worker this job is about to use.
  cancelIdleTimer();
  activeJobs++;
  const jobId = `dg-ocr-${++jobCounter}`;
  if (opts?.onProgress) progressListeners.set(jobId, opts.onProgress);
  try {
    return await oneAtATime(async () => {
      // A languages change in Settings takes effect on the next read: the
      // worker was built for the old set, so retire it (reads are queued, so
      // no other read is using it) and spawn one for the new set.
      const languages = configuredLanguages();
      if (workerPromise && workerLanguages !== languages) await terminateLocalOcr();
      workerPromise ??= spawnWorker(languages);
      const worker = await workerPromise;
      // Grayscale, invert a dark background, upscale narrow images (preprocess.ts).
      const prepared = await preprocessForOcr(image);
      const read = async (layout: OcrLayout) => {
        await worker.setParameters({
          tessedit_pageseg_mode: LAYOUT_PSM[layout] as PSM,
        });
        const { data } = await worker.recognize(prepared, {}, { text: true, blocks: true }, jobId);
        // Word positions let a page Tesseract shredded into columns (terminal
        // output, tables) be read back row by row (layout.ts).
        const lines: OcrLine[] = (data.blocks ?? []).flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.map((line) => ({
              words: line.words.map((word) => ({ text: word.text, bbox: word.bbox, confidence: word.confidence })),
            })),
          ),
        );
        return {
          // A table becomes a markdown table (table.ts); otherwise rows are
          // rebuilt only when Tesseract shredded the page into columns (layout.ts).
          text: tableMarkdown(lines) ?? readingOrderText(data.text ?? "", lines),
          confidence: typeof data.confidence === "number" ? data.confidence : 0,
          layout,
        };
      };
      // Normal layout first; a low-confidence read earns a sparse-mode pass
      // and the more confident of the two wins.
      const first = await read("auto");
      const best = needsSparsePass(first.confidence) ? pickBetterRead(first, await read("sparse")) : first;
      // Icons and decoration read as junk at low confidence: report no text.
      const text = readsAsNoText(best.confidence) ? "" : best.text;
      return { text, confidence: best.confidence, layout: best.layout, engine: "local" as const };
    });
  } catch (error) {
    // A worker that threw mid-job may be wedged; respawn on the next call.
    await terminateLocalOcr();
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    progressListeners.delete(jobId);
    activeJobs--;
    if (activeJobs === 0) scheduleIdleTermination();
  }
}

export const localOcrEngine: OcrEngine = { id: "local", recognize };
