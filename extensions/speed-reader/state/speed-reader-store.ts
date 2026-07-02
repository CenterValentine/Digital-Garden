import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SpeedReaderFont =
  | "system"
  | "atkinson"
  | "lexend"
  | "open-dyslexic";

export type SpeedReaderTheme = "system" | "light" | "dark" | "sepia" | "oled";

export type SpeedReaderOrpColor = "red" | "blue";

export interface SpeedReaderPolishToggles {
  orpHighlight: boolean;
  punctuationPauses: boolean;
  lengthBasedTiming: boolean;
  bionicReading: boolean;
  /** Ramp WPM from 50% → 100% over 3 s whenever playback starts or resumes. */
  crescendoResume: boolean;
  /** Add a ~0.9 s hard pause after each sentence-ending word before continuing. */
  pauseAtSentenceEnd: boolean;
  /** Auto-start playback 1 s after content finishes loading. */
  autoStart: boolean;
}

interface SpeedReaderState {
  wpm: number;
  font: SpeedReaderFont;
  fontSizeRem: number;
  theme: SpeedReaderTheme;
  orpColor: SpeedReaderOrpColor;
  /** Normalize PDF-extracted text: collapse whitespace fragments, strip soft hyphens. */
  pdfCompatMode: boolean;
  polish: SpeedReaderPolishToggles;
  setWpm: (wpm: number) => void;
  setFont: (font: SpeedReaderFont) => void;
  setFontSizeRem: (size: number) => void;
  setTheme: (theme: SpeedReaderTheme) => void;
  setOrpColor: (color: SpeedReaderOrpColor) => void;
  setPdfCompatMode: (on: boolean) => void;
  togglePolish: (key: keyof SpeedReaderPolishToggles) => void;
}

const MIN_WPM = 100;
const MAX_WPM = 1200;

const DEFAULT_POLISH: SpeedReaderPolishToggles = {
  orpHighlight: true,
  punctuationPauses: true,
  lengthBasedTiming: true,
  bionicReading: false,
  crescendoResume: true,
  pauseAtSentenceEnd: false,
  autoStart: false,
};

export const useSpeedReaderStore = create<SpeedReaderState>()(
  persist(
    (set) => ({
      wpm: 300,
      font: "atkinson",
      fontSizeRem: 4,
      theme: "system",
      orpColor: "red",
      pdfCompatMode: false,
      polish: DEFAULT_POLISH,
      setWpm: (wpm) =>
        set({ wpm: Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(wpm))) }),
      setFont: (font) => set({ font }),
      setFontSizeRem: (size) =>
        set({ fontSizeRem: Math.min(8, Math.max(1.5, size)) }),
      setTheme: (theme) => set({ theme }),
      setOrpColor: (orpColor) => set({ orpColor }),
      setPdfCompatMode: (pdfCompatMode) => set({ pdfCompatMode }),
      togglePolish: (key) =>
        set((state) => ({
          polish: { ...state.polish, [key]: !state.polish[key] },
        })),
    }),
    {
      name: "speed-reader:settings",
      version: 4,
      migrate: (persisted, version) => {
        const s = persisted as Partial<SpeedReaderState>;
        if (version < 2) {
          return {
            ...s,
            polish: { ...DEFAULT_POLISH, ...(s.polish ?? {}) },
            orpColor: "red" as SpeedReaderOrpColor,
            pdfCompatMode: false,
          };
        }
        if (version < 3) {
          return { ...s, orpColor: "red" as SpeedReaderOrpColor, pdfCompatMode: false };
        }
        if (version < 4) {
          return { ...s, pdfCompatMode: false };
        }
        return s;
      },
    }
  )
);

export const SPEED_READER_WPM_RANGE = { min: MIN_WPM, max: MAX_WPM } as const;
