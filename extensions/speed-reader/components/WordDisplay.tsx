"use client";

import { getOrpIndex, getBionicSplit, type Chunk } from "../lib/tokenizer";
import { FONT_STACKS, type ResolvedTheme } from "../lib/theme";
import type { SpeedReaderFont, SpeedReaderPolishToggles } from "../state/speed-reader-store";

interface WordDisplayProps {
  chunk: Chunk | null;
  font: SpeedReaderFont;
  fontSizeRem: number;
  theme: ResolvedTheme;
  polish: SpeedReaderPolishToggles;
}

export function WordDisplay({
  chunk,
  font,
  fontSizeRem,
  theme,
  polish,
}: WordDisplayProps) {
  if (!chunk) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ color: theme.textMuted, fontFamily: FONT_STACKS[font] }}
      >
        Ready
      </div>
    );
  }

  const orpIdx = polish.orpHighlight ? getOrpIndex(chunk) : -1;
  const fontFamily = FONT_STACKS[font];

  if (polish.bionicReading) {
    const { bold, rest } = getBionicSplit(chunk);
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ fontFamily }}
      >
        <span
          style={{
            fontSize: `${fontSizeRem}rem`,
            color: theme.textPrimary,
            letterSpacing: "0.02em",
            lineHeight: 1,
          }}
        >
          <span style={{ fontWeight: 700 }}>{bold}</span>
          <span style={{ fontWeight: 400, opacity: 0.7 }}>{rest}</span>
        </span>
      </div>
    );
  }

  if (orpIdx < 0) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ fontFamily }}
      >
        <span
          style={{
            fontSize: `${fontSizeRem}rem`,
            color: theme.textPrimary,
            letterSpacing: "0.02em",
            lineHeight: 1,
          }}
        >
          {chunk.text}
        </span>
      </div>
    );
  }

  // ORP: render each chunk so the ORP letter sits at the visual center.
  // We approximate by absolute-positioning the highlighted letter at center
  // and aligning the rest around it.
  const before = chunk.text.slice(0, orpIdx);
  const orpChar = chunk.text.slice(orpIdx, orpIdx + 1);
  const after = chunk.text.slice(orpIdx + 1);

  return (
    <div
      className="relative flex h-full w-full items-center justify-center"
      style={{ fontFamily }}
    >
      {/* Fixation guide marks */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[1.6em] w-px -translate-x-1/2 -translate-y-1/2"
        style={{
          background: `linear-gradient(180deg, transparent, ${theme.orpAccent} 20%, ${theme.orpAccent} 80%, transparent)`,
          opacity: 0.18,
          fontSize: `${fontSizeRem}rem`,
        }}
      />
      <div
        className="grid items-baseline"
        style={{
          fontSize: `${fontSizeRem}rem`,
          color: theme.textPrimary,
          gridTemplateColumns: "1fr auto 1fr",
          columnGap: "0",
          letterSpacing: "0.02em",
          lineHeight: 1,
        }}
      >
        <span
          style={{
            justifySelf: "end",
            whiteSpace: "pre",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {before}
        </span>
        <span
          style={{
            color: theme.orpAccent,
            justifySelf: "center",
            whiteSpace: "pre",
          }}
        >
          {orpChar}
        </span>
        <span
          style={{
            justifySelf: "start",
            whiteSpace: "pre",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {after}
        </span>
      </div>
    </div>
  );
}
