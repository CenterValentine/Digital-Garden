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
import type { LoggerMessage, Worker as TesseractWorker } from "tesseract.js";

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
/**
 * The language pack is data, not code, so it stays on the CDN. This is the
 * exact pack tesseract.js v7 uses by default for its LSTM engine (2.9 MB
 * gzipped), pinned to an immutable package version instead of "latest".
 */
const LANG_PATH = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int";

let workerPromise: Promise<TesseractWorker> | null = null;
let activeJobs = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let jobCounter = 0;
const progressListeners = new Map<string, (p: OcrProgress) => void>();

function routeLog(message: LoggerMessage) {
  const listener = progressListeners.get(message.userJobId);
  if (!listener) return;
  listener({
    stage: message.status === "recognizing text" ? "recognizing" : "loading",
    progress: typeof message.progress === "number" ? message.progress : 0,
  });
}

function spawnWorker(): Promise<TesseractWorker> {
  const pending = (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    return createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: WORKER_PATH,
      corePath: CORE_PATH,
      langPath: LANG_PATH,
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
    workerPromise ??= spawnWorker();
    const worker = await workerPromise;
    const { data } = await worker.recognize(image, {}, { text: true }, jobId);
    return {
      text: data.text ?? "",
      confidence: typeof data.confidence === "number" ? data.confidence : 0,
      engine: "local",
    };
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
