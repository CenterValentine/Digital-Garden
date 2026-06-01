/**
 * MixedProviderChip — surfaces beside the MakeAndModelPicker when a
 * conversation contains assistant messages from more than one provider.
 *
 * The visible chip is intentionally low-key: a small pill with a
 * blended brand-color border and an info icon. Hovering reveals a
 * tooltip listing the contributing providers in encounter order.
 */

"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { getProviderTheme } from "@/lib/design/system/ai-providers";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import type { AIProviderId } from "@/lib/domain/ai/types";

export interface MixedProviderChipProps {
  contributors: AIProviderId[];
}

export function MixedProviderChip({ contributors }: MixedProviderChipProps) {
  const [hover, setHover] = useState(false);

  if (contributors.length < 2) return null;

  // Border color blends contributors' brand colors via a multi-stop gradient.
  // We can't apply a gradient directly to `border-color`, so we paint it
  // onto the chip background at low opacity instead and use a neutral
  // border.
  const stops = contributors
    .map((id, i) => {
      const c = getProviderTheme(id).brandColor;
      const pct = Math.round((i / Math.max(1, contributors.length - 1)) * 100);
      return `${c}33 ${pct}%`;
    })
    .join(", ");

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 border text-[11px]",
          "border-white/15 text-gray-300",
        )}
        style={{
          background: `linear-gradient(135deg, ${stops})`,
        }}
      >
        <Info className="h-3 w-3" />
        Mixed
      </span>

      {hover && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md border border-white/10 bg-[#1a1a1a] px-2.5 py-1.5 text-[10px] text-gray-300 shadow-xl z-50">
          <div className="text-gray-500 dark:text-gray-400 mb-0.5">
            Providers in this conversation
          </div>
          {contributors.map((id) => {
            const name =
              PROVIDER_CATALOG.find((p) => p.id === id)?.name ?? id;
            const color = getProviderTheme(id).brandColor;
            return (
              <div key={id} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <span>{name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
