"use client";

/**
 * EmphasisInput — author a title without typing asterisks.
 *
 * Select part of the text and pick a font tier; the component rewrites the
 * underlying emphasis string (`*accent*`, `**bold**`, plain). A live preview
 * underneath renders it with the SAME parser the public page uses, so what you
 * see here is what the site shows.
 */

import { useRef, useState } from "react";
import { Emphasis } from "@/components/common/Emphasis";

type Tier = "plain" | "accent" | "bold";

/** Wrap/unwrap the selected range so it carries the requested tier. */
export function applyTier(text: string, start: number, end: number, tier: Tier): string {
  if (start === end) return text;
  const before = text.slice(0, start);
  const after = text.slice(end);
  // Strip any markers the selection already carries so tiers don't stack.
  const bare = text.slice(start, end).replace(/^\*{1,2}/, "").replace(/\*{1,2}$/, "");
  if (!bare) return text;
  const wrapped = tier === "accent" ? `*${bare}*` : tier === "bold" ? `**${bare}**` : bare;
  return before + wrapped + after;
}

export function EmphasisInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [hasSelection, setHasSelection] = useState(false);

  const syncSelection = () => {
    const el = ref.current;
    setHasSelection(!!el && el.selectionStart !== el.selectionEnd);
  };

  const apply = (tier: Tier) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    if (selectionStart === null || selectionEnd === null) return;
    onChange(applyTier(value, selectionStart, selectionEnd, tier));
    // Keep focus so the author can keep working; exact re-selection after a
    // length change isn't meaningful, so just restore focus.
    requestAnimationFrame(() => el.focus());
  };

  const tierBtn = (tier: Tier, label: string) => (
    <button
      key={tier}
      type="button"
      disabled={!hasSelection}
      title={
        hasSelection
          ? `Set the selected text to ${label.toLowerCase()}`
          : "Select some text first"
      }
      onClick={() => apply(tier)}
      className="rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/60 enabled:hover:border-amber-600/60 enabled:hover:text-amber-400 disabled:opacity-30"
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-1">
      <input
        ref={ref}
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 font-serif text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onSelect={syncSelection}
        onKeyUp={syncSelection}
        onMouseUp={syncSelection}
        onBlur={() => setHasSelection(false)}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/35">
          Selected text:
        </span>
        {tierBtn("plain", "Serif")}
        {tierBtn("accent", "Accent")}
        {tierBtn("bold", "Bold")}
        {value && (
          <span className="ml-auto max-w-[55%] truncate font-serif text-sm text-white/70">
            <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-white/35">
              Preview
            </span>
            <span className="[&_em]:not-italic [&_em]:text-amber-400 [&_strong]:text-amber-400">
              <Emphasis text={value} />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
