import * as React from "react";

import { cn } from "@/lib/core/utils";

/**
 * Tone scale. Status tones carry meaning and should be used consistently
 * across the app; categorical tones carry none and exist only to tell
 * members of a taxonomy apart (capability flags, provider kinds, tag
 * groups). Hues live in globals.css as --tone-*.
 */
export type Tone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "purple"
  | "pink"
  | "teal"
  | "sky"
  | "indigo"
  | "orange"
  | "cyan";

interface ToneChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /**
   * "loud" fills the chip — for the one attribute that classifies the row.
   * "quiet" drops the fill and desaturates toward --muted-foreground, for
   * attributes that merely qualify it. A row of all-loud chips has no
   * hierarchy and competes with the label it annotates.
   */
  emphasis?: "loud" | "quiet";
}

/**
 * Tinted status/category chip.
 *
 * Replaces the hand-rolled `bg-x-500/15 text-x-300 border-x-500/30` idiom
 * that appears across ~78 files. That idiom is dark-mode-only: an `x-300`
 * text tint is calibrated to sit on black and falls to roughly 1.7:1 on a
 * light surface, which is why the capability badges were unreadable on the
 * light settings pages.
 *
 * Colors come from `.tone-surface` in globals.css, which derives fill, text
 * and border from a single hue via color-mix() against --foreground — so
 * one declaration stays legible in both themes. This component owns only
 * shape and typography.
 */
export const ToneChip = React.forwardRef<HTMLSpanElement, ToneChipProps>(
  ({ className, tone = "neutral", emphasis = "loud", ...props }, ref) => (
    <span
      ref={ref}
      data-tone={tone}
      data-emphasis={emphasis}
      className={cn(
        "tone-surface inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        className
      )}
      {...props}
    />
  )
);
ToneChip.displayName = "ToneChip";
