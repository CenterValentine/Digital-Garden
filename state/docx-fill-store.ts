/**
 * Which open files were produced from a document template (carry a
 * `docxFill` record). Set by MainPanelContent when it applies a loaded
 * payload's facts; read by the right sidebar to offer the Template Fields
 * tab. Not persisted — it mirrors what the current session has loaded.
 */

import { create } from "zustand";

interface DocxFillState {
  filled: Record<string, boolean>;
  setFilled: (contentId: string, isFill: boolean) => void;
}

export const useDocxFillStore = create<DocxFillState>()((set) => ({
  filled: {},
  setFilled: (contentId, isFill) =>
    set((state) => {
      if (Boolean(state.filled[contentId]) === isFill) return state;
      const filled = { ...state.filled };
      if (isFill) filled[contentId] = true;
      else delete filled[contentId];
      return { filled };
    }),
}));
