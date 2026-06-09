"use client";

/**
 * Reusable deck-path input with themed autocomplete. Replaces the
 * native <datalist> approach which couldn't pick up the chat panel's
 * dark theme. Shows a styled dropdown below the input with suggestions
 * from the user's existing decks (substring match against the typed
 * value), keyboard nav with arrow keys / Enter, click-to-pick.
 *
 * Accent colors map to the surrounding card:
 *   - `amber` for the cards proposal card
 *   - `emerald` for the standalone deck proposal card
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useExistingDeckPaths } from "./use-existing-deck-paths";

interface DeckPathFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  accent?: "amber" | "emerald";
  ariaLabel?: string;
  /**
   * If set, the field auto-resets to this value when the input blurs
   * with a blank (empty / whitespace-only / slash-only) string. Used
   * by the proposal cards so a user who clears the input and clicks
   * away gets the AI's original suggestion back instead of being left
   * with an unsubmittable empty field. NOT triggered when the user
   * picks from the dropdown (the dropdown's mousedown preventDefault
   * suppresses the input's blur), so this only catches "click away
   * with nothing" cases.
   */
  resetValueOnBlankBlur?: string;
}

const ACCENT_CLASSES = {
  amber: {
    input:
      "border-amber-400/30 focus:border-amber-500/60 dark:border-amber-400/20",
    item: "hover:bg-amber-500/[0.12] data-[active=true]:bg-amber-500/[0.18]",
    surface:
      "border-amber-400/30 dark:border-amber-400/20",
  },
  emerald: {
    input:
      "border-emerald-400/30 focus:border-emerald-500/60 dark:border-emerald-400/20",
    item: "hover:bg-emerald-500/[0.12] data-[active=true]:bg-emerald-500/[0.18]",
    surface:
      "border-emerald-400/30 dark:border-emerald-400/20",
  },
} as const;

export function DeckPathField({
  value,
  onChange,
  disabled = false,
  placeholder,
  accent = "amber",
  ariaLabel,
  resetValueOnBlankBlur,
}: DeckPathFieldProps) {
  const existingDecks = useExistingDeckPaths();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Per-row refs so we can scroll the active item into view as the
  // user navigates with arrow keys. Mutated via inline ref callbacks
  // on each list item.
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const classes = ACCENT_CLASSES[accent];

  // Substring match (case-insensitive) against the user's current
  // value. Empty value shows the top 8 decks alphabetically; typing
  // narrows the list. Cap at 8 to keep the dropdown compact.
  const suggestions = useMemo(() => {
    const q = value.toLowerCase().trim();
    const filtered = q
      ? existingDecks.filter((d) => d.path.toLowerCase().includes(q))
      : existingDecks;
    return filtered.slice(0, 8);
  }, [existingDecks, value]);

  // No clamp effect — when suggestions shrink, activeIndex may point
  // past the end. The data-active check below falls through (no
  // highlight on any row) and the Enter handler guards with
  // `suggestions[activeIndex] && pick(...)`. Arrow nav re-clamps via
  // Math.min/max on each keystroke. Avoids the React-Compiler
  // sync-setState-in-effect anti-pattern.

  // Scroll the active item into view when arrow nav moves it (or
  // when the dropdown opens fresh). `block: "nearest"` no-ops when
  // the item is already visible, so this only fires when needed.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  const pick = useCallback(
    (path: string) => {
      onChange(path);
      setOpen(false);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        setOpen(true);
        e.preventDefault();
        return;
      }
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && suggestions[activeIndex]) {
        e.preventDefault();
        pick(suggestions[activeIndex].path);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [open, activeIndex, suggestions, pick],
  );

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Auto-reset only when (a) caller asked for it, (b) the
          // field isn't disabled (committed state shouldn't fight us),
          // and (c) the current value is blank by any reasonable
          // measure. The dropdown-pick path skips this because its
          // mousedown preventDefault stops blur from firing at all.
          if (
            !disabled &&
            resetValueOnBlankBlur !== undefined &&
            value.trim() === ""
          ) {
            onChange(resetValueOnBlankBlur);
          }
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        placeholder={placeholder}
        className={`min-w-0 w-full rounded border bg-white/40 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 outline-none focus:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.04] dark:text-gray-200 dark:focus:bg-white/[0.08] ${classes.input}`}
      />
      {open && suggestions.length > 0 && !disabled && (
        <div
          className={`absolute left-0 right-0 top-full z-20 mt-1 rounded-md border bg-white/95 shadow-lg backdrop-blur dark:bg-[#1a2530]/95 ${classes.surface}`}
          role="listbox"
        >
          <ul className="max-h-48 overflow-y-auto py-1">
            {suggestions.map((d, i) => (
              <li key={d.id}>
                <button
                  type="button"
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  data-active={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    // mousedown (not onClick) so the picker fires
                    // before the input's onBlur closes the dropdown.
                    e.preventDefault();
                    pick(d.path);
                  }}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`block w-full px-2 py-1.5 text-left font-mono text-[11px] text-gray-700 dark:text-gray-200 ${classes.item}`}
                >
                  {d.path}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
