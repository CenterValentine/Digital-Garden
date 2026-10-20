"use client";

/**
 * "The model reads from here" — rendered above the user message that
 * carries `lineAbove` (CONTEXT-WINDOW-EDITOR-PLAN §7). Same grammar as the
 * model-switch divider: a quiet inline line, not a card.
 */

export function ContextLineDivider({ onClear }: { onClear?: () => void }) {
  return (
    <div
      className="my-2 flex items-center gap-2 text-[10.5px] text-amber-700 dark:text-amber-300"
      role="separator"
      aria-label="The model reads from here"
      title="Everything above is stubbed for the model; the transcript keeps it"
    >
      <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
      <span>the model reads from here</span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-amber-500/40 px-1.5 py-px text-[10px] hover:bg-amber-500/10"
          title="Clear the line — the model reads everything again"
        >
          clear
        </button>
      )}
      <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
    </div>
  );
}
