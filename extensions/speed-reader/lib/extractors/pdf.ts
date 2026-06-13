/**
 * Extract text from a PDF Blob using pdfjs-dist (loaded lazily).
 *
 * pdfjs-dist ships its own Web Worker. We use the CDN-hosted worker so we
 * don't bloat the Next.js client bundle with a ~1MB asset that only this
 * extension uses.
 */
export async function pdfBlobToReaderText(
  blob: Blob,
  onProgress?: (page: number, total: number) => void
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // The worker URL must match the package version we just imported.
  const pdfjsVersion = (pdfjs as unknown as { version: string }).version;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await blob.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const parts: string[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    parts.push(pageText);
    onProgress?.(pageNo, doc.numPages);
  }

  return parts.join("\n\n");
}

const TEXT_DECODER = new TextDecoder("utf-8");

export async function textBlobToReaderText(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return TEXT_DECODER.decode(buf);
}

const SCANNED_PDF_TEXT_THRESHOLD = 50;

export function looksLikeScannedPdf(text: string, sizeBytes: number): boolean {
  // PDFs with >100KB of bytes but <50 chars of extracted text are almost
  // always scanned page images. We surface an OCR prompt for those.
  return sizeBytes > 100_000 && text.replace(/\s+/g, "").length < SCANNED_PDF_TEXT_THRESHOLD;
}
