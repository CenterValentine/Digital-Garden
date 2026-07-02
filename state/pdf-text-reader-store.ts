/**
 * PDF text-reader store — "read aloud" (Audio subsystem).
 *
 * Controls the draggable extracted-text panel for file content (PDFs, docs).
 * Because the native PDF viewer renders in an iframe whose selection the app
 * can't read, this panel shows the server-extracted text in OUR OWN DOM — where
 * the browser selection IS reachable, so highlight → right-click → Speak works.
 *
 * Opened by the toolbar "Listen" button for file content; the panel fetches the
 * text itself from the content id.
 */

import { create } from "zustand";

interface PdfTextReaderState {
  open: boolean;
  contentId: string | null;
  openReader: (contentId: string) => void;
  close: () => void;
}

export const usePdfTextReaderStore = create<PdfTextReaderState>((set) => ({
  open: false,
  contentId: null,
  openReader: (contentId) => set({ open: true, contentId }),
  close: () => set({ open: false, contentId: null }),
}));
