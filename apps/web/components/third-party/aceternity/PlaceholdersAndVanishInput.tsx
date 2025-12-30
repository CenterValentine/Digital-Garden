/**
 * Placeholders & Vanish Input ⭐⭐⭐
 * Source: https://ui.aceternity.com/components/placeholders-and-vanish-input
 * Sliding placeholders & vanish effect
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/utils";

export interface PlaceholdersAndVanishInputProps {
  className?: string;
  color?: DigitalGardenColor;
  placeholders?: string[];
  onChange?: (value: string) => void;
}

export function PlaceholdersAndVanishInput({
  className,
  color = "shale",
  placeholders = [],
  onChange,
}: PlaceholdersAndVanishInputProps) {
  return (
    <div className={cn("relative", className)}>
      <input
        type="text"
        className="w-full px-4 py-2 rounded-md border"
        style={{
          borderColor: getColorVariable(color, "mid"),
          color: getColorVariable(color, "dark"),
        }}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {/* Original Aceternity component code should go here */}
    </div>
  );
}
