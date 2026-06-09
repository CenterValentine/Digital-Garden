"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useContentStore } from "@/state/content-store";
import { FlashcardQuickAddForm } from "./FlashcardQuickAddForm";
import { FlashcardClozeQuickAddForm } from "./FlashcardClozeQuickAddForm";
import { FLASHCARD_CHANGED_EVENT, FLASHCARD_QUICK_ADD_EVENT } from "../events";

type Mode = "basic" | "cloze";

function getUsableSourceContentId(value: string | null) {
  if (!value || value.startsWith("temp-") || value.startsWith("person:")) return null;
  return value;
}

export function FlashcardQuickAddDialog() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const [open, setOpen] = useState(false);
  const [sourceContentId, setSourceContentId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("basic");

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceContentId?: string | null }>).detail;
      setSourceContentId(
        getUsableSourceContentId(detail?.sourceContentId ?? selectedContentId)
      );
      setMode("basic");
      setOpen(true);
    };

    window.addEventListener(FLASHCARD_QUICK_ADD_EVENT, handleOpen);
    return () => window.removeEventListener(FLASHCARD_QUICK_ADD_EVENT, handleOpen);
  }, [selectedContentId]);

  if (!open) return null;

  const tabBase =
    "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors";
  const tabActive = "bg-white/10 text-white";
  const tabIdle = "text-gray-400 hover:bg-white/[0.05] hover:text-gray-200";

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center">
      <div className="flex h-[100dvh] w-full flex-col border-white/10 bg-[#111318] shadow-2xl md:h-[min(86vh,820px)] md:max-w-3xl md:rounded-lg md:border">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Quick Add Flashcard</h2>
            <p className="text-xs text-gray-400">
              {mode === "basic"
                ? "Save a card and keep moving."
                : "Mark text in a sentence — one card per cloze."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-gray-300 hover:bg-white/10"
            aria-label="Close flashcard quick add"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          role="tablist"
          aria-label="Card type"
          className="flex shrink-0 gap-1 border-b border-white/10 px-3 py-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "basic"}
            onClick={() => setMode("basic")}
            className={`${tabBase} ${mode === "basic" ? tabActive : tabIdle}`}
          >
            Basic
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "cloze"}
            onClick={() => setMode("cloze")}
            className={`${tabBase} ${mode === "cloze" ? tabActive : tabIdle}`}
          >
            Cloze
          </button>
        </div>
        <div className="min-h-0 flex-1 p-3">
          {mode === "basic" ? (
            <FlashcardQuickAddForm
              sourceContentId={sourceContentId}
              mobileSheet
              onCreated={() => {
                window.dispatchEvent(new CustomEvent(FLASHCARD_CHANGED_EVENT));
              }}
              onCancel={() => setOpen(false)}
            />
          ) : (
            <FlashcardClozeQuickAddForm
              sourceContentId={sourceContentId}
              onCreated={() => {
                window.dispatchEvent(new CustomEvent(FLASHCARD_CHANGED_EVENT));
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
