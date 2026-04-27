"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { toast } from "sonner";
import type { FlashcardDto } from "@/lib/domain/flashcards";
import { AdaptiveFlashcardEditor } from "./AdaptiveFlashcardEditor";

interface FlashcardInlineEditorProps {
  card: FlashcardDto;
  onSaved: (card: FlashcardDto) => void;
  compact?: boolean;
  reserveStatusSpace?: boolean;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function serializeContent(frontContent: JSONContent, backContent: JSONContent) {
  return JSON.stringify({ frontContent, backContent });
}

export function FlashcardInlineEditor({
  card,
  onSaved,
  compact = false,
  reserveStatusSpace = false,
}: FlashcardInlineEditorProps) {
  const [frontContent, setFrontContent] = useState(card.frontContent);
  const [backContent, setBackContent] = useState(card.backContent);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedSnapshotRef = useRef(
    serializeContent(card.frontContent, card.backContent)
  );
  const savedStateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setFrontContent(card.frontContent);
    setBackContent(card.backContent);
    savedSnapshotRef.current = serializeContent(
      card.frontContent,
      card.backContent
    );
    setSaveState("idle");
  }, [card.backContent, card.frontContent, card.id]);

  const currentSnapshot = useMemo(
    () => serializeContent(frontContent, backContent),
    [backContent, frontContent]
  );
  const isDirty = currentSnapshot !== savedSnapshotRef.current;

  useEffect(() => {
    if (!isDirty) return;
    setSaveState("dirty");
    const timeoutId = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fetch(`/api/flashcards/${card.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            isFrontRichText: card.isFrontRichText,
            frontContent,
            backContent,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.error?.message || "Failed to save flashcard");
        }

        const updated = result.data as FlashcardDto;
        savedSnapshotRef.current = serializeContent(
          updated.frontContent,
          updated.backContent
        );
        onSaved(updated);
        setSaveState("saved");
        if (savedStateTimerRef.current) {
          window.clearTimeout(savedStateTimerRef.current);
        }
        savedStateTimerRef.current = window.setTimeout(() => {
          setSaveState("idle");
        }, 1200);
      } catch (error) {
        setSaveState("error");
        toast.error(
          error instanceof Error ? error.message : "Failed to save flashcard"
        );
      }
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [
    backContent,
    card.id,
    card.isFrontRichText,
    frontContent,
    isDirty,
    onSaved,
  ]);

  useEffect(() => {
    return () => {
      if (savedStateTimerRef.current) {
        window.clearTimeout(savedStateTimerRef.current);
      }
    };
  }, []);

  const saveLabel =
    saveState === "saving"
      ? "Saving..."
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Could not save"
          : saveState === "dirty"
            ? "Autosaves in 2 seconds"
            : "Autosaved";

  return (
    <div
      className="space-y-3"
      data-flashcard-editor="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className={`flex items-center justify-between gap-3 ${
          reserveStatusSpace ? "pr-14" : ""
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-primary">
          Edit Card
        </p>
        <p
          className={`text-xs ${
            saveState === "error" ? "text-red-300" : "text-gray-400"
          }`}
        >
          {saveLabel}
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {card.frontLabel}
        </span>
        <AdaptiveFlashcardEditor
          value={frontContent}
          onChange={setFrontContent}
          mode={card.isFrontRichText ? "rich" : "plain"}
          placeholder="Front of card..."
          ariaLabel="Edit flashcard front"
          compact
        />
      </div>

      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {card.backLabel}
        </span>
        <AdaptiveFlashcardEditor
          value={backContent}
          onChange={setBackContent}
          mode="rich"
          placeholder="Back of card..."
          ariaLabel="Edit flashcard back"
          compact={compact}
        />
      </div>
    </div>
  );
}
