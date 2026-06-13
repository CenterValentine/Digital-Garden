/**
 * Local OCR via Tesseract.js. We run it through the library's own worker —
 * no separate Web Worker file needed; tesseract.js manages the WASM lifecycle
 * and a dedicated worker thread internally.
 *
 * Lifecycle: createWorker() is expensive (~2s including WASM compile). We
 * cache the worker instance and reuse it for the life of the page.
 */

type TesseractWorker = {
  recognize: (image: Blob | string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
};

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const tesseract = await import("tesseract.js");
      const worker = await tesseract.createWorker("eng");
      return worker as unknown as TesseractWorker;
    })();
  }
  return workerPromise;
}

export async function ocrBlobToReaderText(blob: Blob): Promise<string> {
  const worker = await getWorker();
  const result = await worker.recognize(blob);
  return result.data.text.replace(/\n{3,}/g, "\n\n").trim();
}

export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
