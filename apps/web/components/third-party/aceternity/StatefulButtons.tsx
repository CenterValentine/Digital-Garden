/**
 * Stateful Buttons ⭐⭐
 * Source: https://ui.aceternity.com/components/stateful-buttons
 * Loading & success states
 */

"use client";

import {
  getColorVariable,
  getIntentColor,
  type DigitalGardenColor,
  type DigitalGardenIntent,
} from "@/lib/third-party";
import { cn } from "@/lib/utils";

export interface StatefulButtonsProps {
  className?: string;
  color?: DigitalGardenColor;
  intent?: DigitalGardenIntent;
  loading?: boolean;
  success?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
}

export function StatefulButtons({
  className,
  color = "shale",
  intent,
  loading = false,
  success = false,
  children,
  onClick,
}: StatefulButtonsProps) {
  return (
    <button
      className={cn(
        "px-4 py-2 rounded-md font-medium transition-all",
        className
      )}
      style={{
        backgroundColor: intent
          ? getIntentColor(intent)
          : getColorVariable(color, "primary"),
        color: "white",
      }}
      onClick={onClick}
      disabled={loading || success}
    >
      {loading ? "Loading..." : success ? "Success!" : children}
    </button>
  );
}
