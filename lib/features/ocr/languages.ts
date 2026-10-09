/**
 * Which languages text recognition reads. OCR-PASTE-PLAN.md D10.
 *
 * English is always on; the user adds others in Settings → Editor & Files →
 * Text recognition (`editor.ocrLanguages`). Each adds a one-time download of
 * its language pack (cached in IndexedDB) and makes reads a little slower,
 * so it is opt-in rather than a default.
 *
 * Packs come from the same pinned jsdelivr package family as English
 * (`@tesseract.js-data/<code>@1.0.0/4.0.0_best_int`, verified to exist).
 * Pure: the gate pins `normalizeOcrLanguages`.
 */

export interface OcrLanguage {
  /** Tesseract language code (ISO 639-2/T). */
  code: string;
  label: string;
  /** Gzipped pack size, for the settings copy. */
  sizeMb: number;
}

export const OCR_BASE_LANGUAGE = "eng";

export const OCR_LANGUAGES: readonly OcrLanguage[] = [
  { code: "eng", label: "English", sizeMb: 2.9 },
  { code: "spa", label: "Spanish", sizeMb: 2.1 },
  { code: "fra", label: "French", sizeMb: 0.7 },
  { code: "deu", label: "German", sizeMb: 1.3 },
  { code: "por", label: "Portuguese", sizeMb: 1.4 },
  { code: "ita", label: "Italian", sizeMb: 1.7 },
  { code: "nld", label: "Dutch", sizeMb: 3.0 },
];

/**
 * The stored setting → the codes to load: English first and always present,
 * unknown codes dropped, duplicates removed, catalogue order otherwise. Any
 * malformed value (not an array, wrong element types) reads as English only.
 */
export function normalizeOcrLanguages(stored: unknown): string[] {
  const picked = new Set(
    Array.isArray(stored) ? stored.filter((c): c is string => typeof c === "string") : [],
  );
  picked.add(OCR_BASE_LANGUAGE);
  // Reading codes off the catalogue is what drops unknown ones and fixes the order.
  return OCR_LANGUAGES.map((l) => l.code).filter((code) => picked.has(code));
}
